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
ORDRE = ["Michael Olise", "Harry Kane", "Lamine Yamal", "Lionel Messi", "Kylian Mbappé",
         "Khvicha Kvaratskhelia", "Ousmane Dembélé", "Erling Haaland", "Rodri",
         "Jude Bellingham"]   # ordre du 27/09/2026

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

# Page 3 : les compétitions de même type sont alignées sur les mêmes lignes d'un tableau à
# l'autre (championnat en face de championnat, etc.). Ordre des lignes = ordre de TYPES, puis
# ordre de COMPETITIONS_DETAIL dans un même type (coupe principale avant coupe secondaire).
# Nationales, puis continentales, puis mondiales.
TYPES = ["championnat", "coupe-nationale",
         "coupe-continentale", "supercoupe-uefa",
         "intercontinentale", "coupe-du-monde", "qualifications"]

# Compétition de l'onglet Detail → (nom affiché, logo dans assets/competitions/, type).
# Les deux lignes MLS (saison régulière, playoffs) sont additionnées en une seule.
COMPETITIONS_DETAIL = {
    "LaLiga": ("Liga", "laliga", "championnat"),
    "Premier League": ("Premier League", "premier-league", "championnat"),
    "Bundesliga": ("Bundesliga", "bundesliga", "championnat"),
    "Ligue 1": ("Ligue 1", "ligue-1", "championnat"),
    "MLS — saison régulière 2025": ("MLS", "mls", "championnat"),
    "MLS — playoffs 2025": ("MLS", "mls", "championnat"),
    "Copa del Rey": ("Coupe du Roi", "copa-del-rey", "coupe-nationale"),
    "Coupe d'Allemagne": ("Coupe d'Allemagne", "dfb-pokal", "coupe-nationale"),
    "Coupe de France": ("Coupe de France", "coupe-de-france", "coupe-nationale"),
    "FA Cup": ("FA Cup", "fa-cup", "coupe-nationale"),
    # Coupes secondaires : même type que les coupes nationales, placées après elles.
    "EFL Cup": ("EFL Cup", "efl-cup", "coupe-nationale"),
    "Leagues Cup": ("Leagues Cup", "leagues-cup", "coupe-nationale"),
    "Ligue des champions": ("Ligue des champions", "champions-league", "coupe-continentale"),
    "Coupe des champions de la CONCACAF": ("CONCACAF Champions Cup", "concacaf-champions-cup",
                                           "coupe-continentale"),
    # Supercoupes nationales : même type que les coupes nationales, placées après elles.
    "Supercoupe d'Espagne": ("Supercoupe d'Espagne", "supercoupe-espagne", "coupe-nationale"),
    "Supercoupe d'Allemagne": ("Supercoupe d'Allemagne", "supercoupe-allemagne", "coupe-nationale"),
    "Trophée des champions": ("Trophée des champions", "trophee-des-champions", "coupe-nationale"),
    "Supercoupe de l'UEFA": ("Supercoupe de l'UEFA", "uefa-badge", "supercoupe-uefa"),
    "Coupe intercontinentale": ("Coupe intercontinentale", "club-world-cup", "intercontinentale"),
    "Coupe du monde 2026": ("Coupe du monde", "world-cup-2026", "coupe-du-monde"),
    "Qualifications Coupe du monde (UEFA)": ("Qualifications Coupe du monde", "world-cup-2026",
                                             "qualifications"),
    "Qualifications Coupe du monde (CONMEBOL)": ("Qualifications Coupe du monde", "world-cup-2026",
                                                 "qualifications"),
}


