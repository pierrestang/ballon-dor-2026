import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, m, useMotionValue, useSpring, useTransform } from 'framer-motion'
import players from './data'
import { Coin, syncFloat, useCoinTurn, useHoverSpin } from './Coin'
import { ArcText, NameArc, ScrollLetters } from './Letters'
import { watchTitle } from './titleFit'
import { TROPHY_PATHS, VIEW_H, VIEW_W } from './Intro'
import { ringLayout } from './SoloPick'

// Éléments de la sélection du duel (Carousel.jsx) : géométrie de l'écran, titre, pièce centrale,
// pièces posées, pièces fantômes, noms en arc et vols entre le centre et les emplacements.
// Sortis de Carousel.jsx le 27/09/2026 (audit), sans changement.

const POWER3_IN_OUT = [0.65, 0, 0.35, 1]
const FLIGHT = { duration: 0.7, ease: POWER3_IN_OUT }
export const SPIN = 540          // 1,5 tour pendant le vol
const SPLIT_MIN = 820    // px : en dessous, mobile
const HOVER = { stiffness: 300, damping: 24 }   // pièce centrale soulevée au survol
const NAME_BELOW = 0.72   // bas du nom en arc, en diamètres de la pièce sous son centre
const BOTTOM_SPACE = 80   // px laissés en bas (grand écran) à l'aide clavier et à la flèche
const TITLE_MOBILE = 150   // px réservés en haut (mobile) à la flèche « Menu » et au titre « DUEL »
const BOTTOM_MOBILE = 96   // px réservés en bas (mobile) à « LANCER LE DUEL » et son chevron
const GROUP_GAP = 28       // mobile : du bas des noms des emplacements au haut de la pièce centrale

