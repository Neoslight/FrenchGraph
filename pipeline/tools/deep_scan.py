#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script de consolidation de la base de données.
Ce script parcourt les artistes déjà traités pour s'assurer que toutes leurs
collaborations ont bien été collectées. Il est conçu pour être lent mais exhaustif.
Architecture basée sur le crawler principal.
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

# --- Configuration Générale ---
GENIUS_TOKEN = os.getenv('GENIUS_ACCESS_TOKEN')
if not GENIUS_TOKEN: raise Exception("Token Genius non trouvé ! Assurez-vous de l'avoir défini.")
BASE_API_URL = "https://api.genius.com/"
HEADERS = {'Authorization': f'Bearer {GENIUS_TOKEN}'}
CONCURRENT_REQUESTS = 5

# Fichiers de données
ARTISTS_FILE = 'data/artists_final.csv'
COLLABOS_FILE = 'data/collaborations_final.csv'
PROCESSED_FILE = 'data/processed_artists.csv'
CONSOLIDATED_FILE = 'data/consolidated_artists.csv' # Fichier de suivi

# --- Classe de suivi de l'état de l'API (Disjoncteur) ---
class APITracker:
    def __init__(self, failure_threshold=25, cooldown_period=900): # 900s = 15 minutes
        self.consecutive_failures = 0; self.failure_threshold = failure_threshold
        self.cooldown_period = cooldown_period; self.circuit_open_until = 0
    def register_success(self):
        if self.consecutive_failures > 0: self.consecutive_failures = 0
        if self.circuit_open_until > 0 and not self.is_circuit_open:
            tqdm.write("✅ Connexion API rétablie."); self.circuit_open_until = 0
    def register_failure(self):
        self.consecutive_failures += 1
        if self.consecutive_failures >= self.failure_threshold: self.trip_circuit()
    def trip_circuit(self):
        tqdm.write(f"\n🚨 [DISJONCTEUR] Trop d'échecs. Pause de {self.cooldown_period / 60:.0f} minutes.\n")
        self.circuit_open_until = time.time() + self.cooldown_period; self.consecutive_failures = 0
    @property
    def is_circuit_open(self): return self.circuit_open_until > time.time()

# --- Fonctions de communication avec l'API Genius ---
async def safe_api_request(session, semaphore, tracker, url, params=None, pbar=None):
    if tracker.is_circuit_open: await asyncio.sleep(2); return None
    max_retries = 5; base_delay = 2
    async with semaphore:
        for attempt in range(max_retries):
            try:
                async with session.get(url, params=params, headers=HEADERS, timeout=30) as response:
                    if response.status == 429:
                        delay = int(response.headers.get("Retry-After", base_delay**(attempt+1))) + random.uniform(0, 1)
                        tqdm.write(f"  [API] Limite atteinte (429). Attente de {delay:.1f}s...")
                        await asyncio.sleep(delay); continue
                    response.raise_for_status()
                    tracker.register_success()
                    if pbar and isinstance(pbar.postfix, dict): pbar.postfix['failures'] = tracker.consecutive_failures
                    return await response.json()
            except (aiohttp.ClientError, asyncio.TimeoutError): await asyncio.sleep(base_delay**(attempt+1)); continue
    tracker.register_failure()
    if pbar and isinstance(pbar.postfix, dict): pbar.postfix['failures'] = tracker.consecutive_failures
    return None

async def get_all_artist_songs(session, semaphore, tracker, artist_id, pbar):
    all_songs = []; current_page = 1
    while True:
        url = BASE_API_URL + f"artists/{artist_id}/songs"
        json_response = await safe_api_request(session, semaphore, tracker, url, params={'per_page': 50, 'page': current_page}, pbar=pbar)
        if not json_response or not json_response.get('response', {}).get('songs'): break
        all_songs.extend(json_response['response']['songs']); current_page += 1
    return all_songs

