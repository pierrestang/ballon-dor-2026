import { useEffect, useRef, useState } from 'react'
import { m } from 'framer-motion'
import players from './data'
import { open } from './sequence'
import FinalPlayers, { RollDuration, SWAP_S } from './FinalPlayers'
import FinalTables from './FinalTables'
import { finalVariants } from './transitions'
import { usePlayerPage, usePlexus } from './playerPage'
import { PageUp, TablesDown, TablesUp } from './PageArrows'

// Page du duel (après la sélection des deux joueurs) : identique aux duels de Mon classement
// (27/09/2026). En haut, palmarès · joueur · stats face à face · joueur · palmarès (FinalPlayers,
// grille de la page du duel) ; dessous, les tableaux détaillés des deux joueurs (FinalTables),
// en simple défilement : les joueurs s'effacent en descendant (usePlayerPage). ← / → (ou les
// flèches ‹ › des joueurs, ou le doigt qui glisse sur l'un d'eux) : joueur suivant de ce côté,
// tant que les joueurs sont affichés.

export default function Final({ pair, nav, reduced, onBack, onStep }) {
  const page = useRef(null)
  // Textes et tableaux : les joueurs `shown`, remplacés par `pair` quand la rotation de la vidéo
  // commence (SwapTurn, onStart) ; leur défilement dure la rotation (RollDuration) : départ et
  // fin communs.
  const [shown, setShown] = useState(pair)
  const pairRef = useRef(pair)
  pairRef.current = pair
  // Séquences des voisins de chaque joueur (précédent, suivant, l'autre joueur sauté comme dans
  // App.jsx) chargées à l'avance : au changement, la rotation part tout de suite.
  useEffect(() => {
    const n = players.length, idx = pair.map((p) => players.findIndex((q) => q.id === p.id))
    idx.forEach((k, side) => [1, -1].forEach((d) => {
      let x = (k + d + n) % n
      if (x === idx[1 - side]) x = (x + d + n) % n
      open(players[x].id)
    }))
  }, [pair[0].id, pair[1].id])
  const tables = useRef(null)
  usePlexus(page)
  const { atTables, atTablesRef, toTables, toTop, back } = usePlayerPage({
    pageRef: page, tablesRef: tables, reduced, onBack,
    onArrow: (d) => onStep(d > 0 ? 1 : 0, 1),
    // Doigt : glisser sur un joueur le change (moitié de l'écran où le doigt s'est posé).
    onSwipe: (d, x) => onStep(x < window.innerWidth / 2 ? 0 : 1, d),
  })
  return (
    <m.main ref={page} className="final" custom={nav} variants={finalVariants}
            initial="hidden" animate="shown" exit="exit">
      <RollDuration.Provider value={SWAP_S}>
      <h1 className="sr-only">Le duel en détail</h1>
      <div className="final-band">
        <div className="sticky duel-grid final-players">
          <FinalPlayers pair={pair} shown={shown} onStart={() => setShown(pairRef.current)}
                        onStep={(side, d) => { if (!atTablesRef.current) onStep(side, d) }} />
        </div>
        <TablesDown onClick={toTables} />
      </div>
      <div ref={tables} className="details final-tables">
        <FinalTables pair={shown} />
      </div>
      {atTables ? <TablesUp onClick={toTop} /> : <PageUp label="Changer de joueurs" onClick={back} />}
      </RollDuration.Provider>
    </m.main>
  )
}
