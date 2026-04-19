import type { Settings } from 'sigma/settings';
import type { NodeDisplayData, PartialButFor } from 'sigma/types';
import { getState } from '../state.ts';

// Position souris en coordonnées viewport (px), mis à jour depuis main.ts
let _mouseX = -9999;
let _mouseY = -9999;

// Anti-collision : positions déjà rendues ce frame (reset chaque frame)
const _placed: Array<{ x: number; y: number; halfW: number }> = [];
let _lastFrameId = -1;
// Compteur de labels rendus hors ego-network (cap pour la vue par défaut)
let _defaultLabelsThisFrame = 0;
const MAX_DEFAULT_LABELS = 10;

// Rayon fixe en pixels autour du curseur pour la vue par défaut
const MOUSE_RADIUS_PX = 90;

export function setMouseViewport(x: number, y: number): void {
  _mouseX = x;
  _mouseY = y;
}

export function drawNodeLabel(
  context: CanvasRenderingContext2D,
  data: PartialButFor<NodeDisplayData, 'x' | 'y' | 'size' | 'label' | 'color'>,
  settings: Settings,
): void {
  if (!data.label) return;

  const { x, y, size, label } = data;
  const state = getState();

  // ── Reset par frame ──────────────────────────────────────────────────────
  const frameId = performance.now() | 0;
  if (frameId !== _lastFrameId) {
    _placed.length = 0;
    _defaultLabelsThisFrame = 0;
    _lastFrameId = frameId;
  }

  // ── Filtre visibilité ────────────────────────────────────────────────────
  const inEgoOrPath = state.selectedNode !== null || (state.pathNodes?.length ?? 0) > 0;

  if (!inEgoOrPath) {
    // Vue par défaut : labels uniquement près de la souris, cap à MAX_DEFAULT_LABELS
    if (_defaultLabelsThisFrame >= MAX_DEFAULT_LABELS) return;
    if (Math.hypot(x - _mouseX, y - _mouseY) > MOUSE_RADIUS_PX) return;
    _defaultLabelsThisFrame++;
  }
  // En mode ego/path : le reducer a déjà mis label=null pour les nœuds hors réseau,
  // donc on laisse passer tous les labels qui arrivent ici.

  // ── Anti-collision AABB ──────────────────────────────────────────────────
  const fontSize = 12;
  context.font = `${settings.labelWeight ?? '600'} ${fontSize}px ${settings.labelFont ?? 'Inter, sans-serif'}`;
  const textWidth = context.measureText(label).width;
  const halfW = (textWidth + 6) / 2;

  for (const p of _placed) {
    if (Math.abs(x - p.x) < (halfW + p.halfW + 4) && Math.abs(y - p.y) < fontSize + 6) return;
  }
  _placed.push({ x, y, halfW });

  // ── Dessin ───────────────────────────────────────────────────────────────
  const labelX = x + size + 3;
  const labelY = y + size / 3;

  context.fillStyle = 'rgba(10, 10, 15, 0.82)';
  context.fillRect(labelX - 2, labelY - fontSize, textWidth + 4, fontSize + 4);

  context.fillStyle = settings.labelColor?.color ?? '#e8e6e3';
  context.fillText(label, labelX, labelY);
}