# --- Le "Worker" de Consolidation ---
async def consolidate_worker(name, queue, lock, session, semaphore, tracker, pbar, recorded_collabs, all_known_ids):
    """Worker qui scanne la discographie d'un artiste et ajoute les collaborations manquantes."""
    while True:
        artist_id, artist_name = await queue.get()
        try:
            tqdm.write(f"\n--- {name} consolide: {artist_name} ---")
            songs = await get_all_artist_songs(session, semaphore, tracker, artist_id, pbar)
            total_songs = len(songs)
            tqdm.write(f"  -> {total_songs} chansons à vérifier.")
            
            newly_found_collabs = []
            for i, song in enumerate(songs):
                if not song or not song.get('featured_artists'): continue
                main_artist = song['primary_artist']
                for featured_artist in song['featured_artists']:
                    feat_id = featured_artist['id']
                    if feat_id not in all_known_ids: continue

                    collab_tuple = (main_artist['id'], feat_id, song['id'])
                    
                    async with lock:
                        if collab_tuple not in recorded_collabs:
                            tqdm.write(f"    [+] Collab manquante trouvée: {main_artist['name']} ft. {featured_artist.get('name', 'N/A')}")
                            release_info = song.get('release_date_components'); year = release_info.get('year') if release_info else None
                            album_info = song.get('album'); album_name = album_info.get('name') if album_info else 'Single'
                            newly_found_collabs.append({'source': main_artist['id'], 'target': feat_id, 'song_id': song['id'], 'song_title': song['title'], 'year': year, 'album': album_name})
                            recorded_collabs.add(collab_tuple)

            # Sauvegarde incrémentale
            if newly_found_collabs:
                df = pd.DataFrame(newly_found_collabs)
                async with aiofiles.open(COLLABOS_FILE, mode='a', encoding='utf-8') as f:
                    await f.write(df.to_csv(header=False, index=False))
            
            # Marquer l'artiste comme consolidé
            async with aiofiles.open(CONSOLIDATED_FILE, mode='a', encoding='utf-8') as f:
                await f.write(f"{artist_id}\n")
            
            pbar.update(1)
            tqdm.write(f"--- Consolidation de {artist_name} terminée par {name} ---")
        except Exception as e:
            tqdm.write(f"[ERREUR] Échec de la consolidation pour {artist_name} par {name}: {e}")
        finally:
            queue.task_done()

# --- Orchestrateur Principal ---
async def main():
    """Fonction principale qui initialise et orchestre la consolidation."""
    semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
    lock = asyncio.Lock()
    queue = asyncio.Queue()
    api_tracker = APITracker() # <-- LA LIGNE MANQUANTE EST AJOUTÉE ICI
    
    # --- Chargement de l'état ---
    if not all(os.path.exists(f) for f in [PROCESSED_FILE, ARTISTS_FILE, COLLABOS_FILE]):
        print("[ERREUR] Un ou plusieurs fichiers de données principaux sont manquants. Veuillez d'abord lancer le crawler.")
        return
        
    tqdm.write("Lecture de l'état de la collecte...")
    df_processed = pd.read_csv(PROCESSED_FILE); processed_ids = set(df_processed['id'].tolist())
    df_artists = pd.read_csv(ARTISTS_FILE); all_known_ids = set(df_artists['id'].tolist())
    df_collabs = pd.read_csv(COLLABOS_FILE); recorded_collabs = set(map(tuple, df_collabs[['source', 'target', 'song_id']].values))
    
    if not os.path.exists(CONSOLIDATED_FILE):
        pd.DataFrame(columns=['id']).to_csv(CONSOLIDATED_FILE, index=False, encoding='utf-8')
    df_consolidated = pd.read_csv(CONSOLIDATED_FILE); consolidated_ids = set(df_consolidated['id'].tolist())
    
    # --- Calcul du travail à faire ---
    artists_to_scan_ids = processed_ids - consolidated_ids
    if not artists_to_scan_ids:
        print("✅ Tous les artistes déjà traités ont été consolidés.")
        return
        
    artist_map = df_artists.set_index('id')['name'].to_dict()
    for artist_id in artists_to_scan_ids:
        await queue.put((artist_id, artist_map.get(artist_id, "Nom Inconnu")))
    
    tqdm.write(f" -> {len(processed_ids)} artistes traités au total.")
    tqdm.write(f" -> {len(consolidated_ids)} déjà consolidés.")
    tqdm.write(f" -> {queue.qsize()} artistes restants à consolider.")

    # --- Lancement des workers ---
    async with aiohttp.ClientSession() as session:
        pbar = tqdm(total=queue.qsize(), desc="Artistes Consolidés", postfix={'failures': 0})
        
        tasks = []
        for i in range(CONCURRENT_REQUESTS):
            # On passe bien 'api_tracker' au worker
            task = asyncio.create_task(consolidate_worker(f'Worker-{i+1}', queue, lock, session, semaphore, api_tracker, pbar, recorded_collabs, all_known_ids))
            tasks.append(task)
            
        await queue.join()

        for task in tasks: task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        pbar.close()

    tqdm.write("\n--- Consolidation terminée ---")
    
if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nInterruption manuelle. Arrêt du script.")