# Résultat de l'équipe dans chaque compétition (page 3), par (club ou sélection, nom affiché).
# Absent de l'Excel : relevé le 25/09/2026 (Wikipédia, UEFA, ESPN, sites des clubs).
RESULTATS = {
    ("Real Madrid", "Liga"): "2ème",
    ("Real Madrid", "Coupe du Roi"): "8es de finale",
    ("Real Madrid", "Ligue des champions"): "Quarts de finale",
    ("Real Madrid", "Supercoupe d'Espagne"): "Finale",
    ("FC Barcelone", "Liga"): "Vainqueur",
    ("FC Barcelone", "Coupe du Roi"): "Demi-finale",
    ("FC Barcelone", "Ligue des champions"): "Quarts de finale",
    ("FC Barcelone", "Supercoupe d'Espagne"): "Vainqueur",
    ("Paris Saint-Germain", "Ligue 1"): "Vainqueur",
    ("Paris Saint-Germain", "Coupe de France"): "16es de finale",
    ("Paris Saint-Germain", "Ligue des champions"): "Vainqueur",
    ("Paris Saint-Germain", "Trophée des champions"): "Vainqueur",
    ("Paris Saint-Germain", "Supercoupe de l'UEFA"): "Vainqueur",
    ("Paris Saint-Germain", "Coupe intercontinentale"): "Vainqueur",
    ("Bayern Munich", "Bundesliga"): "Vainqueur",
    ("Bayern Munich", "Coupe d'Allemagne"): "Vainqueur",
    ("Bayern Munich", "Ligue des champions"): "Demi-finale",
    ("Bayern Munich", "Supercoupe d'Allemagne"): "Vainqueur",
    ("Manchester City", "Premier League"): "2ème",
    ("Manchester City", "FA Cup"): "Vainqueur",
    ("Manchester City", "EFL Cup"): "Vainqueur",
    ("Manchester City", "Ligue des champions"): "8es de finale",
    ("Inter Miami", "MLS"): "Vainqueur",   # MLS Cup (playoffs)
    ("Inter Miami", "CONCACAF Champions Cup"): "8es de finale",
    ("Inter Miami", "Leagues Cup"): "Finale",
    ("Espagne", "Coupe du monde"): "Vainqueur",
    ("Argentine", "Coupe du monde"): "Finale",
    ("Angleterre", "Coupe du monde"): "3ème",
    ("France", "Coupe du monde"): "Demi-finale",   # 4e place : affichée comme les autres demi-finales
    ("Norvège", "Coupe du monde"): "Quarts de finale",
    ("Espagne", "Qualifications Coupe du monde"): "Qualifié",
    ("Argentine", "Qualifications Coupe du monde"): "Qualifié",
    ("Angleterre", "Qualifications Coupe du monde"): "Qualifié",
    ("France", "Qualifications Coupe du monde"): "Qualifié",
    ("Norvège", "Qualifications Coupe du monde"): "Qualifié",
    ("Géorgie", "Qualifications Coupe du monde"): "Éliminé",   # 3e du groupe E
}
SELECTION = {"coupe-du-monde", "qualifications"}

# Trophée affiché à la place de « Vainqueur » (assets/trophees/, recadrés et réduits depuis
# assets-source/trophees-collectifs/).
TROPHEES = {
    "Liga": "laliga", "Supercoupe d'Espagne": "supercopa", "Ligue 1": "ligue-1",
    "Trophée des champions": "trophee-des-champions", "Ligue des champions": "champions-league",
    "Supercoupe de l'UEFA": "uefa-super-cup", "Coupe intercontinentale": "intercontinental",
    "Bundesliga": "bundesliga", "Coupe d'Allemagne": "dfb-pokal",
    "Supercoupe d'Allemagne": "dfl-supercup", "FA Cup": "fa-cup", "EFL Cup": "efl-cup",
    "MLS": "mls-cup", "Coupe du monde": "world-cup",
}   # compétitions jouées avec la sélection


# Colonne « Individuel » de la page 3 : distinctions individuelles rattachées à leur
# compétition (nom affiché de l'onglet Detail). Le Soulier d'or (« Europe ») n'en a pas.
# EXCLUES ne s'applique qu'au palmarès : le titre de meilleur buteur des qualifications
# de Haaland figure bien sur sa ligne.
COMPETITION_DISTINCTION = {"Coupe du monde (qualifications)": "Qualifications Coupe du monde"}


# Icône de chaque distinction (assets/medailles/, réduites depuis assets-source/medailles/) :
# étoile = meilleur joueur, ballon = meilleur buteur, cible = meilleur passeur ; or, argent,
# bronze selon le rang.
ICONES_CATEGORIE = {"joueur": "star", "buteur": "ball", "passeur": "target"}
METAUX = {1: "gold", 2: "silver", 3: "bronze"}


