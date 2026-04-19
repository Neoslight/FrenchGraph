#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Crawler asynchrone pour collecter le réseau de collaborations du rap francophone depuis l'API Genius.
Version : 4.0 (consolidée)

Fonctionnalités :
- Démarrage depuis un artiste "graine".
- Exploration du réseau de proche en proche.
- Asynchrone pour une collecte rapide (gestion de requêtes concurrentes).
- Verrou de synchronisation (`asyncio.Lock`) pour éviter le traitement en double des artistes.
- Garde-fou de langue à deux niveaux pour rester dans l'écosystème francophone.
- Reprise sur erreur : peut être arrêté et relancé, reprendra où il s'était arrêté.
- Cache persistant pour les vérifications de langue afin d'éviter les appels API inutiles.
- Disjoncteur ("Circuit Breaker") pour se mettre en pause automatiquement en cas de surcharge de l'API.
- Système de suivi de progression fiable via un fichier dédié (processed_artists.csv).
- Prévention de l'écriture de doublons en temps réel.
"""

import asyncio
import aiohttp
import aiofiles
import pandas as pd
from tqdm.asyncio import tqdm
import time
import os
import json
import random
import io
import csv
from langdetect import detect, lang_detect_exception

# --- Configuration Générale ---
GENIUS_TOKEN = os.getenv('GENIUS_ACCESS_TOKEN')
if not GENIUS_TOKEN: raise Exception("Token Genius non trouvé ! Assurez-vous de l'avoir défini dans vos variables d'environnement (GENIUS_ACCESS_TOKEN).")

BASE_API_URL = "https://api.genius.com/"
HEADERS = {'Authorization': f'Bearer {GENIUS_TOKEN}'}
STARTING_ARTIST = "Booba"
CONCURRENT_REQUESTS = 5

# Fichiers de sortie
ARTISTS_FILE = 'data/artists_final.csv'
COLLABOS_FILE = 'data/collaborations_final.csv'
REJECTED_FILE = 'data/rejected_final.csv'
CACHE_FILE = 'data/cache.json'
PROCESSED_FILE = 'data/processed_artists.csv'

# --- Classe de suivi de l'état de l'API (Disjoncteur) ---
class APITracker:
    def __init__(self, failure_threshold=25, cooldown_period=900): # 900s = 15 minutes
        self.consecutive_failures = 0
        self.failure_threshold = failure_threshold
        self.cooldown_period = cooldown_period
        self.circuit_open_until = 0

    def register_success(self):
        if self.consecutive_failures > 0: self.consecutive_failures = 0
        if self.circuit_open_until > 0 and not self.is_circuit_open:
            tqdm.write("✅ Connexion à l'API rétablie. Le disjoncteur est réarmé.")
            self.circuit_open_until = 0

    def register_failure(self):
        self.consecutive_failures += 1
        if self.consecutive_failures >= self.failure_threshold: self.trip_circuit()

    def trip_circuit(self):
        tqdm.write("\n" + "="*80)
        tqdm.write(f"🚨 [DISJONCTEUR DÉCLENCHÉ] Plus de {self.failure_threshold} échecs consécutifs de l'API.")
        tqdm.write(f"Le script se met en pause pour {self.cooldown_period / 60:.0f} minutes pour protéger votre IP.")
        tqdm.write("="*80 + "\n")
        self.circuit_open_until = time.time() + self.cooldown_period
        self.consecutive_failures = 0

    @property
    def is_circuit_open(self):
        return self.circuit_open_until > time.time()

# --- Fonctions de gestion de fichiers ---
def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r', encoding='utf-8') as f: return json.load(f)
    return {}

def save_cache(cache_data):
    with open(CACHE_FILE, 'w', encoding='utf-8') as f: json.dump(cache_data, f, indent=2)

# --- Fonctions de communication avec l'API Genius ---
async def safe_api_request(session, semaphore, tracker, url, params=None, pbar=None):
    if tracker.is_circuit_open: await asyncio.sleep(2); return None
    max_retries = 5; base_delay = 2
    async with semaphore:
        for attempt in range(max_retries):
            try:
                async with session.get(url, params=params, headers=HEADERS, timeout=30) as response:
                    if response.status == 429:
                        delay = int(response.headers.get("Retry-After", base_delay ** (attempt + 1))) + random.uniform(0, 1)
                        tqdm.write(f"  [ATTENTION] Rate limit (429) atteint. Attente de {delay:.2f}s.")
                        await asyncio.sleep(delay)
                        continue
                    response.raise_for_status()
                    tracker.register_success()
                    if pbar and isinstance(pbar.postfix, dict): pbar.postfix['failures'] = tracker.consecutive_failures
                    return await response.json()
            except (aiohttp.ClientError, asyncio.TimeoutError): await asyncio.sleep(base_delay ** (attempt + 1)); continue
    tracker.register_failure()
    if pbar and isinstance(pbar.postfix, dict): pbar.postfix['failures'] = tracker.consecutive_failures
    return None

async def search_artist_id(session, semaphore, tracker, artist_name, pbar):
    url = BASE_API_URL + "search"
    json_response = await safe_api_request(session, semaphore, tracker, url, params={'q': artist_name}, pbar=pbar)
    if json_response:
        for hit in json_response.get('response', {}).get('hits', []):
            if hit.get('type') == 'song':
                primary_artist = hit.get('result', {}).get('primary_artist', {})
                if artist_name.lower() in primary_artist.get('name', '').lower():
                    return primary_artist.get('id'), primary_artist.get('name')
    return None, None

async def get_all_artist_songs(session, semaphore, tracker, artist_id, pbar):
    all_songs = []; current_page = 1
    while True:
        url = BASE_API_URL + f"artists/{artist_id}/songs"
        json_response = await safe_api_request(session, semaphore, tracker, url, params={'per_page': 50, 'page': current_page}, pbar=pbar)
        if not json_response or not json_response.get('response', {}).get('songs'): break
        all_songs.extend(json_response['response']['songs']); current_page += 1
    return all_songs

async def get_song_details(session, semaphore, tracker, song_id, pbar):
    url = BASE_API_URL + f"songs/{song_id}"
    json_response = await safe_api_request(session, semaphore, tracker, url, pbar=pbar)
    return json_response.get('response', {}).get('song') if json_response else None

# --- Garde-fou de langue à deux niveaux ---
async def is_artist_francophone(session, semaphore, tracker, artist_id, artist_name, cache, rejected_ids, pbar):
    artist_id_str = str(artist_id)
    if artist_id_str in cache: return cache[artist_id_str]
    if artist_id in rejected_ids: return False
    
    songs = await get_all_artist_songs(session, semaphore, tracker, artist_id, pbar)
    if not songs: cache[artist_id_str] = False; return False

    tasks = [get_song_details(session, semaphore, tracker, song['id'], pbar) for song in songs[:5]]
    details_list = await asyncio.gather(*tasks)
    french_song_count = sum(1 for d in details_list if d and d.get('language') == 'fr')
    if french_song_count >= 3: cache[artist_id_str] = True; return True

    try:
        titles = " ".join([song.get('title', '') for song in songs[:10]])
        if titles and detect(titles) == 'fr': cache[artist_id_str] = True; return True
    except lang_detect_exception.LangDetectException: pass

    tqdm.write(f"    [-] Artiste rejeté: {artist_name}")
    rejected_ids.add(artist_id)
    output = io.StringIO(); writer = csv.writer(output); writer.writerow([artist_id, artist_name]); formatted_line = output.getvalue()
    async with aiofiles.open(REJECTED_FILE, mode='a', encoding='utf-8') as f: await f.write(formatted_line)
    cache[artist_id_str] = False
    return False

# --- Le "Worker" : la logique de traitement d'un artiste ---
async def worker(name, queue, lock, session, semaphore, tracker, pbar, all_known_ids, visited_ids, checking_ids, rejected_ids, recorded_collabs, cache):
    """Tâche exécutée en boucle par chaque travailleur pour traiter un artiste."""
    while True:
        artist_id, artist_name = await queue.get()
        try:
            tqdm.write(f"\n--- {name} démarre l'exploration de: {artist_name} ---")
            
            songs = await get_all_artist_songs(session, semaphore, tracker, artist_id, pbar)
            total_songs = len(songs)
            tqdm.write(f"  -> {total_songs} chansons trouvées pour {artist_name}.")
            
            newly_found_artists, newly_found_collabs = [], []
            # On ajoute l'artiste en cours de traitement s'il n'est pas déjà connu
            if artist_id not in all_known_ids:
                newly_found_artists.append({'id': artist_id, 'name': artist_name, 'url': f'https://genius.com/artists/{artist_id}', 'image_url': ''})
                all_known_ids.add(artist_id)

            for song in songs:
                if not song or not song.get('featured_artists'): continue
                main_artist = song['primary_artist']
                for featured_artist in song['featured_artists']:
                    feat_id, feat_name = featured_artist['id'], featured_artist.get('name', 'N/A')
                    
                    should_check = False
                    async with lock:
                        if feat_id not in visited_ids and feat_id not in rejected_ids and feat_id not in checking_ids:
                            checking_ids.add(feat_id)
                            should_check = True
                    
                    if should_check:
                        if await is_artist_francophone(session, semaphore, tracker, feat_id, feat_name, cache, rejected_ids, pbar):
                            tqdm.write(f"    [+] Artiste validé: {feat_name} (découvert par {name})")
                            await queue.put((feat_id, feat_name))
                            pbar.total += 1
                            # On ajoute le nouvel artiste validé s'il n'est pas déjà connu
                            if feat_id not in all_known_ids:
                                newly_found_artists.append({'id': feat_id, 'name': feat_name, 'url': featured_artist.get('url'), 'image_url': featured_artist.get('image_url')})
                                all_known_ids.add(feat_id)
                        
                            collab_tuple = (main_artist['id'], feat_id, song['id'])
                            if collab_tuple not in recorded_collabs:
                                release_info = song.get('release_date_components'); year = release_info.get('year') if release_info else None
                                album_info = song.get('album'); album_name = album_info.get('name') if album_info else 'Single'
                                newly_found_collabs.append({'source': main_artist['id'], 'target': feat_id, 'song_id': song['id'], 'song_title': song['title'], 'year': year, 'album': album_name})
                                recorded_collabs.add(collab_tuple)

            # Écriture groupée pour ce worker
            if newly_found_artists:
                df = pd.DataFrame(newly_found_artists)
                async with aiofiles.open(ARTISTS_FILE, mode='a', encoding='utf-8') as f: await f.write(df.to_csv(header=False, index=False))
            if newly_found_collabs:
                df = pd.DataFrame(newly_found_collabs)
                async with aiofiles.open(COLLABOS_FILE, mode='a', encoding='utf-8') as f: await f.write(df.to_csv(header=False, index=False))
            
            # Marquer l'artiste comme traité à la toute fin
            visited_ids.add(artist_id)
            async with aiofiles.open(PROCESSED_FILE, mode='a', encoding='utf-8') as f: await f.write(f"{artist_id}\n")
            pbar.update(1)
            tqdm.write(f"--- {name} a terminé l'exploration de: {artist_name} ---")
        except Exception as e:
            tqdm.write(f"[ERREUR FATALE] Le worker {name} a rencontré une erreur en traitant {artist_name}: {e}")
        finally:
            queue.task_done()

# --- Orchestrateur Principal ---
async def main():
    """Fonction principale qui initialise et orchestre le crawl."""
    semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
    lock = asyncio.Lock()
    queue = asyncio.Queue()
    api_tracker = APITracker()
    
    # Les sets sont nos sources de vérité en temps réel pendant l'exécution
    visited_ids, rejected_ids, checking_ids, recorded_collabs, all_known_ids = set(), set(), set(), set(), set()
    all_artists_map = {}
    cache = load_cache()

    # Logique de reprise / migration
    if not os.path.exists(PROCESSED_FILE):
        tqdm.write(f"Fichier de suivi '{PROCESSED_FILE}' non trouvé. Tentative de migration...")
        migrated_ids = set()
        if os.path.exists(COLLABOS_FILE) and os.path.getsize(COLLABOS_FILE) > 50:
            df_collabs_mig = pd.read_csv(COLLABOS_FILE); migrated_ids.update(df_collabs_mig['source'].unique().tolist())
            pd.DataFrame(list(migrated_ids), columns=['id']).to_csv(PROCESSED_FILE, index=False, encoding='utf-8')
            tqdm.write(f" -> {len(migrated_ids)} artistes traités migrés.")
        else:
            tqdm.write("Aucune donnée précédente à migrer. Création de nouveaux fichiers.")
            pd.DataFrame(columns=['id']).to_csv(PROCESSED_FILE, index=False, encoding='utf-8')
            pd.DataFrame(columns=['id', 'name', 'url', 'image_url']).to_csv(ARTISTS_FILE, index=False, encoding='utf-8')
            pd.DataFrame(columns=['source', 'target', 'song_id', 'song_title', 'year', 'album']).to_csv(COLLABOS_FILE, index=False, encoding='utf-8')
            pd.DataFrame(columns=['id', 'name']).to_csv(REJECTED_FILE, index=False, encoding='utf-8')

    tqdm.write("Lecture de l'état de la collecte...")
    df_processed = pd.read_csv(PROCESSED_FILE); visited_ids.update(df_processed['id'].tolist())
    if os.path.exists(ARTISTS_FILE) and os.path.getsize(ARTISTS_FILE) > 50:
        df_artists = pd.read_csv(ARTISTS_FILE); all_known_ids.update(df_artists['id'].tolist())
        for index, row in df_artists.iterrows(): all_artists_map[row['id']] = row['name']
    if os.path.exists(REJECTED_FILE) and os.path.getsize(REJECTED_FILE) > 0:
        df_rejected = pd.read_csv(REJECTED_FILE); rejected_ids.update(df_rejected['id'].tolist())
    if os.path.exists(COLLABOS_FILE) and os.path.getsize(COLLABOS_FILE) > 0:
         df_collabs = pd.read_csv(COLLABOS_FILE); recorded_collabs.update(map(tuple, df_collabs[['source', 'target', 'song_id']].values))
    tqdm.write(f" -> {len(visited_ids)} traités | {len(rejected_ids)} rejetés | {len(all_known_ids)} découverts.")

    async with aiohttp.ClientSession() as session:
        if queue.empty():
            if not visited_ids:
                # Logique de démarrage à partir de zéro
                pbar = tqdm(total=0, desc="Artistes Traités", postfix={'failures': 0})
                while True:
                    start_id, start_name = await search_artist_id(session, semaphore, api_tracker, STARTING_ARTIST, pbar)
                    if start_id:
                        tqdm.write(f"Artiste de départ trouvé: {start_name}")
                        await queue.put((start_id, start_name)); checking_ids.add(start_id)
                        break
                    else:
                        tqdm.write(f"Impossible de trouver l'artiste de départ '{STARTING_ARTIST}'. Nouvel essai dans 30s...")
                        await asyncio.sleep(30)
            else:
                # Logique de reprise
                tqdm.write("Recalcul de la frontière d'exploration...")
                ids_to_explore = all_known_ids - visited_ids - rejected_ids
                tqdm.write(f" -> {len(ids_to_explore)} artistes à explorer trouvés. Remplissage de la file d'attente...")
                for artist_id in ids_to_explore:
                    artist_name = all_artists_map.get(artist_id)
                    if artist_name: await queue.put((artist_id, artist_name))
        
        pbar = tqdm(total=len(visited_ids) + queue.qsize(), initial=len(visited_ids), desc="Artistes Traités", postfix={'failures': 0})

        if queue.empty() and visited_ids:
            tqdm.write("Aucun nouvel artiste à explorer. La collecte est terminée.")
        else:
            tasks = []
            for i in range(CONCURRENT_REQUESTS):
                task = asyncio.create_task(worker(f'Worker-{i+1}', queue, lock, session, semaphore, api_tracker, pbar, all_known_ids, visited_ids, checking_ids, rejected_ids, recorded_collabs, cache))
                tasks.append(task)
            
            await queue.join()

            for task in tasks: task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        
        pbar.close()
        tqdm.write("\nCrawl terminé. Sauvegarde du cache...")
        save_cache(cache)
        tqdm.write("Terminé !")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nInterruption manuelle. Arrêt du script.")