// Passages entre les pages : glissement vertical continu, comme un seul long défilement
// intro → page 1 → duel. La page qui sort part par le haut pendant que la suivante arrive
// par le bas (et inversement en remontant). `nav` ({ from, to }) est passé en `custom`
// pour que la page qui sort connaisse la direction.

const SLIDE = { duration: 0.8, ease: [0.76, 0, 0.24, 1] }
const UP = '-100vh'
const DOWN = '100vh'

export const introVariants = {
  hidden: (nav) => ({ y: nav.from === 'carousel' ? UP : 0 }),
  shown: { y: 0, transition: SLIDE },
  exit: { y: UP, transition: SLIDE },
}

export const carouselVariants = {
  // Arrive par le bas depuis l'intro, par le haut en revenant du duel.
  hidden: (nav) => ({ y: nav.from === 'intro' ? DOWN : nav.from === 'player' ? UP : 0 }),
  shown: { y: 0, transition: SLIDE },
  // Sort par le bas vers l'intro, par le haut vers le duel.
  exit: (nav) => ({ y: nav.to === 'intro' ? DOWN : UP, transition: SLIDE }),
}

export const duelVariants = {
  hidden: { y: DOWN },
  shown: { y: 0, transition: SLIDE },
  exit: { y: DOWN, transition: SLIDE },
}
