import musicbrainzngs
import pandas as pd
import time
from tqdm import tqdm

# --- Configuration ---
# MusicBrainz demande de s'identifier. Remplacez par le nom de votre projet.
# Cela leur permet de vous contacter en cas de problème.
musicbrainzngs.set_useragent(
    "RapGraphProject",
    "0.1",
    "https://github.com/votre-pseudo/rap-graph" # Mettez l'URL de votre futur projet
)

# --- Logique de Recherche ---
def get_francophone_rappers():
    """
    Interroge l'API MusicBrainz pour trouver des artistes de rap francophones.
    Gère la pagination pour récupérer un maximum de résultats.
    """
    all_artists = []
    limit = 100  # Nombre de résultats par page (max 100)
    offset = 0   # Point de départ dans les résultats

    # On cherche des artistes (personnes, pas des groupes)
    # de pays francophones, avec le tag 'hip hop' ou 'rap'.
    query = (
        'type:person AND '
        '(country:FR OR country:BE) AND '
        '(tag:"hip hop" OR tag:rap OR tag:"french rap")'
    )

    # Premier appel pour connaître le nombre total de résultats
    initial_result = musicbrainzngs.search_artists(query=query, limit=limit, offset=offset)
    count = initial_result['artist-count']
    print(f"Nombre total d'artistes trouvés : {count}")

    # On utilise tqdm pour créer une barre de progression
    with tqdm(total=count) as pbar:
        while True:
            try:
                result = musicbrainzngs.search_artists(query=query, limit=limit, offset=offset)
                artists = result.get('artist-list', [])

                if not artists:
                    break  # Plus de résultats, on arrête la boucle

                all_artists.extend(artists)
                pbar.update(len(artists))

                offset += limit
                
                # IMPORTANT : Attendre 1 seconde entre chaque requête pour respecter l'API
                time.sleep(1)

            except musicbrainzngs.WebServiceError as exc:
                print(f"Erreur de connexion à l'API : {exc}. On réessaie dans 5 secondes...")
                time.sleep(5)

    return all_artists


# --- Exécution Principale ---
if __name__ == "__main__":
    print("Début de la récupération de la liste de base des rappeurs...")
    rappers_data = get_francophone_rappers()

    if rappers_data:
        # On transforme la liste de dictionnaires en DataFrame pandas
        df = pd.DataFrame(rappers_data)
        
        # On sélectionne les colonnes qui nous intéressent
        df_clean = df[['id', 'name', 'country', 'disambiguation']]
        
        # On sauvegarde le fichier dans le dossier 'data'
        output_path = 'data/rappeurs_base.csv'
        df_clean.to_csv(output_path, index=False)
        
        print(f"\nTerminé ! {len(df_clean)} artistes sauvegardés dans '{output_path}'")
    else:
        print("Aucun artiste trouvé ou une erreur est survenue.")
