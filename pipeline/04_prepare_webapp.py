"""
Pré-traitement des données pour la webapp Sigma.js.
Charge le GraphML + CSV sources, calcule le layout, et exporte des JSON optimisés.
"""

import igraph as ig
import pandas as pd
import json
import os
import math
from collections import defaultdict

# --- Configuration ---
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'webapp', 'public', 'data')

GRAPHML_FILE = os.path.join(DATA_DIR, 'graphe_rap_fr.graphml')
ARTISTS_FILE = os.path.join(DATA_DIR, 'artists_final.csv')
COLLABS_FILE = os.path.join(DATA_DIR, 'collaborations_final.csv')


def load_data():
    """Charge le graphe et les données CSV sources."""
    print("Chargement du GraphML...")
    g = ig.Graph.Read_GraphML(GRAPHML_FILE)
    print(f"  {g.vcount()} noeuds, {g.ecount()} arêtes")

    print("Chargement des CSV...")
    df_artists = pd.read_csv(ARTISTS_FILE).drop_duplicates(subset=['id'])
    df_collabs = pd.read_csv(COLLABS_FILE).drop_duplicates()

    # Build image_url lookup from CSV (not in GraphML)
    image_lookup = {}
    for _, row in df_artists.iterrows():
        aid = int(row['id'])
        img = row.get('image_url', '')
        if pd.notna(img) and img:
            image_lookup[aid] = str(img)

    return g, df_collabs, image_lookup


def compute_layout(g):
    """Layout DRL pondéré + séparation communautés + répulsion anti-collision."""
    print("Calcul du layout DRL avec poids communautaires (peut prendre ~30s)...")

    communities = [int(v['community']) for v in g.vs]

    # Weight edges: intra-community attracts strongly, inter weakly
    weights = []
    for e in g.es:
        if communities[e.source] == communities[e.target]:
            weights.append(3.0)
        else:
            weights.append(0.3)
    g.es['layout_weight'] = weights

    layout = g.layout_drl(weights='layout_weight')
    coords = layout.coords

    # Step 1: amplify community separation
    coords = _spread_communities(coords, communities, spread_factor=2.5)

    # Step 2: normalize to 0-30000 BEFORE repulsion (distances in final space)
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    range_x = max_x - min_x or 1
    range_y = max_y - min_y or 1
    coords = [
        ((x - min_x) / range_x * 30000, (y - min_y) / range_y * 30000)
        for x, y in coords
    ]

    # Step 3: repulsion in final coordinate space
    # Average spacing = sqrt(30000² / 9473) ≈ 308 units → target 200 units min
    coords = _repulsion_pass(coords, iterations=150, min_dist=280)

    # Final normalize (repulsion may shift extents slightly)
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    range_x = max_x - min_x or 1
    range_y = max_y - min_y or 1

    positions = []
    for x, y in coords:
        nx = round((x - min_x) / range_x * 30000)
        ny = round((y - min_y) / range_y * 30000)
        positions.append((nx, ny))

    print(f"  Layout calculé et normalisé (0-30000)")
    return positions


def _spread_communities(coords, communities, spread_factor=2.5):
    """Amplifie la distance entre les centroïdes de communautés."""
    from collections import defaultdict

    comm_nodes = defaultdict(list)
    for i, comm in enumerate(communities):
        comm_nodes[comm].append(i)

    centroids = {}
    for comm, indices in comm_nodes.items():
        cx = sum(coords[i][0] for i in indices) / len(indices)
        cy = sum(coords[i][1] for i in indices) / len(indices)
        centroids[comm] = (cx, cy)

    all_cx = sum(c[0] for c in centroids.values()) / len(centroids)
    all_cy = sum(c[1] for c in centroids.values()) / len(centroids)

    new_coords = list(coords)
    for comm, indices in comm_nodes.items():
        cx, cy = centroids[comm]
        offset_x = (cx - all_cx) * (spread_factor - 1)
        offset_y = (cy - all_cy) * (spread_factor - 1)
        for i in indices:
            new_coords[i] = (coords[i][0] + offset_x, coords[i][1] + offset_y)

    return new_coords


