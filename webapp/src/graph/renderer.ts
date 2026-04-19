import Sigma from 'sigma';
import type Graph from 'graphology';
import { createNodeBorderProgram } from '@sigma/node-border';
import { getCommunityColorRanked } from '../utils/colors.ts';
import { createNodeReducer, createEdgeReducer } from './reducers.ts';
import { drawNodeLabel } from './label-renderer.ts';
import { initCommunityLabels } from './community-labels.ts';

// Nœud avec anneau extérieur blanc subtil — distingue les individus dans les clusters
const NodeWithBorderProgram = createNodeBorderProgram({
  borders: [
    { color: { value: 'rgba(255,255,255,0.22)' }, size: { value: 0.12 } }, // anneau extérieur
    { color: { attribute: 'color' },               size: { fill: true } },  // disque intérieur
  ],
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sigmaInstance: Sigma<any, any, any> | null = null;

export function initSigma(graph: Graph, container: HTMLElement): Sigma<any, any, any> {
  sigmaInstance = new Sigma(graph as any, container, {
    // Rendering
    renderLabels: true,
    renderEdgeLabels: false,
    // Désactiver le système de density/threshold natif de Sigma —
    // on gère nous-mêmes l'affichage des labels dans drawNodeLabel
    labelRenderedSizeThreshold: 0,
    labelDensity: 1,
    labelGridCellSize: 200,
    labelFont: 'Inter, sans-serif',
    labelSize: 11,
    labelWeight: '600',
    labelColor: { color: '#e8e6e3' },
    defaultDrawNodeLabel: drawNodeLabel as any,

    // Edges
    defaultEdgeColor: '#2a2a3a',
    defaultEdgeType: 'line',

    // Nodes
    defaultNodeColor: '#3a3a4a',
    defaultNodeType: 'border',
    nodeProgramClasses: { border: NodeWithBorderProgram },

    // Performance
    enableEdgeEvents: false,
    zIndex: true,

    // Reducers
    nodeReducer: createNodeReducer(),
    edgeReducer: createEdgeReducer(graph),
  });

  // Set node colors based on community
  graph.forEachNode((node, attrs) => {
    graph.setNodeAttribute(node, 'color', getCommunityColorRanked(attrs.community));
  });

  // Set edge colors — teinte de la communauté source à faible opacité
  // (évite l'accumulation blanc pur du #ffffff0d avec le blending additif WebGL)
  graph.forEachEdge((edge, _attrs, source) => {
    const community = graph.getNodeAttribute(source, 'community');
    const communityColor = getCommunityColorRanked(community);
    graph.setEdgeAttribute(edge, 'color', communityColor + '18'); // ~9% opacité, teinte communauté
    graph.setEdgeAttribute(edge, 'size', 0.5);
  });

  // Init labels de communauté (overlay canvas)
  initCommunityLabels(sigmaInstance);

  return sigmaInstance;
}

export function getSigma(): Sigma<any, any, any> {
  if (!sigmaInstance) throw new Error('Sigma not initialized');
  return sigmaInstance;
}
