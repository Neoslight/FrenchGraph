import pandas as pd
import os

# --- Configuration des fichiers ---
# Assurez-vous que ces chemins correspondent à vos fichiers
DATA_DIR = 'data/'
ARTISTS_FILE = os.path.join(DATA_DIR, 'artists_final.csv')
COLLABOS_FILE = os.path.join(DATA_DIR, 'collaborations_final.csv')
REJECTED_FILE = os.path.join(DATA_DIR, 'rejected_final.csv')

def clean_file(filepath):
    """Charge un fichier CSV, supprime les doublons et le réécrit."""
    if not os.path.exists(filepath):
        print(f"Fichier non trouvé: {filepath}. Ignoré.")
        return

    try:
        df = pd.read_csv(filepath)
        rows_before = len(df)
        if rows_before == 0:
            print(f"Fichier {os.path.basename(filepath)} est vide. Rien à faire.")
            return

        # Supprimer les lignes qui sont des doublons parfaits
        df.drop_duplicates(inplace=True)
        rows_after = len(df)

        removed_count = rows_before - rows_after
        if removed_count > 0:
            print(f"Nettoyage de {os.path.basename(filepath)}... {removed_count} doublon(s) supprimé(s).")
            # Réécrire le fichier avec les données nettoyées
            df.to_csv(filepath, index=False, encoding='utf-8')
        else:
            print(f"Fichier {os.path.basename(filepath)} est déjà propre.")

    except pd.errors.EmptyDataError:
        print(f"Fichier {os.path.basename(filepath)} est vide. Rien à faire.")
    except Exception as e:
        print(f"Une erreur est survenue en traitant {filepath}: {e}")

if __name__ == "__main__":
    print("--- Début du nettoyage des fichiers de données ---")
    clean_file(ARTISTS_FILE)
    clean_file(COLLABOS_FILE)
    clean_file(REJECTED_FILE)
    print("--- Nettoyage terminé ---")