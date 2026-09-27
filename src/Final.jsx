import { useRef, useState } from 'react'
import { m } from 'framer-motion'
import FinalPlayers from './FinalPlayers'
import FinalTables from './FinalTables'
import { finalVariants } from './transitions'
import { usePlayerPage } from './playerPage'
import { PageUp, TablesDown, TablesUp } from './PageArrows'

// Page du duel (après la sélection des deux joueurs) : identique aux duels de Mon classement
// (27/09/2026). En haut, palmarès · joueur · stats face à face · joueur · palmarès (FinalPlayers,
// grille de la page du duel) ; dessous, les tableaux détaillés des deux joueurs (FinalTables),
// en simple défilement : les joueurs s'effacent en descendant (usePlayerPage). ← / → (ou les
// flèches ‹ › des joueurs) : joueur suivant de ce côté, tant que les joueurs sont affichés.

export default function Final({ pair, nav, reduced, onBack, onStep }) {
  const page = useRef(null)
  const tables = useRef(null)
  const { atTables, atTablesRef, toTables, toTop, back } = usePlayerPage({
    pageRef: page, tablesRef: tables, reduced, onBack,
    onArrow: (d) => onStep(d > 0 ? 1 : 0, 1),
  })
  // Tour complet des joueurs à la fin réelle du glissement d'arrivée.
  const [entered, setEntered] = useState(false)
  return (
    <m.main ref={page} className="final" custom={nav} variants={finalVariants}
            initial="hidden" animate="shown" exit="exit"
            onAnimationComplete={(def) => { if (def === 'shown') setEntered(true) }}>
      <h1 className="sr-only">Le duel en détail</h1>
      <div className="final-band">
        <div className="sticky duel-grid final-players">
          <FinalPlayers pair={pair} onStep={(side, d) => { if (!atTablesRef.current) onStep(side, d) }} play={entered} />
        </div>
        <TablesDown onClick={toTables} />
      </div>
      <div ref={tables} className="details final-tables">
        <FinalTables pair={pair} />
      </div>
      {atTables ? <TablesUp onClick={toTop} /> : <PageUp label="Changer de duel" onClick={back} />}
    </m.main>
  )
}
