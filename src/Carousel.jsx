import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, m, useMotionValue, useMotionValueEvent, useReducedMotion, useSpring, useTransform, useIsPresent } from 'framer-motion'
import players, { coinUrl } from './data'
import { Coin, syncFloat, useHoverSpin } from './Coin'
import { ARC_FONT, ArcText, GlitchArc, NameArc, R_BOTTOM, ScrollLetters } from './Letters'
import { carouselVariants } from './transitions'
import { watchTitle } from './titleFit'
import { COIN_AT, FLASH_MS, READY_AT, TROPHY_PATHS, TrophyLoader, VIEW_H, VIEW_W, useIntroClock } from './Intro'
import CandidatesRing, { mod as ringMod, ringLayout } from './SoloPick'

// Intro et sélection du duel : une seule scène (depuis le 27/09/2026). L'intro (chargement, pièce
// du joueur, « BALLON D'OR 2026 » et son nom en arc) est l'état 0 d'une progression, la sélection
// l'état 1 ; un geste (molette, doigt, ↓ / ↑, Entrée, chevron) joue la transition dans un sens ou
// dans l'autre (TRANSITION), interruptible à tout moment. C'est la même pièce du début à la fin :
// la pièce centrale de la sélection, agrandie (48vmin) et centrée dans l'intro, qui rétrécit et
// se pose à sa place ; aucun relais, donc aucun saut. Timeline (progression 0 → 1) : chevron
// (0 → 0,15), « BALLON D'OR 2026 » dissous lettre par lettre depuis les extrémités (0 → 0,25),
// pièce (0,1 → 0,7), titre (0,35 → 0,7), description (0,55 → 0,8), emplacements (0,65 → 0,9),
// flèches et aide clavier (0,85 → 1) ; la sélection ne répond qu'au-delà de 0,97.
//
// Sélection des deux joueurs du duel. Une seule pièce au centre, entre ses flèches ‹ › :
// chaque flèche la fait tourner sur elle-même et elle montre un autre joueur (comme la pièce de
// l'intro). Clic sur la pièce : elle vole jusqu'au premier emplacement libre (A puis B), à gauche
// et à droite de l'écran ; clic sur une pièce placée : elle revient au centre. Les deux
// emplacements remplis, la flèche clignotante en bas de l'écran ouvre la page 2.

const N = players.length
// Changement de joueur : un tour complet, courbe de l'intro ; l'image change quand la pièce est
// vue de profil (aucun saut).
const COIN_TURN = { duration: 1.1, ease: [0.3, 0.7, 0.2, 1] }
const POWER3_IN_OUT = [0.65, 0, 0.35, 1]
const FLIGHT = { duration: 0.7, ease: POWER3_IN_OUT }
const SPIN = 540          // 1,5 tour pendant le vol
const LABELS = ['JOUEUR A', 'JOUEUR B']   // lecteurs d'écran seulement
const STATUS = ['SÉLECTIONNEZ DEUX JOUEURS', 'UN JOUEUR SÉLECTIONNÉ', 'DUEL PRÊT']
const SPLIT_MIN = 820    // px : en dessous, mobile
const DRAG_STEP = 60     // px de glissé horizontal pour changer de joueur
const WHEEL_STEP = 30    // molette horizontale : seuil d'un changement
const HOVER = { stiffness: 300, damping: 24 }
const SLIDE = { duration: 0.7, ease: [0.65, 0, 0.35, 1] }   // pièces qui se rapprochent / s'écartent
const NAME_BELOW = 0.72   // bas du nom en arc, en diamètres de la pièce sous son centre
const BOTTOM_SPACE = 80   // px laissés en bas (grand écran) à l'aide clavier et à la flèche
const TITLE_MOBILE = 110   // px réservés en haut (mobile) au titre « FAITES VOS JEUX ! »
const INTRO_VMIN = 0.48   // diamètre de la pièce dans l'intro (48vmin)
const TRANSITION = { duration: 1.6, ease: [0.33, 0, 0.25, 1] }   // intro ↔ sélection, trajet complet
const LIVE = 0.97         // au-delà, la sélection répond (clics, clavier)
const CYCLE_MS = 2000     // intro : un nominé toutes les 2 s
// Versions du site, au choix sur l'intro (← → / glisser, en boucle) ; titre en arc sous le nom
// du joueur, plus grand que le nom (MODE_FONT), en or, glitch léger au changement. Ordre :
// Les candidats · Duel · Mon classement.
export const MODES = [
  { id: 'solo', title: 'Les candidats' },
  { id: 'duel', title: 'Duel' },
  { id: 'game', title: 'Mon classement' },
]
const MODE_FONT = 36                         // taille du titre de la version (nom : ARC_FONT = 25)
const R_MODE = R_BOTTOM + 16 + MODE_FONT * 0.7   // ligne de base du titre : 16 unités sous le nom
const INTRO_LIFT = 34                        // intro : bloc remonté de 34 unités d'arc
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const seg = (p, a, b) => clamp01((p - a) / (b - a))
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

