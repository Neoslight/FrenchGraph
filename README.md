# rap-graph

Réseau de collaborations du rap francophone. Explore les liens entre artistes à travers leurs featurings, avec détection de communautés et visualisation interactive.

**Données actuelles** : 9 972 artistes · 42 318 collaborations · 75 communautés · composante principale de 9 473 nœuds

---

## Structure

```
rap-graph/
├── pipeline/               # Collecte et traitement des données
│   ├── 01_discover.py      # Découverte initiale via MusicBrainz
│   ├── 02_crawl.py         # Crawler asynchrone Genius (production)
│   ├── 03_build_graph.py   # Construction du graphe + détection de communautés
│   └── tools/
│       ├── check.py        # Bilan de santé des données
│       ├── clean.py        # Déduplique les fichiers CSV
│       ├── repair.py       # Récupère les artistes "fantômes" depuis Genius
│       ├── sanitize.py     # Résout les conflits accepté/rejeté
│       ├── deep_scan.py    # Re-scanne les artistes traités pour colmater les trous
│       └── fix_years.py    # Normalise les années aberrantes dans les collaborations
├── webapp/                 # Application web interactive (Dash)
│   ├── app.py              # Point d'entrée
│   └── src/
│       ├── data_loader.py  # Chargement + graphe NetworkX
│       ├── layout.py       # UI Dash
│       └── callbacks.py    # Interactions
├── data/
│   ├── artists_final.csv          # 9 972 artistes (id, name, url, image_url)
│   ├── collaborations_final.csv   # 42 318 collaborations (source, target, song_id, song_title, year, album)
│   ├── processed_artists.csv      # Artistes déjà crawlés (reprise du crawler)
│   ├── rejected_final.csv         # Artistes rejetés comme non-francophones
│   └── graphe_rap_fr.graphml      # Graphe final (Gephi / webapp)
└── requirements.txt
```

---

## Installation

```bash
python3 -m venv venv
source venv/bin/activate    # Windows : venv\Scripts\activate
pip install -r requirements.txt
```

---

## Pipeline de données

Toutes les commandes se lancent **depuis la racine du projet**.

### 1. Collecte

```bash
# Découverte initiale (à lancer une seule fois)
python pipeline/01_discover.py

# Crawler principal (reprend là où il s'est arrêté)
# Nécessite la variable d'environnement GENIUS_ACCESS_TOKEN
export GENIUS_ACCESS_TOKEN="votre_token"
python pipeline/02_crawl.py
```

### 2. Construction du graphe

```bash
python pipeline/03_build_graph.py
# → génère data/graphe_rap_fr.graphml
```

### 3. Outils de maintenance

```bash
python pipeline/tools/check.py       # Rapport de cohérence des données
python pipeline/tools/clean.py       # Supprime les doublons dans les CSV
python pipeline/tools/repair.py      # Récupère les artistes manquants via Genius
python pipeline/tools/sanitize.py    # Nettoie les conflits accepté/rejeté
python pipeline/tools/fix_years.py   # Normalise les années (1980-2026 uniquement)
python pipeline/tools/deep_scan.py   # Scan de consolidation (featurings manqués)
```

---

## Webapp

```bash
cd webapp
python app.py
# → http://localhost:8050
```

**Vue d'ensemble** : Top 200 artistes par degré de connectivité.  
**Vue détaillée** : Sélectionner un artiste (dropdown ou clic) pour voir son réseau direct.

---

## Token Genius

Créer un compte sur [genius.com/api-clients](https://genius.com/api-clients), générer un token Client Access, puis :

```bash
export GENIUS_ACCESS_TOKEN="votre_token_ici"
```

---

## Roadmap visualisation

La webapp actuelle est fonctionnelle mais a des limites de performance :
- Layout spring recalculé à chaque interaction (O(n²))
- Rendu SVG via Plotly Scatter, lent au-delà de ~200 nœuds

Piste d'amélioration : pré-calculer le layout ForceAtlas2 une fois (stocké dans le GraphML), puis migrer vers `dash-cytoscape` pour un rendu WebGL performant.
