import Graph from 'graphology';
import { GraphData } from './loader.ts';
import { setState } from '../state.ts';

let graph: Graph | null = null;

// Cache pré-calculé des longueurs d'arêtes — évite Math.hypot() par frame dans le reducer
export const edgeLengthCache = new Map<string, number>();

export function buildGraph(data: GraphData): Graph {
  graph = new Graph({ type: 'undirected', multi: false });

  // Stocker les positions d'origine pour le bouton "Réinitialiser layout"
  const originalPositions = new Map<string, { x: number; y: number }>();

  for (const node of data.nodes) {
    originalPositions.set(String(node.id), { x: node.x, y: node.y });
    graph.addNode(String(node.id), {
      x: node.x,
      y: node.y,
      label: node.label,
      community: node.community,
      degree: node.size,
      size: Math.max(1.5, Math.sqrt(node.size)),
      originalSize: Math.max(1.5, Math.sqrt(node.size)),
    });
  }

  // Sauvegarder les positions d'origine dans l'état global
  setState({ originalPositions } as any);

  for (const edge of data.edges) {
    const src = String(edge.source);
    const tgt = String(edge.target);
    if (graph.hasNode(src) && graph.hasNode(tgt) && !graph.hasEdge(src, tgt)) {
      graph.addEdge(src, tgt, {
        weight: edge.weight ?? 1,
        minYear: edge.minYear ?? 0,
        originalColor: '#505050',
      });
    }
  }

  // Pré-calculer les longueurs d'arêtes une seule fois au chargement
  edgeLengthCache.clear();
  graph.forEachEdge((edge, _, source, target) => {
    const sx = graph!.getNodeAttribute(source, 'x') as number;
    const sy = graph!.getNodeAttribute(source, 'y') as number;
    const tx = graph!.getNodeAttribute(target, 'x') as number;
    const ty = graph!.getNodeAttribute(target, 'y') as number;
    edgeLengthCache.set(edge, Math.hypot(tx - sx, ty - sy));
  });

  return graph;
}

export function getGraph(): Graph {
  if (!graph) throw new Error('Graph not initialized');
  return graph;
}

export function rebuildEdgeLengthCache(g: Graph): void {
  g.forEachEdge((edge, _, source, target) => {
    const sx = g.getNodeAttribute(source, 'x') as number;
    const sy = g.getNodeAttribute(source, 'y') as number;
    const tx = g.getNodeAttribute(target, 'x') as number;
    const ty = g.getNodeAttribute(target, 'y') as number;
    edgeLengthCache.set(edge, Math.hypot(tx - sx, ty - sy));
  });
}
