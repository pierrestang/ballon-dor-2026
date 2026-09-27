import { useEffect, useRef, useState } from 'react'
import { m, useIsPresent } from 'framer-motion'
import { asset, decimal } from './data'
import { Coin, useHoverSpin } from './Coin'
import { ARC_FONT, BOTTOM_ARC, NameArc } from './IntroCoin'
import Tip from './Tip'
import { ClubLogo, Flag } from './Nameplate'
import { SLIDE, detailsVariants } from './transitions'

// « Ratio » : buts + assists par match, détaillé au survol de l'intitulé.
const COLUMNS = ['Matches', 'Buts', 'Assists', 'Ratio']
const HEADER_TIPS = { Ratio: 'Buts + Assists / match' }
const dash = (n, format = (x) => x) => (n === null ? '–' : format(n))   // passes non renseignées
const cells = (s) => [s.matchs, s.buts, dash(s.passes), dash(s.contributionsParMatch, decimal)]
// Valeurs comparées entre les deux joueurs, colonne par colonne (pas les matches) ; ratio
// comparé sur la valeur arrondie affichée.
const round2 = (n) => (n === null ? null : Math.round(n * 100) / 100)
const scores = (s) => [null, s.buts, s.passes, round2(s.contributionsParMatch)]
/** Classe de chaque cellule de score : « is-better » (en or) quand le joueur bat son adversaire sur la
    même ligne (aucun en cas d'égalité, de valeur inconnue ou de ligne vide en face). */
const better = (own, rival) => scores(own).map((v, k) => {
  const r = rival && scores(rival)[k]
  return v !== null && r !== null && r !== undefined && v > r ? 'is-better' : undefined
})

// Ordre des types de compétition (TYPES dans scripts/excel_vers_json.py). Les deux tableaux
// ont les mêmes lignes : pour chaque type, autant de lignes que le joueur qui en a le plus
// (coupe nationale + coupe secondaire : 2), pour que les compétitions similaires se font face.
// Nationales, puis continentales, puis mondiales.
const TYPES = ['championnat', 'coupe-nationale',
  'coupe-continentale', 'supercoupe-uefa',
  'intercontinentale', 'coupe-du-monde', 'qualifications']

// Intitulé du trophée, en infobulle : « Champion Liga », « Vainqueur de la Ligue des
// champions », « Vainqueur du Trophée des champions », « Vainqueur de l'EFL Cup »…
const trophyLabel = (c) => {
  if (c.type === 'championnat') return `Champion ${c.nom}`
  if (/^[AEIOUÉ]/i.test(c.nom)) return `Vainqueur de l'${c.nom}`
  if (c.nom.startsWith('Trophée')) return `Vainqueur du ${c.nom}`
  return `Vainqueur de la ${c.nom}`
}

/** Totaux des colonnes Résultat et Individuel : trophées collectifs remportés et distinctions
    individuelles de 1er (les 2e et 3e places ne comptent pas). */
const trophies = (p) => [
  p.competitions.filter((c) => c.trophee).length,
  p.competitions.flatMap((c) => c.individuel).filter((t) => t.rang === 1).length,
]

// Compétitions jouées avec la sélection (drapeau dans la colonne Équipe) ; les autres avec le
// club (logo). Comme SELECTION dans scripts/excel_vers_json.py.
const SELECTION = new Set(['coupe-du-monde', 'qualifications'])

// Apparition des lignes, de haut en bas, une fois la page arrivée.
const row = (i) => ({
  initial: { opacity: 0, y: -12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: SLIDE.duration + i * 0.05, duration: 0.4, ease: 'easeOut' },
})

/** Tableau d'un joueur : les lignes communes `slots` ([type, n]) remplies par ses
    compétitions (ligne vide s'il en a moins), puis le total de la saison. Les deux
    tableaux se lisent dans le même sens (pas de miroir). */