def _repulsion_pass(coords, iterations=80, min_dist=200):
    """
    Champ de force de répulsion pure : pousse les noeuds trop proches l'un de l'autre.
    min_dist : distance minimale souhaitée en unités du canvas (0-30000).
    """
    try:
        import numpy as np
        from scipy.spatial import KDTree
    except ImportError:
        print("  (scipy non disponible, répulsion ignorée)")
        return coords

    arr = np.array(coords, dtype=float)
    print(f"  Répulsion : {iterations} iters, distance min = {min_dist} unités...")

    for it in range(iterations):
        tree = KDTree(arr)
        pairs = tree.query_pairs(min_dist)
        if not pairs:
            print(f"    Convergé à l'itération {it + 1}")
            break

        deltas = np.zeros_like(arr)
        for i, j in pairs:
            d = arr[j] - arr[i]
            dist = float(np.linalg.norm(d))
            if dist < 1e-6:
                # Nodes at exactly same position: push randomly
                angle = (i * 2.399963) % (2 * math.pi)  # golden angle
                d = np.array([math.cos(angle), math.sin(angle)])
                dist = 1.0
            push = (min_dist - dist) * 0.5
            direction = d / dist
            deltas[i] -= direction * push
            deltas[j] += direction * push

        arr += deltas

        if (it + 1) % 10 == 0:
            remaining = len(list(tree.query_pairs(min_dist)))
            print(f"    iter {it+1}: {remaining} paires trop proches")

    return [(float(c[0]), float(c[1])) for c in arr]


def build_collab_details(df_collabs, genius_ids_in_graph):
    """Construit les détails de collaboration par paire d'artistes."""
    print("Construction des détails de collaborations...")
    valid_ids = set(genius_ids_in_graph)

    # Clean data
    df = df_collabs.copy()
    df = df.dropna(subset=['source', 'target'])
    df['source'] = pd.to_numeric(df['source'], errors='coerce').astype('Int64')
    df['target'] = pd.to_numeric(df['target'], errors='coerce').astype('Int64')
    df['year'] = pd.to_numeric(df['year'], errors='coerce').astype('Int64')
    df = df.dropna(subset=['source', 'target'])
    df = df[df['source'].isin(valid_ids) & df['target'].isin(valid_ids)]

    # Group by sorted pair
    details = defaultdict(list)
    pair_min_year = {}
    pair_weight = defaultdict(int)

    for _, row in df.iterrows():
        s, t = int(row['source']), int(row['target'])
        key = f"{min(s,t)}-{max(s,t)}"
        pair_weight[key] += 1

        year = int(row['year']) if pd.notna(row['year']) and row['year'] > 0 else None
        title = str(row['song_title']) if pd.notna(row['song_title']) else ''
        album = str(row['album']) if pd.notna(row['album']) else ''

        song = {"title": title}
        if year:
            song["year"] = year
        if album and album != 'Single':
            song["album"] = album

        details[key].append(song)

        if year and (key not in pair_min_year or year < pair_min_year[key]):
            pair_min_year[key] = year

    print(f"  {len(details)} paires de collaborateurs")
    return dict(details), pair_min_year, dict(pair_weight)


def export_graph_json(g, positions, image_lookup, pair_min_year, pair_weight):
    """Exporte le fichier graph.json principal."""
    print("Export graph.json...")

    # Build genius_id -> node index mapping
    genius_ids = [int(v['genius_id']) for v in g.vs]

    nodes = []
    for i, v in enumerate(g.vs):
        gid = int(v['genius_id'])
        x, y = positions[i]
        degree = g.degree(i)
        nodes.append({
            "id": gid,
            "label": v['name'],
            "x": x,
            "y": y,
            "community": int(v['community']),
            "size": degree
        })

    # Build edge list with weights and min year
    gid_to_idx = {int(v['genius_id']): i for i, v in enumerate(g.vs)}
    edges = []
    for e in g.es:
        src_gid = genius_ids[e.source]
        tgt_gid = genius_ids[e.target]
        key = f"{min(src_gid, tgt_gid)}-{max(src_gid, tgt_gid)}"
        edge_data = {
            "source": src_gid,
            "target": tgt_gid,
        }
        weight = pair_weight.get(key, 1)
        if weight > 1:
            edge_data["weight"] = weight
        if key in pair_min_year:
            edge_data["minYear"] = pair_min_year[key]
        edges.append(edge_data)

    data = {"nodes": nodes, "edges": edges}
    write_json(data, 'graph.json')


def export_artists_json(g, image_lookup):
    """Exporte artists.json avec les métadonnées complètes."""
    print("Export artists.json...")
    artists = {}
    for i, v in enumerate(g.vs):
        gid = int(v['genius_id'])
        artist = {
            "name": v['name'],
            "community": int(v['community']),
            "degree": g.degree(i),
        }
        url = v['url'] if 'url' in v.attributes() else ''
        if url:
            artist["url"] = url
        img = image_lookup.get(gid, '')
        if img:
            artist["image"] = img
        artists[str(gid)] = artist

    write_json(artists, 'artists.json')


def export_search_json(g):
    """Exporte search.json pour Fuse.js."""
    print("Export search.json...")
    entries = []
    for v in g.vs:
        entries.append({
            "id": int(v['genius_id']),
            "name": v['name']
        })
    entries.sort(key=lambda x: x['name'].lower())
    write_json(entries, 'search.json')


