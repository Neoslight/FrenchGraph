import { getSigma } from './renderer.ts';
import { getGraph } from '../data/graph-store.ts';

export function animateToNode(nodeId: string, duration = 600): void {
  const sigma = getSigma();
  const graph = getGraph();
  if (!graph.hasNode(nodeId)) return;

  const nodePosition = sigma.getNodeDisplayData(nodeId);
  if (!nodePosition) return;

  sigma.getCamera().animate(
    { x: nodePosition.x, y: nodePosition.y, ratio: 0.15 },
    { duration }
  );
}

export function animateToBBox(
  nodes: string[],
  duration = 600,
  padding = 0.2
): void {
  const sigma = getSigma();
  if (nodes.length === 0) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const nodeId of nodes) {
    const pos = sigma.getNodeDisplayData(nodeId);
    if (!pos) continue;
    if (pos.x < minX) minX = pos.x;
    if (pos.x > maxX) maxX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.y > maxY) maxY = pos.y;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rangeX = maxX - minX;
  const rangeY = maxY - minY;
  const range = Math.max(rangeX, rangeY, 0.01);

  // Estimate ratio to fit the bounding box with padding
  const ratio = Math.min(range * (1 + padding) / 2, 1);

  sigma.getCamera().animate(
    { x: cx, y: cy, ratio: Math.max(ratio, 0.02) },
    { duration }
  );
}

export function resetCamera(duration = 600): void {
  const sigma = getSigma();
  sigma.getCamera().animate(
    { x: 0.5, y: 0.5, ratio: 1 },
    { duration }
  );
}
