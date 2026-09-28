// Flèches des pages de joueurs (page du duel, Présentation, duels de Mon classement) : en bas de
// la vue des joueurs, « Détails des compétitions » ; tableaux affichés, la même flèche retournée
// vers le haut, fixée en haut de l'écran, sans libellé, remonte aux joueurs.

export function TablesDown({ onClick }) {
  return (
    <button className="intro-down tables-down" onClick={onClick}>
      <span className="intro-down-label">Détails des compétitions</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7" /></svg>
    </button>
  )
}

export function TablesUp({ onClick, label = 'Voir les joueurs' }) {
  return (
    <button className="intro-down tables-up" aria-label={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7" /></svg>
    </button>
  )
}

/** Retour à la page précédente, en haut au centre de la vue des joueurs (libellé : sa page). */
export function PageUp({ label, onClick }) {
  return (
    <button className="intro-down final-up page-up" onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7" /></svg>
      <span className="intro-down-label">{label}</span>
    </button>
  )
}
