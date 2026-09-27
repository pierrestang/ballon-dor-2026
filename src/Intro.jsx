import { useEffect, useRef, useState } from 'react'
import players, { coinUrl } from './data'

// Chargement de l'intro (IntroSelect dans Carousel.jsx) : fond noir, un trophée en trait fin se
// construit du socle vers le ballon au rythme du chargement réel (polices + pièces), avec une
// progression minimale simulée par paliers (3 s au plus). Trophée complet : bref flash doré, il
// se réduit et s'efface, et la pièce d'or apparaît au centre. Au retour depuis la page du duel,
// tout est affiché d'emblée ; en mouvement réduit, le trophée s'efface simplement.

const SIM_MS = 2300    // progression simulée, de 000 à 100
const MAX_MS = 3000    // plafond : à 3 s, le chargement est affiché complet quoi qu'il arrive
export const FLASH_MS = 150   // flash doré du trophée complet
export const COIN_AT = FLASH_MS + 50   // apparition de la pièce (après la fin du chargement)
export const READY_AT = COIN_AT + 900  // flèche de défilement
const SETTLE_MS = READY_AT + 400   // fin de l'horloge d'animation

// Progression simulée : accélérations et paliers (x = temps, y = progression, 0 → 1).
const CURVE = [[0, 0], [0.1, 0.12], [0.28, 0.19], [0.4, 0.47], [0.55, 0.55], [0.7, 0.81], [0.85, 0.88], [1, 1]]
function curve(x) {
  if (x >= 1) return 1
  if (!(x > 0)) return 0   // temps négatif ou NaN (horloge qui démarre) : pas encore de progression
  const i = CURVE.findIndex(([cx]) => cx > x)
  const [x0, y0] = CURVE[i - 1]
  const [x1, y1] = CURVE[i]
  const k = (x - x0) / (x1 - x0)
  return y0 + (y1 - y0) * (1 - (1 - k) ** 3)   // power3.out sur chaque segment
}
// Jamais plus vite que la simulation, jamais plus que le chargement réel (sauf passé MAX_MS).
const progress = (t, real) => Math.min(curve(t / SIM_MS), Math.max(real, t / MAX_MS))

/** Chargement réel : polices de l'intro + les 10 pièces de la page 1 (arrivée instantanée).
    Renvoie une ref dont `current` va de 0 à 1. */
function useAssetProgress() {
  const done = useRef(0)
  useEffect(() => {
    const urls = players.map((p) => coinUrl(p.id))
    const total = urls.length + 1
    let n = 0
    const tick = () => { done.current = ++n / total }
    urls.forEach((u) => { const img = new Image(); img.onload = img.onerror = tick; img.src = u })
    const fonts = document.fonts
    if (!fonts) { tick(); return }
    fonts.ready
      .then(() => Promise.all([fonts.load('700 1em "Barlow Condensed"'), fonts.load('400 1em "JetBrains Mono"')]))
      .catch(() => {})
      .finally(tick)
  }, [])
  return done
}

/** Horloge de l'intro : `t` (ms depuis le montage), `pct` (0 → 100) et `end` (instant où le
    chargement a atteint 100, null avant). `t` passe à Infinity une fois tout en place. */