def export_communities_json(g, positions):
    """Exporte communities.json avec stats par communauté."""
    print("Export communities.json...")

    community_members = defaultdict(list)
    for i, v in enumerate(g.vs):
        cid = int(v['community'])
        community_members[cid].append(i)

    communities = []
    for cid, members in sorted(community_members.items(), key=lambda x: -len(x[1])):
        # Centroid
        cx = round(sum(positions[i][0] for i in members) / len(members))
        cy = round(sum(positions[i][1] for i in members) / len(members))

        # Internal edges
        member_set = set(members)
        internal_edges = sum(
            1 for e in g.es
            if e.source in member_set and e.target in member_set
        )

        # Density
        n = len(members)
        possible = n * (n - 1) / 2 if n > 1 else 1
        density = round(internal_edges / possible, 4)

        # Top members by degree
        members_sorted = sorted(members, key=lambda i: g.degree(i), reverse=True)
        top = []
        for i in members_sorted[:5]:
            top.append({
                "id": int(g.vs[i]['genius_id']),
                "name": g.vs[i]['name'],
                "degree": g.degree(i)
            })

        communities.append({
            "id": cid,
            "size": n,
            "density": density,
            "internalEdges": internal_edges,
            "centroid": [cx, cy],
            "topArtist": top[0]["name"] if top else "",
            "topMembers": top
        })

    write_json(communities, 'communities.json')


def export_stats_json(g, pair_weight, df_collabs):
    """Exporte stats.json avec les métriques globales."""
    print("Export stats.json...")

    degrees = g.degree()

    # Top artists by degree
    top_artists = sorted(
        [(int(g.vs[i]['genius_id']), g.vs[i]['name'], d) for i, d in enumerate(degrees)],
        key=lambda x: -x[2]
    )[:20]

    # Top pairs by weight
    genius_ids = [int(v['genius_id']) for v in g.vs]
    gid_to_name = {int(v['genius_id']): v['name'] for v in g.vs}
    top_pairs = sorted(pair_weight.items(), key=lambda x: -x[1])[:20]
    top_pairs_named = []
    for key, weight in top_pairs:
        a, b = key.split('-')
        a, b = int(a), int(b)
        if a in gid_to_name and b in gid_to_name:
            top_pairs_named.append({
                "artists": [gid_to_name[a], gid_to_name[b]],
                "ids": [a, b],
                "songs": weight
            })

    # Year histogram
    df = df_collabs.copy()
    df['year'] = pd.to_numeric(df['year'], errors='coerce')
    df = df[df['year'] > 0]
    year_counts = df['year'].astype(int).value_counts().sort_index()
    year_histogram = {str(int(y)): int(c) for y, c in year_counts.items() if 1980 <= y <= 2026}

    # Community sizes
    community_sizes = defaultdict(int)
    for v in g.vs:
        community_sizes[int(v['community'])] += 1
    community_size_list = sorted(community_sizes.values(), reverse=True)

    # Network metrics
    stats = {
        "totalArtists": g.vcount(),
        "totalEdges": g.ecount(),
        "totalSongs": len(df_collabs),
        "totalCommunities": len(set(int(v['community']) for v in g.vs)),
        "avgDegree": round(sum(degrees) / len(degrees), 1),
        "maxDegree": max(degrees),
        "isolatedArtists": sum(1 for d in degrees if d == 1),
        "topArtists": [{"id": a[0], "name": a[1], "degree": a[2]} for a in top_artists],
        "topPairs": top_pairs_named,
        "yearHistogram": year_histogram,
        "communitySizes": community_size_list,
    }

    write_json(stats, 'stats.json')


def export_details_json(details):
    """Exporte details.json avec les détails des collaborations."""
    print("Export details.json...")
    write_json(details, 'details.json')


def write_json(data, filename):
    """Écrit un fichier JSON dans le dossier de sortie."""
    path = os.path.join(OUTPUT_DIR, filename)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(path) / 1024
    print(f"  -> {filename} ({size:.0f} KB)")


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    g, df_collabs, image_lookup = load_data()
    positions = compute_layout(g)

    genius_ids = [int(v['genius_id']) for v in g.vs]
    details, pair_min_year, pair_weight = build_collab_details(df_collabs, genius_ids)

    export_graph_json(g, positions, image_lookup, pair_min_year, pair_weight)
    export_artists_json(g, image_lookup)
    export_search_json(g)
    export_communities_json(g, positions)
    export_stats_json(g, pair_weight, df_collabs)
    export_details_json(details)

    print("\n--- Pré-traitement terminé ---")


if __name__ == '__main__':
    main()
