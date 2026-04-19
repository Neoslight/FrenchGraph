import type Graph from 'graphology';
import { getCommunityColorRanked, COLORS } from '../utils/colors.ts';
import { getState } from '../state.ts';
import { edgeLengthCache } from '../data/graph-store.ts';

export function createNodeReducer() {
  return (node: string, data: any): any => {
    const state = getState();

    // LOD : masquer les nœuds sous le seuil de degré au zoom arrière
    // (ne s'applique pas si un nœud est sélectionné/highlight — on affiche tout)
    if (!state.selectedNode && !state.pathNodes?.length && state.highlightedCommunity === null) {
      const degree = (data.degree as number) ?? 1;
      if (degree < state.zoomNodeThreshold) {
        return { ...data, hidden: true };
      }
    }

    const res: any = { ...data };

    // Z-index proportionnel à la taille : les hubs restent au premier plan
    // Multiplicateur 0.8 calibré pour sqrt(degree) → range effectif 1-8
    res.zIndex = Math.min(10, Math.round((data.size ?? 3) * 0.8));

    // Hover highlight
    if (state.hoveredNode === node) {
      res.highlighted = true;
      res.zIndex = 10;
    }

    // Selected artist (ego network)
    if (state.selectedNode) {
      if (node === state.selectedNode) {
        res.highlighted = true;
        res.size = (data.size ?? 3) * 3;
        res.zIndex = 10;
      } else if (state.egoNodes?.has(node)) {
        // Neighbor in ego network — légèrement agrandi pour être visible
        res.size = (data.size ?? 3) * 1.8;
        res.zIndex = 5;
      } else {
        // Not in ego network — dim
        res.color = '#1a1a24';
        res.label = null;
        res.size = (data.size ?? 3) * 0.5;
        res.zIndex = 0;
      }
    }

    // Path mode
    if (state.pathNodes && state.pathNodes.length > 0) {
      if (state.pathNodes.includes(node)) {
        res.color = COLORS.highlight;
        res.highlighted = true;
        res.size = (data.size ?? 3) * 3;
        res.zIndex = 10;
      } else {
        res.color = '#1a1a24';
        res.label = null;
        res.size = (data.size ?? 3) * 0.5;
        res.zIndex = 0;
      }
    }

    // Community highlight
    if (state.highlightedCommunity !== null && !state.selectedNode && !state.pathNodes?.length) {
      const community = data.community as number | undefined;
      if (community === state.highlightedCommunity) {
        res.zIndex = 5;
      } else {
        res.color = '#1a1a24';
        res.label = null;
        res.size = (data.size ?? 3) * 0.5;
        res.zIndex = 0;
      }
    }

    // Timeline filter
    if (state.hiddenNodes?.has(node)) {
      res.hidden = true;
    }

    return res;
  };
}

export function createEdgeReducer(graph: Graph) {
  return (edge: string, data: any): any => {
    const state = getState();
    const res: any = { ...data };

    // Sizing par poids — arêtes plus épaisses pour collabs fréquentes
    const weight = data.weight ?? 1;
    res.size = Math.max(0.5, Math.log(weight + 1) * 0.8);

    // Selected node (ego network)
    if (state.selectedNode) {
      if (state.egoEdges?.has(edge)) {
        const source = graph.source(edge);
        const target = graph.target(edge);
        if (source === state.selectedNode || target === state.selectedNode) {
          const community = graph.getNodeAttribute(state.selectedNode, 'community');
          res.color = getCommunityColorRanked(community) + '80';
          res.size = Math.max(1.5, res.size);
        } else {
          res.color = '#ffffff15';
          res.size = 0.5;
        }
      } else {
        res.hidden = true;
      }
      return res;
    }

    // Path mode
    if (state.pathEdges && state.pathEdges.size > 0) {
      if (state.pathEdges.has(edge)) {
        res.color = COLORS.highlight;
        res.size = 3;
        res.zIndex = 10;
      } else {
        res.hidden = true;
      }
      return res;
    }

    // Community highlight
    if (state.highlightedCommunity !== null) {
      const srcComm = graph.getNodeAttribute(graph.source(edge), 'community');
      const tgtComm = graph.getNodeAttribute(graph.target(edge), 'community');
      if (srcComm === state.highlightedCommunity && tgtComm === state.highlightedCommunity) {
        res.color = getCommunityColorRanked(state.highlightedCommunity) + '40';
        res.size = Math.max(1, res.size);
      } else {
        res.hidden = true;
      }
      return res;
    }

    // Timeline filter
    if (state.hiddenEdges?.has(edge)) {
      res.hidden = true;
      return res;
    }

    // === Vue par défaut (pas de mode actif) ===

    // LOD arêtes : masquer si un des endpoints est sous le seuil de degré
    if (state.zoomNodeThreshold > 1) {
      const srcDeg = graph.getNodeAttribute(graph.source(edge), 'degree') as number;
      const tgtDeg = graph.getNodeAttribute(graph.target(edge), 'degree') as number;
      if (srcDeg < state.zoomNodeThreshold || tgtDeg < state.zoomNodeThreshold) {
        res.hidden = true;
        return res;
      }
    }

    // Zoom-based weight threshold
    if (weight < state.edgeWeightThreshold) {
      res.hidden = true;
      return res;
    }

    // Filtre longueur d'arête zoom-relatif — désactivé pendant la simulation (positions bougent)
    if (!state.simulationRunning) {
      const maxLen = Math.max(3000, 1500 * (state.cameraRatio ?? 1));
      const cachedLen = edgeLengthCache.get(edge) ?? 0;
      if (cachedLen > maxLen) {
        res.hidden = true;
        return res;
      }
    }

    // Opacité des arêtes par zoom — palier discret pré-calculé dans le listener caméra
    res.color = (data.originalColor as string) + state.alphaHex;

    return res;
  };
}
