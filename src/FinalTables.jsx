// Copie du composant de tableaux détaillés de la page 3 (Details.jsx), pour la page finale
// (Final.jsx) : mêmes tableaux, mêmes classes. Allégée à la demande (26/09/2026) : sans la pièce
// au-dessus du tableau (colonne Équipe et ligne Total remises le 27/09/2026). Le comportement de page
// (clavier, molette, retour) est dans Final.jsx.
import { useEffect, useRef } from 'react'
import { m } from 'framer-motion'
import { asset, decimal } from './data'
import Tip from './Tip'
import { RollText, StatsTable } from './FinalPlayers'
import SeasonPalmares from './SeasonPalmares'
import { ClubLogo, Flag } from './Nameplate'
import { SLIDE } from './transitions'

// « B+A/Match » (ex-« Ratio », 28/09/2026) : buts + assists par match, détaillé au survol de l'intitulé.
// SHORT : intitulés courts du mode Duel sur mobile (deux blocs côte à côte).
const COLUMNS = ['Matches', 'Buts', 'Passes', 'Buts\u00a0+\u00a0passes\n/\u00a0match']
export const SHORT = { Matches: 'M', Buts: 'B', Passes: 'P', 'Buts\u00a0+\u00a0passes\n/\u00a0match': 'B+P/M' }
const HEADER_TIPS = { 'Buts\u00a0+\u00a0passes\n/\u00a0match': 'Buts + passes décisives / match' }
// Ratio : buts + assists par match. Passes non relevées (« n.r. » : qualifications de la Coupe du
// monde, supercoupes, certaines coupes) : buts par match à la place, signalé en infobulle.
const goalsOnly = (s) => s.contributionsParMatch === null && s.passes === null && s.matchs > 0
const ratio = (s) => (goalsOnly(s) ? s.buts / s.matchs : s.contributionsParMatch)
const RATIO_GOALS_TIP = 'Buts / match (passes non relevées)'
// Ratio nul (0,00) ou inconnu : « – » (27/09/2026).
const ratioCell = (s, roll = (t) => t) => {
  const r = goalsOnly(s) ? ratio(s) : s.contributionsParMatch
  if (r === null || Math.round(r * 100) === 0) return '—'
  return goalsOnly(s) ? <Tip label={RATIO_GOALS_TIP}>{roll(decimal(r))}</Tip> : roll(decimal(r))
}
// Assists non relevées : 0 (27/09/2026).
// roll : habille chaque texte (défilement au changement de joueur, RollText).
const cells = (s, roll = (t) => t) => [roll(String(s.matchs)), roll(String(s.buts)), roll(String(s.passes ?? 0)),
  ratioCell(s, roll)]

// Familles alignées d'un tableau à l'autre (27/09/2026) : championnat, coupes nationales
// (supercoupes comprises), coupes d'Europe et intercontinentales, compétitions internationales
// (Coupe du monde et qualifications). Chaque famille prend, dans les deux tableaux, autant de
// lignes que le joueur qui en a le plus ; les lignes vides sont en fin de famille.
const GROUPS = [
  ['championnat'],
  ['coupe-nationale'],
  ['coupe-continentale', 'supercoupe-uefa', 'intercontinentale'],
  ['coupe-du-monde', 'qualifications'],
]
const inGroup = (p, g) => g.flatMap((t) => p.competitions.filter((c) => c.type === t))

// Intitulé du trophée, en infobulle : « Champion Liga », « Vainqueur de la Ligue des
// champions », « Vainqueur du Trophée des champions », « Vainqueur de l'EFL Cup »…
const trophyLabel = (c) => {
  if (c.type === 'championnat') return `Champion ${c.nom}`
  if (/^[AEIOUÉ]/i.test(c.nom)) return `Vainqueur de l'${c.nom}`
  if (c.nom.startsWith('Trophée')) return `Vainqueur du ${c.nom}`
  return `Vainqueur de la ${c.nom}`
}

// Résultat raccourci : « Demi-finale » → « Demi », « 8es de finale » → « 8es », « Quarts de
// finale » → « Quarts », « 16es de finale » → « 16es » ; « Finale » reste « Finale ».
const shortResult = (r) => r.replace(/^Demi-finale$/i, 'Demi').replace(/ de finale$/i, '')

