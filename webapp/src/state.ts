import { type FA2Params, DEFAULT_FA2_PARAMS } from './graph/simulation.ts';

// Centralized application state
export interface AppState {
  hoveredNode: string | null;
  selectedNode: string | null;
  egoNodes: Set<string> | null;
  egoEdges: Set<string> | null;
  pathNodes: string[] | null;
  pathEdges: Set<string> | null;
  highlightedCommunity: number | null;
  hiddenNodes: Set<string> | null;
  hiddenEdges: Set<string> | null;
  yearRange: [number, number];
  edgeWeightThreshold: number; // Min weight to show edge (zoom-dependent)
  cameraRatio: number;         // Current camera zoom ratio (>1 = zoomed out)
  alphaHex: string;            // Discrete edge alpha tier ('08'|'14'|'28'|'40') derived from cameraRatio
  zoomNodeThreshold: number;   // Min degree to show a node at current zoom (LOD)
  simulationEnabled: boolean;
  simulationRunning: boolean;
  communityLabelsVisible: boolean;
  forceParams: FA2Params;
  originalPositions: Map<string, { x: number; y: number }> | null;
}

const state: AppState = {
  hoveredNode: null,
  selectedNode: null,
  egoNodes: null,
  egoEdges: null,
  pathNodes: null,
  pathEdges: null,
  highlightedCommunity: null,
  hiddenNodes: null,
  hiddenEdges: null,
  yearRange: [2000, 2025],
  edgeWeightThreshold: 3,
  cameraRatio: 1,
  alphaHex: '40',
  zoomNodeThreshold: 1,
  simulationEnabled: false,
  simulationRunning: false,
  communityLabelsVisible: true,
  forceParams: { ...DEFAULT_FA2_PARAMS },
  originalPositions: null,
};

type Listener = () => void;
const listeners: Listener[] = [];

export function getState(): AppState {
  return state;
}

export function setState(partial: Partial<AppState>): void {
  Object.assign(state, partial);
  listeners.forEach(fn => fn());
}

export function onStateChange(fn: Listener): void {
  listeners.push(fn);
}
