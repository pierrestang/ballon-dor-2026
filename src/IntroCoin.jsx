import { useEffect, useRef, useState } from 'react'
import { animate, useMotionValue } from 'framer-motion'
import players, { coinUrl } from './data'
import { Coin } from './Coin'

// Centre de l'intro : la pièce d'or de la page 1 (mêmes classes .coin / .coin-face /
// .coin-layer : faces détourées, tranche en disques dorés empilés, halo doré, flottement), un
// nominé toutes les 2 s dans l'ordre du fichier de données. Changement : un tour complet, la
// nouvelle image posée quand la pièce est vue de profil (aucun saut). « BALLON D'OR 2026 » en
// arc au-dessus, le nom du joueur en arc dessous (NameArc : sortie puis frappe lettre par
// lettre), dans la police des noms de la page 3.
// Mouvement réduit : pas de rotation, l'image change simplement.

const CYCLE_MS = 2000
const TURN_S = 1.1

// Arcs (viewBox centré sur la pièce, rayon de la pièce = 100) : titre au-dessus, lu de gauche
// à droite par le haut ; nom dessous, lu de gauche à droite par le bas (lettres à l'endroit).
// Même taille de lettres (ARC_FONT) et même écart avec la pièce en haut et en bas : en haut
// les lettres montent depuis la ligne de base, en bas elles descendent vers la pièce, d'où la
// hauteur des capitales ajoutée au rayon du bas (Barlow Condensed : ~0,7 em).
export const ARC_FONT = 25
const GAP = 16
const R_TOP = 100 + GAP
const R_BOTTOM = 100 + GAP + ARC_FONT * 0.7
const TOP_ARC = `M ${-R_TOP} 0 A ${R_TOP} ${R_TOP} 0 0 1 ${R_TOP} 0`
export const BOTTOM_ARC = `M ${-R_BOTTOM} 0 A ${R_BOTTOM} ${R_BOTTOM} 0 0 0 ${R_BOTTOM} 0`

// Animation du nom, lettre par lettre le long de l'arc. Sortie : l'ancien nom s'échappe vers
// l'extérieur en s'effaçant, du centre vers les bords. Entrée : le nouveau nom est « frappé » du
// centre vers les extrémités, chaque lettre arrive de l'extérieur, se pose contre la pièce, en
// or, puis refroidit vers le blanc. Décalage radial par `dy` (perpendiculaire à l'arc).
const OUT_MS = 240, OUT_STEP = 14, OUT_DY = 9
const IN_MS = 520, IN_STEP = 38, IN_DY = 14
const GOLD = [212, 175, 55], INK = [237, 234, 227], INK_CSS = 'rgb(237,234,227)'
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const easeOut = (x) => 1 - (1 - clamp01(x)) ** 3
const easeIn = (x) => clamp01(x) ** 2
const mixRgb = (a, b, k) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`
const rank = (i, n) => Math.abs(i - (n - 1) / 2)   // distance au centre du mot

/** Nom en arc, animé à chaque changement (`text`). Repris en page 1 (Carousel.jsx), avec
    `className` pour ne pas hériter des styles de l'intro et `pace` (< 1 : plus rapide) pour
    caler l'animation sur le glissement des pièces. */
export function NameArc({ text, href, fontSize, animate: on, className = 'arc-name', pace = 1 }) {
  const [shown, setShown] = useState({ text, chars: null })   // chars : [{ dy, o, fill }] ou null (au repos)
  const cur = useRef(text)
  useEffect(() => {
    if (!on) { cur.current = text; setShown({ text, chars: null }); return }
    const old = cur.current
    cur.current = text
    const t0 = performance.now()
    const outMs = OUT_MS * pace, outStep = OUT_STEP * pace, inMs = IN_MS * pace, inStep = IN_STEP * pace
    const outN = old === text ? 0 : old.length
    const outEnd = outN ? (Math.ceil((outN - 1) / 2) * outStep + outMs) : 0
    let raf
    const frame = (now) => {
      const t = now - t0
      if (t < outEnd) {
        setShown({ text: old, chars: [...old].map((_, i) => {
          const k = easeIn((t - rank(i, outN) * outStep) / outMs)
          return { off: k * OUT_DY, o: 1 - k, fill: INK_CSS }
        }) })
      } else {
        const ti = t - outEnd
        const n = text.length
        const chars = [...text].map((_, i) => {
          const x = (ti - rank(i, n) * inStep) / inMs
          const k = easeOut(x)
          return { off: (1 - k) * IN_DY, o: clamp01(x * 1.8), fill: mixRgb(GOLD, INK, clamp01((x - 0.3) / 0.7)) }
        })
        setShown({ text, chars })
        if (ti > Math.ceil((n - 1) / 2) * inStep + inMs) { setShown({ text, chars: null }); return }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [text, on, pace])

  const { chars } = shown
  return (
    <text className={className} fontSize={fontSize}>
      <textPath href={href} startOffset="50%" textAnchor="middle">
        {chars
          ? [...shown.text].map((ch, i) => (
            <tspan key={i} dy={chars[i].off - (i ? chars[i - 1].off : 0)} fillOpacity={chars[i].o} fill={chars[i].fill}>{ch}</tspan>
          ))
          : shown.text}
      </textPath>
    </text>
  )
}

export default function IntroCoin({ active, reduced }) {
  const [index, setIndex] = useState(0)
  const rot = useMotionValue(0)
  const p = players[index]

  // Les 10 pièces se chargent pendant le chargement de l'intro.
  useEffect(() => { players.forEach((q) => { new Image().src = coinUrl(q.id) }) }, [])

  // Un tour complet toutes les 2 s ; l'image change au passage de profil (90°).
  const current = useRef(0)
  useEffect(() => {
    if (!active) return
    let turn = null
    const id = setInterval(() => {
      const next = (current.current + 1) % players.length
      if (reduced) { current.current = next; setIndex(next); return }
      const from = rot.get()
      let swapped = false
      turn = animate(rot, from + 360, {
        duration: TURN_S,
        ease: [0.3, 0.7, 0.2, 1],   // comme en page 1
        onUpdate: (v) => {
          if (!swapped && v - from >= 90) { swapped = true; current.current = next; setIndex(next) }
        },
      })
    }, CYCLE_MS)
    return () => { clearInterval(id); turn?.stop() }
  }, [active, reduced])

  return (
    <div className={`intro-coin${active ? ' is-on' : ''}`}>
      {/* Pièce : la même que sur tout le site (Coin.jsx : tranche striée de 6 %). */}
      <div className="intro-coin-item">
        <div className="intro-coin-float">
          <Coin player={p} rotateY={rot} />
        </div>
      </div>

      {/* Titre et nom en arc de cercle, en haut et en bas de la pièce. */}
      <svg className="intro-arcs" viewBox="-180 -180 360 360" aria-hidden="true">
        <path id="intro-arc-top" d={TOP_ARC} />
        <path id="intro-arc-bottom" d={BOTTOM_ARC} />
        <text className="arc-title" fontSize={ARC_FONT}>
          <textPath href="#intro-arc-top" startOffset="50%" textAnchor="middle">
            BALLON D’OR <tspan className="arc-year">2026</tspan>
          </textPath>
        </text>
        <NameArc text={p.nom} href="#intro-arc-bottom" fontSize={ARC_FONT} animate={active && !reduced} />
      </svg>
      <h1 className="sr-only">Ballon d’Or 2026</h1>
      <p className="sr-only" aria-live="polite">{p.nom}</p>
    </div>
  )
}
