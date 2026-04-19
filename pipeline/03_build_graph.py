# src/build_igraph.py

import pandas as pd
import igraph as ig
import os

# --- Configuration des fichiers ---
DATA_DIR = 'data/'
ARTISTS_FILE = os.path.join(DATA_DIR, 'artists_final.csv')
COLLABOS_FILE = os.path.join(DATA_DIR, 'collaborations_final.csv')
OUTPUT_GRAPH_FILE = os.path.join(DATA_DIR, 'graphe_rap_fr.graphml')

def create_graph():
    """
    Charge les données CSV, construit un graphe NON-ORIENTÉ avec igraph,
    en traduisant les IDs, détecte les communautés et l'exporte au format GraphML.
    """
    print("--- Démarrage du script de construction de graphe ---")

    # --- 1. Chargement des données ---
    print(f"Chargement des artistes depuis '{ARTISTS_FILE}'...")
    df_artists = pd.read_csv(ARTISTS_FILE).drop_duplicates(subset=['id'])

    print(f"Chargement des collaborations depuis '{COLLABOS_FILE}'...")
    df_collabs = pd.read_csv(COLLABOS_FILE).drop_duplicates()
    
    # --- 2. Préparation et Nettoyage des données ---
    print("Préparation et nettoyage des données...")
    
    df_artists = df_artists.fillna('')
    df_collabs = df_collabs.dropna(subset=['source', 'target'])
    df_collabs = df_collabs.fillna('')

    df_artists['id'] = df_artists['id'].astype(int)
    df_collabs['source'] = pd.to_numeric(df_collabs['source'], errors='coerce').astype(int)
    df_collabs['target'] = pd.to_numeric(df_collabs['target'], errors='coerce').astype(int)
    df_collabs['year'] = pd.to_numeric(df_collabs['year'], errors='coerce').fillna(0).astype(int)

    valid_artist_ids = set(df_artists['id'])
    df_collabs = df_collabs[df_collabs['source'].isin(valid_artist_ids) & df_collabs['target'].isin(valid_artist_ids)]
    
    final_artist_ids = set(df_collabs['source']).union(set(df_collabs['target']))
    df_artists_final = df_artists[df_artists['id'].isin(final_artist_ids)]
    
    print(f"\nDonnées prêtes : {len(df_artists_final)} artistes et {len(df_collabs)} collaborations seront dans le graphe.")

    # --- 3. Traduction des IDs ---
    print("Création de la table de traduction d'IDs...")
    genius_id_to_igraph_id = {genius_id: i for i, genius_id in enumerate(df_artists_final['id'])}
    df_collabs['source_igraph'] = df_collabs['source'].map(genius_id_to_igraph_id)
    df_collabs['target_igraph'] = df_collabs['target'].map(genius_id_to_igraph_id)
    df_collabs.dropna(subset=['source_igraph', 'target_igraph'], inplace=True)

    # --- 4. Construction du graphe igraph ---
    print("Construction de l'objet Graph (Non-Orienté)...")

    edges = list(zip(df_collabs['source_igraph'].astype(int), df_collabs['target_igraph'].astype(int)))
    g = ig.Graph(n=len(df_artists_final), edges=edges, directed=False)

    df_artists_sorted = df_artists_final.copy()
    df_artists_sorted['igraph_id'] = df_artists_sorted['id'].map(genius_id_to_igraph_id)
    df_artists_sorted.sort_values('igraph_id', inplace=True)
    
    g.vs['genius_id'] = df_artists_sorted['id'].tolist()
    g.vs['name'] = df_artists_sorted['name'].tolist()
    g.vs['url'] = df_artists_sorted['url'].tolist()

    g.es['song_title'] = df_collabs['song_title'].tolist()
    g.es['year'] = df_collabs['year'].tolist()
    g.es['album'] = df_collabs['album'].tolist()

    print("Graphe de base construit.")
    print(g.summary())

    # --- 5. Simplification et Nettoyage ---
    print("\nSimplification du graphe...")
    g.simplify(combine_edges='first')
    
    print("Recherche de la composante principale...")
    components = g.components(mode='weak')
    g = components.giant()
    
    print("Graphe simplifié à sa composante principale.")
    print(g.summary())

    # --- 6. Détection de communautés (Leiden Algorithm) ---
    print("\nDétection des communautés avec l'algorithme de Leiden...")
    
    communities = g.community_leiden(
        objective_function='modularity',
        resolution=1.8,        # Plus élevé = communautés plus petites, plus représentatives
        n_iterations=15,       # Meilleure convergence
    )
    g.vs['community'] = communities.membership
    
    print(f"Détection terminée : {len(communities)} communautés trouvées.")

    # --- 7. Exportation du graphe ---
    print(f"\nSauvegarde du graphe final dans '{OUTPUT_GRAPH_FILE}'...")
    g.write_graphml(OUTPUT_GRAPH_FILE)
    
    print("\n--- Script terminé avec succès ---")
    print(f"Ouvrez le fichier '{OUTPUT_GRAPH_FILE}' avec Gephi pour visualiser le réseau.")


if __name__ == "__main__":
    create_graph()