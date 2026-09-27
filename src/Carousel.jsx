import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, m, useMotionValue, useReducedMotion, useSpring, useTransform, useIsPresent } from 'framer-motion'
import players from './data'
import { Coin, useHoverSpin } from './Coin'
import { ARC_FONT, BOTTOM_ARC, NameArc } from './IntroCoin'
import { SLIDE as PAGE_SLIDE, carouselVariants } from './transitions'
import { TROPHY_PATHS, VIEW_H, VIEW_W } from './Intro'

// Page 1 : sélection des deux joueurs du duel. Une seule pièce au centre, entre ses flèches ‹ › :
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
               slotXReady: [vw / 2 - near, vw / 2 + near] }
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
             slotXReady: [vw / 2 - half, vw / 2 + half] }
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
function PickTitle({ top }) {
  const title = useRef(null)
  const sub = useRef(null)
  useLayoutEffect(() => {
    const fit = () => {
      const h = title.current
      const p = sub.current
      if (!h || !p) return
      // Largeur visible du titre (sans l'espacement après sa dernière lettre).
      const hs = parseFloat(getComputedStyle(h).letterSpacing) || 0
      const target = h.getBoundingClientRect().width - hs
      p.style.letterSpacing = '0px'
      const natural = p.getBoundingClientRect().width
      const n = p.textContent.length
      const ls = n > 1 ? (target - natural) / (n - 1) : 0
      p.style.letterSpacing = `${ls}px`
      p.style.marginRight = `${-ls}px`   // pas d'espacement après la dernière lettre : centrée
    }
    fit()
    document.fonts?.ready.then(fit)
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return (
    <header className="pick-title" style={top !== undefined ? { top } : undefined}>
      <h1><span ref={title}>FAITES VOS JEUX !</span></h1>
      <p><span ref={sub}>Sélectionnez deux joueurs à comparer.</span></p>
    </header>
  )
}

/** Point d'une courbe de Bézier quadratique. */
const bez = (a, c, b, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b

/** Pièce centrale : montre le joueur k. Quand k change, elle fait un tour complet dans le sens
    de la flèche (dir) et l'image change au passage de profil, comme dans l'intro. Au survol :
    tour complet sur elle-même et, si le joueur est disponible, élévation de 6 px. Un joueur déjà
    placé reste visible, grisé et inerte (curseur interdit). */
function CenterCoin({ k, dir, placedSet, reduced, instant, onSelect, btnRef }) {
  const [shown, setShown] = useState(k)
  const rot = useMotionValue(0)
  const [spin, startSpin] = useHoverSpin()
  const rotateY = useTransform([rot, spin], ([a, b]) => a + b)
  const lift = useSpring(0, HOVER)
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
    if (e.pointerType === 'mouse' && !placed) lift.set(-6)
  }
  useEffect(() => { if (placed) lift.set(0) }, [placed])
  return (
    <button ref={btnRef} className="pick-coin" onClick={() => { if (!placed) onSelect() }}
            aria-label={`${player.nom}, ${player.club}, ${player.selection}${placed ? ' — déjà sélectionné' : ''}`}
            aria-disabled={placed} onPointerEnter={onEnter} onPointerLeave={() => lift.set(0)}>
      <m.span className="pick-hover" style={{ y: lift }}>
        <span className="pick-spin">
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
    l'intro) ; le SVG est centré sur la pièce et 1,8 fois plus grand qu'elle. */
function NameCurve({ id, text, animate }) {
  return (
    <svg className="pick-curve" viewBox="-180 -180 360 360" aria-hidden="true">
      <path id={id} d={BOTTOM_ARC} />
      {text && <NameArc text={text} href={`#${id}`} fontSize={ARC_FONT} animate={animate} className="pick-name" />}
    </svg>
  )
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

export default function Carousel({ nav, pair, setPair, onOpen, onIntro }) {
  // Page qui sort (AnimatePresence la garde le temps du glissement) : on retire aussitôt ses
  // écouteurs de clavier, molette et tactile, pour que la page suivante soit seule à réagir.
  const isPresent = useIsPresent()
  const lay = useLayout()
  const reduced = useReducedMotion()
  // En revenant du duel, les deux joueurs sont déjà en place ; depuis l'intro, tout est vide.
  const back = nav.from === 'player' || nav.from === 'final'
  const [active, setActive] = useState(back ? pair[0] : 0)
  const [dir, setDir] = useState(1)   // sens du dernier changement (flèche › : 1, ‹ : -1)
  // Emplacements A et B : { k, landed, t } ou null. landed : la pièce est arrivée ; t : ordre
  // de placement (Retour arrière retire la dernière placée).
  const [slots, setSlots] = useState(() => (back ? pair.map((k, t) => ({ k, landed: true, t })) : [null, null]))
  const [flights, setFlights] = useState([])
  const coinRef = useRef(null)
  // Arrivée sur la page (depuis l'intro ou le duel) : la page glisse d'abord, vide (fond noir),
  // puis ses éléments apparaissent dans l'ordre (titre, emplacements, pièce, nom, flèches).
  const [revealed, setRevealed] = useState(!!reduced)
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), reduced ? 0 : PAGE_SLIDE.duration * 1000)
    return () => clearTimeout(t)
  }, [])
  // Nom de la pièce centrale : frappé une fois la pièce apparue.
  const [nameOn, setNameOn] = useState(!!reduced)
  useEffect(() => {
    if (!revealed) return
    const t = setTimeout(() => setNameOn(true), reduced ? 0 : 350)
    return () => clearTimeout(t)
  }, [revealed])
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
  const turn = (d) => {
    if (returning) return
    setDir(d)
    setActive((a) => (a + d + N) % N)
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

  // Clavier : ← → changent de joueur, Entrée place le joueur affiché (duel prêt : lance le duel),
  // Retour arrière ou Échap retirent le dernier joueur placé (un second appui retire le premier) ;
  // ↑ revient à l'intro, ↓ lance le duel quand il est prêt. Entrée sur un bouton qui a le focus
  // garde son action propre, sauf duel prêt. Duel prêt, la pièce centrale est effacée : ← → sont
  // sans effet.
  useEffect(() => {
    if (!isPresent) return   // page en train de sortir (glissement) : ses gestes ne comptent plus
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
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
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        onIntro()
      } else if (e.key === 'ArrowDown' && ready) {
        e.preventDefault()
        onOpen({ autoplay: true })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Molette : horizontale → joueur suivant / précédent ; verticale → intro (haut) ou duel (bas,
  // s'il est prêt).
  const cooldown = useRef(performance.now() + 800) // ignore l’inertie au retour
  const wheelX = useRef({ acc: 0, until: 0 })
  useEffect(() => {
    if (!isPresent) return   // page en train de sortir (glissement) : ses gestes ne comptent plus
    const onWheel = (e) => {
      const now = performance.now()
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const w = wheelX.current
        if (ready || now < w.until) return
        w.acc += e.deltaX
        if (Math.abs(w.acc) > WHEEL_STEP) { turn(Math.sign(w.acc)); w.acc = 0; w.until = now + 450 }
        return
      }
      if (now < cooldown.current) return
      if (e.deltaY > 25 && ready) { onOpen({ autoplay: true }); cooldown.current = now + 1000 }
      else if (e.deltaY < -25) { onIntro(); cooldown.current = now + 1000 }
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [onOpen, onIntro, ready, isPresent])

  // Glisser horizontal (souris ou doigt) : un joueur tous les DRAG_STEP px ; le clic qui termine
  // un glissé ne sélectionne rien.
  const drag = useRef(null)
  const onPointerDown = (e) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, moved: false }
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d || ready) return
    const dx = e.clientX - d.x
    if (Math.abs(dx) < DRAG_STEP) return
    turn(dx < 0 ? 1 : -1)
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

  // Tactile : glisser verticalement vers le haut → duel (s'il est prêt), vers le bas → intro.
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
    if (c.clientY - t.y < -60 && ready) onOpen({ autoplay: true })
    else if (c.clientY - t.y > 60) onIntro()
  }

  const current = players[active]
  const isPlaced = placed.has(active)

  return (
    <m.main className={`carousel${revealed ? ' is-revealed' : ''}`} custom={nav} variants={carouselVariants}
            initial="hidden" animate="shown" exit="exit" style={{ '--d': `${lay.D}px` }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onClickCapture={onClickCapture}
            onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Titre de la page, dans la police des noms des joueurs. */}
      <PickTitle top={lay.titleY} />

      {/* Emplacements du duel : vides, une pièce fantôme (la gravure seule, avant la frappe) ;
          remplis, la vraie pièce, qui flotte, et le nom du joueur dessous. */}
      <section className="pick-in pick-in-slots" aria-label="Duel">
        {slots.map((s, i) => {
          const name = s?.landed ? players[s.k].nom : null
          return (
            <m.div key={i} className={`pick-slot${s?.landed ? ' is-filled' : ''}`} role="group"
                   aria-label={`${LABELS[i]} : ${name ?? 'vide'}`}
                   initial={false} animate={{ x: ready ? lay.slotXReady[i] - lay.slotX[i] : 0 }}
                   transition={reduced ? { duration: 0 } : SLIDE}
                   style={{ left: lay.slotX[i] - lay.G / 2, top: lay.slotY - lay.G / 2,
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
              <NameCurve id={`pick-arc-${i}`} text={nameOn ? name ?? '' : ''} animate={!reduced} />
            </m.div>
          )
        })}
        {/* « VS » entre les deux emplacements : toujours sur mobile ; sur grand écran, une fois
            le duel prêt (avant, la pièce centrale est entre les deux). */}
        <m.span className="pick-vs" style={{ top: lay.slotY }} aria-hidden="true"
                initial={false} animate={{ opacity: !lay.wide || ready ? 1 : 0 }}
                transition={{ duration: 0.4, delay: ready && lay.wide ? 0.35 : 0 }}>VS</m.span>
      </section>

      {/* Rien sous les deux pièces : l'état n'est annoncé qu'aux lecteurs d'écran. */}
      <p className="sr-only" aria-live="polite">{STATUS[landed]}</p>

      <div className="pick-in pick-in-coin" style={{ transformOrigin: `50% ${lay.coinY}px` }}>
      {/* Pièce centrale, nom en arc dessous (frappé lettre par lettre, comme dans l'intro).
          Duel prêt : elle s'efface (avec son nom et ses flèches) pendant que les deux pièces
          sélectionnées se rapprochent ; elle revient dès qu'un joueur est retiré. */}
      <m.div className={`pick-item is-active${isPlaced ? ' is-placed' : ''}${ready ? ' is-gone' : ''}`}
             initial={false}
             animate={{ opacity: ready || returning ? 0 : isPlaced ? 0.3 : 1, scale: ready ? 0.8 : 1 }}
             transition={snap ? { duration: 0 } : { duration: 0.4 }} aria-hidden={ready}
             style={{ left: lay.vw / 2 - lay.D / 2, top: lay.coinY - lay.D / 2, width: lay.D, height: lay.D }}>
        <CenterCoin k={active} dir={dir} placedSet={placed} reduced={reduced} instant={returning}
                    btnRef={coinRef} onSelect={() => select(active)} />
      </m.div>
      <m.div className="pick-active" aria-hidden="true"
             initial={false} animate={{ opacity: ready ? 0 : 1 }} transition={{ duration: 0.3 }}
             style={{ left: lay.vw / 2 - lay.D / 2, top: lay.coinY - lay.D / 2, width: lay.D, height: lay.D }}>
        <NameCurve id="pick-arc-active" text={nameOn ? current.nom : ''} animate={!reduced} />
      </m.div>

      {/* ‹ à gauche et › à droite de la pièce, à mi-hauteur. */}
      {[-1, 1].map((d) => (
        <button key={d} className={`pick-arrow${ready ? ' is-gone' : ''}`} onClick={() => turn(d)}
                aria-label={d > 0 ? 'Joueur suivant' : 'Joueur précédent'} tabIndex={ready ? -1 : 0}
                style={{ left: lay.vw / 2 + d * (lay.D / 2 + 40), top: lay.coinY }}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {d > 0 ? <path d="M9 5l7 7-7 7" /> : <path d="M15 5l-7 7 7 7" />}
          </svg>
        </button>
      ))}
      </div>

      {/* Bas de l'écran : l'aide clavier (masquée sur mobile), puis, le duel prêt, la flèche
          clignotante de l'intro et de la page 2 (vers le duel). */}
      <p className={`pick-help${ready ? ' is-hidden' : ''}`} aria-hidden="true">
        ← → NAVIGUER · ENTRÉE SÉLECTIONNER · RETOUR RETIRER
      </p>
      <button className={`intro-down pick-go${ready ? ' is-on' : ''}`} onClick={() => onOpen()}
              disabled={!ready} aria-hidden={!ready} aria-label="Lancer le duel">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7" /></svg>
      </button>

      {flights.map((f) => (
        <Flight key={f.id} f={f} D={lay.D} onDone={() => endFlight(f)} />
      ))}
    </m.main>
  )
}
