import { useEffect, useLayoutEffect, useRef } from 'react'
import { animate, m, useMotionValue, useSpring, useTransform } from 'framer-motion'
import players from './data'
import { LiveCoin } from './Coin'
import { ScrollLetters } from './Letters'
import { watchTitle } from './titleFit'

// Choix du joueur « Les candidats » (27/09/2026) : état final de la scène de l'intro quand la
// version choisie est Les candidats (Carousel.jsx), comme la sélection du duel pour la version
// Duel ; même transition pilotée par la progression (0 : intro, 1 : ce choix). La pièce de
// l'intro rétrécit et se pose au centre de l'anneau ; à la fin de la transition, la pièce du
// centre de l'anneau la remplace exactement (même place, même taille, même flottement : relais
// invisible). Disposition inspirée du carrousel de canettes de Ciao Energy : anneau plus large
// que l'écran (pièces des bords coupées), pièces espacées, légèrement penché (plus bas à gauche,
// plus haut à droite) ; la pièce du centre grande et éclairée, les autres un peu plus petites mais
// de plus en plus sombres (presque des silhouettes) et floues, tournées vers le centre et penchées
// chacune à sa façon ; elles se déploient depuis la pièce du centre pendant la transition. Codes du
// site (comme la sélection du duel) : titre « LES CANDIDATS » et description de la même longueur
// (titleFit.js), nom du joueur du centre en arc dessous (celui de la pièce de la scène), flèches
// ‹ › de part et d'autre de la pièce du centre, aide clavier en bas.

const N = players.length
const VISIBLE = 3          // pièces de chaque côté du centre (les dernières coupées par les bords)
// Inclinaison propre à chaque joueur (degrés, dans le plan), comme les canettes de Ciao.
const TILT = [-7, 5, -3, 8, -6, 4, -9, 6, -4, 7]
// Changement de joueur : comme la pièce de la sélection du duel (COIN_TURN, Carousel.jsx) — même
// durée et même courbe pour le déplacement le long de l'anneau et pour le tour complet que chaque
// pièce fait sur elle-même, dans le sens du déplacement ; soulèvement de 6 px au survol.
export const RING_STEP = { duration: 1.1, ease: [0.3, 0.7, 0.2, 1] }
const HOVER = { stiffness: 300, damping: 24 }
export const mod = (n) => ((n % N) + N) % N
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const seg = (p, a, b) => clamp01((p - a) / (b - a))
const easeOut = (x) => 1 - (1 - x) ** 3

/** Géométrie de l'anneau : diamètre de la pièce du centre et hauteur de son centre. */
export function ringLayout(vw, vh) {
  const mobile = vw <= 820
  return {
    D: Math.round(mobile ? Math.min(vw * 0.42, vh * 0.24) : Math.min(vh * 0.36, vw * 0.21)),
    cy: vh * (mobile ? 0.48 : 0.47),
  }
}

/** Place d'une pièce à la distance o du centre (o entier ; |o| > VISIBLE : hors champ) ; n : sa
    place absolue (inclinaison propre au joueur). */
function place(o, n, vw, { D, cy }) {
  const a = Math.abs(o)
  return {
    x: vw / 2 + Math.sign(o) * D * (a * 1.18 - 0.04 * a * a) - D / 2,   // espacées ; l'anneau déborde
    y: cy - D * 0.05 * a * a - o * D * 0.06 - D / 2,   // légère courbe, anneau penché
    scale: Math.max(0.5, 1 - 0.1 * a),
    rotateY: -o * 22,                  // tournées vers le centre
    rotate: a === 0 ? 0 : TILT[mod(n)],   // la pièce du centre droite, comme celle de la scène
    opacity: a > VISIBLE ? 0 : 1,
    zIndex: 10 - a,
    '--dim': [1, 0.36, 0.2, 0.11][Math.min(a, 3)],   // silhouettes vers les bords
    '--blur': `${[0, 0.6, 1.8, 3][Math.min(a, 3)]}px`,
  }
}

/** Pièce de l'anneau : place animée (ressort) quand le centre change ; pendant la transition, elle
    se déploie depuis la pièce du centre (décalage piloté par la progression). La pièce du centre
    n'apparaît qu'une fois la transition finie (docked), à la place de celle de la scène. */
