import type Sigma from 'sigma';
import {
  setNodeFixed,
  releaseNode,
  setAlphaTarget,
  reheat,
  isSimulationRunning,
  startSimulation,
} from './simulation.ts';

let _sigma: Sigma<any, any, any> | null = null;
let _draggedNode: string | null = null;
let _isDragging = false;

export function initDrag(sigma: Sigma<any, any, any>): void {
  _sigma = sigma;

  // Début du drag sur un nœud
  sigma.on('downNode', ({ node, event }) => {
    // Prévenir le pan de caméra Sigma pendant le drag
    event.preventSigmaDefault();

    _draggedNode = node;
    _isDragging = false; // sera mis à true au premier mousemove

    // Fixer le nœud à sa position actuelle
    const attrs = sigma.getGraph().getNodeAttributes(node);
    setNodeFixed(node, attrs.x, attrs.y);

    // Maintenir la simulation active autour du nœud tiré
    setAlphaTarget(0.3);
    if (!isSimulationRunning()) {
      startSimulation();
    }

    // Bloquer le curseur pour indiquer le drag
    const container = sigma.getContainer();
    container.style.cursor = 'grabbing';
  });

  // Mouvement de la souris — mise à jour de la position du nœud
  sigma.getMouseCaptor().on('mousemovebody', (e) => {
    if (!_draggedNode || !_sigma) return;

    _isDragging = true;

    // Convertir les coordonnées viewport → coordonnées graphe
    const graphCoords = sigma.viewportToFramedGraph({ x: e.x, y: e.y });
    setNodeFixed(_draggedNode, graphCoords.x, graphCoords.y);

    // Rafraîchir le rendu immédiatement
    sigma.refresh({ skipIndexation: true });
  });

  // Fin du drag — relâcher le nœud
  sigma.getMouseCaptor().on('mouseup', () => {
    if (!_draggedNode) return;

    releaseNode(_draggedNode);
    setAlphaTarget(0);

    // Légère animation de stabilisation
    reheat(0.1);

    _draggedNode = null;
    _isDragging = false;

    const container = _sigma?.getContainer();
    if (container) container.style.cursor = '';
  });

  // Restaurer le curseur si la souris quitte le container pendant un drag
  sigma.getMouseCaptor().on('mouseleave', () => {
    if (!_draggedNode) return;
    releaseNode(_draggedNode);
    setAlphaTarget(0);
    _draggedNode = null;
    _isDragging = false;
    const container = _sigma?.getContainer();
    if (container) container.style.cursor = '';
  });
}

export function isDragging(): boolean {
  return _isDragging;
}
