import { useEffect, useMemo, useRef, useState } from 'react'
import { m, useTransform } from 'framer-motion'

// Textes en arc et lettres animées au scroll. Une span par lettre (plus de SVG textPath), pour
// animer chaque lettre séparément : titre « BALLON D'OR 2026 », noms sous les pièces, titre et
// description de la sélection.
//
// Arcs : repère centré sur la pièce, rayon de la pièce = 100 unités (1 unité = --d / 200, via
// la taille de police de .arc-box). Chaque lettre est posée par rotate(angle) translateY(±rayon),
// sa ligne de base sur le cercle : en haut, lue de gauche à droite par le haut ; en bas, lue de
// gauche à droite par le bas, lettres à l'endroit (le haut des lettres vers la pièce).

const FONT = '"Barlow Condensed"'
// Même taille de lettres et même écart avec la pièce en haut et en bas : en bas, les lettres
// descendent vers la pièce, d'où la hauteur des capitales ajoutée au rayon (~0,7 em).
export const ARC_FONT = 25
const ARC_LS = 0.08 * ARC_FONT   // espacement des lettres (0,08 em)
const GAP = 16
const R_TOP = 100 + GAP
export const R_BOTTOM = 100 + GAP + ARC_FONT * 0.7

let fontsLoaded = false
/** Vrai une fois Barlow Condensed 700 chargée (les angles des lettres dépendent des largeurs). */
function useFontsReady() {
  const [ok, setOk] = useState(fontsLoaded)
  useEffect(() => {
    if (ok) return
    if (!document.fonts) { setOk(true); return }
    document.fonts.load(`700 1em ${FONT}`).catch(() => {}).finally(() => { fontsLoaded = true; setOk(true) })
  }, [])
  return ok
}

let ctx = null
const setFont = (size = ARC_FONT) => {
  ctx ??= document.createElement('canvas').getContext('2d')
  ctx.font = `700 ${size}px ${FONT}, 'Arial Narrow', sans-serif`
  return ctx
}
/** Position de la ligne de base dans une ligne de hauteur 1 em, depuis le bas (en em). */
let baseline = null
function baselineFromBottom() {
  if (baseline !== null && fontsLoaded) return baseline
  const c = setFont()
  const mt = c.measureText('H')
  const asc = mt.fontBoundingBoxAscent, desc = mt.fontBoundingBoxDescent
  baseline = asc && desc ? (desc + (ARC_FONT - asc - desc) / 2) / ARC_FONT : 0.2
  return baseline
}

/** Angle (degrés) du centre de chaque lettre, d'après les largeurs réelles (crénage compris) ;
    size : taille des lettres (unités). */
function arcLayout(text, radius, side, size = ARC_FONT) {
  const t = text.toUpperCase()
  const c = setFont(size)
  const W = (k) => c.measureText(t.slice(0, k)).width
  const n = t.length
  const ls = ARC_LS * (size / ARC_FONT)
  const total = W(n) + (n - 1) * ls
  const sign = side === 'top' ? 1 : -1
  return [...t].map((ch, i) => {
    const mid = (W(i) + W(i + 1)) / 2 + i * ls - total / 2
    return { ch, deg: (sign * mid / radius) * 180 / Math.PI }
  })
}

/** Transformation d'une lettre de l'arc ; off : décalage vers l'extérieur (unités). */
const arcTransform = (side, radius, deg, off = 0) =>
  `rotate(${deg}deg) translateY(${side === 'top' ? -(radius + off) : radius + off}em)`

function Glyph({ ch, className, style, size = ARC_FONT }) {
  return (
    <span className={`arc-g${className ? ` ${className}` : ''}`}
          style={{ fontSize: `${size}em`, bottom: `${-baselineFromBottom()}em`, ...style }}>{ch}</span>
  )
}

/** Texte en arc. chars (facultatif) : par lettre, { off, o, fill, rot, ch } (animations de
    NameArc et GlitchArc : décalage radial, opacité, couleur, décalage le long de l'arc en
    degrés, caractère de remplacement) ; accentFrom : à partir de cette lettre, classe is-accent
    (« 2026 » en or) ; size : taille des lettres (unités, ARC_FONT par défaut). */
