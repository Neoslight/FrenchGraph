import { findShortestPath } from '../data/algorithms.ts';
import { getGraph } from '../data/graph-store.ts';
import { loadDetails } from '../data/loader.ts';
import { setState } from '../state.ts';
import { getSigma } from '../graph/renderer.ts';
import { animateToBBox } from '../graph/camera.ts';
import { createSearchHandler } from './search.ts';
import { selectNode } from './artist-panel.ts';
import { COLORS } from '../utils/colors.ts';
import { $, show, hide } from '../utils/dom.ts';

let fromId: number | null = null;
let toId: number | null = null;

export function initPathFinder(): void {
  const modal = $('#path-modal');
  const findBtn = $('#path-find-btn') as HTMLButtonElement;

  // Open modal
  $('#btn-path').addEventListener('click', () => {
    show(modal);
  });

  // Close modal
  modal.querySelector('.modal-close')!.addEventListener('click', () => {
    hide(modal);
  });

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hide(modal);
  });

  // Search handlers for path inputs
  const fromInput = $('#path-from') as HTMLInputElement;
  const toInput = $('#path-to') as HTMLInputElement;
  const fromResults = $('#path-from-results');
  const toResults = $('#path-to-results');

  createSearchHandler(fromInput, fromResults, (id, name) => {
    fromId = id;
    updateFindButton(findBtn);
  });

  createSearchHandler(toInput, toResults, (id, name) => {
    toId = id;
    updateFindButton(findBtn);
  });

  findBtn.addEventListener('click', () => {
    if (fromId && toId) executePath(String(fromId), String(toId));
  });
}

function updateFindButton(btn: HTMLButtonElement): void {
  btn.disabled = !(fromId && toId);
}

async function executePath(from: string, to: string): Promise<void> {
  const path = findShortestPath(from, to);
  const resultEl = $('#path-result');
  const graph = getGraph();

  if (!path || path.length === 0) {
    resultEl.innerHTML = '<p class="text-muted">Aucun chemin trouvé.</p>';
    show(resultEl);
    return;
  }

  // Build path edges set
  const pathEdges = new Set<string>();
  for (let i = 0; i < path.length - 1; i++) {
    const edgeId = graph.edge(path[i], path[i + 1]);
    if (edgeId) pathEdges.add(edgeId);
  }

  setState({
    pathNodes: path,
    pathEdges,
    selectedNode: null,
    egoNodes: null,
    egoEdges: null,
    highlightedCommunity: null,
  });

  getSigma().refresh();
  animateToBBox(path, 800);

  // Show result in modal
  const names = path.map(id => graph.getNodeAttribute(id, 'label'));
  resultEl.innerHTML = `
    <div class="path-found">
      <p class="path-hops">${path.length - 1} degré${path.length > 2 ? 's' : ''} de séparation</p>
      <div class="path-chain">
        ${names.map((name, i) => `<span class="path-node" data-id="${path[i]}">${escapeHtml(name)}</span>${i < names.length - 1 ? '<span class="path-arrow">→</span>' : ''}`).join('')}
      </div>
    </div>
  `;
  show(resultEl);

  // Click on path nodes
  resultEl.querySelectorAll('.path-node').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.id!;
      selectNode(id);
      hide($('#path-modal'));
    });
  });

  // Show path strip at bottom
  showPathStrip(path, names);

  // Load details for each hop
  loadPathDetails(path);
}

async function loadPathDetails(path: string[]): Promise<void> {
  try {
    const details = await loadDetails();
    const graph = getGraph();
    const resultEl = $('#path-result');
    const hopDetails: string[] = [];

    for (let i = 0; i < path.length - 1; i++) {
      const a = Math.min(+path[i], +path[i + 1]);
      const b = Math.max(+path[i], +path[i + 1]);
      const key = `${a}-${b}`;
      const songs = details[key] || [];
      const nameA = graph.getNodeAttribute(path[i], 'label');
      const nameB = graph.getNodeAttribute(path[i + 1], 'label');

      if (songs.length > 0) {
        const song = songs[0];
        hopDetails.push(`${escapeHtml(nameA)} × ${escapeHtml(nameB)} : "${escapeHtml(song.title)}"${song.year ? ` (${song.year})` : ''}`);
      }
    }

    if (hopDetails.length > 0) {
      const existingContent = resultEl.innerHTML;
      resultEl.innerHTML = existingContent + `
        <div class="path-details">
          ${hopDetails.map(h => `<div class="path-hop-detail">${h}</div>`).join('')}
        </div>
      `;
    }
  } catch { /* ignore */ }
}

function showPathStrip(path: string[], names: string[]): void {
  const strip = $('#path-strip');
  strip.innerHTML = `
    <div class="path-strip-content">
      <span class="path-strip-label">Chemin :</span>
      ${names.map((name, i) => `<span class="path-strip-node" data-id="${path[i]}">${escapeHtml(name)}</span>${i < names.length - 1 ? '<span class="path-strip-arrow">→</span>' : ''}`).join('')}
      <button class="path-strip-close">&times;</button>
    </div>
  `;
  show(strip);

  strip.querySelector('.path-strip-close')!.addEventListener('click', () => {
    clearPath();
  });

  strip.querySelectorAll('.path-strip-node').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.id!;
      selectNode(id);
    });
  });
}

export function clearPath(): void {
  setState({ pathNodes: null, pathEdges: null });
  hide($('#path-strip'));
  getSigma().refresh();
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
