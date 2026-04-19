import type { StatsData } from '../data/loader.ts';
import { selectNode } from './artist-panel.ts';
import { animateToNode } from '../graph/camera.ts';
import { formatNumber } from '../utils/format.ts';
import { $, show, hide } from '../utils/dom.ts';

export function initStats(stats: StatsData): void {
  const modal = $('#stats-modal');

  $('#btn-stats').addEventListener('click', () => {
    show(modal);
    renderStats(stats);
  });

  modal.querySelector('.modal-close')!.addEventListener('click', () => {
    hide(modal);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) hide(modal);
  });
}

function renderStats(stats: StatsData): void {
  const content = $('#stats-content');

  // Year histogram as SVG
  const years = Object.keys(stats.yearHistogram).map(Number).filter(y => y >= 2000).sort((a, b) => a - b);
  const maxCount = Math.max(...years.map(y => stats.yearHistogram[String(y)] || 0));
  const barWidth = Math.max(12, 500 / years.length);

  const histogramSvg = years.length > 0 ? `
    <svg class="stats-chart" viewBox="0 0 ${years.length * barWidth} 160" preserveAspectRatio="none">
      ${years.map((y, i) => {
        const count = stats.yearHistogram[String(y)] || 0;
        const height = (count / maxCount) * 130;
        return `
          <rect x="${i * barWidth + 1}" y="${130 - height}" width="${barWidth - 2}" height="${height}" fill="#c4a35a" opacity="0.7" rx="2"/>
          <text x="${i * barWidth + barWidth / 2}" y="150" fill="#8b8b9e" font-size="8" text-anchor="middle">${y % 5 === 0 ? y : ''}</text>
        `;
      }).join('')}
    </svg>
  ` : '';

  content.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${formatNumber(stats.totalArtists)}</div>
        <div class="stat-label">Artistes</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatNumber(stats.totalEdges)}</div>
        <div class="stat-label">Connexions uniques</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatNumber(stats.totalSongs)}</div>
        <div class="stat-label">Collaborations totales</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalCommunities}</div>
        <div class="stat-label">Communautés</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.avgDegree}</div>
        <div class="stat-label">Degré moyen</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatNumber(stats.isolatedArtists)}</div>
        <div class="stat-label">Artistes isolés (1 collab)</div>
      </div>
    </div>

    <div class="stats-section">
      <h3>Collaborations par année</h3>
      ${histogramSvg}
    </div>

    <div class="stats-section">
      <h3>Top 20 artistes les plus connectés</h3>
      <div class="stats-list">
        ${stats.topArtists.map((a, i) => `
          <div class="stats-list-item clickable" data-id="${a.id}">
            <span class="stats-rank">${i + 1}</span>
            <span class="stats-name">${escapeHtml(a.name)}</span>
            <span class="stats-value-small">${a.degree} collabs</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="stats-section">
      <h3>Duos les plus prolifiques</h3>
      <div class="stats-list">
        ${stats.topPairs.map((p, i) => `
          <div class="stats-list-item">
            <span class="stats-rank">${i + 1}</span>
            <span class="stats-name">${escapeHtml(p.artists[0])} × ${escapeHtml(p.artists[1])}</span>
            <span class="stats-value-small">${p.songs} titres</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Click handlers for artists
  content.querySelectorAll('.stats-list-item.clickable').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.id!;
      hide($('#stats-modal'));
      animateToNode(String(id));
      selectNode(String(id));
    });
  });
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
