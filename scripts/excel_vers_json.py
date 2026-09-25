#!/usr/bin/env python3
"""
Excel → players.json.

Lit les onglets « Synthese », « Detail » et « Distinctions » du classeur de contrôle
et écrit players.json à la racine du projet, au format attendu par le site.

Usage (depuis BO2026/) :
  python3 scripts/excel_vers_json.py controle-stats-ballon-dor.xlsx
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl manquant : python3 -m pip install openpyxl (ou .venv/bin/python)")

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
OUT = ROOT / "players.json"

# Poste de chaque joueur (absent de l'Excel).
POSTES = {
    "Kylian Mbappé": "BU",
    "Ousmane Dembélé": "BU/AD",
    "Michael Olise": "AD",
    "Rodri": "MDC",
    "Lamine Yamal": "AD",
    "Jude Bellingham": "MOC",
    "Harry Kane": "BU",
    "Lionel Messi": "AD",
    "Khvicha Kvaratskhelia": "AG",
    "Erling Haaland": "BU",
}

# Couleur de chaque sélection (cartes de la page 1). Choisies pour que deux joueurs voisins
# sur le disque n'aient jamais la même : Espagne en jaune, Norvège en rouge.
COULEURS = {
    "France": "#0055a4", "Espagne": "#f1bf00", "Angleterre": "#ce1124",
    "Argentine": "#74acdf", "Géorgie": "#e8112d", "Norvège": "#ba0c2f",
}

# Ordre des joueurs sur le disque de la page 1 : jamais deux joueurs de la même sélection
# (ni de la même couleur) côte à côte, y compris entre le dernier et le premier.
ORDRE = ["Kylian Mbappé", "Rodri", "Harry Kane", "Lionel Messi", "Ousmane Dembélé",
         "Khvicha Kvaratskhelia", "Lamine Yamal", "Erling Haaland", "Michael Olise",
         "Jude Bellingham"]

DRAPEAUX = {
    "France": "fr", "Espagne": "es", "Angleterre": "gb-eng",
    "Argentine": "ar", "Géorgie": "ge", "Norvège": "no",
}

# Titre collectif (onglet Distinctions) → logo de la compétition dans assets/competitions/
LOGOS_COLLECTIF = {
    "Ligue 1": "ligue-1",
    "Trophée des champions": "trophee-des-champions",
    "Ligue des champions": "champions-league",
    "Supercoupe de l'UEFA": "uefa-badge",
    "Coupe intercontinentale": "club-world-cup",   # compétition FIFA
    "Bundesliga": "bundesliga",
    "Coupe d'Allemagne": "dfb-pokal",
    "Supercoupe d'Allemagne": "supercoupe-allemagne",
    "FA Cup": "fa-cup",
    "EFL Cup": "efl-cup",
    "Coupe du monde": "world-cup-2026",
    "Liga": "laliga",
    "Supercoupe d'Espagne": "supercoupe-espagne",
    "MLS Cup": "mls",
}

# Compétition d'une distinction individuelle → fichier dans assets/competitions/
LOGOS_COMPETITION = {
    "Ligue des champions": "champions-league",
    "Liga": "laliga",
    "Coupe du monde": "world-cup-2026",
    "Coupe du monde (qualifications)": "uefa",
    "Ligue 1": "ligue-1",
    "Bundesliga": "bundesliga",
    "Coupe d'Allemagne": "dfb-pokal",
    "Premier League": "premier-league",
    "MLS": "mls",
}

# Compétitions regroupées sur le site : « Meilleur buteur — Playoffs MLS » et
# « Meilleur buteur — MLS » ne font plus qu'une ligne « Meilleur buteur — MLS ».
FUSIONS = {"Playoffs MLS": "MLS"}

# Distinctions de l'Excel non affichées sur le site.
EXCLUES = {"Meilleur buteur — Coupe du monde (qualifications)"}

# Tri des distinctions individuelles : rang d'abord (1er avant 2e), puis compétition
# (ordre ci-dessous, par prestige), puis catégorie.
ORDRE_COMPETITIONS = ["Europe", "Coupe du monde", "Ligue des champions", "Liga", "Premier League",
                      "Bundesliga", "Ligue 1", "MLS", "Coupe d'Allemagne",
                      "Coupe du monde (qualifications)"]
ORDRE_CATEGORIES = ["joueur", "buteur", "passeur"]


def ordre(t):
    if t["competition"] not in ORDRE_COMPETITIONS:
        sys.exit(f"Compétition « {t['competition']} » absente de ORDRE_COMPETITIONS")
    return (t["rang"], ORDRE_COMPETITIONS.index(t["competition"]),
            ORDRE_CATEGORIES.index(t["categorie"]))
DISTINCTION = re.compile(r"^(?:(\d)ème )?meilleur (buteur|passeur|joueur) — (.+)$", re.I)


def slug(texte):
    t = unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def asset(dossier, nom):
    """Chemin assets/<dossier>/<nom>.<ext> d'un fichier existant (WebP de préférence)."""
    for ext in ("webp", "svg", "png"):
        chemin = f"assets/{dossier}/{nom}.{ext}"
        if (PUBLIC / chemin).exists():
            return chemin
    sys.exit(f"Fichier introuvable : public/assets/{dossier}/{nom}.*")