export function ArcText({ text, side = 'bottom', radius = side === 'top' ? R_TOP : R_BOTTOM, chars, accentFrom, className = '', size = ARC_FONT, style }) {
  const ready = useFontsReady()
  const lay = useMemo(() => arcLayout(text, radius, side, size), [text, radius, side, size, ready])
  return (
    <div className={`arc-box ${className}`} aria-hidden="true" style={style}>
      {lay.map(({ ch: base, deg }, i) => {
        const c = chars?.[i]
        const ch = c?.ch ?? base
        return (
          <span key={i} className="arc-l" style={{ transform: arcTransform(side, radius, deg + (c?.rot ?? 0), c?.off), opacity: c?.o }}>
            <Glyph ch={ch} size={size} className={accentFrom !== undefined && i >= accentFrom ? 'is-accent' : ''}
                   style={c?.fill ? { color: c.fill } : undefined} />
          </span>
        )
      })}
    </div>
  )
}

// ——— Lettres pilotées par la progression du scroll ———

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const easeOut = (x) => 1 - (1 - x) ** 3
const WINDOW = 0.45   // part de la plage occupée par l'animation d'une lettre

/** Rang de départ de la lettre i sur n (0 : la première à bouger). ltr : de gauche à droite ;
    edges : des deux extrémités vers le centre. */
const rankOf = (order, i, n) => {
  if (n < 2) return 0
  if (order === 'edges') return 1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2)
  return i / (n - 1)
}

function ScrollLetter({ progress, k, place, blur, className, children }) {
  // k(p) : 1 = lettre en place et visible, 0 = effacée (décalée, floue).
  const opacity = useTransform(progress, k)
  const transform = useTransform(progress, (p) => place(1 - k(p)))
  const filter = useTransform(progress, (p) => {
    const b = (1 - k(p)) * blur
    return b > 0.05 ? `blur(${b}px)` : 'none'
  })
  return <m.span className={className} style={{ opacity, transform, filter }}>{children}</m.span>
}

/** Texte dont chaque lettre apparaît (mode in) ou s'efface (mode out) quand la progression
    parcourt range ; en ligne (décalage vertical de dist px) ou en arc (arc: 'top' | 'bottom',
    décalage vers l'extérieur de dist unités). */
export function ScrollLetters({ text, progress, range: [a, b], mode = 'in', order = 'ltr', arc, dist = 30,
                                blur = 8, accentFrom, className = '', innerRef }) {
  const ready = useFontsReady()
  const radius = arc === 'top' ? R_TOP : R_BOTTOM
  const lay = useMemo(() => (arc ? arcLayout(text, radius, arc) : [...text].map((ch) => ({ ch }))), [text, arc, ready])
  const n = lay.length
  const span = b - a
  const letters = lay.map(({ ch, deg }, i) => {
    const start = a + rankOf(order, i, n) * span * (1 - WINDOW)
    const t = (p) => easeOut(clamp01((p - start) / (span * WINDOW)))
    const k = mode === 'in' ? t : (p) => 1 - t(p)
    const accent = accentFrom !== undefined && i >= accentFrom
    if (arc) {
      return (
        <ScrollLetter key={i} progress={progress} k={k} blur={blur} className="arc-l"
                      place={(u) => arcTransform(arc, radius, deg, u * dist)}>
          <Glyph ch={ch} className={accent ? 'is-accent' : ''} />
        </ScrollLetter>
      )
    }
    return (
      <ScrollLetter key={i} progress={progress} k={k} blur={blur} className={`line-l${accent ? ' is-accent' : ''}`}
                    place={(u) => `translateY(${u * dist}px)`}>{ch}</ScrollLetter>
    )
  })
  if (arc) return <div className={`arc-box ${className}`} aria-hidden="true">{letters}</div>
  return <span ref={innerRef} className={className} aria-label={text}><span aria-hidden="true">{letters}</span></span>
}

// ——— Nom en arc animé au changement de joueur ———

