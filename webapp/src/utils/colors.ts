// Community color palette — jewel tones on dark background
const COMMUNITY_PALETTE = [
  '#c4a35a', // gold
  '#7c5cbf', // purple
  '#e05252', // red
  '#4ecdc4', // teal
  '#45b7d1', // sky blue
  '#f78c6b', // coral
  '#98d8c8', // mint
  '#c06c84', // mauve
  '#6c5b7b', // lavender
  '#f67280', // salmon
  '#355c7d', // navy
  '#2ecc71', // emerald
  '#e17055', // burnt orange
  '#74b9ff', // light blue
  '#a29bfe', // periwinkle
];

const SMALL_COMMUNITY_COLOR = '#3a3a4a';

// Cache: community id -> color
const colorCache = new Map<number, string>();

export function getCommunityColor(communityId: number): string {
  if (colorCache.has(communityId)) return colorCache.get(communityId)!;

  // We assign palette colors to the first 15 unique communities encountered
  // Beyond that, use the neutral gray
  const color = communityId < COMMUNITY_PALETTE.length
    ? COMMUNITY_PALETTE[communityId % COMMUNITY_PALETTE.length]
    : SMALL_COMMUNITY_COLOR;

  colorCache.set(communityId, color);
  return color;
}

// Map sorted community indices (by size desc) to palette colors
let communityRankMap: Map<number, number> | null = null;

export function initCommunityColors(communitySizes: { id: number; size: number }[]): void {
  communityRankMap = new Map();
  const sorted = [...communitySizes].sort((a, b) => b.size - a.size);
  sorted.forEach((c, i) => communityRankMap!.set(c.id, i));
  colorCache.clear();
}

export function getCommunityColorRanked(communityId: number): string {
  if (colorCache.has(communityId)) return colorCache.get(communityId)!;
  const rank = communityRankMap?.get(communityId) ?? communityId;
  const color = rank < COMMUNITY_PALETTE.length
    ? COMMUNITY_PALETTE[rank]
    : SMALL_COMMUNITY_COLOR;
  colorCache.set(communityId, color);
  return color;
}

export const COLORS = {
  bg: '#0a0a0f',
  panelBg: '#12121a',
  border: '#1e1e2e',
  text: '#e8e6e3',
  textMuted: '#8b8b9e',
  gold: '#c4a35a',
  purple: '#7c5cbf',
  highlight: '#f0c040',
  danger: '#e05252',
};