// Géométrie de l'écran : diamètre D de la pièce centrale (centre en coinY), diamètre G des pièces
// fantômes (et des pièces posées), centres des deux emplacements.
export function useLayout() {
  const measure = () => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const wide = vw > SPLIT_MIN
    if (wide) {
      // Grand écran : un seul bloc centré verticalement — titre, puis la rangée pièce A · pièce
      // centrale · pièce B (noms en arc compris) —, en laissant le bas de l'écran à l'aide
      // clavier et à la flèche. Emplacements aux places des joueurs en page 2 (28 % et 72 % de
      // la largeur, --center de .duel-grid), écartés juste assez pour ne pas toucher les
      // flèches ‹ ›.
      const D = Math.round(Math.min(vh * 0.22, vw * 0.14))
      // Emplacements : taille propre, indépendante de la pièce centrale.
      const G = Math.round(Math.min(vh * 0.36, vw * 0.24))
      // Hauteur du titre (tailles de .pick-title) et écart titre → pièces.
      const h1 = Math.min(48, Math.max(28, vw * 0.032))
      const sub = Math.min(20, Math.max(15, vw * 0.013))
      const titleH = h1 + 10 + sub * 1.25
      const gap = vh * 0.07
      // Titre à la même hauteur que sur toutes les pages (.pick-title : clamp(24px, 6vh, 64px),
      // + 40 px sous la flèche « Menu ») ; pièces centrées dans la hauteur qui reste.
      const titleY = Math.min(64, Math.max(24, vh * 0.06)) + 40
      const freeTop = titleY + titleH
      const rowH = G / 2 + G * NAME_BELOW + G / 2
      const gapFree = Math.max(gap, (vh - BOTTOM_SPACE - freeTop - rowH) / 2)
      const coinY = freeTop + gapFree + G / 2
      const off = Math.max(vw * 0.22, D / 2 + G / 2 + 110)   // du centre de l'écran à un emplacement
      // Duel prêt : la pièce centrale s'efface et les deux emplacements se rapprochent, « VS »
      // entre les deux (slotXReady).
      const near = G / 2 + 70
      return { vw, vh, D, G, wide, titleY, coinY, slotY: coinY, slotYReady: coinY, slotX: [vw / 2 - off, vw / 2 + off],
               slotXReady: [vw / 2 - near, vw / 2 + near], ring: ringLayout(vw, vh) }
    }
    // Mobile : emplacements côte à côte (« VS » entre les deux), pièce dessous ; le groupe entier
    // (emplacements et leurs noms, écart, pièce et son nom) centré entre le titre (TITLE_MOBILE)
    // et « LANCER LE DUEL » (BOTTOM_MOBILE) — il était calé en haut, 40 % de l'écran vide
    // dessous, et la pièce chevauchait les noms des emplacements sur les petits écrans ;
    // pièces réduites si la place manque.
    const vsGap = 30
    let D = Math.min(vw * 0.32, vh * 0.18)
    let G = Math.min(vw * 0.36, vh * 0.2, (vw - 32) / 2 - vsGap)
    const room = vh - TITLE_MOBILE - BOTTOM_MOBILE
    const fit = (room - GROUP_GAP) / ((G + D) * (0.5 + NAME_BELOW))
    if (fit < 1) { G *= fit; D *= fit }
    G = Math.round(G); D = Math.round(D)
    const groupH = (G + D) * (0.5 + NAME_BELOW) + GROUP_GAP
    const slotY = TITLE_MOBILE + Math.max(0, (room - groupH) / 2) + G / 2
    const coinY = slotY + G * NAME_BELOW + GROUP_GAP + D / 2
    const half = G / 2 + vsGap
    // Duel prêt : la pièce centrale s'efface, les deux pièces descendent au centre de la place libre.
    const slotYReady = Math.max(slotY, TITLE_MOBILE + room / 2 - (G * NAME_BELOW - G / 2) / 2)
    return { vw, vh, D, G, wide, coinY, slotY, slotYReady, slotX: [vw / 2 - half, vw / 2 + half],
             slotXReady: [vw / 2 - half, vw / 2 + half], ring: ringLayout(vw, vh) }
  }
  const [lay, setLay] = useState(measure)
  useEffect(() => {
    const onResize = () => setLay(measure())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return lay
}

/** Titre de la page et description dessous, de la même longueur que le titre : l'espacement des
    lettres de la description est calculé d'après les largeurs réelles (polices chargées),
    recalculé au redimensionnement. */
export function PickTitle({ top, progress, reduced, hidden = false }) {
  const title = useRef(null)
  const sub = useRef(null)
  // Titre et description de la même longueur (titleFit.js).
  useLayoutEffect(() => watchTitle(() => title.current, () => sub.current), [])
  // Apparition lettre par lettre, de gauche à droite (opacité, montée de 30 px, flou 8 px → 0).
  const motion = reduced ? { dist: 0, blur: 0 } : {}
  return (
    <header className="pick-title" style={top !== undefined ? { top } : undefined} aria-hidden={hidden || undefined}>
      <h1><ScrollLetters innerRef={title} text="DUEL" progress={progress} range={[0.35, 0.7]} {...motion} /></h1>
      <p><ScrollLetters innerRef={sub} text="Sélectionnez deux joueurs à comparer." progress={progress} range={[0.55, 0.8]} {...motion} /></p>
    </header>
  )
}

/** Point d'une courbe de Bézier quadratique. */
const bez = (a, c, b, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b

/** Pièce centrale : montre le joueur k. Quand k change, elle fait un tour complet dans le sens
    de la flèche (dir) et l'image change au passage de profil, comme dans l'intro. Au survol :
    tour complet sur elle-même et, si le joueur est disponible, élévation de 6 px. Un joueur déjà
    placé reste visible, grisé et inerte (curseur interdit). */
export function CenterCoin({ k, dir, placedSet, reduced, instant, onSelect, btnRef, live = true }) {
  // Pièce cachée (une pièce revient d'un emplacement) ou mouvement réduit : le joueur change
  // sans rotation, la pièce de face.
  const [shown, rot] = useCoinTurn(k, { dir, instant, reduced })
  const [spin, startSpin] = useHoverSpin(() => players[shown].id)
  const rotateY = useTransform([rot, spin], ([a, b]) => a + b)
  const lift = useSpring(0, HOVER)
  const [floatDelay] = useState(syncFloat)   // flottement sur l'horloge commune (relais avec les candidats)
  const player = players[shown]
  const placed = placedSet.has(shown)
  const onEnter = (e) => {
    startSpin(e)
    if (e.pointerType === 'mouse' && !placed && live) lift.set(-6)
  }
  useEffect(() => { if (placed) lift.set(0) }, [placed])
  return (
    <button ref={btnRef} className="pick-coin" onClick={() => { if (!placed && live) onSelect() }}
            aria-label={`${player.nom}, ${player.club}, ${player.selection}${placed ? ' — déjà sélectionné' : ''}`}
            aria-disabled={placed} onPointerEnter={onEnter} onPointerLeave={() => lift.set(0)}>
      <m.span className="pick-hover" style={{ y: lift }}>
        <span className="pick-spin" style={{ animationDelay: `${floatDelay}s` }}>
          <Coin player={player} rotateY={rotateY} />
        </span>
      </m.span>
    </button>
  )
}

/** Pièce posée dans un emplacement du duel : clic pour la renvoyer au centre ; flotte doucement
    (comme les pièces de l'intro et de la page 3) et tourne sur elle-même au survol. */
export function SlotCoin({ player, landed, reduced, onRemove, label }) {
  const [spin, startSpin] = useHoverSpin(player.id)
  return (
    <m.button className="pick-slot-coin" onClick={onRemove} onPointerEnter={startSpin}
              aria-label={label} disabled={!landed} aria-hidden={!landed}
              initial={{ opacity: 0 }} animate={{ opacity: landed ? 1 : 0 }}
              transition={{ duration: landed && reduced ? 0.3 : 0 }}>
      <span className="pick-float">
        <m.span className="pick-hover" style={{ rotateY: spin }}>
          <Coin player={player} rotateY={reduced ? 0 : SPIN} />
        </m.span>
      </span>
    </m.button>
  )
}

// Perles du cercle intérieur de la pièce fantôme (repère 100 × 100).
const PEARLS = Array.from({ length: 64 }, (_, i) => {
  const t = (i / 64) * Math.PI * 2
  return [50 + 44 * Math.cos(t), 50 + 44 * Math.sin(t)]
})

/** Pièce fantôme d'un emplacement vide : la gravure seule, en trait or de 1 px sans aucun aplat
    (cercle extérieur, cercle intérieur perlé, trophée de l'intro), comme un dessin de graveur
    avant la frappe. Tourne lentement sur elle-même (12 s par tour) et respire ; s'efface quand
    la vraie pièce se pose dessus. */
export function Ghost({ hidden }) {
  return (
    <div className={`pick-ghost${hidden ? ' is-hidden' : ''}`} aria-hidden="true">
      <div className="pick-ghost-breathe">
        <div className="pick-ghost-turn">
          <svg className="pick-ghost-coin" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="49" />
            {PEARLS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.55" />)}
            <svg x="23" y="20" width="54" height="61" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
              {TROPHY_PATHS.map((d) => <path key={d} d={d} />)}
            </svg>
          </svg>
        </div>
      </div>
    </div>
  )
}

/** Nom en arc sous une pièce (même tracé, même police et même frappe lettre par lettre que
    l'intro), centré sur la pièce (Letters.jsx). */
export function NameCurve({ text, animate, className = 'pick-name', boxClass = '', dir, pace }) {
  if (!text) return null
  return animate === false
    ? <ArcText text={text} side="bottom" className={`${className} ${boxClass}`} />
    : <NameArc text={text} animate={animate} className={className} dir={dir} pace={pace} />
}

/** Pièce en vol entre le centre et un emplacement (dans un sens ou dans l'autre) : courbe de
    Bézier, 1,5 tour sur elle-même, 700 ms. */
export function Flight({ f, D, onDone }) {
  const t = useMotionValue(0)
  const x = useTransform(t, (v) => bez(f.from.cx, f.ctrl.x, f.to.cx, v) - D / 2)
  const y = useTransform(t, (v) => bez(f.from.cy, f.ctrl.y, f.to.cy, v) - D / 2)
  // La pièce grossit un peu à mi-course, comme soulevée vers l'écran.
  const scale = useTransform(t, (v) => f.from.scale + (f.to.scale - f.from.scale) * v + 0.18 * Math.sin(Math.PI * v))
  const rotateY = useTransform(t, (v) => f.from.yaw + (f.to.yaw - f.from.yaw) * v)
  useEffect(() => {
    const ctl = animate(t, 1, FLIGHT)
    ctl.then(onDone)
    return () => ctl.stop()
  }, [])
  return (
    <m.div className="pick-flight" aria-hidden="true"
           style={{ width: D, height: D, x, y, scale, '--d': `${D}px` }}>
      <Coin player={players[f.k]} rotateY={rotateY} />
    </m.div>
  )
}
