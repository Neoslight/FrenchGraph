import pandas as pd
import os

# --- Configuration des fichiers ---
DATA_DIR = 'data/'
ARTISTS_FILE = os.path.join(DATA_DIR, 'artists_final.csv')
REJECTED_FILE = os.path.join(DATA_DIR, 'rejected_final.csv')
COLLABOS_FILE = os.path.join(DATA_DIR, 'collaborations_final.csv')

def sanitize_database():
    """
    Assainit la base de données en s'assurant qu'aucun artiste rejeté
    ne figure dans la liste d'artistes principale NI dans les collaborations.
    """
    print("--- Lancement de l'assainissement complet de la base de données ---")

    try:
        df_artists = pd.read_csv(ARTISTS_FILE)
        df_rejected = pd.read_csv(REJECTED_FILE)
        df_collabs = pd.read_csv(COLLABOS_FILE)
    except FileNotFoundError as e:
        print(f"[ERREUR] Fichier manquant : {e}. Impossible de continuer.")
        return
    except pd.errors.EmptyDataError:
        print("[INFO] Un ou plusieurs fichiers sont vides. Aucun assainissement nécessaire.")
        return

    # --- Identification des conflits ---
    artists_ids = set(df_artists['id'])
    rejected_ids = set(df_rejected['id'])

    conflicting_ids = artists_ids.intersection(rejected_ids)

    if not conflicting_ids:
        print("✅ [OK] Aucune incohérence artiste/rejet trouvée.")
    else:
        print(f"🚨 [PROBLÈME] {len(conflicting_ids)} artiste(s) trouvé(s) à la fois dans la liste principale et la liste des rejets.")
        
        # --- Correction Fichier Artistes ---
        print(" -> Nettoyage de artists_final.csv...")
        rows_before = len(df_artists)
        df_artists_sanitized = df_artists[~df_artists['id'].isin(conflicting_ids)]
        df_artists_sanitized.to_csv(ARTISTS_FILE, index=False, encoding='utf-8')
        print(f"    -> {rows_before - len(df_artists_sanitized)} artistes en conflit retirés.")

        # --- Correction Fichier Collaborations ---
        print(" -> Nettoyage de collaborations_final.csv...")
        rows_before = len(df_collabs)
        # On ne garde que les lignes où NI la source NI la cible n'est un artiste en conflit.
        df_collabs_sanitized = df_collabs[~df_collabs['source'].isin(conflicting_ids) & ~df_collabs['target'].isin(conflicting_ids)]
        df_collabs_sanitized.to_csv(COLLABOS_FILE, index=False, encoding='utf-8')
        print(f"    -> {rows_before - len(df_collabs_sanitized)} collaborations impliquant des artistes en conflit retirées.")

    print("\n--- Assainissement terminé ---")
    print("Vous pouvez maintenant relancer le script de diagnostic pour vérification, puis le crawler principal.")


if __name__ == "__main__":
    sanitize_database()