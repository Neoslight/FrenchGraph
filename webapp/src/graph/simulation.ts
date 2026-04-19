import FA2LayoutSupervisor from 'graphology-layout-forceatlas2/worker';
import type { ForceAtlas2Settings } from 'graphology-layout-forceatlas2';
import type Graph from 'graphology';
import type Sigma from 'sigma';
import { rebuildEdgeLengthCache } from '../data/graph-store.ts';
import { setState } from '../state.ts';

export interface FA2Params {
  scalingRatio: number;   // Contrôle la répulsion globale
  gravity: number;        // Attraction vers le centre
  slowDown: number;       // Frein (1 = normal, >1 = ralenti)
  linLogMode: boolean;    // Clusters denses + espaces propres inter-communautés
  barnesHutOptimize: boolean; // O(n log n) — obligatoire pour >1k nœuds
  adjustSizes: boolean;   // Éviter le chevauchement des nœuds (plus lent)
  enabled: boolean;
}

// Backward-compat aliases (importés par state.ts et main.ts)
export type ForceParams = FA2Params;

export const DEFAULT_FA2_PARAMS: FA2Params = {
  scalingRatio: 2.0,
  gravity: 0.05,
  slowDown: 1,
  linLogMode: true,
  barnesHutOptimize: true,
  adjustSizes: false,
  enabled: false,
};

export const DEFAULT_FORCE_PARAMS = DEFAULT_FA2_PARAMS;

// ─── Module state ─────────────────────────────────────────────────────────────
let _graph: Graph | null = null;
let _sigma: Sigma<any, any, any> | null = null;
let _params: FA2Params = { ...DEFAULT_FA2_PARAMS };
let _supervisor: InstanceType<typeof FA2LayoutSupervisor> | null = null;
let _rafId: number | null = null;

function _toSettings(params: FA2Params): ForceAtlas2Settings {
  return {
    scalingRatio: params.scalingRatio,
    gravity: params.gravity,
    slowDown: params.slowDown,
    linLogMode: params.linLogMode,
    barnesHutOptimize: params.barnesHutOptimize,
    adjustSizes: params.adjustSizes,
    outboundAttractionDistribution: true,
    edgeWeightInfluence: 1,
  };
}

function _createSupervisor(): InstanceType<typeof FA2LayoutSupervisor> {
  return new (FA2LayoutSupervisor as any)(_graph!, {
    settings: _toSettings(_params),
    getEdgeWeight: 'weight',
  });
}

// ─── RAF rendering loop ───────────────────────────────────────────────────────
function _loop(): void {
  if (!_supervisor || !_sigma) return;
  if (_supervisor.isRunning()) {
    _sigma.refresh({ skipIndexation: true });
    _rafId = requestAnimationFrame(_loop);
  } else {
    // Supervisor stopped (manually or killed)
    _rafId = null;
    _onStopped();
  }
}

function _onStopped(): void {
  if (!_graph || !_sigma) return;
  setState({ simulationRunning: false });
  _sigma.setSetting('renderLabels', true);
  rebuildEdgeLengthCache(_graph);
  _sigma.refresh({ skipIndexation: true });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initSimulation(
  graph: Graph,
  sigma: Sigma<any, any, any>,
  params: FA2Params = DEFAULT_FA2_PARAMS,
): void {
  _graph = graph;
  _sigma = sigma;
  _params = { ...params };
  _supervisor = _createSupervisor();
}

export function startSimulation(): void {
  if (!_supervisor || !_params.enabled) return;
  _sigma?.setSetting('renderLabels', false);
  setState({ simulationRunning: true });
  _supervisor.start();
  if (_rafId !== null) cancelAnimationFrame(_rafId);
  _rafId = requestAnimationFrame(_loop);
}

export function stopSimulation(): void {
  if (!_supervisor) return;
  _supervisor.stop();
  // _loop détectera isRunning() === false et appellera _onStopped()
}

// reheat : relancer la simulation (paramètre alpha ignoré pour FA2)
export function reheat(_alpha = 0.3): void {
  if (!_params.enabled) return;
  if (!_supervisor?.isRunning()) {
    startSimulation();
  }
}

// Appelé pendant le drag — le Worker FA2 lira les nouvelles positions sur son prochain tick
export function setNodeFixed(nodeId: string, x: number, y: number): void {
  if (!_graph) return;
  _graph.setNodeAttribute(nodeId, 'x', x);
  _graph.setNodeAttribute(nodeId, 'y', y);
}

// FA2 n'a pas de nœuds "fixes" — le nœud reprendra son mouvement naturellement
export function releaseNode(_nodeId: string): void {}

// Compatibilité drag.ts — no-op pour FA2 (alpha target n'existe pas)
export function setAlphaTarget(_target: number): void {}

export function updateParams(partial: Partial<FA2Params>): void {
  _params = { ..._params, ...partial };

  if (_supervisor) {
    const wasRunning = _supervisor.isRunning();
    _supervisor.kill();
    _supervisor = _createSupervisor();
    if (wasRunning && _params.enabled) {
      startSimulation();
    }
  }

  if ('enabled' in partial && !_params.enabled) {
    stopSimulation();
  }
}

export function isSimulationRunning(): boolean {
  return _supervisor?.isRunning() ?? false;
}

export function getSimulation(): InstanceType<typeof FA2LayoutSupervisor> | null {
  return _supervisor;
}
