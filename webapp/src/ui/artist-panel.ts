import { getGraph } from '../data/graph-store.ts';
import { loadArtists, loadDetails } from '../data/loader.ts';
import { getEgoNetwork } from '../data/algorithms.ts';
import { getCommunityColorRanked } from '../utils/colors.ts';
import { setState, getState } from '../state.ts';
import { getSigma } from '../graph/renderer.ts';
import { animateToNode } from '../graph/camera.ts';
import { $, show, hide } from '../utils/dom.ts';

export function initArtistPanel(): void {
  // Close button
  $('#artist-panel .panel-close').addEventListener('click', () => {
    deselectNode();
  });
}

export async function selectNode(nodeId: string): Promise<void> {
  const graph = getGraph();
  if (!graph.hasNode(nodeId)) return;

  // Set ego network state
  const ego = getEgoNetwork(nodeId);
  setState({
    selectedNode: nodeId,
    egoNodes: ego.nodes,
    egoEdges: ego.edges,
    pathNodes: null,
    pathEdges: null,
    highlightedCommunity: null,
  });

  getSigma().refresh();
  show($('#artist-panel'));

  // Render basic info from graph attributes
  const attrs = graph.getNodeAttribute(nodeId, 'label');
  const community = graph.getNodeAttribute(nodeId, 'community');
  const degree = graph.getNodeAttribute(nodeId, 'degree');
  const color = getCommunityColorRanked(community);

  const content = $('#artist-content');
  content.innerHTML = `
    <div class="artist-header">
      <div class="artist-avatar-container">
        <div class="artist-avatar" style="border-color:${color}">
          <div class="artist-avatar-placeholder">${attrs.charAt(0).toUpperCase()}</div>
        </div>
      </div>
      <h3 class="artist-name">${escapeHtml(attrs)}</h3>
      <div class="artist-stats">
        <span class="stat"><strong>${degree}</strong> collaborations</span>
        <span class="stat"><span class="community-dot" style="background:${color}"></span> Communauté ${community}</span>
      </div>
      <div class="artist-actions" id="artist-actions"></div>
    </div>
    <div class="artist-collabs" id="artist-collabs">
      <p class="text-muted">Chargement des collaborations...</p>
    </div>
  `;

  // Load full artist data asynchronously
  loadFullArtistData(nodeId);
}

async function loadFullArtistData(nodeId: string): Promise<void> {
  try {
    const [artists, details] = await Promise.all([loadArtists(), loadDetails()]);
    const graph = getGraph();

    // Check if still selected
    if (getState().selectedNode !== nodeId) return;

    const artist = artists[nodeId];
    if (!artist) return;

    // Update avatar with image
    if (artist.image) {
      const avatarEl = $('#artist-panel .artist-avatar');
      if (avatarEl) {
        avatarEl.innerHTML = `<img src="${artist.image}" alt="${escapeHtml(artist.name)}" onerror="this.parentElement.innerHTML='<div class=\\'artist-avatar-placeholder\\'>${artist.name.charAt(0).toUpperCase()}</div>'" />`;
      }
    }

    // Add Genius link
    const actionsEl = $('#artist-actions');
    if (actionsEl && artist.url) {
      actionsEl.innerHTML = `<a href="${artist.url}" target="_blank" rel="noopener" class="btn-genius">Voir sur Genius</a>`;
    }

    // Build collaboration list
    const neighbors = graph.neighbors(nodeId);
    const collabMap: Map<string, { name: string; songs: { title: string; year?: number }[]; count: number }> = new Map();

    for (const neighborId of neighbors) {
      const neighborName = graph.getNodeAttribute(neighborId, 'label');
      const key1 = `${Math.min(+nodeId, +neighborId)}-${Math.max(+nodeId, +neighborId)}`;
      const songs = details[key1] || [];

      collabMap.set(neighborId, {
        name: neighborName,
        songs: songs.map(s => ({ title: s.title, year: s.year })),
        count: songs.length || 1,
      });
    }

    // Sort by number of songs (desc)
    const sorted = [...collabMap.entries()].sort((a, b) => b[1].count - a[1].count);

    const collabsEl = $('#artist-collabs');
    if (!collabsEl) return;

    if (sorted.length === 0) {
      collabsEl.innerHTML = '<p class="text-muted">Aucune collaboration trouvée.</p>';
      return;
    }

    collabsEl.innerHTML = `
      <h4 class="section-title">Collaborations (${sorted.length} artistes)</h4>
      <div class="collab-list">
        ${sorted.map(([nId, collab]) => {
          const nComm = graph.getNodeAttribute(nId, 'community');
          const nColor = getCommunityColorRanked(nComm);
          const songsHtml = collab.songs.length > 0
            ? collab.songs.slice(0, 5).map(s =>
                `<div class="song-item">${escapeHtml(s.title)}${s.year ? ` <span class="song-year">(${s.year})</span>` : ''}</div>`
              ).join('') + (collab.songs.length > 5 ? `<div class="song-more">+${collab.songs.length - 5} autres</div>` : '')
            : '';
          return `
            <div class="collab-entry" data-id="${nId}">
              <div class="collab-header">
                <span class="community-dot" style="background:${nColor}"></span>
                <span class="collab-name">${escapeHtml(collab.name)}</span>
                <span class="collab-count">${collab.count} titre${collab.count > 1 ? 's' : ''}</span>
              </div>
              ${songsHtml ? `<div class="collab-songs">${songsHtml}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Click on collaborator to navigate
    collabsEl.querySelectorAll('.collab-entry').forEach(el => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.id!;
        animateToNode(id);
        selectNode(id);
      });
    });
  } catch (err) {
    console.error('Failed to load artist details:', err);
  }
}

export function deselectNode(): void {
  setState({
    selectedNode: null,
    egoNodes: null,
    egoEdges: null,
  });
  hide($('#artist-panel'));
  getSigma().refresh();
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
