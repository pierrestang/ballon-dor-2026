# Site Ballon d'Or 2026 — brief

Site one-page présentant les 10 candidats au Ballon d'Or (saison 3 août 2025 – 19 juillet 2026). Inspiration de mouvement : le site Ciao Energy (carrousel de canettes, zoom au clic).

**Contrainte principale : le site doit rester léger.** Objectif : moins de 400 ko au premier chargement (hors polices), environ 1 Mo supplémentaire par joueur ouvert.

## Stack

Vite + React + Framer Motion. Rien d'autre (pas de librairie de carrousel, pas de framework CSS lourd). Build statique déployable sur GitHub Pages.

## Arborescence du projet (dossier `BO2026/`)

```
BO2026/
├── CLAUDE.md
├── controle-stats-ballon-dor.xlsx   source des données
├── players.json                      données générées, importées par le site
├── scripts/
│   ├── convertir.py                  vidéo fond vert → séquence AVIF
│   └── excel_vers_json.py            Excel → players.json
└── public/assets/
    ├── competitions/  flags/  logos/
    └── players/
        └── sequences/<id>/           généré : 000.avif … 047.avif + face.avif + poster.avif
```

Les vidéos brutes fond vert sont rangées hors du projet, dans `~/videos/` (`/Users/pierrestang/videos/`) : rien de ce qui n'est pas utilisé par le site ne doit se trouver dans `public/`, car tout y est copié dans le site en ligne.

Commandes, lancées depuis `BO2026/` :
```
python3 scripts/excel_vers_json.py controle-stats-ballon-dor.xlsx
python3 scripts/convertir.py ~/videos/<fichier>.mp4 <id-du-joueur>
```
L'`id` doit correspondre au champ `id` de `players.json` (ex : `michael-olise`, `kylian-mbappe`). Chaque joueur pèse ~1,8 Mo de séquence (810×1440, AVIF q70) et ~20 ko de poster (800 px, AVIF q55). Choix validé le 24/09/2026 : la qualité prime sur l'objectif initial d'~1 Mo (WebP 960 px q70 jugé trop flou).

Les vidéos IA ont du flou de bougé de profil (3 à 4× moins net que de face) : `convertir.py` prend pour chaque position la voisine la plus nette (±1 image) et accentue la netteté en proportion du flou. La photo studio de face (`~/joueurs/detoures`, compétence detourage-joueurs) est calée sur l'image 000 → `face.avif` (~50 ko) et sert aussi de poster. Pas de photo de dos : le raccord avec la vidéo dédouble nom et numéro. Si la pose de la photo diffère trop de la vidéo (recouvrement < 0,80), le script garde l'image 000, sauf avec `--forcer-photo` : c'est le cas de Messi, à relancer avec cette option.

Tous les chemins du JSON commencent par `assets/` : les préfixer avec `import.meta.env.BASE_URL` pour qu'ils fonctionnent aussi sur GitHub Pages.

## Page 0 — l'intro

« BALLON D'OR » en plein écran avec l'effet « Hero Shutter Text » de 21st.dev (lettres qui sortent du flou traversées par trois lamelles or / clair / or), adapté en CSS simple + Framer Motion (pas de Tailwind). Puis « 2026 » en or ; aucun autre texte. En bas, une flèche dorée clignotante pointe vers le bas (faire défiler ; cliquable). On entre par clic, Entrée, ↓, molette vers le bas ou glisser vers le haut ; depuis le carrousel, ↑, molette vers le haut ou glisser vers le bas ramènent à l'intro. Le passage intro ↔ carrousel est un glissement vertical façon scroll (`src/transitions.js`) : l'intro sort par le haut pendant que le carrousel arrive par le bas, et inversement. Les posters se préchargent pendant l'intro. Au retour d'une page joueur, on revient au carrousel, pas à l'intro.

## Principe : le duel