def lignes(ws):
    rows = ws.iter_rows(values_only=True)
    entetes = next(rows)
    for r in rows:
        if r[0] is None:
            continue
        yield dict(zip(entetes, r))


def individuel(titre):
    if titre == "Soulier d'or européen":
        return {"titre": titre, "categorie": "buteur", "rang": 1, "competition": "Europe",
                "icone": None, "logo": asset("competitions", "uefa")}
    m = DISTINCTION.match(titre)
    if not m:
        sys.exit(f"Distinction non reconnue : « {titre} »")
    rang, categorie, competition = int(m.group(1) or 1), m.group(2).lower(), m.group(3)
    if competition in FUSIONS:
        competition = FUSIONS[competition]
        titre = f"{titre.split(' — ')[0]} — {competition}"
    if competition not in LOGOS_COMPETITION:
        sys.exit(f"Pas de logo pour la compétition « {competition} » (LOGOS_COMPETITION)")
    return {"titre": titre, "categorie": categorie, "rang": rang, "competition": competition,
            "icone": None,   # pas de médaille affichée : le logo suffit
            "logo": asset("competitions", LOGOS_COMPETITION[competition])}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    wb = openpyxl.load_workbook(sys.argv[1], data_only=True)

    passes_incompletes = {r["Joueur"] for r in lignes(wb["Detail"]) if r["Passes"] == "n.r."}

    distinctions = {}
    for r in lignes(wb["Distinctions"]):
        if r["Distinction"] not in EXCLUES:
            distinctions.setdefault(r["Joueur"], []).append(r)

    joueurs = []
    for r in lignes(wb["Synthese"]):
        nom = r["Joueur"]
        if nom == "TOTAL" or r["Matchs"] is None:
            continue
        if nom not in POSTES:
            sys.exit(f"Pas de poste pour « {nom} » (POSTES)")
        if r["Sélection"] not in DRAPEAUX:
            sys.exit(f"Pas de drapeau pour « {r['Sélection']} » (DRAPEAUX)")
        matchs, buts, passes = r["Matchs"], r["Buts"], r["Passes"]
        d = distinctions.get(nom, [])
        joueurs.append({
            "id": slug(nom),
            "nom": nom,
            "poste": POSTES[nom],
            "selection": r["Sélection"],
            "drapeau": asset("flags", DRAPEAUX[r["Sélection"]]),
            "couleur": COULEURS[r["Sélection"]],
            "club": r["Club (saison)"],
            "stats": {
                "matchs": matchs, "buts": buts, "passes": passes,
                "passesMinimum": nom in passes_incompletes,
                "contributionsParMatch": round((buts + passes) / matchs, 2),
            },
            "collectif": [{"titre": x["Distinction"],
                           "icone": asset("competitions", LOGOS_COLLECTIF[x["Distinction"]])}
                          for x in d if x["Type"] == "Collective"],
            "individuel": sorted({t["titre"]: t for t in (individuel(x["Distinction"]) for x in d
                                                          if x["Type"] == "Individuelle")}.values(),
                                 key=ordre),
        })

    if sorted(j["nom"] for j in joueurs) != sorted(ORDRE):
        sys.exit("ORDRE ne liste pas exactement les joueurs de l'Excel")
    joueurs.sort(key=lambda j: ORDRE.index(j["nom"]))
    for x, y in zip(joueurs, joueurs[1:] + joueurs[:1]):
        if x["selection"] == y["selection"] or x["couleur"] == y["couleur"]:
            sys.exit(f"ORDRE : {x['nom']} et {y['nom']} côte à côte (même sélection ou couleur)")

    OUT.write_text(json.dumps(joueurs, ensure_ascii=False, indent=2) + "\n")
    print(f"{len(joueurs)} joueurs → {OUT.relative_to(ROOT)}")
    for j in joueurs:
        s = j["stats"]
        print(f"  {j['id']:<24}{s['matchs']:>3} m {s['buts']:>3} b {s['passes']:>3}"
              f"{'+' if s['passesMinimum'] else ' '} p  {s['contributionsParMatch']:.2f}/m  "
              f"{len(j['collectif'])} titres, {len(j['individuel'])} distinctions")


if __name__ == "__main__":
    main()
