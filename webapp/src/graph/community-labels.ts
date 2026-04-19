import type Sigma from 'sigma';
import type Graph from 'graphology';
import type { CommunityInfo } from '../data/loader.ts';
import { getCommunityColorRanked } from '../utils/colors.ts';
import { getState, onStateChange } from '../state.ts';
import { highlightCommunity } from '../ui/community-panel.ts';

// ─── Helpers ────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Noms curatés ───────────────────────────────────────────────────────────

const COMMUNITY_NAMES: Record<number, string> = {
  0: "Grünt / Rap Alternatif",
  1: "Rap Conscient / Classique",
  2: "Pop Française / Variété",
  3: "Rap Années 2010 / Mainstream",
  4: "Rap Mainstream / Freestyle",
  5: "Rap Alternatif / Émergent",
  6: "Rap Indé / Underground",
  7: "Afrobeats / R&B",
  8: "L'Entourage / Rap Technique",
  9: "Rap Engagé / Mainstream",
  10: "Street Rap / Hardcore",
  11: "Rap Belge",
  12: "Cloud Rap / Digital",
  13: "Rap Indé / Boom Bap",
  14: "Marseille / 13 Organisé",
  15: "Rap Indé",
  16: "Nouvelle Vague / Médias Rap",
  17: "New Wave / Rap Underground",
  18: "Rap Québécois",
  19: "Rap Suisse",
  20: "Drill / 667 / Underground",
  21: "Pop Urbaine / Variété",
  22: "L'Animalerie / Rap Indé Lyon",
  23: "Boulangerie Française / Turn Up",
  24: "Rap Pop / R&B",
  25: "Rap Alternatif / Pionniers",
  26: "Rap Underground 90s/00s",
  27: "Vald / Rap Absurde",
  28: "Rap Chrétien / Gospel",
  29: "Divertissement / YouTubeurs",
  30: "Battle Rap",
  31: "Rap Underground / SoundCloud",
  32: "Comédie / YouTubeurs",
  33: "Slam / Poésie Urbaine",
  34: "Rap 93 / Courtilières",
  35: "PNL / QLF",
  36: "YouTube Rap / Divertissement",
  37: "Guette l'ascension / Émergent",
  38: "Starmania / Variété",
  39: "93 Gang / Rap Ghetto",
  40: "Rap Indé",
  41: "Rap Émergent",
  42: "Rap Underground / Indé",
  43: "Rap Émergent",
  44: "New Wave / SoundCloud",
  45: "Rap Émergent / SoundCloud",
  46: "Rap Grand Est / Boom Bap",
  47: "Rap Underground / Freestyle",
  48: "Geek Music / YouTube",
  49: "Indie Québécois",
  50: "Rap Émergent / SoundCloud",
  51: "Hyperpop / SoundCloud",
  52: "Rap Féminin / Marseille",
  53: "Livre Audio / Doublage",
  54: "Collectif 10B",
  55: "Sheguey Squaad / Gradur",
  56: "Rap Émergent / Beatmaking",
  57: "Musique Malienne",
  58: "Rap Émergent / SoundCloud",
  59: "Rap Émergent / Nord",
  60: "Rap Émergent",
  61: "Rap Nationaliste",
  62: "Electro / Bass Music",
  63: "Comédies Musicales (Cindy 2002)",
  64: "Chanson Québécoise",
  65: "Comédies Musicales Classiques",
  66: "Cinéma Français Classique",
  67: "Rap Indé / PLSD",
  68: "Rap Indé",
  69: "Comédies Musicales / Télé-Crochet",
  70: "Stupeflip / Punk Rap",
  71: "Production Audiovisuelle",
  72: "Rap Indé",
  73: "Collectif 135 / Émergent",
  74: "Zouk / Kompa",
  75: "Rap Indé",
  76: "Musique Algérienne / Raï",
  77: "QLF / MMZ",
  78: "Rap Malgache"
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface CommunityLabel {
  id: number;
  graphX: number;
  graphY: number;
  name: string;
  size: number;
  color: string;
  el: HTMLDivElement;
  // Nœuds appartenant à cette communauté (pour le recalcul des centroïdes)
  nodeIds: string[];
}

// ─── State ──────────────────────────────────────────────────────────────────

let _labels: CommunityLabel[] = [];
let _sigma: Sigma<any, any, any> | null = null;
let _graph: Graph | null = null;
let _overlay: HTMLDivElement | null = null;

// ─── Init ───────────────────────────────────────────────────────────────────

export function initCommunityLabels(sigma: Sigma<any, any, any>): void {
  _sigma = sigma;

  const container = sigma.getContainer();
  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }

  _overlay = document.createElement('div');
  _overlay.id = 'community-labels-overlay';
  container.appendChild(_overlay);

  // Repositionner à chaque mouvement de caméra (y compris pendant la simulation)
  sigma.getCamera().on('updated', () => {
    // Pendant la simulation FA2 : recalcul des centroïdes depuis les positions actuelles
    if (getState().simulationRunning && _graph) {
      _recomputeCentroids();
    }
    _updatePositions();
    _updateVisibility();
  });

  onStateChange(_updateActiveState);
  onStateChange(() => {
    // Réagir aux changements de visibilité
    if (_overlay) {
      _overlay.style.display = getState().communityLabelsVisible ? '' : 'none';
    }
  });
}

// ─── Recalcul des centroïdes depuis les nœuds actuels ───────────────────────

function _recomputeCentroids(): void {
  if (!_graph) return;
  for (const label of _labels) {
    if (label.nodeIds.length === 0) continue;
    let sumX = 0, sumY = 0;
    for (const id of label.nodeIds) {
      sumX += _graph.getNodeAttribute(id, 'x') as number;
      sumY += _graph.getNodeAttribute(id, 'y') as number;
    }
    label.graphX = sumX / label.nodeIds.length;
    label.graphY = sumY / label.nodeIds.length;
  }
}

