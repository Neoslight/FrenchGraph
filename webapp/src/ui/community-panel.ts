import type { CommunityInfo } from '../data/loader.ts';
import { getCommunityColorRanked } from '../utils/colors.ts';
import { setState, getState } from '../state.ts';
import { getSigma } from '../graph/renderer.ts';
import { animateToBBox } from '../graph/camera.ts';
import { getGraph } from '../data/graph-store.ts';
import { $, show, hide, toggle } from '../utils/dom.ts';

let communities: CommunityInfo[] = [];

export function initCommunityPanel(data: CommunityInfo[]): void {
  communities = data;

  // Toggle panel
  $('#btn-communities').addEventListener('click', () => {
    toggle($('#community-panel'));
  });

  // Close button
  $('#community-panel .panel-close').addEventListener('click', () => {
    hide($('#community-panel'));
  });

  renderCommunities();
}

function renderCommunities(): void {
  const list = $('#community-list');
  list.innerHTML = communities.map((c, rank) => {
    const color = getCommunityColorRanked(c.id);
    const topNames = c.topMembers.slice(0, 3).map(m => m.name).join(', ');
    return `
      <div class="community-item" data-id="${c.id}">
        <div class="community-item-header">
          <span class="community-dot-large" style="background:${color}"></span>
          <div class="community-item-info">
            <span class="community-item-size">${c.size} artistes</span>
            <span class="community-item-names">${escapeHtml(topNames)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Click handlers
  list.querySelectorAll('.community-item').forEach(el => {
    el.addEventListener('click', () => {
      const cid = parseInt((el as HTMLElement).dataset.id!);
      highlightCommunity(cid);
    });
  });
}

export function highlightCommunity(communityId: number): void {
  const state = getState();

  // Toggle off if same community
  if (state.highlightedCommunity === communityId) {
    setState({
      highlightedCommunity: null,
      selectedNode: null,
      egoNodes: null,
      egoEdges: null,
    });
    getSigma().refresh();
    return;
  }

  setState({
    highlightedCommunity: communityId,
    selectedNode: null,
    egoNodes: null,
    egoEdges: null,
    pathNodes: null,
    pathEdges: null,
  });

  // Zoom to community
  const graph = getGraph();
  const communityNodes: string[] = [];
  graph.forEachNode((node, attrs) => {
    if (attrs.community === communityId) communityNodes.push(node);
  });

  if (communityNodes.length > 0) {
    animateToBBox(communityNodes);
  }

  getSigma().refresh();
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
