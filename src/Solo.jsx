import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { m } from 'framer-motion'
import players, { decimal, kitStyle } from './data'
import { open } from './sequence'
import Tip from './Tip'
import { ArcName, Counter, PlayerTag, RollDuration, SidePanel, StatsTable, SWAP_S, SwapTurn } from './FinalPlayers'
import { SingleTable } from './FinalTables'
import { finalVariants } from './transitions'
import { useNarrow, usePlayerPage, usePlexus } from './playerPage'
import { PageUp, TablesDown, TablesUp } from './PageArrows'

// Page « Présentation des joueurs » : la page du duel (Final.jsx) avec un seul joueur, en grand,
// même comportement (usePlayerPage) : à l'arrivée et à chaque changement de joueur, un tour
// complet (Turn) ; dessous, son tableau des compétitions, en simple défilement. ← / →, flèches
// ‹ › ou doigt horizontal : joueur précédent / suivant ; ↓ : tableau ; ↑ / Échap : retour au
// choix du joueur (SoloPick.jsx). Classes de la page du duel (.final…), différences sous .solo.

const STATS_CENTER = 0.53   // milieu de la colonne des stats, en part de la hauteur de l'écran
const round2 = (n) => Math.round(n * 100) / 100
// Stats de la saison, sans les titres (déjà dans le palmarès), comme la page du duel.
const ROWS = [
  { label: 'Matches', value: (p) => p.stats.matchs },
  { label: 'Buts', value: (p) => p.stats.buts },
  { label: 'Passes', value: (p) => p.stats.passes },
  { label: 'B+A/Match', tip: 'Buts + passes / match', value: (p) => p.stats.contributionsParMatch,
    format: (v) => decimal(round2(v)) },
]

/** Stats de la saison, à droite du joueur : pour chaque stat, l'intitulé (petites capitales
    grises de la page du duel) et le score dessous, centrés. */
function SoloStats({ player }) {
  return (
    <div className="compare solo-stats">
      {ROWS.map((r) => (
        <div key={r.label} className="compare-row">
          <span>{r.tip ? <Tip label={r.tip}>{r.label}</Tip> : r.label}</span>
          <strong><Counter value={r.value(player)} format={r.format ?? String} trigger={player.id} /></strong>
        </div>
      ))}
      <StatsTable players={[player]} />
    </div>
  )
}

export default function Solo({ player, nav, reduced, onBack, onStep }) {
  const narrow = useNarrow()
  const page = useRef(null)
  const band = useRef(null)
  const tables = useRef(null)
  usePlexus(page)
  const { atTables, atTablesRef, toTables, toTop, back } = usePlayerPage({
    pageRef: page, tablesRef: tables, reduced, onBack, onArrow: onStep, onSwipe: onStep,
  })

  // Colonne des stats (grand écran) : son milieu toujours à STATS_CENTER de la hauteur de
  // l'écran, quel que soit le joueur.
  useLayoutEffect(() => {
    const grid = band.current
    const align = () => {
      const stats = grid?.querySelector('.solo-stats')
      if (!stats) return
      stats.style.marginTop = '0px'
      if (narrow || !stats.offsetHeight) return
      const top = stats.getBoundingClientRect().top - (grid.getBoundingClientRect().top - grid.offsetTop)
      stats.style.marginTop = `${window.innerHeight * STATS_CENTER - stats.offsetHeight / 2 - top}px`
    }
    align()
    document.fonts?.ready.then(align)
    window.addEventListener('resize', align)
    return () => window.removeEventListener('resize', align)
  }, [narrow, player.id])

  const step = (d) => { if (!atTablesRef.current) onStep(d) }
  // Textes et tableau : le joueur `shown`, remplacé par `player` quand la rotation de la vidéo
  // commence (SwapTurn, onStart) ; leur défilement dure la rotation (RollDuration) : départ et fin
  // communs.
  const [shown, setShown] = useState(player)
  const playerRef = useRef(player)
  playerRef.current = player
  // Séquences du joueur précédent et du suivant chargées à l'avance : au changement, la rotation
  // part tout de suite (sinon elle attend la séquence du nouveau joueur).
  useEffect(() => {
    const n = players.length, k = players.findIndex((p) => p.id === player.id)
    open(players[(k + 1) % n].id); open(players[(k - 1 + n) % n].id)
  }, [player.id])
  return (
    <m.main ref={page} className="final solo" custom={nav} variants={finalVariants}
            initial="hidden" animate="shown" exit="exit">
      <RollDuration.Provider value={SWAP_S}>
      <h1 className="sr-only">Les candidats : {player.nom}</h1>
      <div className="final-band">
        <div ref={band} className="sticky duel-grid final-players solo-grid">
          <SidePanel player={shown} side="left" />
          <div className="figure is-left" style={kitStyle(shown.id)}>
            <ArcName id={shown.id} name={shown.nom} />
            <PlayerTag player={shown} />
            <SwapTurn id={player.id} name={player.nom} onStart={() => setShown(playerRef.current)} />
            <div className="figure-picker">
              <button className="arrow is-outer-left" onClick={() => step(-1)} aria-label="Joueur précédent">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
              </button>
              <button className="arrow is-outer-right" onClick={() => step(1)} aria-label="Joueur suivant">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
          <SoloStats player={shown} />
        </div>
        <TablesDown onClick={toTables} />
      </div>
      <div ref={tables} className="details final-tables">
        <SingleTable player={shown} />
      </div>
      {atTables ? <TablesUp onClick={toTop} label="Voir le joueur" /> : <PageUp label="Les candidats" onClick={back} />}
      </RollDuration.Provider>
    </m.main>
  )
}