def accomplissements(rows):
    """Distinctions individuelles d'un joueur → {compétition : [{titre, categorie, rang, icone}]},
    triées par rang puis catégorie (joueur, buteur, passeur)."""
    out = {}
    for x in rows:
        t = individuel(x["Distinction"])
        if t["competition"] == "Europe":
            continue
        comp = COMPETITION_DISTINCTION.get(t["competition"], t["competition"])
        titre = t["titre"].split(" — ")[0]
        icone = asset("medailles", f"{ICONES_CATEGORIE[t['categorie']]}-{METAUX[t['rang']]}")
        liste = out.setdefault(comp, [])
        if all(d["titre"] != titre for d in liste):   # MLS : saison régulière et playoffs
            liste.append({"titre": titre, "categorie": t["categorie"], "rang": t["rang"],
                          "icone": icone})
    for liste in out.values():
        liste.sort(key=lambda d: (d["rang"], ORDRE_CATEGORIES.index(d["categorie"])))
    return out


def competitions(rows, club, selection, distinctions_joueur):
    """Lignes de l'onglet Detail d'un joueur → une ligne par compétition, triées par type
    (TYPES) puis par ordre de COMPETITIONS_DETAIL. Passes « n.r. » → None (affiché « – »)."""
    out = {}
    for r in rows:
        if r["Compétition"] not in COMPETITIONS_DETAIL:
            sys.exit(f"Compétition « {r['Compétition']} » absente de COMPETITIONS_DETAIL")
        nom, logo, type_ = COMPETITIONS_DETAIL[r["Compétition"]]
        passes = None if r["Passes"] == "n.r." else r["Passes"]
        rang = list(COMPETITIONS_DETAIL).index(r["Compétition"])
        c = out.setdefault(nom, {"nom": nom, "type": type_, "logo": asset("competitions", logo),
                                 "matchs": 0, "buts": 0, "passes": 0, "_rang": rang})
        c["matchs"] += r["Matchs"]
        c["buts"] += r["Buts"]
        c["passes"] = None if passes is None or c["passes"] is None else c["passes"] + passes
    for c in out.values():
        equipe = selection if c["type"] in SELECTION else club
        if (equipe, c["nom"]) not in RESULTATS:
            sys.exit(f"Pas de résultat pour ({equipe!r}, {c['nom']!r}) (RESULTATS)")
        c["resultat"] = RESULTATS[(equipe, c["nom"])]
        if c["resultat"] == "Vainqueur":
            if c["nom"] not in TROPHEES:
                sys.exit(f"Pas de trophée pour « {c['nom']} » (TROPHEES)")
            c["trophee"] = asset("trophees", TROPHEES[c["nom"]])
        c["individuel"] = distinctions_joueur.pop(c["nom"], [])
        c["contributionsParMatch"] = (None if c["passes"] is None
                                      else round((c["buts"] + c["passes"]) / c["matchs"], 2))
    if distinctions_joueur:
        sys.exit(f"Distinctions sans compétition dans l'onglet Detail : {list(distinctions_joueur)}")
    return [{k: v for k, v in c.items() if k != "_rang"}
            for c in sorted(out.values(), key=lambda c: (TYPES.index(c["type"]), c["_rang"]))]


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
        # Affiché « Soulier d'or » (demande du propriétaire, 28/09/2026) ; l'Excel garde le nom complet.
        return {"titre": "Soulier d'or", "categorie": "buteur", "rang": 1, "competition": "Europe",
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

    detail = {}
    for r in lignes(wb["Detail"]):
        detail.setdefault(r["Joueur"], []).append(r)

    toutes_individuelles = {}
    for r in lignes(wb["Distinctions"]):
        if r["Type"] == "Individuelle":
            toutes_individuelles.setdefault(r["Joueur"], []).append(r)

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
            "competitions": competitions(detail.get(nom, []), r["Club (saison)"], r["Sélection"],
                                         accomplissements(toutes_individuelles.get(nom, []))),
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

    # Ordinaux à la française : « 2e », comme « 8es de finale » (et non « 2ème »).
    texte = re.sub(r"(\d+)ème\b", r"\1e", json.dumps(joueurs, ensure_ascii=False, indent=2))
    OUT.write_text(texte + "\n")
    print(f"{len(joueurs)} joueurs → {OUT.relative_to(ROOT)}")
    for j in joueurs:
        s = j["stats"]
        print(f"  {j['id']:<24}{s['matchs']:>3} m {s['buts']:>3} b {s['passes']:>3}"
              f"{'+' if s['passesMinimum'] else ' '} p  {s['contributionsParMatch']:.2f}/m  "
              f"{len(j['collectif'])} titres, {len(j['individuel'])} distinctions")


if __name__ == "__main__":
    main()
