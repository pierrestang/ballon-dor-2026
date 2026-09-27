# Site Ballon d'Or 2026 — brief

Site one-page sur les 10 candidats au Ballon d'Or (saison 3 août 2025 – 19 juillet 2026) : pièces d'or 3D, joueurs en vidéo qui tournent, noir et or. Inspiration de mouvement : Ciao Energy.

Ce fichier décrit **l'état actuel**. Le détail de chaque décision, date par date (réglages fins, essais abandonnés, raisons des choix), est dans `docs/HISTORIQUE.md` : le consulter avant de revenir sur un choix, sans le recopier ici. Tenir ce fichier court : y mettre la règle, pas l'historique.

## Contraintes

- **Léger.** Intro : ~680 Ko au premier chargement (JS + CSS ~200 Ko, 10 pièces ~480 Ko), hors polices. Les séquences vidéo (~1,8 Mo par joueur) ne se chargent qu'à l'entrée dans Duel (sélection : préchargement des deux joueurs affichés), dans la page du duel, la Présentation ou un duel du jeu. Jamais depuis l'intro.
- **Déploiement GitHub Pages** : base Vite relative (`./`). Aucun chemin absolu (`/…`) ; les chemins du JSON commencent par `assets/`, à préfixer avec `asset()` (`data.js`). Une `url()` passée par une variable CSS se résout depuis la feuille de style : lui donner une adresse absolue (ex. `--coin`, `Coin.jsx`).
- `prefers-reduced-motion` respecté partout (pas de rotation ni de vol ; fondus).

## Stack et commandes

Vite + React + Framer Motion ; GSAP + ScrollTrigger pour la page du duel et la Présentation seulement (import dynamique ; animations dans un `gsap.context`, `revert()` à la sortie). Rien d'autre.

```
npm run dev | npm run build
python3 scripts/excel_vers_json.py controle-stats-ballon-dor.xlsx   # Excel → players.json
python3 scripts/convertir.py ~/videos/<fichier>.mp4 <id>           # vidéo fond vert → séquence AVIF
node scripts/comparer_formats.mjs [parties]                        # moteur du jeu : vérifs + comparaison
```

Vidéos brutes hors projet (`~/videos/`) ; rien d'inutilisé dans `public/` (tout y est publié). Sources d'images : `assets-source/` (dont `coins-q70/`, pièces avant réencodage en AVIF q50). Aperçu des liens partagés : `public/og.jpg` (1200 × 630) et balises Open Graph dans `index.html` (`og:image` relative : à rendre absolue une fois le domaine connu).

## Fichiers

