import { useEffect, useRef, useState } from 'react'
import { animate, m, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import players, { coinUrl } from './data'
import { clink, setCoinNotes } from './sound'

setCoinNotes(players.map((p) => p.id))   // une note par joueur (sound.js)

// Pièce d'or en 3D des pages 1 et 3 (Carousel.jsx, Details.jsx).

// Tranche : 6 % du diamètre, disques empilés (stries fines, visible même de profil).
const THICK = 0.06
const LAYERS = 12
const HOVER_SPIN = { duration: 1.8, ease: [0.3, 0.7, 0.2, 1] }   // tour complet au survol
const TILT = { stiffness: 180, damping: 18 }   // inclinaison au survol (LiveCoin)

/** Pièce d'or en 3D : portrait sur les deux faces (le joueur regarde vers la droite quelle que
    soit la face montrée), tranche = LAYERS disques dorés, un sur deux plus sombre (stries). */
export function Coin({ player, rotateY = 0 }) {
  const half = 50 * THICK   // demi-épaisseur, en % du diamètre
  // Reflet (27/09/2026) : bande de lumière douce en diagonale ; au repos au milieu de la face,
  // elle glisse d'un bord à l'autre quand la pièce tourne (t : angle de la face visible, -1 → 1).
  const still = useMotionValue(0)
  const rot = typeof rotateY === 'object' ? rotateY : still
  const sheen = useTransform(rot, (v) => {
    const t = ((((v + 90) % 180) + 180) % 180 - 90) / 90
    return `${50 - t * 75}% 0`
  })
  const face = (flip) => `${flip ? 'rotateY(180deg) ' : ''}translateZ(calc(var(--d) * ${half / 100} + 0.5px)) scaleX(-1)`
  return (
    // Adresse absolue : une url() relative dans une variable CSS se résout depuis la feuille de
    // style qui l'utilise (dist/assets/), pas depuis la page (base Vite « ./ »).
    <m.span className="coin" style={{ rotateY, '--coin': `url(${new URL(coinUrl(player.id), document.baseURI).href})` }}>
      <img className="coin-face" src={coinUrl(player.id)} alt="" draggable="false" decoding="sync"
           style={{ transform: `translateZ(calc(var(--d) * ${half / 100})) scaleX(-1)` }} />
      {Array.from({ length: LAYERS - 1 }, (_, k) => (
        <span key={k} className={`coin-layer${k % 2 ? ' is-dark' : ''}`}
              style={{ transform: `translateZ(calc(var(--d) * ${(half - ((k + 1) * 2 * half) / LAYERS) / 100}))` }} />
      ))}
      <img className="coin-face" src={coinUrl(player.id)} alt="" draggable="false" decoding="sync"
           style={{ transform: `rotateY(180deg) translateZ(calc(var(--d) * ${half / 100})) scaleX(-1)` }} />
      <m.span className="coin-sheen" aria-hidden="true" style={{ transform: face(false), backgroundPosition: sheen }} />
      <m.span className="coin-sheen" aria-hidden="true" style={{ transform: face(true), backgroundPosition: sheen }} />
    </m.span>
  )
}

/** Tour complet sur elle-même au passage de la souris (HOVER_SPIN, comme l'ancienne page 1),
    pour toutes les pièces : arc, pièces déjà placées comprises, et emplacements du duel. Repassée
    pendant un tour, la pièce repart pour un tour complet de plus (toujours un nombre entier de
    tours : elle finit de face) ; pas de rotation en mouvement réduit. */
export function useHoverSpin(id) {   // id : joueur de la pièce (sa note au survol)
  const reduced = useReducedMotion()
  const spin = useMotionValue(0)
  const target = useRef(0)
  const start = (e) => {
    if (e.pointerType !== 'mouse') return
    clink(typeof id === 'function' ? id() : id)
    if (reduced) return
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
  const [spin, startSpin] = useHoverSpin(player.id)
  const [delay] = useState(() => (phase === 'sync' ? syncFloat() : -phase))
  const turn = useTransform(() => spin.get() + (typeof rotateY === 'object' ? rotateY.get() : rotateY ?? 0))
  // Inclinaison au survol (souris) : la pièce suit le pointeur, jusqu'à 12°, comme tenue en main.
  const reduced = useReducedMotion()
  const tiltX = useSpring(0, TILT), tiltY = useSpring(0, TILT)
  const onMove = (e) => {
    if (e.pointerType !== 'mouse' || reduced) return
    const r = e.currentTarget.getBoundingClientRect()
    tiltY.set(((e.clientX - r.left) / r.width - 0.5) * 24)
    tiltX.set(-((e.clientY - r.top) / r.height - 0.5) * 24)
  }
  const onLeave = () => { tiltX.set(0); tiltY.set(0) }
  return (
    <m.span className="coin-live" onPointerEnter={startSpin} onPointerMove={onMove} onPointerLeave={onLeave}
            style={{ rotateX: tiltX, rotateY: tiltY }}>
      <span className="coin-live-float" style={{ animationDelay: `${delay}s` }}>
        <Coin player={player} rotateY={turn} />
      </span>
    </m.span>
  )
}

export const COIN_TURN = { duration: 1.1, ease: [0.3, 0.7, 0.2, 1] }   // changement de joueur (intro, sélection, candidats, annonce)

/** Changement de ce que montre une pièce : quand `value` change, elle fait un tour complet
    (sens `dir`) et la nouvelle valeur apparaît au passage de profil (90° + n × 180°) ; toujours
    un nombre entier de tours (elle finit de face, même interrompue). `instant` ou mouvement
    réduit : changement direct, sans rotation. Renvoie [valeur affichée, rotation]. */
export function useCoinTurn(value, { dir = 1, instant = false, reduced = false } = {}) {
  const [shown, setShown] = useState(value)
  const rot = useMotionValue(0)
  const target = useRef(value)
  const turning = useRef(null)
  useEffect(() => {
    if (value === target.current) return
    target.current = value
    turning.current?.stop()
    if (reduced || instant) { rot.set(Math.round(rot.get() / 360) * 360); setShown(value); return }
    const from = rot.get()
    const to = Math.round(from / 360) * 360 + dir * 360
    const edge = (v) => Math.floor((v + 90) / 180)
    const e0 = edge(from)
    let swapped = false
    turning.current = animate(rot, to, {
      ...COIN_TURN,
      onUpdate: (v) => { if (!swapped && edge(v) !== e0) { swapped = true; setShown(target.current) } },
    })
    turning.current.then(() => { if (!swapped) setShown(target.current) })
  }, [value])
  return [shown, rot]
}
