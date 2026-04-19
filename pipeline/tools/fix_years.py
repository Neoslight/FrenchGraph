"""
Normalise les valeurs de la colonne 'year' dans collaborations_final.csv.
- Convertit les floats encodés en string (ex: "2015.0" → "2015")
- Vide les valeurs aberrantes (< 1980 ou > 2026) : 1, 1.0, 1690, 1926...
- Laisse vides les valeurs déjà manquantes

Lancer depuis la racine du projet : python pipeline/tools/fix_years.py
Dépendances : aucune (stdlib uniquement)
"""

import csv
import io

COLLABS_FILE = 'data/collaborations_final.csv'
YEAR_MIN = 1980
YEAR_MAX = 2026


def normalize_year(raw):
    if raw is None or raw.strip() == '':
        return ''
    try:
        val = float(raw)
    except ValueError:
        return ''
    if val < YEAR_MIN or val > YEAR_MAX:
        return ''
    return str(int(val))


def fix_years():
    with open(COLLABS_FILE, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    cleared = 0
    normalized = 0

    for row in rows:
        raw = row.get('year', '')
        fixed = normalize_year(raw)
        if raw != fixed:
            if fixed == '':
                cleared += 1
            else:
                normalized += 1
            row['year'] = fixed

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)

    with open(COLLABS_FILE, 'w', newline='', encoding='utf-8') as f:
        f.write(output.getvalue())

    total = len(rows)
    valid_after = sum(1 for r in rows if r.get('year', '').strip() != '')
    empty_after = total - valid_after

    print(f"--- Normalisation des années ({COLLABS_FILE}) ---")
    print(f"Total lignes         : {total}")
    print(f"Valeurs normalisées  : {normalized}  (float→int, ex: 2015.0→2015)")
    print(f"Valeurs supprimées   : {cleared}  (hors plage [{YEAR_MIN}-{YEAR_MAX}] ou invalides)")
    print(f"Vides après          : {empty_after}")
    print(f"Valides après        : {valid_after}")
    print(f"\nFichier réécrit : {COLLABS_FILE}")


if __name__ == '__main__':
    fix_years()