// ─── Data ───────────────────────────────────────────────────────────────────

export function setCommunityLabelsData(communities: CommunityInfo[], graph: Graph): void {
  if (!_overlay) return;
  _graph = graph;

  _overlay.innerHTML = '';
  _labels = [];

  // Indexer les nœuds par communauté pour le recalcul futur
  const commNodes = new Map<number, string[]>();
  graph.forEachNode((id, attrs) => {
    const cid = attrs.community as number;
    const arr = commNodes.get(cid) ?? [];
    arr.push(id);
    commNodes.set(cid, arr);
  });

  // Calculer les centroïdes initiaux depuis les positions actuelles du graphe
  const sums = new Map<number, { x: number; y: number; count: number }>();
  graph.forEachNode((_, attrs) => {
    const cid = attrs.community as number;
    const s = sums.get(cid) ?? { x: 0, y: 0, count: 0 };
    s.x += attrs.x as number;
    s.y += attrs.y as number;
    s.count++;
    sums.set(cid, s);
  });

  for (const c of communities) {
    if (c.size < 5 || c.topMembers.length === 0) continue;

    const sum = sums.get(c.id);
    if (!sum) continue;

    const graphX = sum.x / sum.count;
    const graphY = sum.y / sum.count;
    const name = COMMUNITY_NAMES[c.id] ?? c.topMembers[0].name;
    const color = getCommunityColorRanked(c.id);

    const el = document.createElement('div');
    el.className = 'community-badge';
    el.dataset.communityId = String(c.id);

    el.style.setProperty('--cc', color);
    el.style.setProperty('--cc-bg',     hexToRgba(color, 0.18));
    el.style.setProperty('--cc-border', hexToRgba(color, 0.50));
    el.style.setProperty('--cc-hover',  hexToRgba(color, 0.35));
    el.style.setProperty('--cc-active', hexToRgba(color, 0.55));

    el.textContent = name;

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      highlightCommunity(c.id);
    });

    _overlay!.appendChild(el);
    _labels.push({
      id: c.id,
      graphX,
      graphY,
      name,
      size: c.size,
      color,
      el,
      nodeIds: commNodes.get(c.id) ?? [],
    });
  }

  _updatePositions();
  _updateVisibility();
  _updateActiveState();
}

// ─── Mise à jour positions + anti-collision ─────────────────────────────────

function _updatePositions(): void {
  if (!_sigma || _labels.length === 0) return;

  const ratio = _sigma.getCamera().ratio;
  // Badges plus grands en zoom arrière pour rester lisibles
  const scale = Math.min(Math.max(ratio * 0.65, 0.75), 1.8);

  // Calculer toutes les positions viewport d'abord
  type Placed = { x: number; y: number; halfW: number; halfH: number };
  const placed: Placed[] = [];
  const BADGE_H = 24 * scale; // hauteur approximative en px
  const PAD_V = 8;            // marge verticale supplémentaire

  // Trier par taille décroissante : les grandes communautés ont priorité
  const sorted = [..._labels].sort((a, b) => b.size - a.size);

  for (const label of sorted) {
    const vp = _sigma.graphToViewport({ x: label.graphX, y: label.graphY });

    // Largeur estimée du badge en px (police 12px * scale, + padding 20px)
    const textLen = label.name.length;
    const badgeW  = (textLen * 7 + 20) * scale;
    const halfW   = badgeW / 2;
    const halfH   = (BADGE_H + PAD_V) / 2;

    // Anti-collision AABB
    let collides = false;
    for (const p of placed) {
      const overlapX = Math.abs(vp.x - p.x) < (halfW + p.halfW);
      const overlapY = Math.abs(vp.y - p.y) < (halfH + p.halfH);
      if (overlapX && overlapY) {
        collides = true;
        break;
      }
    }

    if (collides) {
      label.el.style.opacity = '0';
      label.el.style.pointerEvents = 'none';
    } else {
      label.el.style.opacity = '';
      label.el.style.pointerEvents = '';
      label.el.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      label.el.style.left = `${vp.x}px`;
      label.el.style.top  = `${vp.y}px`;
      placed.push({ x: vp.x, y: vp.y, halfW, halfH });
    }
  }
}

// ─── Mise à jour visibilité globale (zoom) ───────────────────────────────────

function _updateVisibility(): void {
  if (!_sigma || !_overlay) return;

  const ratio = _sigma.getCamera().ratio;

  let opacity: number;
  if (ratio < 0.35 || ratio > 14)  opacity = 0;
  else if (ratio < 0.6)             opacity = (ratio - 0.35) / 0.25;
  else if (ratio > 10)              opacity = 1 - (ratio - 10) / 4;
  else                              opacity = 1;

  opacity = Math.max(0, Math.min(1, opacity));
  _overlay.style.opacity = String(opacity);
}

// ─── État actif (sélection communauté) ─────────────────────────────────────

function _updateActiveState(): void {
  const state = getState();
  const activeCommunity = state.highlightedCommunity;

  for (const label of _labels) {
    const isActive = activeCommunity === label.id;
    label.el.classList.toggle('community-badge--active', isActive);
    label.el.classList.toggle('community-badge--dimmed',
      activeCommunity !== null && !isActive
    );
  }
}

// ─── Toggle visibilité ───────────────────────────────────────────────────────

export function setCommunityLabelsVisible(visible: boolean): void {
  if (_overlay) _overlay.style.display = visible ? '' : 'none';
}
