import { m } from 'framer-motion'
import { decimal, posteLabel } from './data'
import { Coin, useHoverSpin } from './Coin'
import { ArcText } from './Letters'
import { ClubLogo, Flag } from './Nameplate'

// Carte d'un joueur dans un duel du mode « Mon classement » : pièce d'or (tour complet au
// survol), nom en arc dessous, drapeau, club et poste, puis les stats de la saison (mêmes lignes
// que le milieu de la page du duel, Compare dans FinalPlayers.jsx) ; la meilleure valeur des deux
// en or (sauf les matches). La carte entière est le bouton de vote.

const round2 = (n) => Math.round(n * 100) / 100
const ROWS = [
  { label: 'Titres collectifs', get: (p) => p.collectif.length },
  { label: 'Titres individuels', get: (p) => p.individuel.filter((t) => t.rang === 1).length },
  { label: 'Matches', get: (p) => p.stats.matchs, neutral: true },
  { label: 'Buts', get: (p) => p.stats.buts },
  { label: 'Assists', get: (p) => p.stats.passes },
  { label: 'Ratio', get: (p) => round2(p.stats.contributionsParMatch), format: decimal, tip: 'Buts + Assists / match' },
]

export default function BattleCard({ player, other, side, state, onVote, coin }) {
  const [spin, startSpin] = useHoverSpin()
  // state : null (à voter), 'won' (choisie), 'lost' (écartée).
  return (
    <m.button className={`game-card is-${side}${state ? ` is-${state}` : ''}`} onClick={onVote}
              onPointerEnter={startSpin} disabled={!!state}
              aria-label={`Voter pour ${player.nom}`}
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: state === 'lost' ? 0.3 : 1, y: 0, scale: state === 'won' ? 1.03 : 1 }}
              exit={{ opacity: 0, y: -16, transition: { duration: 0.25 } }}
              transition={{ duration: 0.4, ease: [0.215, 0.61, 0.355, 1] }}>
      <span className="game-card-coin" style={{ '--d': `${coin}px` }}>
        <span className="game-card-spin">
          <Coin player={player} rotateY={spin} />
        </span>
        <ArcText text={player.nom} side="bottom" className="game-card-name" />
      </span>
      <span className="game-card-id">
        <Flag player={player} />
        <span className="game-card-poste" title={posteLabel(player.poste)}>{player.poste}</span>
        <ClubLogo player={player} />
      </span>
      <span className="game-card-stats">
        {ROWS.map((r) => {
          const v = r.get(player), o = r.get(other)
          return (
            <span key={r.label} className={`game-stat${!r.neutral && v > o ? ' is-better' : ''}`}>
              <span className="game-stat-label" title={r.tip}>{r.label}</span>
              <span className="game-stat-value">{r.format ? r.format(v) : v}</span>
            </span>
          )
        })}
      </span>
    </m.button>
  )
}
