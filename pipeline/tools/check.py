import pandas as pd
import os

# --- Configuration des fichiers ---
DATA_DIR = 'data/'
ARTISTS_FILE = os.path.join(DATA_DIR, 'artists_final.csv')
COLLABOS_FILE = os.path.join(DATA_DIR, 'collaborations_final.csv')
PROCESSED_FILE = os.path.join(DATA_DIR, 'processed_artists.csv')

def health_check():
    """
    Analyse la cohérence des fichiers de données et produit un rapport.
    """
    print("--- Lancement du Bilan de Santé de la Base de Données ---")

    # --- Chargement des données ---
    try:
        df_artists = pd.read_csv(ARTISTS_FILE)
        df_collabs = pd.read_csv(COLLABOS_FILE)
        df_processed = pd.read_csv(PROCESSED_FILE)
    except FileNotFoundError as e:
        print(f"[ERREUR] Fichier manquant : {e}. Impossible de lancer le diagnostic.")
        return
    except pd.errors.EmptyDataError:
        print("[INFO] Un ou plusieurs fichiers sont vides. La base est au début de sa construction.")
        return

    # --- Création des ensembles d'IDs pour la comparaison ---
    artists_ids = set(df_artists['id'].unique())
    processed_ids = set(df_processed['id'].unique())
    
    collab_source_ids = set(df_collabs['source'].unique())
    collab_target_ids = set(df_collabs['target'].unique())
    all_collab_ids = collab_source_ids.union(collab_target_ids)

    # --- Exécution des vérifications ---
    print("\n--- RAPPORT DE COHÉRENCE ---")

    # 1. Vérifier les artistes "fantômes"
    ghost_artists = all_collab_ids - artists_ids
    if ghost_artists:
        print(f"🚨 [PROBLÈME] {len(ghost_artists)} Artiste(s) 'Fantôme(s)' trouvé(s).")
        print("   -> Ces artistes apparaissent dans des collaborations mais manquent dans la liste d'artistes principale.")
    else:
        print("✅ [OK] Aucune artiste 'fantôme'. Tous les artistes des collaborations sont dans la liste principale.")

    # 2. Vérifier la frontière d'exploration
    frontier_artists = artists_ids - processed_ids
    if frontier_artists:
        print(f"ℹ️  [INFO] {len(frontier_artists)} artiste(s) sont sur la 'frontière' d'exploration (découverts mais non traités).")
        # Afficher quelques exemples
        if len(frontier_artists) > 0:
            sample_ids = list(frontier_artists)[:5]
            sample_names = df_artists[df_artists['id'].isin(sample_ids)]['name'].tolist()
            print(f"   -> Exemples : {', '.join(sample_names)}")
    else:
        print("✅ [OK] Tous les artistes découverts ont été traités. La collecte est potentiellement terminée.")
        
    # 3. Vérifier les données incomplètes
    incomplete_data = df_artists[df_artists['name'].isnull() | (df_artists['name'] == '')]
    if not incomplete_data.empty:
        print(f"🚨 [PROBLÈME] {len(incomplete_data)} artiste(s) avec des données incomplètes (nom manquant).")
    else:
        print("✅ [OK] Aucune donnée d'artiste incomplète détectée.")
        
    print("\n--- FIN DU RAPPORT ---")
    if ghost_artists or frontier_artists:
        print("\nACTION RECOMMANDÉE : Relancez le script de collecte principal ('crawler.py').")
        print("Sa logique de reprise est conçue pour traiter automatiquement la 'frontière' et combler les manques.")

if __name__ == "__main__":
    health_check()