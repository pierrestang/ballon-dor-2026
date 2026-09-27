import { useRef, useState } from 'react'
import { animate, m, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
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
    pour toutes les pièces : arc, pièces déjà placées comprises, et emplacements du duel. Repassée
    pendant un tour, la pièce repart pour un tour complet de plus (toujours un nombre entier de
    tours : elle finit de face) ; pas de rotation en mouvement réduit. */
export function useHoverSpin() {
  const reduced = useReducedMotion()
  const spin = useMotionValue(0)
  const target = useRef(0)
  const start = (e) => {
    if (e.pointerType !== 'mouse' || reduced) return
    target.current += 360
    animate(spin, target.current, HOVER_SPIN)
  }
  return [spin, start]
}

/** Retard (négatif, en s) qui cale le flottement coin-float (5 s) sur l'horloge commune de la
    page : deux pièces créées à des moments différents flottent alors exactement ensemble (relais
    entre la pièce de la scène et celle du centre des candidats). */
export const syncFloat = () => -((performance.now() / 1000) % 5)

/** Pièce « vivante », l'animation commune à toutes les pièces d'or du site (27/09/2026) :
    léger flottement (coin-float, 5 s ; `phase` : décalage en secondes, pour que des pièces
    voisines ne flottent pas ensemble ; 'sync' : calé sur l'horloge commune, syncFloat) et tour
    complet au passage de la souris (useHoverSpin).
    `rotateY` (facultatif) : rotation supplémentaire (valeur de mouvement), ajoutée au tour. */
export function LiveCoin({ player, phase = 0, rotateY }) {
  const [spin, startSpin] = useHoverSpin()
  const [delay] = useState(() => (phase === 'sync' ? syncFloat() : -phase))
  const turn = useTransform(() => spin.get() + (typeof rotateY === 'object' ? rotateY.get() : rotateY ?? 0))
  return (
    <span className="coin-live" onPointerEnter={startSpin}>
      <span className="coin-live-float" style={{ animationDelay: `${delay}s` }}>
        <Coin player={player} rotateY={turn} />
      </span>
    </span>
  )
}