function RingCoin({ n, center, vw, ring, progress, docked, reduced, onClick }) {
  const o = n - center
  // Tour complet sur elle-même à chaque changement, dans le sens du déplacement (toujours un
  // nombre entier de tours : elle finit de face, même interrompue).
  const turn = useMotionValue(0)
  const prev = useRef(center)
  useEffect(() => {
    const d = Math.sign(center - prev.current)
    prev.current = center
    if (!d || reduced) return
    const to = Math.round(turn.get() / 360) * 360 + d * 360   // même sens que la pièce du duel (→ : +1 tour)
    const ctl = animate(turn, to, RING_STEP)
    return () => ctl.stop()
  }, [center])
  // Survol de la pièce du centre : soulevée de 6 px (comme la sélection du duel).
  const lift = useSpring(0, HOVER)
  const at = place(o, n, vw, ring)
  const cx = vw / 2 - ring.D / 2, cy = ring.cy - ring.D / 2
  const k = (p) => easeOut(seg(p, 0.65, 0.9))
  const dx = useTransform(progress, (p) => (1 - k(p)) * (cx - at.x))
  const dy = useTransform(progress, (p) => (1 - k(p)) * (cy - at.y))
  const reveal = useTransform(progress, (p) => (o === 0 ? (docked ? 1 : 0) : k(p)))
  return (
    <m.div className="sp-slot" style={{ x: dx, y: dy, opacity: reveal, zIndex: at.zIndex }}>
      <m.button className={`sp-coin${o === 0 ? ' is-center' : ''}`} onClick={onClick}
                aria-label={o === 0 ? `Voir la présentation de ${players[mod(n)].nom}` : players[mod(n)].nom}
                tabIndex={o === 0 ? 0 : -1}
                style={{ width: ring.D, height: ring.D, '--d': `${ring.D}px` }}
                onPointerEnter={(e) => { if (o === 0 && e.pointerType === 'mouse') lift.set(-6) }}
                onPointerLeave={() => lift.set(0)}
                initial={at} animate={at} transition={reduced ? { duration: 0 } : RING_STEP}>
        {/* Animation commune des pièces (flottement calé sur l'horloge commune, pour que la pièce
            du centre relaie celle de la scène sans saut ; tour au survol) + tour au changement. */}
        <m.span className="sp-lift" style={{ y: o === 0 ? lift : 0 }}>
          <LiveCoin player={players[mod(n)]} phase="sync" rotateY={turn} />
        </m.span>
      </m.button>
    </m.div>
  )
}

/** Couche « Les candidats » de la scène : titre, anneau, flèches et aide clavier. */
export default function CandidatesRing({ progress, vw, ring, center, docked, reduced, onStep, onPick }) {
  const titleRef = useRef(null)
  const subRef = useRef(null)
  useLayoutEffect(() => watchTitle(() => titleRef.current, () => subRef.current), [])
  const motion = reduced ? { dist: 0, blur: 0 } : {}
  const late = useTransform(progress, (p) => seg(p, 0.85, 1))
  const slots = []
  for (let o = -VISIBLE; o <= VISIBLE; o++) slots.push(center + o)
  return (
    <>
      {/* Titre et description, comme la sélection du duel (.pick-title), frappés lettre par lettre. */}
      <header className="pick-title sp-head">
        <h1><ScrollLetters innerRef={titleRef} text="LES CANDIDATS" progress={progress} range={[0.35, 0.7]} {...motion} /></h1>
        <p><ScrollLetters innerRef={subRef} text="Sélectionnez un joueur à découvrir." progress={progress} range={[0.55, 0.8]} {...motion} /></p>
      </header>
      <div className="stage-layer sp-ring" aria-label="Candidats">
        {slots.map((n) => (
          <RingCoin key={n} n={n} center={center} vw={vw} ring={ring} progress={progress} docked={docked}
                    reduced={reduced} onClick={() => (n === center ? onPick() : onStep(n - center))} />
        ))}
      </div>
      <m.div className="stage-layer" style={{ opacity: late }}>
        {/* ‹ à gauche et › à droite de la pièce du centre (flèches de la sélection du duel). */}
        {[-1, 1].map((d) => (
          <button key={d} className="pick-arrow sp-arrow" onClick={() => onStep(d)}
                  aria-label={d < 0 ? 'Joueur précédent' : 'Joueur suivant'}
                  style={{ left: vw / 2 + d * (ring.D / 2 + 40), top: ring.cy }}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {d > 0 ? <path d="M9 5l7 7-7 7" /> : <path d="M15 5l-7 7 7 7" />}
            </svg>
          </button>
        ))}
        <p className="pick-help" aria-hidden="true">← → NAVIGUER · ↵ SÉLECTIONNER · ESC RETOUR</p>
        <button className="intro-down sp-down" onClick={onPick} aria-label="Voir la présentation">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7" /></svg>
        </button>
      </m.div>
    </>
  )
}
