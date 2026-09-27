// Passages entre les pages : glissement vertical continu, comme un seul long défilement,
// intro → page 1 → duel → détails des compétitions. La page qui sort part par le haut (en reculant légèrement et en
// s'estompant) pendant que la suivante arrive par le bas, avec la même courbe de mouvement
// pour les deux : un seul geste de caméra. Inversement en remontant. `nav` ({ from, to }) est
// passé en `custom` pour que la page qui sort connaisse la direction.

export const SLIDE = { duration: 0.7, ease: [0.65, 0, 0.35, 1] }
const FADE = { duration: 0.45, ease: [0.215, 0.61, 0.355, 1] }   // intro ↔ Mon classement
const UP = '-100vh'
const DOWN = '100vh'
const away = (y) => ({ y, scale: 0.94, opacity: 0.4, transition: SLIDE })
const here = { y: 0, scale: 1, opacity: 1, transition: SLIDE }

// Intro → page 1 : l'intro part par le haut et la page 1 arrive par le bas, encore vide (fond
// noir qui défile) ; ses éléments apparaissent une fois le glissement fini (Carousel.jsx).
export const introVariants = {
  hidden: (nav) => (nav.from === 'carousel' ? { y: UP, scale: 0.94, opacity: 0.4 } : { y: 0 }),
  shown: here,
  exit: away(UP),
}

export const carouselVariants = {
  // Arrive par le bas depuis l'intro, par le haut en revenant du duel.
  hidden: (nav) => (nav.from === 'intro' ? { y: DOWN, scale: 1, opacity: 1 }
    : nav.from === 'player' || nav.from === 'final' || nav.from === 'solo' ? { y: UP, scale: 0.94, opacity: 0.4 }
      : nav.from === 'game' && nav.relay ? { y: 0, scale: 1, opacity: 0 } : { y: 0 }),
  shown: here,
  // Sort par le bas vers l'intro, par le haut vers le duel (en reculant).
  exit: (nav) => (nav.to === 'intro' ? { y: DOWN, transition: SLIDE }
    : nav.to === 'game' && nav.relay ? { opacity: 0, transition: { duration: 0 } } : away(UP)),   // l'annonce reprend la pièce
}

export const duelVariants = {
  // Arrive par le bas depuis la page 1, par le haut en revenant de la page 3.
  hidden: (nav) => (nav.from === 'details' ? { y: UP, scale: 0.94, opacity: 0.4 }
    : { y: DOWN, scale: 1, opacity: 1 }),
  shown: here,
  // Sort par le bas vers la page 1, par le haut (en reculant) vers la page 3.
  exit: (nav) => (nav.to === 'details' ? away(UP) : { y: DOWN, transition: SLIDE }),
}

export const detailsVariants = {
  // Arrive par le bas depuis la page 2, par le haut en revenant de la page finale.
  hidden: (nav) => (nav.from === 'final' ? { y: UP, scale: 0.94, opacity: 0.4 } : { y: DOWN, scale: 1, opacity: 1 }),
  shown: here,
  // Sort par le bas vers la page 2, par le haut (en reculant) vers la page finale.
  exit: (nav) => (nav.to === 'final' ? away(UP) : { y: DOWN, transition: SLIDE }),
}

// Page du duel (après la sélection) : arrive par le bas, repart par le bas vers la sélection.
export const finalVariants = {
  hidden: { y: DOWN, scale: 1, opacity: 1 },
  shown: here,
  exit: { y: DOWN, transition: SLIDE },
}

// Mode « Mon classement » (Game.jsx) : partie en cours, comme la page du duel (arrive par le bas,
// repart par le bas) ; classement déjà fait (nav.relay), dans la continuité de l'intro : là
// d'emblée, l'annonce du Ballon d'Or reprend la pièce de l'intro ; au retour, fondu vers la scène.
export const gameVariants = {
  hidden: (nav) => (nav.relay ? { y: 0, scale: 1, opacity: 1 } : finalVariants.hidden),
  shown: (nav) => (nav.relay ? { y: 0, scale: 1, opacity: 1 } : finalVariants.shown),
  exit: (nav) => (nav.relay ? { opacity: 0, transition: FADE } : finalVariants.exit),
}
