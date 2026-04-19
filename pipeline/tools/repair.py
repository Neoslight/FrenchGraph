import asyncio
import aiohttp
import aiofiles
import pandas as pd
from tqdm.asyncio import tqdm
import os
import json
import random
import io
import csv
import time  # <--- IMPORT MANQUANT AJOUTÉ ICI

# --- Configuration ---
GENIUS_TOKEN = os.getenv('GENIUS_ACCESS_TOKEN')
if not GENIUS_TOKEN: raise Exception("Token Genius non trouvé ! Assurez-vous de l'avoir défini.")
BASE_API_URL = "https://api.genius.com/"
HEADERS = {'Authorization': f'Bearer {GENIUS_TOKEN}'}
CONCURRENT_REQUESTS = 5 

# Fichiers de données
ARTISTS_FILE = 'data/artists_final.csv'
COLLABOS_FILE = 'data/collaborations_final.csv'
REJECTED_FILE = 'data/rejected_final.csv'

# --- On importe la logique robuste du crawler principal ---
class APITracker:
    def __init__(self, failure_threshold=20, cooldown_period=60):
        self.consecutive_failures = 0
        self.failure_threshold = failure_threshold
        self.cooldown_period = cooldown_period
        self.circuit_open_until = 0

    def register_success(self):
        self.consecutive_failures = 0

    def register_failure(self):
        self.consecutive_failures += 1
        if self.consecutive_failures >= self.failure_threshold: self.trip_circuit()

    def trip_circuit(self):
        tqdm.write(f"\n🚨 Trop d'échecs consécutifs. Pause de {self.cooldown_period}s.\n")
        self.circuit_open_until = time.time() + self.cooldown_period
        self.consecutive_failures = 0

    @property
    def is_circuit_open(self):
        return self.circuit_open_until > time.time()

async def safe_api_request(session, semaphore, tracker, url, params=None):
    if tracker.is_circuit_open: await asyncio.sleep(2); return None
    max_retries = 5; base_delay = 2
    async with semaphore:
        for attempt in range(max_retries):
            try:
                async with session.get(url, params=params, headers=HEADERS, timeout=30) as response:
                    if response.status == 429:
                        delay = int(response.headers.get("Retry-After", base_delay**(attempt+1))) + random.uniform(0, 1)
                        await asyncio.sleep(delay)
                        continue
                    response.raise_for_status()
                    tracker.register_success()
                    return await response.json()
            except (aiohttp.ClientError, asyncio.TimeoutError):
                await asyncio.sleep(base_delay**(attempt+1)); continue
    tracker.register_failure()
    return None

async def get_artist_details(session, semaphore, tracker, artist_id):
    url = BASE_API_URL + f"artists/{artist_id}"
    json_response = await safe_api_request(session, semaphore, tracker, url)
    return json_response.get('response', {}).get('artist') if json_response else None

# --- Logique de Réparation ---
async def repair_database():
    print("--- Démarrage de la réparation de la base de données (v2) ---")

    try:
        df_artists = pd.read_csv(ARTISTS_FILE)
        df_collabs = pd.read_csv(COLLABOS_FILE)
    except FileNotFoundError as e:
        print(f"[ERREUR] Fichier manquant : {e}.")
        return

    artists_ids = set(df_artists['id'].unique())
    all_collab_ids = set(df_collabs['source'].unique()).union(set(df_collabs['target'].unique()))
    ghost_artist_ids = list(all_collab_ids - artists_ids)
    
    if not ghost_artist_ids:
        print("✅ Base de données saine. Aucun artiste 'fantôme' trouvé.")
        return
        
    print(f"🚨 {len(ghost_artist_ids)} artiste(s) 'fantôme(s)' à réparer.")

    semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
    api_tracker = APITracker()
    missing_artists_data = []
    unfindable_artists = []

    async with aiohttp.ClientSession() as session:
        tasks = [get_artist_details(session, semaphore, api_tracker, artist_id) for artist_id in ghost_artist_ids]
        
        for i, f in enumerate(tqdm(asyncio.as_completed(tasks), total=len(tasks), desc="Récupération des artistes manquants")):
            artist_details = await f
            original_artist_id = ghost_artist_ids[i] # On récupère l'ID original pour le cas d'échec
            if artist_details:
                missing_artists_data.append({
                    'id': artist_details.get('id'),
                    'name': artist_details.get('name'),
                    'url': artist_details.get('url'),
                    'image_url': artist_details.get('image_url')
                })
            else:
                unfindable_artists.append({'id': original_artist_id, 'name': 'Introuvable'})

    if missing_artists_data:
        print(f"\n{len(missing_artists_data)} artistes récupérés. Ajout au fichier '{ARTISTS_FILE}'...")
        df_missing = pd.DataFrame(missing_artists_data)
        df_missing.to_csv(ARTISTS_FILE, mode='a', header=False, index=False, encoding='utf-8')
    
    if unfindable_artists:
        print(f"{len(unfindable_artists)} artistes introuvables. Ajout au fichier '{REJECTED_FILE}'...")
        df_unfindable = pd.DataFrame(unfindable_artists)
        
        # On s'assure que le fichier de rejet existe avec un en-tête
        if not os.path.exists(REJECTED_FILE) or os.path.getsize(REJECTED_FILE) == 0:
            df_unfindable.to_csv(REJECTED_FILE, index=False, encoding='utf-8')
        else:
            df_unfindable.to_csv(REJECTED_FILE, mode='a', header=False, index=False, encoding='utf-8')

    # Nettoyage final pour s'assurer qu'il n'y a pas de doublons
    print("Nettoyage final des fichiers...")
    pd.read_csv(ARTISTS_FILE).drop_duplicates(subset=['id']).to_csv(ARTISTS_FILE, index=False, encoding='utf-8')
    if os.path.exists(REJECTED_FILE) and os.path.getsize(REJECTED_FILE) > 0:
        pd.read_csv(REJECTED_FILE).drop_duplicates(subset=['id']).to_csv(REJECTED_FILE, index=False, encoding='utf-8')

    print("✅ Réparation terminée. Les fichiers d'artistes et de rejets ont été mis à jour.")

if __name__ == "__main__":
    asyncio.run(repair_database())