- `App.jsx` : pages, transitions, préchargements, **adresses** (`routes.js`).
- `routes.js` : `#duel/<id>/<id>`, `#joueur/<id>`, `#classement`, rien = intro. Changement de page : nouvelle entrée d'historique (bouton Retour du navigateur) ; changement de joueur : simple mise à jour. Titre d'onglet par page.
- `Carousel.jsx` : l'intro et les états finaux de ses versions, une seule scène ; `SelectionParts.jsx` : géométrie, titre, pièces, vols de la sélection du duel ; `Intro.jsx` : chargeur (trophée).
- `SoloPick.jsx` (Les candidats), `Solo.jsx` (Présentation d'un joueur), `Final.jsx` + `FinalPlayers.jsx` + `FinalTables.jsx` (page du duel), `Game.jsx` (Mon classement, chargé à la demande), `swiss.js` (moteur du jeu), `community.js` (classement communautaire, Firestore REST ; config `.env`, règles `firebase/firestore.rules`), `storage.js` (partie enregistrée).
- `Coin.jsx` : pièce 3D, `LiveCoin` (flottement + tour au survol), `useCoinTurn` (changement de joueur : tour complet, image changée de profil), `COIN_TURN`. `Letters.jsx` : textes en arc (`ArcText`, `NameArc` frappé, `GlitchArc`, `ScrollLetters`).
- `styles.css` n'importe que `src/styles/NN-*.css`, **dans l'ordre de la cascade** (base, intro, sélection, duel, tableaux, page du duel, …, navigation). Modifier la règle d'origine plutôt qu'ajouter une surcharge en fin de fichier.
- `tournament.js` + `scripts/simuler_tournoi.mjs` : ancien moteur en poules, plus importé par le site, gardé pour la comparaison.

## Parcours

Intro → trois versions au choix (← / →, bords, glisser ; on ouvre sur **Mon classement**) : **Les candidats · Duel · Mon classement**. Entrer : ↓, Entrée, chevron, molette, doigt.

- **Intro** : chargeur (trophée, ≤ 3 s), puis la pièce du joueur (48vmin), « BALLON D'OR 2026 » en arc au-dessus, nom dessous, titre de la version en or dessous (glitch doux au changement). Un nominé toutes les 2 s.
- **Duel** : même scène, la pièce se pose au centre de la sélection (titre « DUEL »), ‹ › pour changer de joueur, clic : la pièce vole vers l'emplacement A puis B ; les deux posés → flèche vers la **page du duel** : palmarès · joueur (vidéo, tour complet) · stats face à face · joueur · palmarès ; au scroll (grand écran, épinglé GSAP) les tableaux détaillés montent ; mobile : bande réduite puis tableaux empilés.
- **Les candidats** : même scène, anneau de 7 pièces ; → **Présentation** d'un joueur (palmarès · joueur · stats, puis son tableau).
- **Mon classement** : voir plus bas.
- **Navigation** : flèche vers le haut en haut de chaque page (« MENU » au centre sur la sélection, Les candidats et le jeu ; « CHANGER DE DUEL » / « LES CANDIDATS » en haut à gauche sur la page du duel et la Présentation, le nom en arc occupant le centre). Flèches vers le bas libellées (« VOIR LE JOUEUR », « VOIR LE TABLEAU DÉTAILLÉ », « JOUER LA MANCHE N »…). Pas de ligne d'aide clavier ; les raccourcis restent (↑ retour, ↓ suite, ← → joueur, Échap).

## Mon classement

- **Format : système suisse** (`swiss.js`), 5 **manches** (le mot « ronde » n'apparaît pas à l'écran) de 5 duels, sans tête de série : manche 1 tirée au sort, puis joueurs à égalité de points face à face, jamais deux fois le même duel. Égalités : confrontation directe, sinon duel de barrage voté. ~28 duels (31 au plus). Choisi sur simulation (`comparer_formats.mjs`) : podium exact 99,7 % pour un visiteur cohérent, contre 94 % aux poules.
- **Écrans** : annonce de manche (3 duels puis 2, halo par duel ; manche 1 : les pièces volent du centre) → duels comme la page du duel (joueurs en vidéo, clic ou ← / → pour voter, tableaux en bas de page) → **annonce du Ballon d'Or** (pièce de l'intro, #10 → #1, ↓ pour passer) → classement final sur un écran (#1 … #10, drapeau, club ; « VOTRE BALLON D'OR 2026 » en or) + partie communautaire.
- **Le classement n'est visible qu'à la fin.** Compteur « DUEL N / total » en haut à gauche, fil doré de progression. « Nouvelle partie » demande une confirmation. Partie enregistrée (`storage.js`, `bo2026-classement-v2`, avec `done`).
- **Transitions** : partie en cours, glissement de page ; classement fait, la pièce de l'intro est reprise par l'annonce du Ballon d'Or (bloc identique, glisse à sa place, puis #10).

## Charte

- Variables dans `:root` (`00-base.css`) : fond `--bg` + dégradé `--bg-center` (redéfinis par version, `data-theme` : Mon classement noir, Duel nuit bleue, Les candidats vert), texte `--text`, gris `--text-secondary` (6,9:1), or `--gold`, halo `--halo`, panneaux `--panel`, durées `--t-fast/med/slow`, courbes `--ease-out/expo`.
- **Typo** : Barlow Condensed 700 capitales partout (titres, noms en arc, libellés) ; JetBrains Mono seulement dans le chargeur. Titres de page : `.pick-title` à la même hauteur partout, description à la longueur du titre (`titleFit.js`). Textes ≥ 12 px (libellés de flèche 13–15 px).
- **L'or signifie « se distingue »** : dans un duel, la meilleure valeur des deux (sauf les matches) ; en Présentation, un score supérieur de plus de 2/3 à la moyenne des neuf autres ; places #1 à #3. Il sert aussi au décor (« 2026 », titres de version, « VS »). Or métallique (`--gold-metal` + `--gold-grain`) sur les grands textes et chiffres dorés, or uni sur les petits.
- **Flèches** : un seul chevron (trait fin `--arrow-stroke`) ; latérales 30 px (`--arrow-size`), à égale distance des deux pièces, sous les pièces qui bougent ; verticales 22 px (`--arrow-v-size`), fixes (pas de clignotement), libellé au-dessus ou dessous.
- **Mouvement** : pièces — flottement 5 s, tour complet au survol, changement de joueur en un tour (1,1 s), vols 0,7 s ; textes — fondu + 12 px, décalés ligne par ligne ; noms frappés lettre par lettre. Pages : glissement vertical 0,7 s ; intro ↔ sélection / candidats : même scène, progression 0 → 1 (1,6 s).
- Places et rangs : « #1 » dans le jeu ; « 2e », « 8es de finale » ailleurs (normalisé par `excel_vers_json.py`). Intitulés « Matches », « Assists », « Ratio » : choix du propriétaire.

## Données

`players.json` (généré, ne pas éditer) : `id`, `nom`, `poste` (défini dans `POSTES` du script), `selection`, `drapeau`, `club` (logo via `clubLogo`, `data.js`), `stats` (matchs, buts, passes, contributionsParMatch), `collectif`, `individuel` (rang 1 = compte comme titre), `competitions` (tableaux détaillés : résultat, trophée, distinctions). Résultats des équipes et exclusions : tables `RESULTATS`, `FUSIONS`, `EXCLUES` du script. Dates de naissance : `BIRTHS` (`data.js`).

## Vérifier

- Moteur du jeu : `node scripts/comparer_formats.mjs 300`.
- Rendu : lancer `npm run dev` et parcourir intro, sélection, page du duel (joueurs puis tableaux), Les candidats, Présentation, une partie complète de Mon classement, en grand écran et à 390 px. Toute refonte CSS : comparer des captures avant / après (mouvement réduit pour un rendu stable).