// Géométrie de l'écran : diamètre D de la pièce centrale (centre en coinY), diamètre G des pièces
// fantômes (et des pièces posées), centres des deux emplacements.
function useLayout() {
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
      const blockH = titleH + gap + G / 2 + G * NAME_BELOW
      const titleY = Math.max(24, Math.min((vh - blockH) / 2, vh - BOTTOM_SPACE - blockH))
      const coinY = titleY + titleH + gap + G / 2
      const off = Math.max(vw * 0.22, D / 2 + G / 2 + 110)   // du centre de l'écran à un emplacement
      // Duel prêt : la pièce centrale s'efface et les deux emplacements se rapprochent, « VS »
      // entre les deux (slotXReady).
      const near = G / 2 + 70
      return { vw, vh, D, G, wide, titleY, coinY, slotY: coinY, slotX: [vw / 2 - off, vw / 2 + off],
               slotXReady: [vw / 2 - near, vw / 2 + near], ring: ringLayout(vw, vh) }
    }
    // Mobile : emplacements côte à côte en haut (« VS » entre les deux), pièce dessous.
    const D = Math.round(Math.min(vw * 0.32, vh * 0.18))
    const coinY = vh * 0.6
    const vsGap = 30
    const G = Math.round(Math.min(vw * 0.5, vh * 0.29, (vw - 32) / 2 - vsGap))
    // Sous le titre de la page (TITLE_MOBILE px).
    const slotY = Math.max(G / 2 + TITLE_MOBILE, Math.min(vh * 0.22, coinY - D / 2 - 24 - G * NAME_BELOW))
    const half = G / 2 + vsGap
    return { vw, vh, D, G, wide, coinY, slotY, slotX: [vw / 2 - half, vw / 2 + half],
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
function PickTitle({ top, progress, reduced }) {
  const title = useRef(null)
  const sub = useRef(null)
  // Titre et description de la même longueur (titleFit.js).
  useLayoutEffect(() => watchTitle(() => title.current, () => sub.current), [])
  // Apparition lettre par lettre, de gauche à droite (opacité, montée de 30 px, flou 8 px → 0).
  const motion = reduced ? { dist: 0, blur: 0 } : {}
  return (
    <header className="pick-title" style={top !== undefined ? { top } : undefined}>
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
function CenterCoin({ k, dir, placedSet, reduced, instant, onSelect, btnRef, live = true }) {
  const [shown, setShown] = useState(k)
  const rot = useMotionValue(0)
  const [spin, startSpin] = useHoverSpin()
  const rotateY = useTransform([rot, spin], ([a, b]) => a + b)
  const lift = useSpring(0, HOVER)
  const [floatDelay] = useState(syncFloat)   // flottement sur l'horloge commune (relais avec les candidats)
  const target = useRef(k)
  const turning = useRef(null)
  useEffect(() => {
    if (k === target.current) return
    target.current = k
    turning.current?.stop()
    // Pièce cachée (une pièce revient d'un emplacement) ou mouvement réduit : le joueur change
    // sans rotation, la pièce de face.
    if (reduced || instant) { rot.set(Math.round(rot.get() / 360) * 360); setShown(k); return }
    // Toujours un nombre entier de tours (la pièce finit de face, même après une interruption) ;
    // l'image change quand la pièce passe de profil (90° + n × 180°).
    const from = rot.get()
    const to = Math.round(from / 360) * 360 + dir * 360
    const edge = (v) => Math.floor((v + 90) / 180)
    const e0 = edge(from)
    let swapped = false
    turning.current = animate(rot, to, {
      ...COIN_TURN,
      onUpdate: (v) => {
        if (!swapped && edge(v) !== e0) { swapped = true; setShown(target.current) }
      },
    })
    turning.current.then(() => { if (!swapped) setShown(target.current) })
  }, [k])
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
function SlotCoin({ player, landed, reduced, onRemove, label }) {
  const [spin, startSpin] = useHoverSpin()
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
function Ghost({ hidden }) {
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
function NameCurve({ text, animate, className = 'pick-name', boxClass = '', dir, pace }) {
  if (!text) return null
  return animate === false
    ? <ArcText text={text} side="bottom" className={`${className} ${boxClass}`} />
    : <NameArc text={text} animate={animate} className={className} dir={dir} pace={pace} />
}

/** Pièce en vol entre le centre et un emplacement (dans un sens ou dans l'autre) : courbe de
    Bézier, 1,5 tour sur elle-même, 700 ms. */
function Flight({ f, D, onDone }) {
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


export default function Carousel({ nav, pair, setPair, onOpen, onGame, onSolo, mode, setMode, introPlayer }) {
  // Page qui sort (AnimatePresence la garde le temps du glissement) : on retire aussitôt ses
  // écouteurs de clavier, molette et tactile, pour que la page suivante soit seule à réagir.
  const isPresent = useIsPresent()
  const lay = useLayout()
  const reduced = useReducedMotion()
  // En revenant du duel : sélection affichée d'emblée, les deux joueurs en place, chargement
  // sauté ; au premier affichage : l'intro, emplacements vides.
  const back = nav.from === 'player' || nav.from === 'final'
  // Retour de la présentation d'un joueur : le choix « Les candidats » affiché d'emblée.
  const backSolo = nav.from === 'solo'
  const settledStart = back || backSolo

  // Retour de « Mon classement » : l'intro, sans rejouer le chargement.
  const fromGame = nav.from === 'game'
  // Chargement de l'intro (trophée), puis pièce, puis chevron.
  const { t, pct, end } = useIntroClock(settledStart || fromGame, reduced)
  const elapsed = end === null ? -Infinity : t - end   // temps écoulé depuis la fin du chargement
  const loaded = elapsed >= 0
  const coinOn = elapsed >= COIN_AT
  const introReady = elapsed >= READY_AT

  // Progression intro (0) ↔ sélection (1), jouée par les gestes (goTo).
  const progress = useMotionValue(settledStart ? 1 : 0)
  const goal = useRef(settledStart ? 1 : 0)
  const playing = useRef(null)
  const [live, setLive] = useState(settledStart)       // la sélection répond (au-delà de LIVE)
  const [intro, setIntro] = useState(!settledStart)    // plus près de l'intro que de la sélection
  const [atIntro, setAtIntro] = useState(!settledStart)   // posée sur l'intro : elle fait défiler les nominés
  // Transition entièrement finie : sur Les candidats, la pièce du centre de l'anneau relaie alors
  // celle de la scène (même place, même taille).
  const [docked, setDocked] = useState(settledStart)
  const soloDest = MODES[mode].id === 'solo'   // la scène mène au choix « Les candidats »
  const settledAt = useRef(0)                  // arrivée sur la sélection (geste suivant : duel)
  useMotionValueEvent(progress, 'change', (v) => {
    setLive(v > LIVE)
    setIntro(v < 0.5)
    setAtIntro(v <= 0.001)
    setDocked(v >= 0.999)
    if (v >= 1) settledAt.current = performance.now()
  })
  const goTo = (to) => {
    if (goal.current === to || (to === 1 && !loaded)) return
    goal.current = to
    playing.current?.stop()
    const dist = Math.abs(to - progress.get())
    playing.current = animate(progress, to, reduced
      ? { duration: 0.4 * dist, ease: 'linear' }
      : { ...TRANSITION, duration: TRANSITION.duration * Math.max(0.35, dist) })
  }

  const [active, setActive] = useState(back ? pair[0] : backSolo || fromGame ? (introPlayer ?? 0) : 0)
  // Les candidats : place du centre de l'anneau (entier non borné ; joueur = ringMod) ; le joueur
  // de la pièce de la scène (active) le suit, pour qu'elle le montre en revenant vers l'intro.
  const [ringCenter, setRingCenter] = useState(back ? pair[0] : introPlayer ?? 0)
  const ringStep = (d) => {
    const n = ringCenter + d
    setRingCenter(n)
    setDir(d)
    setActive(ringMod(n))
  }
  const [dir, setDir] = useState(1)   // sens du dernier changement (flèche › : 1, ‹ : -1)
  // Emplacements A et B : { k, landed, t } ou null. landed : la pièce est arrivée ; t : ordre
  // de placement (Retour arrière retire la dernière placée).
  const [slots, setSlots] = useState(() => (back ? pair.map((k, t) => ({ k, landed: true, t })) : [null, null]))
  const [flights, setFlights] = useState([])
  const coinRef = useRef(null)
  // Intro posée : un nominé toutes les 2 s (tour complet de la pièce centrale). En revenant de la
  // sélection, l'intro montre d'abord le joueur choisi, puis reprend le défilement 2 s plus tard
  // (le carrousel s'ouvre sur le joueur affiché).
  useEffect(() => {
    if (!atIntro || !coinOn) return
    const id = setInterval(() => { setDir(1); setActive((a) => (a + 1) % N) }, CYCLE_MS)
    return () => clearInterval(id)
  }, [atIntro, coinOn])
  // Les 10 pièces se chargent pendant le chargement de l'intro.
  useEffect(() => { players.forEach((q) => { new Image().src = coinUrl(q.id) }) }, [])

  // Une pièce revient d'un emplacement : la pièce centrale est cachée pendant le vol et prend
  // aussitôt ce joueur ; la pièce en vol se pose exactement à sa place, puis la pièce centrale
  // réapparaît d'un coup (snap), sans fondu, pour un relais invisible.
  const returning = flights.some((f) => f.dir === 'out')
  const [snap, setSnap] = useState(false)
  const placed = new Set(slots.filter(Boolean).map((s) => s.k))
  const landed = slots.filter((s) => s?.landed).length
  const ready = landed === 2

  useEffect(() => { if (ready) setPair([slots[0].k, slots[1].k]) }, [ready, slots[0]?.k, slots[1]?.k])

  // Pendant qu'une pièce revient au centre, le joueur central est celui de cette pièce : on ne
  // change pas de joueur, on n'en place ni n'en retire d'autre, jusqu'à ce qu'elle soit posée.
  // Ordre de défilement : les joueurs disponibles dans l'ordre habituel, puis ceux déjà placés
  // (grisés) en dernière position.
  const order = (taken) => {
    const all = players.map((_, k) => k)
    return [...all.filter((k) => !taken.has(k)), ...all.filter((k) => taken.has(k))]
  }
  const turn = (d) => {
    if (returning) return
    setDir(d)
    setActive((a) => {
      const o = order(placed)
      const i = o.indexOf(a)
      return o[(i + d + o.length) % o.length]
    })
  }
  const focusCoin = () => requestAnimationFrame(() => coinRef.current?.focus({ preventScroll: true }))

  const center = { cx: lay.vw / 2, cy: lay.coinY, scale: 1, yaw: 0 }
  // Emplacement i : la pièce en vol s'y superpose exactement à la pièce fantôme (G / D).
  const slotPlace = (i) => ({ cx: (ready ? lay.slotXReady : lay.slotX)[i], cy: lay.slotY, scale: lay.G / lay.D, yaw: 0 })
  // Point de contrôle de la courbe : grand écran, au-dessus du trajet ; mobile (emplacements en
  // haut), écarté vers l'extérieur du côté de l'emplacement.
  const ctrlFor = (a, b, i) => (lay.wide
    ? { x: (a.cx + b.cx) / 2, y: Math.min(a.cy, b.cy) - lay.D * 0.8 }
    : { x: (a.cx + b.cx) / 2 + (i ? 1 : -1) * lay.D, y: (a.cy + b.cy) / 2 })

  /** Place le joueur k dans le premier emplacement libre (A puis B). Mouvement réduit : la
      pièce se fond dans son emplacement, sans vol ni rotation. */
  const select = (k) => {
    if (returning || placed.has(k)) return
    const i = slots.findIndex((s) => !s)
    if (i < 0) return
    const t = performance.now()
    // Un emplacement reste libre : la pièce centrale passe aussitôt au joueur disponible suivant
    // (le joueur placé, grisé, part en dernière position du défilement).
    if (slots.filter((s) => !s).length > 1) {
      const taken = new Set([...placed, k])
      const next = players.map((_, n) => (k + 1 + n) % N).find((n) => !taken.has(n))
      if (next !== undefined) { setDir(1); setActive(next) }
    }
    if (reduced) {
      setSlots((s) => s.map((x, j) => (j === i ? { k, landed: true, t } : x)))
      return
    }
    const to = { ...slotPlace(i), yaw: SPIN }
    setSlots((s) => s.map((x, j) => (j === i ? { k, landed: false, t } : x)))
    setFlights((fl) => [...fl, { id: `${k}-${t}`, k, i, dir: 'in', from: center, to, ctrl: ctrlFor(center, to, i) }])
  }

  /** Renvoie la pièce de l'emplacement i au centre (animation inverse). */
  const unselect = (i) => {
    const s = slots[i]
    if (returning || !s?.landed) return
    if (reduced) {
      setActive(s.k)
      setSlots((sl) => sl.map((x, j) => (j === i ? null : x)))
      return
    }
    const from = { ...slotPlace(i), yaw: SPIN }
    const to = center
    setActive(s.k)   // la pièce centrale, cachée pendant le vol, prend ce joueur sans tourner
    setSlots((sl) => sl.map((x, j) => (j === i ? { ...x, landed: false } : x)))
    setFlights((fl) => [...fl, { id: `${s.k}-${performance.now()}`, k: s.k, i, dir: 'out', from, to, ctrl: ctrlFor(from, to, i) }])
  }

  /** Retire le dernier joueur placé. */
  const unselectLast = () => {
    const last = slots.reduce((best, s, i) => (s?.landed && (best < 0 || s.t > slots[best].t) ? i : best), -1)
    if (last >= 0) unselect(last)
  }

  const endFlight = (f) => {
    if (f.dir === 'out') {
      setSnap(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setSnap(false)))
    }
    setFlights((fl) => fl.filter((x) => x.id !== f.id))
    setSlots((sl) => sl.map((x, j) => (j !== f.i || x?.k !== f.k ? x
      : f.dir === 'in' ? { ...x, landed: true } : null)))
  }

  // Gestes verticaux (molette, doigt, ↓ / ↑) : vers le bas, intro → sélection, puis, depuis la
  // sélection posée et le duel prêt, la page du duel ; vers le haut, retour à l'intro (la
  // transition se rembobine, même en cours de route).
  const changeMode = (d) => setMode((m) => (m + d + MODES.length) % MODES.length)
  // Entrer dans la version choisie : Duel → la transition vers la sélection ; Présentation et
  // Mon classement → leur page, avec le joueur affiché sur la pièce.
  const enter = () => {
    const id = MODES[mode].id
    if (id === 'duel') goTo(1)
    else if (id === 'solo') { setRingCenter(active); goTo(1) }   // même transition, vers les candidats
    else if (loaded) onGame(active)
  }
  const down = () => {
    if (goal.current === 0) enter()
    else if (soloDest) { if (progress.get() >= 1 && performance.now() - settledAt.current > 300) onSolo(active) }
    else if (ready && progress.get() >= 1 && performance.now() - settledAt.current > 300) onOpen({ autoplay: true })
  }
  const up = () => goTo(0)

  // Clavier : ↓ / Espace / Entrée (intro) vers la sélection, ↑ vers l'intro. Sélection : ← →
  // changent de joueur, Entrée place le joueur affiché (duel prêt : lance le duel), Retour arrière
  // ou Échap retirent le dernier joueur placé (un second appui retire le premier), ↓ lance le duel
  // quand il est prêt. Entrée sur un bouton qui a le focus garde son action propre, sauf duel
  // prêt. Duel prêt, la pièce centrale est effacée : ← → sont sans effet.
  useEffect(() => {
    if (!isPresent) return   // page en train de sortir (glissement) : ses gestes ne comptent plus
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); down(); return }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); up(); return }
      if (goal.current === 0) {
        if (e.key === 'Enter') { e.preventDefault(); enter() }
        else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && progress.get() < 0.02) {
          e.preventDefault()
          changeMode(e.key === 'ArrowRight' ? 1 : -1)
        }
        return
      }
      if (!live) return
      // Les candidats : ← → changent de joueur, Entrée ouvre sa présentation, Échap revient à l'intro.
      if (soloDest) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); ringStep(e.key === 'ArrowRight' ? 1 : -1) }
        else if (e.key === 'Enter') { e.preventDefault(); onSolo(active) }
        else if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); up() }
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (!ready) turn(e.key === 'ArrowRight' ? 1 : -1)
      } else if (e.key === 'Enter') {
        // Duel prêt : Entrée le lance, quel que soit l'élément qui a le focus (la pièce centrale
        // ou une flèche, cachées, peuvent l'avoir gardé).
        if (ready) { e.preventDefault(); onOpen(); return }
        if (e.target.closest?.('button')) return
        e.preventDefault()
        select(active)
      } else if (e.key === 'Backspace' || e.key === 'Escape') {
        e.preventDefault()
        unselectLast()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Molette : un geste = une action (les événements d'inertie qui suivent sont ignorés ; un
  // nouveau geste commence après 150 ms de calme). Verticale → down / up ; horizontale (sélection)
  // → joueur suivant / précédent.
  const wheel = useRef({ last: 0, acc: 0, done: false })
  const wheelX = useRef({ acc: 0, until: 0 })
  const handlers = useRef({})
  handlers.current = { down, up, turn: soloDest ? ringStep : turn, live, ready: soloDest ? false : ready, changeMode,
                       atIntro: goal.current === 0 && progress.get() < 0.02 }
  useEffect(() => {
    if (!isPresent) return
    const onWheel = (e) => {
      const now = performance.now()
      const h = handlers.current
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const w = wheelX.current
        if (now < w.until || !(h.atIntro || (h.live && !h.ready))) return
        w.acc += e.deltaX
        if (Math.abs(w.acc) > WHEEL_STEP) {
          if (h.atIntro) h.changeMode(Math.sign(w.acc)); else h.turn(Math.sign(w.acc))
          w.acc = 0; w.until = now + (h.atIntro ? 700 : 450)
        }
        return
      }
      const w = wheel.current
      if (now - w.last > 150) { w.acc = 0; w.done = false }
      w.last = now
      if (w.done) return
      w.acc += e.deltaY
      if (w.acc > 25) { w.done = true; h.down() }
      else if (w.acc < -25) { w.done = true; h.up() }
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [isPresent])

  // Glisser horizontal (souris ou doigt) : un joueur tous les DRAG_STEP px ; le clic qui termine
  // un glissé ne sélectionne rien.
  const drag = useRef(null)
  const onPointerDown = (e) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, moved: false }
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    // Intro : un glissé horizontal change de version (une seule par glissé).
    if (goal.current === 0 && progress.get() < 0.02) {
      const dx = e.clientX - d.x
      if (!d.moved && Math.abs(dx) >= DRAG_STEP) { changeMode(dx < 0 ? 1 : -1); d.moved = true }
      return
    }
    if ((ready && !soloDest) || !live) return
    const dx = e.clientX - d.x
    if (Math.abs(dx) < DRAG_STEP) return
    ;(soloDest ? ringStep : turn)(dx < 0 ? 1 : -1)
    d.x = e.clientX
    d.moved = true
  }
  const onPointerEnd = () => {
    if (!drag.current?.moved) drag.current = null
  }
  const onClickCapture = (e) => {
    if (drag.current?.moved) { e.stopPropagation(); e.preventDefault() }
    drag.current = null
  }

  // Tactile : glisser verticalement vers le haut → down, vers le bas → up (comme la molette).
  const touch = useRef(null)
  const onTouchStart = (e) => {
    const t = e.touches[0]
    touch.current = t ? { x: t.clientX, y: t.clientY } : null
  }
  const onTouchEnd = (e) => {
    const t = touch.current
    const c = e.changedTouches[0]
    touch.current = null
    if (!t || !c || Math.abs(c.clientY - t.y) < Math.abs(c.clientX - t.x)) return
    if (c.clientY - t.y < -60) down()
    else if (c.clientY - t.y > 60) up()
  }

  // ——— Timeline (progression 0 → 1) ———
  // Pièce, halo, « BALLON D'OR 2026 » et nom : un seul bloc, qui passe de 48vmin au centre de
  // l'écran à la taille et à la place de la pièce de la sélection (échelle calculée : l'arrivée
  // est exactement la pièce du carrousel). Mouvement réduit : fondu enchaîné entre les deux états.
  const S0 = (INTRO_VMIN * Math.min(lay.vw, lay.vh)) / lay.D
  // Bloc de l'intro (« BALLON D'OR 2026 » au-dessus, nom et titre de la version dessous) remonté
  // de INTRO_LIFT unités d'arc (1 unité = rayon de la pièce / 100), loin du chevron.
  const Y0 = lay.vh / 2 - lay.coinY - INTRO_LIFT * (INTRO_VMIN * Math.min(lay.vw, lay.vh)) / 200
  const heroK = (p) => (reduced ? (p < 0.5 ? 0 : 1) : easeInOut(seg(p, 0.1, 0.7)))
  // Arrivée : la pièce de la sélection du duel (échelle 1, à sa place) ou celle du centre de
  // l'anneau des candidats (sa taille et sa hauteur).
  const endScale = soloDest ? lay.ring.D / lay.D : 1
  const endY = soloDest ? lay.ring.cy - lay.coinY : 0
  const heroScale = useTransform(progress, (p) => S0 + (endScale - S0) * heroK(p))
  const heroY = useTransform(progress, (p) => Y0 + (endY - Y0) * heroK(p))
  const heroOpacity = useTransform(progress, (p) => (reduced ? Math.abs(2 * p - 1) : 1))
  const chevronOpacity = useTransform(progress, (p) => 1 - seg(p, 0, 0.15))
  const modeOpacity = useTransform(progress, (p) => 1 - seg(p, 0, 0.2))
  const slotsOpacity = useTransform(progress, (p) => seg(p, 0.65, 0.9))
  const slotScale = useTransform(progress, (p) => (reduced ? 1 : 0.9 + 0.1 * seg(p, 0.65, 0.9)))
  const lateOpacity = useTransform(progress, (p) => seg(p, 0.85, 1))
  const origin = `${lay.vw / 2}px ${lay.coinY}px`
  const coinBox = { left: lay.vw / 2 - lay.D / 2, top: lay.coinY - lay.D / 2, width: lay.D, height: lay.D }

  const current = players[active]
  const isPlaced = placed.has(active)
  // Dans l'intro, la pièce centrale est toujours pleine, même si son joueur est placé ou le duel
  // prêt (dans la sélection, elle serait grisée ou effacée).
  const inSelect = !intro && !soloDest

  return (
    <m.main className={`carousel stage${live ? ' is-live' : ''}${introReady ? ' is-intro-ready' : ''}${intro && coinOn ? ' is-intro' : ''}`}
            custom={nav} variants={carouselVariants}
            initial="hidden" animate="shown" exit="exit" style={{ '--d': `${lay.D}px` }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onClickCapture={onClickCapture}
            onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Chargement de l'intro : trophée qui se construit, puis s'efface devant la pièce. */}
      {!settledStart && !fromGame && <TrophyLoader pct={pct} done={loaded} gone={elapsed >= FLASH_MS} />}

      {/* Les candidats : titre, anneau des pièces, flèches et aide (SoloPick.jsx). */}
      {soloDest && (
        <CandidatesRing progress={progress} vw={lay.vw} ring={lay.ring} center={ringCenter} docked={docked}
                        reduced={reduced} onStep={ringStep} onPick={() => onSolo(active)} />
      )}

      {/* Titre de la sélection, frappé lettre par lettre. */}
      {!soloDest && <>
      <PickTitle top={lay.titleY} progress={progress} reduced={reduced} />

      {/* Emplacements du duel : vides, une pièce fantôme (la gravure seule, avant la frappe) ;
          remplis, la vraie pièce, qui flotte, et le nom du joueur dessous. */}
      <m.section className="stage-layer" aria-label="Duel" style={{ opacity: slotsOpacity }}>
        {slots.map((s, i) => {
          const name = s?.landed ? players[s.k].nom : null
          return (
            <m.div key={i} className={`pick-slot${s?.landed ? ' is-filled' : ''}`} role="group"
                   aria-label={`${LABELS[i]} : ${name ?? 'vide'}`}
                   initial={false} animate={{ x: ready ? lay.slotXReady[i] - lay.slotX[i] : 0 }}
                   transition={reduced ? { duration: 0 } : SLIDE}
                   style={{ left: lay.slotX[i] - lay.G / 2, top: lay.slotY - lay.G / 2, scale: slotScale,
                            width: lay.G, height: lay.G, '--d': `${lay.G}px` }}>
              <Ghost hidden={!!s?.landed} />
              {s?.landed && <span key={`flash-${s.k}`} className={`pick-flash${reduced ? '' : ' is-on'}`} aria-hidden="true" />}
              {/* Montée dès le départ du vol, invisible jusqu'à l'arrivée : ses faces sont déjà
                  décodées quand la pièce en vol lui passe le relais. */}
              {s && (
                <SlotCoin key={s.k} player={players[s.k]} landed={s.landed} reduced={reduced}
                          onRemove={() => { unselect(i); focusCoin() }}
                          label={`Retirer ${players[s.k].nom} de l'emplacement ${LABELS[i].slice(-1)}`} />
              )}
              <NameCurve text={name ?? ''} animate={!reduced} />
              {/* Emplacement vide : « JOUEUR 1 » / « JOUEUR 2 » en arc sous le cercle (même tracé
                  et même police que les noms), dans le doré atténué du pointillé ; s'efface quand un
                  joueur est placé. */}
              <NameCurve text={`Joueur ${i + 1}`} animate={false}
                         className="pick-slot-label" boxClass={`pick-slot-label-arc${s ? ' is-hidden' : ''}`} />
            </m.div>
          )
        })}
        {/* « VS » entre les deux emplacements : toujours sur mobile ; sur grand écran, une fois
            le duel prêt (avant, la pièce centrale est entre les deux). */}
        <m.span className="pick-vs" style={{ top: lay.slotY }} aria-hidden="true"
                initial={false} animate={{ opacity: !lay.wide || ready ? 1 : 0 }}
                transition={{ duration: 0.4, delay: ready && lay.wide ? 0.35 : 0 }}>VS</m.span>
      </m.section>
      </>}

      {/* Rien sous les deux pièces : l'état n'est annoncé qu'aux lecteurs d'écran. */}
      <p className="sr-only" aria-live="polite">{intro ? `${current.nom} · ${MODES[mode].title}` : soloDest ? current.nom : STATUS[landed]}</p>
      {intro && <h1 className="sr-only">Ballon d’Or 2026</h1>}

      {/* Pièce centrale, « BALLON D'OR 2026 » au-dessus (intro), nom en arc dessous : un seul
          bloc, agrandi et centré dans l'intro, à sa place dans la sélection. Duel prêt : la pièce
          s'efface (avec son nom et ses flèches) pendant que les deux pièces sélectionnées se
          rapprochent ; elle revient dès qu'un joueur est retiré. */}
      <m.div className="stage-layer stage-hero"
             style={{ scale: heroScale, y: heroY, opacity: heroOpacity, transformOrigin: origin }}>
        <div className={`stage-hero-in${coinOn ? ' is-on' : ''}`} style={{ transformOrigin: origin }}>
          <div className="stage-arc-top" style={coinBox}>
            <ScrollLetters arc="top" text="BALLON D’OR 2026" accentFrom={12} className="arc-title"
                           progress={progress} range={[0, 0.25]} mode="out" order="edges"
                           dist={reduced ? 0 : 14} blur={reduced ? 0 : 8} />
          </div>
          <m.div className={`pick-item is-active${inSelect && isPlaced ? ' is-placed' : ''}${inSelect && ready ? ' is-gone' : ''}`}
                 initial={false}
                 animate={{ opacity: soloDest ? (docked ? 0 : 1) : !inSelect ? 1 : ready || returning ? 0 : isPlaced ? 0.3 : 1,
                            scale: inSelect && ready ? 0.8 : 1 }}
                 transition={snap || soloDest ? { duration: 0 } : { duration: 0.4 }} aria-hidden={(inSelect && ready) || (soloDest && docked)}
                 style={coinBox}>
            <CenterCoin k={active} dir={dir} placedSet={placed} reduced={reduced} instant={returning || (soloDest && docked)} live={live && !soloDest}
                        btnRef={coinRef} onSelect={() => select(active)} />
          </m.div>
          {/* Titre de la version (intro), en arc sous le nom : même taille, en or ; s'efface au
              départ vers la sélection. */}
          <m.div className="stage-arc-mode" aria-hidden="true" style={{ ...coinBox, opacity: modeOpacity }}>
            <GlitchArc text={coinOn ? MODES[mode].title : ''} animate={!reduced} radius={R_MODE}
                       size={MODE_FONT} className="arc-mode" />
          </m.div>
          <m.div className="pick-active" aria-hidden="true"
                 initial={false} animate={{ opacity: inSelect && ready ? 0 : 1 }} transition={{ duration: 0.3 }}
                 style={coinBox}>
            {/* Nom : ses lettres bougent vers la pièce (dir < 0), jamais vers le titre de la version. */}
        {/* Le nom change au rythme de la pièce (comme la sélection du duel, et les candidats). */}
        <NameCurve text={coinOn ? current.nom : ''} animate={!reduced} dir={-0.6} />
          </m.div>
        </div>
      </m.div>

      {/* Fin de la transition : flèches ‹ › de part et d'autre de la pièce, aide clavier (masquée
          sur mobile), puis, le duel prêt, la flèche clignotante vers le duel. */}
      {!soloDest && <m.div className="stage-layer" style={{ opacity: lateOpacity }}>
        {[-1, 1].map((d) => (
          <button key={d} className={`pick-arrow${ready ? ' is-gone' : ''}`} onClick={() => turn(d)}
                  aria-label={d > 0 ? 'Joueur suivant' : 'Joueur précédent'} tabIndex={ready || !live ? -1 : 0}
                  style={{ left: lay.vw / 2 + d * (lay.D / 2 + 40), top: lay.coinY }}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {d > 0 ? <path d="M9 5l7 7-7 7" /> : <path d="M15 5l-7 7 7 7" />}
            </svg>
          </button>
        ))}
        <p className={`pick-help${ready ? ' is-hidden' : ''}`} aria-hidden="true">
          ← → NAVIGUER · ↵ SÉLECTIONNER · ESC RETIRER
        </p>
        <button className={`intro-down pick-go${ready ? ' is-on' : ''}`} onClick={() => onOpen()}
                disabled={!ready || !live} aria-hidden={!ready} aria-label="Lancer le duel">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7" /></svg>
        </button>
      </m.div>}

      {/* Intro : flèche clignotante en bas, qui lance la transition (clic aussi). Au-dessus, les
          deux entrées : comparer deux joueurs (la transition) ou le mode « Mon classement ». */}
      <m.div className="stage-layer stage-intro-down" style={{ opacity: chevronOpacity }}>
        {/* Versions voisines, sur les bords, à hauteur de la pièce : ‹ précédente · suivante ›. */}
        {[-1, 1].map((d) => (
          <button key={d} className={`stage-mode-side is-${d < 0 ? 'left' : 'right'}`} onClick={() => changeMode(d)}
                  tabIndex={intro ? 0 : -1} aria-label={`Version : ${MODES[(mode + d + MODES.length) % MODES.length].title}`}>
            {d < 0 && <span aria-hidden="true">‹ </span>}
            {MODES[(mode + d + MODES.length) % MODES.length].title}
            {d > 0 && <span aria-hidden="true"> ›</span>}
          </button>
        ))}
        <button className="intro-down" onClick={enter} tabIndex={intro ? 0 : -1}
                aria-hidden={!intro} aria-label={`Entrer : ${MODES[mode].title}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7" /></svg>
        </button>
      </m.div>

      {flights.map((f) => (
        <Flight key={f.id} f={f} D={lay.D} onDone={() => endFlight(f)} />
      ))}
    </m.main>
  )
}
