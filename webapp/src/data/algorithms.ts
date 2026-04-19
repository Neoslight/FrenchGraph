import { bidirectional } from 'graphology-shortest-path/unweighted';
import { getGraph } from './graph-store.ts';

export function findShortestPath(fromId: string, toId: string): string[] | null {
  const graph = getGraph();
  if (!graph.hasNode(fromId) || !graph.hasNode(toId)) return null;
  try {
    return bidirectional(graph, fromId, toId);
  } catch {
    return null;
  }
}

export function getNeighbors(nodeId: string): Set<string> {
  const graph = getGraph();
  return new Set(graph.neighbors(nodeId));
}

export function getEgoNetwork(nodeId: string): { nodes: Set<string>; edges: Set<string> } {
  const graph = getGraph();
  const neighbors = new Set(graph.neighbors(nodeId));
  neighbors.add(nodeId);

  const edges = new Set<string>();
  graph.forEachEdge((edge, _attrs, source, target) => {
    if (neighbors.has(source) && neighbors.has(target)) {
      edges.add(edge);
    }
  });

  return { nodes: neighbors, edges };
}
