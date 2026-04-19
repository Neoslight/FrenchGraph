import { getSigma } from '../graph/renderer.ts';
import { getGraph } from '../data/graph-store.ts';
import { getCommunityColorRanked } from '../utils/colors.ts';
import { setState } from '../state.ts';
import { $, show, hide } from '../utils/dom.ts';

export function initTooltip(): void {
  const sigma = getSigma();
  const tooltip = $('#tooltip');

  sigma.on('enterNode', ({ node }) => {
    setState({ hoveredNode: node });
    sigma.refresh();

    const graph = getGraph();
    const name = graph.getNodeAttribute(node, 'label');
    const degree = graph.getNodeAttribute(node, 'degree');
    const community = graph.getNodeAttribute(node, 'community');
    const color = getCommunityColorRanked(community);

    tooltip.innerHTML = `
      <span class="tooltip-dot" style="background:${color}"></span>
      <span class="tooltip-name">${escapeHtml(name)}</span>
      <span class="tooltip-meta">${degree} collabs</span>
    `;
    show(tooltip);
    document.body.style.cursor = 'pointer';
  });

  sigma.on('leaveNode', () => {
    setState({ hoveredNode: null });
    sigma.refresh();
    hide(tooltip);
    document.body.style.cursor = 'default';
  });

  // Track mouse for tooltip positioning
  sigma.getMouseCaptor().on('mousemovebody', (coords) => {
    if (tooltip.classList.contains('hidden')) return;
    const e = coords.original as MouseEvent;
    // Keep tooltip within viewport
    const tw = tooltip.offsetWidth + 20;
    const th = tooltip.offsetHeight + 20;
    const x = e.clientX + 16;
    const y = e.clientY + 16;
    tooltip.style.left = `${Math.min(x, window.innerWidth - tw)}px`;
    tooltip.style.top = `${Math.min(y, window.innerHeight - th)}px`;
  });
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
