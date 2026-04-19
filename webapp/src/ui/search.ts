import Fuse from 'fuse.js';
import type { SearchEntry } from '../data/loader.ts';
import { getCommunityColorRanked } from '../utils/colors.ts';
import { getGraph } from '../data/graph-store.ts';
import { animateToNode } from '../graph/camera.ts';
import { selectNode } from './artist-panel.ts';
import { $, show, hide } from '../utils/dom.ts';

let fuse: Fuse<SearchEntry>;

export function initSearch(entries: SearchEntry[]): void {
  fuse = new Fuse(entries, {
    keys: ['name'],
    threshold: 0.3,
    minMatchCharLength: 2,
  });

  const input = $('#search-input') as HTMLInputElement;
  const resultsEl = $('#search-results');

  input.addEventListener('input', () => {
    const query = input.value.trim();
    if (query.length < 2) {
      hide(resultsEl);
      return;
    }
    const results = fuse.search(query, { limit: 8 });
    renderResults(results.map(r => r.item), resultsEl, input);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hide(resultsEl);
      input.blur();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      navigateResults(resultsEl, e.key === 'ArrowDown' ? 1 : -1);
    }
    if (e.key === 'Enter') {
      const active = resultsEl.querySelector('.search-result.active') as HTMLElement;
      if (active) active.click();
    }
  });

  // Close results on outside click
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('#search-container')) {
      hide(resultsEl);
    }
  });
}

function renderResults(items: SearchEntry[], container: HTMLElement, input: HTMLInputElement): void {
  if (items.length === 0) {
    hide(container);
    return;
  }

  const graph = getGraph();
  container.innerHTML = items.map((item, i) => {
    const nodeId = String(item.id);
    let community = 0;
    let degree = 0;
    if (graph.hasNode(nodeId)) {
      community = graph.getNodeAttribute(nodeId, 'community');
      degree = graph.getNodeAttribute(nodeId, 'degree');
    }
    const color = getCommunityColorRanked(community);
    return `<div class="search-result${i === 0 ? ' active' : ''}" data-id="${item.id}">
      <span class="community-dot" style="background:${color}"></span>
      <span class="result-name">${escapeHtml(item.name)}</span>
      <span class="result-degree">${degree} collabs</span>
    </div>`;
  }).join('');

  show(container);

  // Attach click handlers
  container.querySelectorAll('.search-result').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.id!;
      input.value = '';
      hide(container);
      animateToNode(id);
      selectNode(id);
    });
  });
}

function navigateResults(container: HTMLElement, direction: number): void {
  const items = Array.from(container.querySelectorAll('.search-result'));
  if (items.length === 0) return;
  const activeIdx = items.findIndex(el => el.classList.contains('active'));
  items[activeIdx]?.classList.remove('active');
  const newIdx = Math.max(0, Math.min(items.length - 1, activeIdx + direction));
  items[newIdx].classList.add('active');
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Reusable for path finder
export function createSearchHandler(
  input: HTMLInputElement,
  resultsEl: HTMLElement,
  onSelect: (id: number, name: string) => void
): void {
  if (!fuse) return;

  input.addEventListener('input', () => {
    const query = input.value.trim();
    if (query.length < 2) {
      hide(resultsEl);
      return;
    }
    const results = fuse.search(query, { limit: 5 });
    renderPathResults(results.map(r => r.item), resultsEl, input, onSelect);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide(resultsEl);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      navigateResults(resultsEl, e.key === 'ArrowDown' ? 1 : -1);
    }
    if (e.key === 'Enter') {
      const active = resultsEl.querySelector('.search-result.active') as HTMLElement;
      if (active) active.click();
    }
  });
}

function renderPathResults(
  items: SearchEntry[],
  container: HTMLElement,
  input: HTMLInputElement,
  onSelect: (id: number, name: string) => void
): void {
  if (items.length === 0) { hide(container); return; }

  container.innerHTML = items.map((item, i) =>
    `<div class="search-result${i === 0 ? ' active' : ''}" data-id="${item.id}" data-name="${escapeHtml(item.name)}">
      <span class="result-name">${escapeHtml(item.name)}</span>
    </div>`
  ).join('');
  show(container);

  container.querySelectorAll('.search-result').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt((el as HTMLElement).dataset.id!);
      const name = (el as HTMLElement).dataset.name!;
      input.value = name;
      hide(container);
      onSelect(id, name);
    });
  });
}