// Trophées de la colonne Résultat : vraies formes et couleurs (on doit les reconnaître), mais
// même poids visuel. Toutes les images font 96 px de haut pour des largeurs de 26 à 96 px :
// hauteur ajustée selon les proportions (les coupes fines grandissent un peu, les plateaux
// larges rétrécissent un peu), bornée pour tenir dans la ligne.
const balanceTrophy = (e) => {
  const img = e.currentTarget
  const a = img.naturalWidth / img.naturalHeight
  if (!a) return
  const f = Math.min(1.3, Math.max(0.8, 0.9 / Math.sqrt(a)))
  img.style.setProperty('--tr', f.toFixed(3))
}

// Compétitions jouées avec la sélection (drapeau) ; les autres avec le club (logo). Comme
// SELECTION dans scripts/excel_vers_json.py.
const SELECTION = new Set(['coupe-du-monde', 'qualifications'])

// Apparition des lignes, de haut en bas, une fois la page arrivée.
const row = (i) => ({
  initial: { opacity: 0, y: -12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: SLIDE.duration + i * 0.05, duration: 0.4, ease: 'easeOut' },
})

/** Tableau d'un joueur : ses compétitions, dans l'ordre des types, sans ligne vide (les deux
    tableaux ne sont plus alignés ligne à ligne, 27/09/2026). Pas de comparaison par la couleur
    des chiffres. Les deux tableaux se lisent dans le même sens (pas de miroir). Prénom et nom
    sur une ligne en tête du tableau. Colonnes : Équipe, Compétition, scores, puis Résultat et
    Individuel à droite ; `medals` : nombre de médailles de la plus longue cellule Individuel des
    deux tableaux (largeur de cette colonne, même structure des deux côtés). */
// Ligne Total : valeurs comparées entre les deux joueurs (buts, assists, ratio arrondi affiché,
// trophées collectifs, distinctions de 1er ; pas les matches). La plus haute est en or ; rien
// en cas d'égalité ou de valeur inconnue.
const totals = (p) => [
  null,
  p.stats.buts,
  p.stats.passes,
  p.stats.contributionsParMatch === null ? null : Math.round(p.stats.contributionsParMatch * 100) / 100,
  p.competitions.filter((c) => c.trophee).length,
  p.individuel.filter((t) => t.rang === 1).length,   // distinctions de 1er du palmarès (Soulier d'or compris)
]

