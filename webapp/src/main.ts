import './styles/main.css';
import { loadGraphData, loadSearchIndex, loadCommunities, loadStats } from './data/loader.ts';
import { buildGraph, getGraph } from './data/graph-store.ts';
import { initSigma, getSigma } from './graph/renderer.ts';
import { initCommunityColors } from './utils/colors.ts';
import { initSearch } from './ui/search.ts';
import { initArtistPanel, selectNode, deselectNode } from './ui/artist-panel.ts';
import { initTooltip } from './ui/tooltip.ts';
import { initCommunityPanel } from './ui/community-panel.ts';
import { initPathFinder } from './ui/path-finder.ts';
import { initTimeline } from './ui/timeline.ts';
import { initStats } from './ui/stats.ts';
import { getState, setState } from './state.ts';
import { $ } from './utils/dom.ts';
import { initSimulation, DEFAULT_FORCE_PARAMS } from './graph/simulation.ts';
import { initDrag } from './graph/drag.ts';
import { initForcePanel } from './ui/force-panel.ts';
import { setMouseViewport } from './graph/label-renderer.ts';
import { setCommunityLabelsData, setCommunityLabelsVisible } from './graph/community-labels.ts';

async function main() {
  try {
    // Load core data in parallel
    const [graphData, searchIndex, communities, stats] = await Promise.all([
      loadGraphData(),
      loadSearchIndex(),
      loadCommunities(),
      loadStats(),
    ]);

    // Initialize community colors based on size ranking
    initCommunityColors(communities.map(c => ({ id: c.id, size: c.size })));

    // Build graphology graph
    const graph = buildGraph(graphData);

    // Expose graph for reducers (avoids circular imports)
    (window as any).__graph = graph;

    // Init Sigma renderer
    const container = $('#sigma-container');
    const sigma = initSigma(graph, container);

    // Init simulation — positions déjà pré-calculées, pas de reheat au démarrage
    initSimulation(graph, sigma, DEFAULT_FORCE_PARAMS);
    initDrag(sigma);

    // Alimenter les labels de communauté avec les centroïdes calculés depuis le graphe réel
    // (initCommunityLabels est déjà appelé depuis renderer.ts au moment du initSigma)
    setCommunityLabelsData(communities, graph);

    // Init UI modules
    initSearch(searchIndex);
    initArtistPanel();
    initTooltip();
    initCommunityPanel(communities);
    initPathFinder();
    initTimeline();
    initStats(stats);
    initForcePanel();

    // Tracker la position souris pour les labels de proximité
    sigma.getMouseCaptor().on('mousemovebody', (e) => {
      setMouseViewport(e.x, e.y);
    });

    // Node click -> select artist
    sigma.on('clickNode', ({ node }) => {
      const state = getState();
      if (state.selectedNode === node) {
        deselectNode();
      } else {
        selectNode(node);
      }
    });

    // Zoom-based thresholds: edge weight + node LOD tiers
    sigma.getCamera().on('updated', () => {
      const ratio = sigma.getCamera().ratio;

      // Edge weight threshold
      let threshold: number;
      if (ratio > 6) threshold = 999;      // Zoom extrême → 0 arêtes (nuage de points pur)
      else if (ratio > 3) threshold = 5;   // Très zoomé hors → collabs ≥ 5 titres
      else if (ratio > 1.5) threshold = 3; // Zoomé hors → weight >= 3
      else if (ratio > 0.8) threshold = 2; // Mi-zoom → weight >= 2
      else threshold = 2;                  // Jamais afficher les arêtes weight=1

      // Node LOD tiers (distribution des degrés : p99=49, p98=19, p95=9, p91=4, p86=1)
      let nodeThreshold: number;
      if (ratio > 4) nodeThreshold = 50;       // ~130 hubs seulement
      else if (ratio > 2) nodeThreshold = 20;  // ~556 nœuds
      else if (ratio > 1) nodeThreshold = 10;  // ~1302 nœuds
      else if (ratio > 0.5) nodeThreshold = 5; // ~2619 nœuds
      else nodeThreshold = 1;                  // tous les nœuds

      // Exposer le ratio pour label-renderer
      (window as any).__cameraRatio = ratio;

      // Palier discret d'alpha pour les arêtes — 4 niveaux fixes, pas de refresh sur chaque micro-zoom
      const alphaHex = ratio > 3 ? '08' : ratio > 1.5 ? '14' : ratio > 0.7 ? '28' : '40';

      const state = getState();
      if (state.edgeWeightThreshold !== threshold || state.zoomNodeThreshold !== nodeThreshold || state.alphaHex !== alphaHex) {
        setState({ edgeWeightThreshold: threshold, zoomNodeThreshold: nodeThreshold, cameraRatio: ratio, alphaHex });
        sigma.refresh({ skipIndexation: true });
      }
    });

    // Toggle labels de communauté
    const btnLabels = $('#btn-labels');
    btnLabels.addEventListener('click', () => {
      const visible = !getState().communityLabelsVisible;
      setState({ communityLabelsVisible: visible });
      setCommunityLabelsVisible(visible);
      btnLabels.classList.toggle('topbar-btn--active', visible);
    });

    // Click on stage -> deselect
    sigma.on('clickStage', () => {
      const state = getState();
      if (state.selectedNode) {
        deselectNode();
      }
      if (state.highlightedCommunity !== null) {
        setState({ highlightedCommunity: null });
        sigma.refresh();
      }
    });

    // Hide loader
    const loader = $('#loader');
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 500);

  } catch (err) {
    console.error('Failed to initialize:', err);
    const loader = $('#loader');
    loader.innerHTML = `<div class="loader-content"><h1>Erreur</h1><p>${err}</p></div>`;
  }
}

main();