function Table({ player, rival, side, slots, onNext, hover, onHover }) {
  const [spin, startSpin] = useHoverSpin()
  const byType = (p, type) => p.competitions.filter((c) => c.type === type)
  return (
    <section className={`details-side is-${side}`}>
      <div className="details-panel">
      {/* Au-dessus du tableau, centrée : la pièce d'or du joueur (animée comme en page 1), son nom en arc dessous (tracé,
          police et frappe lettre par lettre de l'intro, rejouée à chaque changement de joueur). */}
      <m.header className="details-head" {...row(0)}>
        <h2 className="sr-only">{player.nom}</h2>
        <div className="details-coin" aria-hidden="true" onPointerEnter={startSpin}>
          {/* Pièce 3D de la page 1 : flottement doux, tour complet au survol. */}
          <div className="details-coin-float">
            <m.span className="details-coin-spin" style={{ rotateY: spin }}>
              <Coin player={player} />
            </m.span>
          </div>
          <svg className="details-coin-arc" viewBox="-180 -180 360 360">
            <path id={`details-arc-${side}`} d={BOTTOM_ARC} />
            <NameArc text={player.nom} href={`#details-arc-${side}`} fontSize={ARC_FONT} animate
                     className="details-coin-name" />
          </svg>
        </div>
        {/* Joueur suivant de ce côté (celui d'en face est sauté), comme en pages 1 et 2 : ‹ à
            gauche de la pièce de gauche, › à droite de la pièce de droite, à mi-hauteur. */}
        <button className="details-arrow" onClick={onNext} aria-label="Joueur suivant">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {side === 'right' ? <path d="M9 5l7 7-7 7" /> : <path d="M15 5l-7 7 7 7" />}
          </svg>
        </button>
      </m.header>
      <table className="details-table">
        {/* Colonnes de scores toutes de la même largeur. */}
        <colgroup>
          <col className="details-team-col" />
          <col className="details-comp-col" />
          <col className="details-result-col" />
          <col className="details-indiv-col" />
          {COLUMNS.map((c) => <col key={c} className="details-score" />)}
        </colgroup>
        <thead>
          <m.tr {...row(1)}>
            {['Équipe', 'Compétition', 'Résultat', 'Individuel', ...COLUMNS].map((c) => (
              <th key={c} scope="col">{HEADER_TIPS[c] ? <Tip label={HEADER_TIPS[c]}>{c}</Tip> : c}</th>
            ))}
          </m.tr>
        </thead>
        {/* Survol d'une ligne : elle est surlignée, ainsi que celle d'en face (même ligne). */}
        <tbody onMouseLeave={() => onHover(null)}>
          {slots.map(([type, n], i) => {
            const hl = { onMouseEnter: () => onHover(i), className: hover === i ? 'is-hover' : undefined }
            const c = byType(player, type)[n]
            const win = c && better(c, byType(rival, type)[n])
            return c ? (
              <m.tr key={c.nom} {...row(i + 2)} {...hl}>
                {/* Équipe avec laquelle la compétition a été jouée : club ou sélection. */}
                <td className="details-team">
                  {SELECTION.has(c.type) ? <Flag player={player} /> : <ClubLogo player={player} />}
                </td>
                {/* Compétition : logo seul, son nom au survol. */}
                <th scope="row" className="details-comp">
                  <Tip label={c.nom}>
                    <img className="comp" src={asset(c.logo)} alt={c.nom} loading="lazy" width="36" height="36" />
                  </Tip>
                </th>
                {/* Parcours de l'équipe ; titre remporté : le trophée. */}
                <td className="details-result">
                  {c.trophee ? (
                    <Tip label={trophyLabel(c)}>
                      <img className="details-trophy" src={asset(c.trophee)} alt={trophyLabel(c)}
                           height="36" loading="lazy" />
                    </Tip>
                  ) : (
                    <span className="clamp">{c.resultat}</span>
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
                {cells(c).map((v, k) => <td key={k} className={win[k]}>{v}</td>)}
              </m.tr>
            ) : (
              // Type joué seulement par l'adversaire : ligne vide, pour garder l'alignement.
              <tr key={`${type}-${n}`} aria-hidden="true" {...hl}
                  className={`is-blank${hover === i ? ' is-hover' : ''}`}><td colSpan={8} /></tr>
            )
          })}
        </tbody>
        <tfoot>
          <m.tr {...row(slots.length + 2)}>
            <th scope="row" colSpan={2}>Total</th>
            {/* Nombre de trophées collectifs, puis individuels ; le plus grand des deux joueurs en or. */}
            {trophies(player).map((n, k) => (
              <td key={`t${k}`} className={n > trophies(rival)[k] ? 'is-better' : undefined}>{n}</td>
            ))}
            {cells(player.stats).map((v, k) => (
              <td key={k} className={better(player.stats, rival.stats)[k]}>{v}</td>
            ))}
          </m.tr>
        </tfoot>
      </table>
      </div>
    </section>
  )
}

/** Page 3 — détails des compétitions : le tableau de chaque joueur du duel, côte à côte. */
export default function Details({ pair, nav, onBack, onStep }) {
  // Page qui sort (AnimatePresence la garde le temps du glissement) : on retire aussitôt ses
  // écouteurs de clavier, molette et tactile, pour que la page suivante soit seule à réagir.
  const isPresent = useIsPresent()
  const page = useRef(null)

  useEffect(() => {
    if (!isPresent) return   // page en train de sortir (glissement) : ses gestes ne comptent plus
    // ↑ ou Échap : retour au duel ; ← / → : changer le joueur de gauche / de droite.
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'ArrowUp') { e.preventDefault(); onBack() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); onStep(0, 1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); onStep(1, 1) }
    }
    // Remonter depuis le haut de la page (molette ou doigt) ramène au duel. Seul un geste
    // commencé en haut compte, et pas l'élan de celui qui a ouvert la page.
    const openedAt = performance.now()
    const atTop = () => (page.current?.scrollTop ?? 0) <= 0
    let lastWheel = 0
    let fromTop = false
    const onWheel = (e) => {
      const now = performance.now()
      if (now - lastWheel > 200) fromTop = atTop()
      lastWheel = now
      if (fromTop && e.deltaY < -20 && now - openedAt > 800) { fromTop = false; onBack() }
    }
    let touchY = null
    const onTouchStart = (e) => { touchY = atTop() ? e.touches[0].clientY : null }
    const onTouchEnd = (e) => {
      if (touchY !== null && e.changedTouches[0].clientY - touchY > 80) onBack()
      touchY = null
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [onBack, onStep, isPresent])

  const [a, b] = pair
  const count = (p, t) => p.competitions.filter((c) => c.type === t).length
  const [hover, setHover] = useState(null)   // ligne survolée, commune aux deux tableaux
  const slots = TYPES.flatMap((t) =>
    Array.from({ length: Math.max(count(a, t), count(b, t)) }, (_, n) => [t, n]))
  return (
    <m.main ref={page} className="details" custom={nav} variants={detailsVariants}
            initial="hidden" animate="shown" exit="exit">
      <h1 className="sr-only">Détails des compétitions</h1>
      <div className="details-grid">
        {/* key : un joueur qui change rejoue l'apparition de ses lignes. */}
        <Table key={a.id} player={a} rival={b} side="left" slots={slots} onNext={() => onStep(0, 1)}
               hover={hover} onHover={setHover} />
        <Table key={b.id} player={b} rival={a} side="right" slots={slots} onNext={() => onStep(1, 1)}
               hover={hover} onHover={setHover} />
      </div>
    </m.main>
  )
}