function Table({ player, side, medals, sizes }) {
  // Le bloc reste en place d'un joueur à l'autre (intitulés, fonds de ligne et icônes ne
  // disparaissent pas ; les icônes changent d'un coup) : seuls les textes défilent. L'apparition
  // des lignes (fondu, row) ne se joue qu'à l'arrivée de la page.
  const roll = (t) => <RollText text={t} trigger={player.id} onMount />
  const appear = useRef(true)
  useEffect(() => { appear.current = false }, [])
  // Même cible d'animation à chaque rendu (la retirer annulait l'apparition en cours) ; après
  // l'arrivée, une ligne nouvelle est là d'emblée (initial: false).
  const r = (i) => (appear.current ? row(i) : { ...row(i), initial: false })
  // Lignes du tableau, famille par famille : ses compétitions, puis des lignes vides jusqu'à la
  // taille commune de la famille (sizes).
  const lines = GROUPS.flatMap((g, gi) => {
    const own = inGroup(player, g)
    return [...own, ...Array.from({ length: sizes[gi] - own.length }, (_, k) => ({ pad: `${gi}-${k}` }))]
  })
  return (
    <section className={`details-side is-${side}`}>
      <div className="details-panel">
      {/* Mobile : stats de la saison du joueur, au-dessus de son palmarès (page du duel, Présentation). */}
      {/* Le bloc est recréé à chaque changement de joueur : ses chiffres sont frappés à l'affichage. */}
      <div className="final-table-season"><StatsTable players={[player]} short={SHORT} onMount /></div>
      <SeasonPalmares player={player} r={r} />
      <m.h3 className="final-table-section" {...r(1)}>Détails par compétition</m.h3>
      <table className={`details-table has-medals-${medals}`}>
        {/* Colonnes de scores toutes de la même largeur. */}
        <colgroup>
          <col className="details-team-col" />
          <col className="details-comp-col" />
          {COLUMNS.map((c) => <col key={c} className="details-score" />)}
          <col className="details-result-col" />
          <col className="details-indiv-col" />
        </colgroup>
        <thead>
          <m.tr {...r(1)}>
            {['Équipe', 'Tournoi', ...COLUMNS, 'Résultat', 'Individuel'].map((c) => (
              <th key={c} scope="col" data-short={SHORT[c]}>{HEADER_TIPS[c] ? <Tip label={HEADER_TIPS[c]}>{c}</Tip> : c}</th>
            ))}
          </m.tr>
        </thead>
        <tbody>
          {lines.map((c, i) => c.pad ? (
            <tr key={`pad-${c.pad}`} className="is-pad" aria-hidden="true"><td colSpan={8} /></tr>
          ) : (
              <m.tr key={`l-${i}`} className={c.trophee ? 'is-won' : undefined} {...r(i + 2)}>
                {/* Compétition : logo seul, son nom au survol. */}
                {/* Équipe avec laquelle la compétition a été jouée : club ou sélection (le logo et le
                    drapeau au-dessus des joueurs s'effacent quand les tableaux apparaissent). */}
                <td className="details-team">
                  {SELECTION.has(c.type) ? <Flag player={player} /> : <ClubLogo player={player} />}
                </td>
                <th scope="row" className="details-comp">
                  <Tip label={c.nom}>
                    <img className="comp" src={asset(c.logo)} alt={c.nom} loading="lazy" width="36" height="36" />
                  </Tip>
                  <span className="details-comp-name">{roll(c.nom)}</span>   {/* grand écran seulement */}
                </th>
                {/* data-label : intitulé de la colonne, affiché au-dessus du chiffre dans les cartes du mobile. */}
                {cells(c, roll).map((v, k) => <td key={k} data-label={COLUMNS[k]}>{v}</td>)}
                {/* Parcours de l'équipe ; titre remporté : le trophée. */}
                <td className="details-result">
                  {c.trophee ? (
                    <Tip label={trophyLabel(c)}>
                      <img className="details-trophy" src={asset(c.trophee)} alt={trophyLabel(c)}
                           height="36" loading="lazy" onLoad={balanceTrophy} />
                    </Tip>
                  ) : (
                    <span className="clamp">{shortResult(c.resultat)}</span>
                  )}
                </td>
                {/* Distinctions individuelles dans cette compétition : une icône chacune (étoile =
                    meilleur joueur, ballon = buteur, cible = passeur ; or, argent, bronze). */}
                <td className="details-indiv">
                  {c.individuel.map((t) => (
                    <Tip key={t.titre} label={t.titre}>
                      <img src={asset(t.icone)} alt={t.titre} width="26" height="26" loading="lazy" />
                    </Tip>
                  ))}
                </td>
              </m.tr>
          ))}
        </tbody>
        {/* Total de la saison : scores de la saison entière, trophées collectifs remportés
            (sous Résultat) et distinctions individuelles de 1er (sous Individuel). */}
        <tfoot>
          <m.tr {...r(lines.length + 2)}>
            <th scope="row" colSpan={2} className="final-total-label">Total</th>
            {(() => {
              const t = totals(player)
              return (
                <>
                  {cells(player.stats, roll).map((v, k) => <td key={k} data-label={COLUMNS[k]}>{v}</td>)}
                  <td className="details-total-titles" data-label="Titres">{roll(String(t[4]))}</td>
                  <td className="details-total-indiv" data-label="Distinctions">{roll(String(t[5]))}</td>
                </>
              )
            })()}
          </m.tr>
        </tfoot>
      </table>
      </div>
    </section>
  )
}

/** Les deux tableaux côte à côte (empilés sur mobile), comme en page 3. */
export default function FinalTables({ pair }) {
  const [a, b] = pair
  const sizes = GROUPS.map((g) => Math.max(inGroup(a, g).length, inGroup(b, g).length))
  const medals = Math.min(3, Math.max(0, ...[a, b].flatMap((p) => p.competitions.map((c) => c.individuel.length))))
  return (
    <div className="details-grid">
      {/* key : un joueur qui change rejoue l'apparition de ses lignes. */}
      <Table player={a} side="left" medals={medals} sizes={sizes} />
      <Table player={b} side="right" medals={medals} sizes={sizes} />
    </div>
  )
}

/** Tableau d'un seul joueur (page Présentation des joueurs, Solo.jsx) : ses compétitions, sans
    ligne vide ni comparaison. */
export function SingleTable({ player }) {
  const sizes = GROUPS.map((g) => inGroup(player, g).length)
  const medals = Math.min(3, Math.max(0, ...player.competitions.map((c) => c.individuel.length)))
  return (
    <div className="details-grid is-single">
      <Table player={player} side="left" medals={medals} sizes={sizes} />
    </div>
  )
}