export function useIntroClock(instant, reduced) {
  const real = useAssetProgress()
  const [s, setS] = useState(() => (instant ? { t: Infinity, pct: 100, end: 0 } : { t: 0, pct: 0, end: reduced ? 0 : null }))
  useEffect(() => {
    if (instant) return
    const t0 = performance.now()
    let end = reduced ? 0 : null
    let raf = requestAnimationFrame(function tick(now) {
      const t = now - t0
      const pct = end !== null ? 100 : Math.floor(progress(t, real.current) * 100)
      if (pct >= 100 && end === null) end = t
      if (end !== null && t > end + SETTLE_MS) { setS({ t: Infinity, pct: 100, end }); return }
      setS({ t, pct, end })
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [])
  return s
}

const STATUS = (pct) => (pct < 30 ? 'INITIALISATION'
  : pct < 65 ? 'CHARGEMENT DES CANDIDATS'
    : pct < 100 ? 'SYNCHRONISATION DES STATS' : 'PRÊT')

// Silhouette du trophée (viewBox 160 × 180), d'après le Ballon d'Or : grand ballon à panneaux
// (pentagone central, hexagones, pentagones du pourtour), coupe évasée qui le porte,
// socle rond à deux étages vu légèrement de dessus. Même dessin dans public/favicon.svg.
export const TROPHY_PATHS = [
  'M80 8a56 56 0 1 0 0.01 0',                                                   // ballon
  'M80 53L93.3 62.7L88.2 78.3L71.8 78.3L66.7 62.7Z',                             // pentagone central
  'M80 53L80 36M93.3 62.7L109.5 57.4M88.2 78.3L98.2 92.1M71.8 78.3L61.8 92.1M66.7 62.7L50.5 57.4'
    + 'M65.3 24.5L80 36L94.7 24.5M115.9 39.9L109.5 57.4L125 67.8M116.9 92.8L98.2 92.1L93.2 110'
    + 'M66.8 110L61.8 92.1L43.1 92.8M35 67.8L50.5 57.4L44.1 39.9',                // coutures
  'M94.7 24.5L115.9 39.9M125 67.8L116.9 92.8M93.2 110L66.8 110M43.1 92.8L35 67.8M44.1 39.9L65.3 24.5',
  'M65.3 24.5L52 15.5M94.7 24.5L108 15.5M115.9 39.9L117.5 22.4M125 67.8L134.8 75.6M116.9 92.8L131.2 86.8'
    + 'M93.2 110L85.9 119.7M66.8 110L74.1 119.7M43.1 92.8L28.8 86.8M35 67.8L25.2 75.6M44.1 39.9L42.5 22.4',
  'M59.2 116C64 124 71 128 74 132M100.8 116C96 124 89 128 86 132',              // coupe, qui naît sous le ballon
  // Col évasé, posé sur le bord arrière de l'étage haut (x = 66 et 94 sur l'ellipse de centre
  // 80,146, rayons 30 × 5) ; ce bord n'est pas tracé derrière le col.
  'M74 132V136C74 139 70 141 66 141.58M86 132V136C86 139 90 141 94 141.58',
  'M50 146a30 5 0 0 0 60 0M110 146A30 5 0 0 0 94 141.58M66 141.58A30 5 0 0 0 50 146'
    + 'M50 146V154M110 146V154M50 154a30 5 0 0 0 60 0',                         // étage haut
  'M40 158A40 6 0 0 1 50 154M110 154A40 6 0 0 1 120 158M40 158a40 6 0 0 0 80 0'
    + 'M40 158V166M120 158V166M40 166a40 6 0 0 0 80 0',                          // étage bas
]
export const VIEW_W = 160, VIEW_H = 180
const REVEAL_TOP = 6, REVEAL_BOTTOM = 174   // bornes verticales du dessin

/** Trophée en trait fin : silhouette de fond toujours visible, silhouette dorée révélée du bas
    vers le haut par un rectangle de découpe qui monte avec `pct`. */
export function TrophyLoader({ pct, done, gone }) {
  const h = (REVEAL_BOTTOM - REVEAL_TOP) * (pct / 100)
  const shape = TROPHY_PATHS.map((d) => <path key={d} d={d} />)
  return (
    <div className={`trophy-loader${done ? ' is-done' : ''}${gone ? ' is-gone' : ''}`} aria-hidden="true">
      <svg className="trophy" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
        <defs>
          <clipPath id="trophy-reveal">
            <rect x="0" y={REVEAL_BOTTOM - h} width={VIEW_W} height={h} />
          </clipPath>
          <filter id="trophy-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.2" floodColor="#D4AF37" floodOpacity="0.55" />
          </filter>
        </defs>
        <g className="trophy-base">{shape}</g>
        <g clipPath="url(#trophy-reveal)">
          <g className="trophy-gold" filter="url(#trophy-glow)">{shape}</g>
        </g>
        <g className="trophy-flash">{shape}</g>
      </svg>
      <p className={`loader-status${pct >= 100 ? ' is-ready' : ''}`}>{STATUS(pct)}</p>
      <p className="loader-pct">{String(pct).padStart(3, '0')}</p>
    </div>
  )
}
