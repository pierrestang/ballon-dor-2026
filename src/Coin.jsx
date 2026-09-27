import { useRef } from 'react'
import { animate, m, useMotionValue, useReducedMotion } from 'framer-motion'
import { coinUrl } from './data'

// Pièce d'or en 3D des pages 1 et 3 (Carousel.jsx, Details.jsx).

// Tranche : 6 % du diamètre, disques empilés (stries fines, visible même de profil).
const THICK = 0.06
const LAYERS = 12
const HOVER_SPIN = { duration: 1.8, ease: [0.3, 0.7, 0.2, 1] }   // tour complet au survol

/** Pièce d'or en 3D : portrait sur les deux faces (le joueur regarde vers la droite quelle que
    soit la face montrée), tranche = LAYERS disques dorés, un sur deux plus sombre (stries). */
export function Coin({ player, rotateY = 0 }) {
  const half = 50 * THICK   // demi-épaisseur, en % du diamètre
  return (
    <m.span className="coin" style={{ rotateY, '--coin': `url(${coinUrl(player.id)})` }}>
      <img className="coin-face" src={coinUrl(player.id)} alt="" draggable="false" decoding="sync"
           style={{ transform: `translateZ(calc(var(--d) * ${half / 100})) scaleX(-1)` }} />
      {Array.from({ length: LAYERS - 1 }, (_, k) => (
        <span key={k} className={`coin-layer${k % 2 ? ' is-dark' : ''}`}
              style={{ transform: `translateZ(calc(var(--d) * ${(half - ((k + 1) * 2 * half) / LAYERS) / 100}))` }} />
      ))}
      <img className="coin-face" src={coinUrl(player.id)} alt="" draggable="false" decoding="sync"
           style={{ transform: `rotateY(180deg) translateZ(calc(var(--d) * ${half / 100})) scaleX(-1)` }} />
    </m.span>
  )
}

/** Tour complet sur elle-même au passage de la souris (HOVER_SPIN, comme l'ancienne page 1),
    pour toutes les pièces : arc, pièces déjà placées comprises, et emplacements du duel. Un tour
    en cours n'est pas relancé ; pas de rotation en mouvement réduit. */
export function useHoverSpin() {
  const reduced = useReducedMotion()
  const spin = useMotionValue(0)
  const spinning = useRef(false)
  const start = (e) => {
    if (e.pointerType !== 'mouse' || reduced || spinning.current) return
    spinning.current = true
    animate(spin, spin.get() + 360, HOVER_SPIN).then(() => { spinning.current = false })
  }
  return [spin, start]
}