// Sortie : l'ancien nom s'échappe vers l'extérieur en s'effaçant, du centre vers les bords.
// Entrée : le nouveau nom est « frappé » du centre vers les extrémités, chaque lettre arrive de
// l'extérieur, se pose contre la pièce, en or, puis refroidit vers le blanc.
const OUT_MS = 240, OUT_STEP = 14, OUT_DY = 9
const IN_MS = 520, IN_STEP = 38, IN_DY = 14
export const GOLD = [212, 175, 55]
const INK = [237, 234, 227]
const easeIn = (x) => clamp01(x) ** 2
const mixRgb = (a, b, k) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`
const rank = (i, n) => Math.abs(i - (n - 1) / 2)   // distance au centre du mot

/** Nom en arc sous une pièce, animé à chaque changement (`text`) ; `pace` < 1 : plus rapide ;
    `radius` : autre rayon (titre de la version, sous le nom) ; `settle` : couleur finale des
    lettres frappées (blanc par défaut ; or pour le titre de la version). */
export function NameArc({ text, animate: on, className = 'arc-name', pace = 1, radius = R_BOTTOM, settle = INK, dir = 1 }) {
  const [shown, setShown] = useState({ text, chars: null })   // chars : [{ off, o, fill }] ou null (au repos)
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
          return { off: dir * k * OUT_DY, o: 1 - k }
        }) })
      } else {
        const ti = t - outEnd
        const n = text.length
        const chars = [...text].map((_, i) => {
          const x = (ti - rank(i, n) * inStep) / inMs
          return { off: dir * (1 - easeOut(clamp01(x))) * IN_DY, o: clamp01(x * 1.8), fill: mixRgb(GOLD, settle, clamp01((x - 0.3) / 0.7)) }
        })
        setShown({ text, chars })
        if (ti > Math.ceil((n - 1) / 2) * inStep + inMs) { setShown({ text, chars: null }); return }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [text, on, pace, settle, dir])
  if (!shown.text) return null
  return <ArcText text={shown.text} side="bottom" radius={radius} chars={shown.chars} className={className} />
}

// ——— Textes en ligne animés comme le nom en arc (changement de joueur) ———

/** Même animation que NameArc (mêmes durées, même ordre du centre vers les bords, même passage de
    l'or à la couleur du texte), pilotée par `trigger` (le joueur) : l'ancien texte s'efface en
    descendant, le nouveau est frappé du centre vers les bords, en montant ; un texte identique est
    seulement refrappé. `onMount` : animé dès l'affichage. Renvoie { text, chars } — chars :
    [{ off, o, k }] (k : 0 = or, 1 = couleur du texte ; absent pendant la sortie) ou null au repos. */
export function useStamp(text, trigger = text, { onMount = false, reduced = false } = {}) {
  const [shown, setShown] = useState({ text, chars: null })
  const prev = useRef({ text, trigger: onMount ? {} : trigger })
  useEffect(() => {
    const before = prev.current
    const old = before.text
    const changed = before.trigger !== trigger || old !== text
    prev.current = { text, trigger }
    if (!changed || reduced) { setShown({ text, chars: null }); return }
    const t0 = performance.now()
    const outN = old === text ? 0 : old.length
    const outEnd = outN ? (Math.ceil((outN - 1) / 2) * OUT_STEP + OUT_MS) : 0
    let raf = 0, done = false
    const frame = (now) => {
      const t = now - t0
      if (t < outEnd) {
        setShown({ text: old, chars: [...old].map((_, i) => {
          const k = easeIn((t - rank(i, outN) * OUT_STEP) / OUT_MS)
          return { off: k * OUT_DY, o: 1 - k }
        }) })
      } else {
        const ti = t - outEnd, n = text.length
        if (ti > Math.ceil((n - 1) / 2) * IN_STEP + IN_MS) { setShown({ text, chars: null }); done = true; return }
        setShown({ text, chars: [...text].map((_, i) => {
          const x = (ti - rank(i, n) * IN_STEP) / IN_MS
          return { off: (1 - easeOut(clamp01(x))) * IN_DY, o: clamp01(x * 1.8), k: clamp01((x - 0.3) / 0.7) }
        }) })
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    // Interrompu (texte qui rechange, effet rejoué en développement) : l'état d'avant, pour que
    // l'animation reparte au lieu d'être tenue pour faite.
    return () => { cancelAnimationFrame(raf); if (!done) prev.current = before }
  }, [text, trigger, reduced])
  return shown
}

/** Couleur d'une lettre frappée : de l'or vers la couleur du texte (k de 0 à 1). */
export const stampColor = (k) => (k === undefined || k >= 1 ? undefined
  : `color-mix(in srgb, var(--gold) ${Math.round((1 - k) * 100)}%, currentColor)`)

/** Texte en ligne animé comme le nom des candidats à chaque changement de `trigger` : les lettres
    montent (décalage en em, proportionnel à celui du nom en arc), mots jamais coupés en route. */
export function Stamp({ text, trigger, onMount = false, reduced = false }) {
  const { text: shown, chars } = useStamp(text, trigger, { onMount, reduced })
  if (!chars) return shown
  // Mots (lettres groupées, jamais coupées en route) et espaces, avec l'indice de leur 1re lettre.
  const parts = []
  let at = 0
  for (const w of shown.split(/(\s+)/)) { if (w) parts.push({ w, at }); at += w.length }
  return (
    <span className="stamp" aria-label={shown}>
      {parts.map(({ w, at: a }) => (/^\s+$/.test(w) ? w : (
        <span key={a} aria-hidden="true" style={{ whiteSpace: 'nowrap' }}>
          {[...w].map((ch, k) => {
            const c = chars[a + k] ?? { off: 0, o: 1 }
            return (
              <span key={k} style={{ display: 'inline-block', transform: `translateY(${(c.off / ARC_FONT).toFixed(3)}em)`,
                                     opacity: c.o, color: stampColor(c.k) }}>{ch}</span>
            )
          })}
        </span>
      )))}
    </span>
  )
}

// ——— Titre en arc, glitch léger au changement ———

// Glitch (~480 ms) : l'ancien titre puis le nouveau tremblent le long de l'arc, clignotent en
// nuances de blanc et de gris, quelques lettres brouillées ; un double gris décalé les suit ;
// puis le nouveau titre se pose dans sa couleur (classe CSS). Mouvement réduit : changement direct.
// Adouci (audit du 27/09/2026) : plus de lettres quasi noires (les éclairs les plus forts) et un
// scintillement plus lent, pour limiter l'effet de clignotement.
const GLITCH_MS = 480, GLITCH_TICK = 70
const GLITCH_INKS = ['#FFFFFF', '#EDEAE3', '#9A968F', '#5A5853']
const GLITCH_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#%&'
const pick = (list) => list[Math.floor(Math.random() * list.length)]

/** Titre en arc (radius, size) ; à chaque changement de `text`, glitch léger. */
export function GlitchArc({ text, radius, size = ARC_FONT, className = '', animate: on = true }) {
  const [g, setG] = useState({ text, chars: null, ghost: null })
  const cur = useRef(text)
  useEffect(() => {
    const old = cur.current
    cur.current = text
    if (!on || !text) { setG({ text, chars: null, ghost: null }); return }
    const t0 = performance.now()
    let last = -Infinity, raf
    const frame = (now) => {
      const t = now - t0
      if (t >= GLITCH_MS) { setG({ text, chars: null, ghost: null }); return }
      if (t - last >= GLITCH_TICK) {
        last = t
        const shown = t < GLITCH_MS * 0.4 && old ? old : text
        const k = 1 - t / GLITCH_MS   // intensité, décroissante
        const chars = [...shown].map((ch) => ({
          ch: ch !== ' ' && Math.random() < 0.25 * k ? pick(GLITCH_CHARS) : undefined,
          rot: (Math.random() - 0.5) * 3 * k,
          off: (Math.random() - 0.5) * 4 * k,
          o: Math.random() < 0.15 * k ? 0.2 : 1,
          fill: pick(GLITCH_INKS),
        }))
        setG({ text: shown, chars, ghost: { rot: (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.2) * k } })
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [text, on])
  if (!g.text) return null
  return (
    <>
      {g.ghost && (
        <ArcText text={g.text} side="bottom" radius={radius} size={size} className={`${className} is-ghost`}
                 chars={[...g.text].map(() => ({ rot: g.ghost.rot, fill: '#9A968F', o: 0.45 }))} />
      )}
      <ArcText text={g.text} side="bottom" radius={radius} size={size} className={className} chars={g.chars} />
    </>
  )
}
