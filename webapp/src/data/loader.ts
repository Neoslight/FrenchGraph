export interface GraphNode {
  id: number;
  label: string;
  x: number;
  y: number;
  community: number;
  size: number; // degree
}

export interface GraphEdge {
  source: number;
  target: number;
  weight?: number;
  minYear?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ArtistInfo {
  name: string;
  community: number;
  degree: number;
  url?: string;
  image?: string;
}

export interface SearchEntry {
  id: number;
  name: string;
}

export interface CommunityInfo {
  id: number;
  size: number;
  density: number;
  internalEdges: number;
  centroid: [number, number];
  topMembers: { id: number; name: string; degree: number }[];
}

export interface SongDetail {
  title: string;
  year?: number;
  album?: string;
}

export interface StatsData {
  totalArtists: number;
  totalEdges: number;
  totalSongs: number;
  totalCommunities: number;
  avgDegree: number;
  maxDegree: number;
  isolatedArtists: number;
  topArtists: { id: number; name: string; degree: number }[];
  topPairs: { artists: string[]; ids: number[]; songs: number }[];
  yearHistogram: Record<string, number>;
  communitySizes: number[];
}

const BASE = './data';

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`Failed to load ${file}: ${res.status}`);
  return res.json();
}

// Core data — loaded immediately
export async function loadGraphData(): Promise<GraphData> {
  return fetchJson<GraphData>('graph.json');
}

export async function loadSearchIndex(): Promise<SearchEntry[]> {
  return fetchJson<SearchEntry[]>('search.json');
}

export async function loadCommunities(): Promise<CommunityInfo[]> {
  return fetchJson<CommunityInfo[]>('communities.json');
}

export async function loadStats(): Promise<StatsData> {
  return fetchJson<StatsData>('stats.json');
}

// Lazy-loaded data
let artistsCache: Record<string, ArtistInfo> | null = null;
let detailsCache: Record<string, SongDetail[]> | null = null;

export async function loadArtists(): Promise<Record<string, ArtistInfo>> {
  if (!artistsCache) {
    artistsCache = await fetchJson<Record<string, ArtistInfo>>('artists.json');
  }
  return artistsCache;
}

export async function loadDetails(): Promise<Record<string, SongDetail[]>> {
  if (!detailsCache) {
    detailsCache = await fetchJson<Record<string, SongDetail[]>>('details.json');
  }
  return detailsCache;
}
