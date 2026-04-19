import { $ } from '../utils/dom.ts';
import { getState, setState } from '../state.ts';
import {
  updateParams,
  reheat,
  stopSimulation,
  type FA2Params,
} from '../graph/simulation.ts';
import { getGraph } from '../data/graph-store.ts';
import { getSigma } from '../graph/renderer.ts';

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

function debounce(fn: () => void, delay = 100): void {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(fn, delay);
}

function updateSliderDisplay(sliderId: string, valueId: string, suffix = ''): number {
  const slider = $(`#${sliderId}`) as HTMLInputElement;
  const display = $(`#${valueId}`);
  const val = parseFloat(slider.value);
  display.textContent = val.toFixed(val % 1 === 0 ? 0 : 2) + suffix;
  return val;
}

export function initForcePanel(): void {
  const panel = $('#force-panel');
  const btn = $('#btn-force');
  const closeBtn = panel.querySelector('.panel-close') as HTMLButtonElement;
  const toggle = $('#force-enabled') as HTMLInputElement;
  const reheatBtn = $('#force-reheat');
  const resetBtn = $('#force-reset');

  // Ouvrir/fermer le panel
  btn.addEventListener('click', () => {
    panel.classList.toggle('hidden');
  });
  closeBtn.addEventListener('click', () => {
    panel.classList.add('hidden');
  });

  // Toggle simulation on/off
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    setState({ simulationEnabled: enabled });
    updateParams({ enabled });
    if (enabled) {
      reheat();
    } else {
      stopSimulation();
    }
  });

  // Bouton "Relancer"
  reheatBtn.addEventListener('click', () => {
    if (!getState().simulationEnabled) {
      toggle.checked = true;
      setState({ simulationEnabled: true });
      updateParams({ enabled: true });
    }
    reheat();
  });

  // Bouton "Réinitialiser layout"
  resetBtn.addEventListener('click', () => {
    const { originalPositions } = getState() as any;
    if (!originalPositions) return;

    stopSimulation();
    toggle.checked = false;
    setState({ simulationEnabled: false });
    updateParams({ enabled: false });

    const graph = getGraph();
    graph.forEachNode((id) => {
      const orig = originalPositions.get(id);
      if (orig) {
        graph.setNodeAttribute(id, 'x', orig.x);
        graph.setNodeAttribute(id, 'y', orig.y);
      }
    });
    getSigma().refresh({ skipIndexation: true });
  });

  // === Sliders FA2 ===

  function makeSlider(sliderId: string, valueId: string, suffix: string, paramKey: keyof FA2Params): void {
    const slider = $(`#${sliderId}`) as HTMLInputElement;
    slider.addEventListener('input', () => {
      const val = updateSliderDisplay(sliderId, valueId, suffix);
      debounce(() => {
        updateParams({ [paramKey]: val } as Partial<FA2Params>);
        const state = getState();
        setState({ forceParams: { ...state.forceParams, [paramKey]: val } });
        if (state.simulationEnabled) reheat();
      });
    });
    updateSliderDisplay(sliderId, valueId, suffix);
  }

  makeSlider('fa2-scaling', 'fa2-scaling-val', '', 'scalingRatio');
  makeSlider('fa2-gravity', 'fa2-gravity-val', '', 'gravity');
  makeSlider('fa2-slowdown', 'fa2-slowdown-val', '×', 'slowDown');

  // Toggle linLogMode
  const linlogToggle = $('#fa2-linlog') as HTMLInputElement;
  linlogToggle.addEventListener('change', () => {
    const val = linlogToggle.checked;
    debounce(() => {
      updateParams({ linLogMode: val });
      const state = getState();
      setState({ forceParams: { ...state.forceParams, linLogMode: val } });
      if (state.simulationEnabled) reheat();
    });
  });

  // Toggle adjustSizes
  const adjustToggle = $('#fa2-adjust-sizes') as HTMLInputElement;
  adjustToggle.addEventListener('change', () => {
    const val = adjustToggle.checked;
    debounce(() => {
      updateParams({ adjustSizes: val });
      const state = getState();
      setState({ forceParams: { ...state.forceParams, adjustSizes: val } });
      if (state.simulationEnabled) reheat();
    });
  });
}
