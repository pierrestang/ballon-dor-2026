import { asset, clubLogo } from './data'

export function Flag({ player }) {
  return (
    <img src={asset(player.drapeau)} alt={player.selection} title={player.selection}
         className="flag" width="48" height="32" />
  )
}

export function ClubLogo({ player }) {
  const logo = clubLogo(player.club)
  return logo && (
    <img src={logo} alt={player.club} title={player.club} className="club" width="52" height="52" />
  )
}

/** Nom du joueur encadré par le drapeau de sa sélection (à gauche) et le logo de son club (à droite). */
export default function Nameplate({ player, as: Title = 'h2', hero = false }) {
  return (
    <div className={`nameplate${hero ? ' is-hero' : ''}`}>
      <Flag player={player} />
      <Title>{player.nom}</Title>
      <ClubLogo player={player} />
    </div>
  )
}