Le site compare toujours **deux joueurs** (choix validé le 24/09/2026 : remplace l'ancienne expérience à un joueur). L'écran est coupé en deux, le côté droit est le miroir du gauche. Un même joueur ne peut pas être des deux côtés (la rotation saute le joueur affiché en face).

## Page 1 — le duel (`src/Carousel.jsx`)

- Fond sombre uni, pas de titre visible.
- Au centre, les deux cartes du duel. Chacune a sa propre file, indépendante, des 9 autres joueurs (assombris, plus petits — 72 %, `SMALL` — et centrés verticalement sur la carte du duel) qui part vers son bord de l'écran : à gauche pour la carte de gauche, à droite pour celle de droite. Faire défiler une file ne déplace jamais rien dans l'autre. Départ : ordre `ORDRE`, le joueur d'en face mis tout au bout (hors écran) pour qu'aucun joueur n'apparaisse deux fois.
- Sous chaque carte du duel, une seule flèche, vers l'extérieur : ‹ à gauche, › à droite (pas de compteur). Elle fait entrer la voisine (place 1) au duel ; l'ancienne carte part au bout de sa file (`shift`, `turnList`). Au clavier : ← fait défiler la file de gauche, → celle de droite. Le joueur choisi en face est sauté. Cliquer une carte d'une file l'amène au duel de ce côté. Mouvements inspirés de « Image Stack Carousel » (21st.dev) : ressort vif (raideur 300, amortissement 30), cartes des files droites, légèrement réduites à mesure qu'elles s'éloignent, carte du duel qui se soulève au survol et bascule en 3D quand on la fait glisser — un glissé de plus de 110 px la renvoie au bout de sa file (comme la flèche). La carte qui quitte le duel disparaît aussitôt, sans transition, et réapparaît au bout de sa file. Les cartes passent sous la carte du duel pendant leur trajet.
- Cartes style « carte Ultimate Team » (inspiration, aucune marque EA / FIFA) : forme de blason (épaules incurvées, bas en pointe arrondie ; masque SVG), or texturé (reflets diagonaux, grain métallique SVG, brossage, marbrures), bord biseauté en SVG (arête sombre, liserés clairs, filet intérieur), brillance en haut, ombre portée. En haut à gauche : poste en grand, drapeau, logo du club ; en haut à droite : buste du joueur jusqu'aux biceps (`bust.avif`, même cadre pour tous, ~13 ko, généré par `convertir.py`) ; en bas : nom de famille en capitales, filet, 3 stats de la saison (MJ, BUT, PD). Pas de note globale (donnée inexistante). Grand écran : cartes agrandies (~4,6 dans la largeur) ; mobile : les 2 du duel prennent la largeur.
- Clic sur une carte du duel, ↓, Entrée, molette ou glisser vers le haut : duel (page 2). ↑, molette vers le haut ou glisser vers le bas : intro.
- Passages intro ↔ page 1 ↔ duel : glissement vertical continu, comme un seul long défilement (`src/transitions.js`).

## Page 2 — le duel (`src/Duel.jsx`)

À l'ouverture, la page 2 démarre toujours en haut (début de la rotation) : l'élan de la molette qui l'a ouverte est ignoré. Ouverte avec la touche ↓, elle défile ensuite seule jusqu'en bas en 3 s (`AUTOPLAY`) : les joueurs font leur tour complet, image 000 → 047 → 000, et stats et palmarès apparaissent ; un geste de l'utilisateur l'interrompt. Page 1 → page 2 : les joueurs sont déjà à la même place (page 1 : vue de face `poster.avif`, même grille `.duel-grid`) ; le scroll leur fait faire un tour complet, de face en haut de page à de face en bas (`TURNS`). Les flèches ‹ › de changement de joueur n'apparaissent qu'en fin de scroll. Ancienne transition façon Ciao (remplacée) : les deux joueurs centraux zooment vers leur place. Disposition miroir : palmarès · joueur · stats · joueur · palmarès. Les infos du joueur de droite (logo, drapeau, poste, palmarès) sont alignées sur la droite, en miroir. Les stats sont au milieu, en face-à-face (sans « VS ») — dans l'ordre : nombre de titres collectifs, nombre de titres individuels majeurs (1er uniquement, les 2e / 3e places ne comptent pas), « Matches », buts, « Assists » (passes décisives), « Buts + Assists / / MATCH » sur deux lignes (buts + assists par match) : une ligne par stat « valeur gauche · libellé · valeur droite » ; sauf pour les matchs, le meilleur score est en vert (pas d'écart affiché) ; tous les chiffres ont la même taille, tous les libellés aussi (centrés), et les chiffres sont à la même distance du centre (colonne de libellé de largeur fixe, --label-w) (mobile : joueurs côte à côte, ce tableau dessous sur toute la largeur, puis les deux palmarès à sa place en fin de rotation). Les deux joueurs tournent ensemble au même scroll. Fond noir uni. Le prénom et le nom de chaque joueur sont écrits en arc de cercle juste au-dessus de sa tête (SVG `textPath`, identifiant de chemin propre à chaque joueur, taille des lettres adaptée à la longueur du nom ; au scroll, ils apparaissent en fondu en descendant légèrement (du haut vers le bas) comme les stats et le palmarès, juste avant elles ; affichés d'emblée en mouvement réduit) ; une bande est réservée en haut de l'écran pour les arcs, qui restent ainsi au-dessus des colonnes latérales.

**Rotation au scroll.** La section fait environ 250vh de haut, le joueur est en `position: sticky`. La progression du scroll (`useScroll` de Framer Motion) pilote l'image affichée, de `000.avif` (face, haut de page) à `047.avif` puis retour à `000.avif` (face, bas de page). Afficher dans un `<canvas>` ou une seule balise `<img>` dont on change la source, jamais 48 images dans le DOM. Quand le scroll s'arrête de face (début ou fin du scroll), `face.avif` (photo nette) remplace l'image de la vidéo en fondu.

**Stats**, qui apparaissent en fondu pendant la rotation :
- Matchs
- Buts
- Passes décisives (sans « + », même si `passesMinimum` est vrai)
- Contributions par match = (buts + passes) ÷ matchs, déjà calculé dans `contributionsParMatch`

**Palmarès**, qui apparaît progressivement élément par élément comme les stats (club / drapeau / poste, intertitres, puis chaque titre) ; sur grand écran, les trois colonnes (palmarès, stats, palmarès) apparaissent en même temps, réparties sur presque toute la rotation (`spread`, `FADE`, `REVEAL_START` / `REVEAL_END` dans `Duel.jsx`), sur mobile les stats puis les palmarès, sans titre général, en deux blocs intitulés « Collectif » et « Individuel » :
- Collectif : logo de la compétition (champ `icone`, dans `assets/competitions/`) + nom du titre.
- Individuel : logo de la compétition (champ `logo`) + titre sans le nom de la compétition (« Meilleur buteur »), en blanc. Pas de médaille affichée (champ `icone` à `null`). Le Soulier d'or européen de Kane affiche le logo UEFA (`assets/competitions/uefa.svg`). Les distinctions « Playoffs MLS » sont fusionnées avec « MLS » (`FUSIONS` dans `excel_vers_json.py`) : une seule ligne par titre. La distinction « Meilleur buteur — Coupe du monde (qualifications) » (Haaland) n'est pas affichée (`EXCLUES`). Tri : rang d'abord (1er avant 2e), puis compétition par prestige (`ORDRE_COMPETITIONS`), puis catégorie (joueur, buteur, passeur). Les places d'honneur (2e, 3e) sont grisées (elles ne comptent pas dans le score).

Côté extérieur de chaque joueur, à mi-hauteur, une seule petite flèche (‹ pour le joueur de gauche, › pour celui de droite, comme en page 1 ; au clavier ← et →) sans cercle, en légère lueur blanche, légèrement transparentes (pleines au survol), bien écartées, toujours visibles (sans survol), changent le joueur de ce côté sans quitter la page 2 (même position de scroll, le joueur d'en face est sauté). Au changement, le joueur affiché tourne jusqu'à être de dos, puis le nouveau joueur enchaîne de dos et termine son tour de face (les textes du côté concerné — nom, chiffres, palmarès — remontent en s'effaçant, puis ceux du nouveau joueur arrivent du haut vers le bas — ligne par ligne : la sortie part du bas de l'écran vers le haut, l'entrée du haut vers le bas ; retard calculé d'après la hauteur de chaque élément (`staggerLines`) — au passage de dos) ; le scroll reprend la main au mouvement suivant. Chaque joueur est un peu vers le centre de l'écran (28 % et 72 % de la largeur, variable --center) ; palmarès et stats sont à égale distance de chaque joueur, marges égales sur les bords (colonnes calculées en CSS : --center, --pad, --gap, --fh, --fw, --fcol, --palm-w). Pas de bouton retour : la touche ↑ (ou Échap) ramène à la page 1 pour changer de joueurs, sur le même duel, tout comme remonter (molette ou glisser vers le bas) depuis le haut de la page 2.

## Règles de légèreté

- Page 1 : ne charger que les 10 posters. Aucune séquence de rotation au démarrage.
- Précharger en arrière-plan les séquences des deux joueurs affichés uniquement, après le chargement de la page (`requestIdleCallback`), pour que le clic soit instantané. Une page 2 charge donc ~4 à 4,5 Mo (deux séquences).
- Si l'utilisateur scrolle avant la fin du chargement, afficher la dernière image disponible plutôt que de bloquer.
- Icônes : `loading="lazy"` sur le palmarès. Convertir en WebP toute image d'icône qui dépasse 20 ko. (Les anciens trophées et médailles, plus utilisés, sont dans `assets-source/`.)
- Une seule police Google Fonts : Barlow Condensed (500, 700). Titres du palmarès en 700 majuscules, blancs.
- `prefers-reduced-motion` : pas de rotation, on affiche l'image de face et les stats directement.

## Notes techniques

- Framer Motion 13 confie les `useTransform` branchés directement sur `useScroll` à une `ViewTimeline` native, mal calibrée pour une section plus haute que l'écran : recopier `scrollYProgress` dans une `useMotionValue` ordinaire avant de le transformer (voir `src/Player.jsx`).

## Données

`players.json` (racine du projet), un objet par joueur :
```json
{
  "id": "michael-olise", "nom": "Michael Olise", "poste": "AD",
  "selection": "France", "drapeau": "assets/flags/fr.svg", "club": "Bayern Munich",
  "stats": { "matchs": 65, "buts": 24, "passes": 35, "passesMinimum": true, "contributionsParMatch": 0.91 },
  "collectif": [{ "titre": "Bundesliga", "icone": "assets/trophies/bundesliga.png" }],
  "individuel": [{ "titre": "Meilleur passeur — Bundesliga", "categorie": "passeur", "rang": 1,
                   "competition": "Bundesliga", "icone": "assets/trophies/target-gold.png",
                   "logo": "assets/competitions/bundesliga.svg" }]
}
```
Le poste n'est pas dans l'Excel : il est défini dans `POSTES` (`excel_vers_json.py`) et affiché à droite du drapeau, au-dessus du palmarès. Le fichier logo de club n'est pas dans le JSON : à associer à partir du champ `club` (ex : `Bayern Munich` → `assets/logos/bayern.webp`).
