import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, m, useMotionValue, useTransform } from 'framer-motion'
import players, { coinUrl } from './data'
import { carouselVariants } from './transitions'

// Page 1 : deux listes indépendantes de pièces d'or. Au centre, les deux pièces du duel ; chacune a sa
// propre file des 9 autres joueurs (assombris), qui part vers son bord de l'écran (à gauche
// pour la carte de gauche, à droite pour celle de droite). Faire défiler une file ne touche
// jamais l'autre.
//
// Une file : [carte du duel, place 1, place 2, … place 9], place 1 = voisine immédiate.
// Flèche vers le centre : la place 1 devient la carte du duel et l'ancienne part en dernière
// place, au bout de la file ; flèche vers le bord : l'inverse. Le joueur choisi en face est
// sauté (jamais le même joueur des deux côtés du duel).

const N = players.length
// Pièces : disques de diamètre D. THICK : épaisseur (en fraction du diamètre), LAYERS :
// nombre de disques empilés qui forment la tranche.
// Anneau façon Ciao Energy : écart angulaire entre deux pièces d'une file, remontée des
// pièces vers le fond (en diamètres), inclinaisons fixes par joueur (degrés).
const ARC_STEP = 0.38
const BACK = 3   // pièces toujours visibles de chaque côté du duel (6 en tout)
const ARC_RISE = 0.28
const ARC_TILT = 0.22
const TILTS = [-9, 6, -4, 10, -7, 5, -11, 8, -5, 7]
const THICK = 0.08
const LAYERS = 14
// Page 1 : décalage vertical des pièces (fraction de la hauteur d'écran ; négatif = plus haut).
const DROP = -0.04
const SPLIT_MIN = 820   // px : au-delà, grand écran
// Nom affiché quand le nom de famille ne convient pas.
const SHORT_NAMES = { 'khvicha-kvaratskhelia': 'Kvara' }
// Mouvements inspirés de « Image Stack Carousel » (21st.dev, ayushmxxn) : ressort vif
// (raideur 300, amortissement 30), cartes des files légèrement réduites à mesure qu'elles
// s'éloignent, carte du duel qui se soulève au survol et bascule en
// 3D quand on la fait glisser ; un glissé assez long la renvoie au bout de sa file.
const SPRING = { type: 'spring', stiffness: 300, damping: 30 }
const STACK_SCALE = 0.035     // réduction par place dans une file
const SWIPE = 110             // px de glissé pour renvoyer la carte du duel
const TILT = 18               // degrés de bascule 3D pendant le glissé
const SMALL = 0.72   // taille des cartes des files par rapport aux cartes du duel

// Grand écran : ~4,6 pièces dans la largeur (les voisines extérieures sont coupées par le
// bord) ; mobile : les 2 du duel. Le reste du code manipule slot.w / slot.h (= D) et
// slot.spacing (d'un centre de pièce du duel à l'autre).
function useSlot() {
  const measure = () => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const wide = vw > SPLIT_MIN
    const gap = wide ? 28 : 12
    const D = wide
      ? Math.min((vw - 48 - 4 * gap) / 4.6, vh * 0.62)
      : Math.min((vw - 3 * gap) / 2, vh * 0.4)
    const spacing = D + gap
    // Bord gauche de la pièce de gauche du duel (duel centré) : les places en découlent.
    const duelLeft = vw / 2 - spacing + gap / 2
    // Pièces un peu au-dessus du centre de l'écran (DROP × hauteur).
    return { vw, h: D, w: D, spacing, bottom: (vh - D) / 2 - vh * DROP, duelLeft }
  }
  const [slot, setSlot] = useState(measure)
  useEffect(() => {
    const onResize = () => setSlot(measure())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return slot
}

/** Anneau de départ à partir du duel [gauche, droite] : à droite les joueurs qui suivent le
    joueur de droite dans ORDRE, à gauche ceux qui précèdent le joueur de gauche, le reste en
    file d'attente (cachés). */
function initialRing([l, r]) {
  const used = new Set([l, r])
  const take = (from, dirStep) => {
    const out = []
    for (let k = 1; out.length < BACK && k < N; k++) {
      const p = (((from + dirStep * k) % N) + N) % N
      if (!used.has(p)) { out.push(p); used.add(p) }
    }
    return out
  }
  const R = [r, ...take(r, 1)]
  const L = [l, ...take(l, -1)]
  const Q = players.map((_, k) => k).filter((k) => !used.has(k))
  return { L, R, Q }
}

/** Un pas d'un côté (0 = gauche, 1 = droite) : la voisine entre au duel, la file d'attente
    alimente le bout de ce côté, l'ancienne pièce du duel part au bout de la file d'attente. */
function step(r, side) {
  const key = side ? 'R' : 'L'
  const [main, ...rest] = r[key]
  if (!r.Q.length) return { ...r, [key]: [...rest, main] }
  return { ...r, [key]: [...rest, r.Q[0]], Q: [...r.Q.slice(1), main] }
}


/** Pièce : se soulève au survol, bascule en 3D quand on la fait glisser horizontalement ;
    au-delà de SWIPE px, onSwipe (joueur suivant). Glisser seulement si `enabled` (duel). */
function SwipeCard({ children, onSwipe, onTap, enabled = true, label }) {
  const x = useMotionValue(0)
  const rotateY = useTransform(x, [-200, 200], [-TILT, TILT])
  const rotateZ = useTransform(x, [-200, 200], [-4, 4])
  const moved = useRef(false)
  return (
    <m.div className="swipe" style={{ x, rotateY, rotateZ }} role="button" tabIndex={0}
           aria-label={label}
           drag={enabled ? 'x' : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.5}
           dragSnapToOrigin
           whileHover={enabled ? { scale: 1.03 } : undefined} whileTap={{ scale: 0.99 }}
           transition={SPRING}
           onDragStart={() => { moved.current = true }}
           onDragEnd={(_, info) => {
             if (Math.abs(info.offset.x) > SWIPE) onSwipe()
             setTimeout(() => { moved.current = false }, 0)
           }}
           onClickCapture={(e) => { if (moved.current) { e.stopPropagation(); e.preventDefault() } }}
           onClick={onTap}>
      {children}
    </m.div>
  )
}

/** Pièce d'or en 3D, avec épaisseur : portrait du joueur sur les deux faces, retourné en miroir
    pour que le joueur regarde vers la droite quelle que soit la face montrée (duel ou file),
    tranche = LAYERS disques dorés empilés. De face quand elle est au duel, de dos sinon ; à
    chaque changement, elle tourne sur elle-même (un tour et demi) jusqu'à la bonne face ; au
    survol de la souris, elle fait un tour complet. */
function Coin({ player, front, yaw = 0 }) {
  const rot = useMotionValue(front ? 0 : 180)
  // Orientation sur l'anneau (la pièce suit la courbe) : ajoutée à sa propre rotation.
  const yawMV = useMotionValue(yaw)
  useEffect(() => { animate(yawMV, yaw, SPRING) }, [yaw])
  const rotateY = useTransform([rot, yawMV], ([r, w]) => r + w)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const target = front ? 0 : 180
    const cur = rot.get()
    const delta = (((target - cur) % 360) + 360) % 360
    animate(rot, cur + delta + 360, { duration: 2, ease: [0.3, 0.7, 0.2, 1] })
  }, [front])
  const half = 50 * THICK   // demi-épaisseur, en % du diamètre
  // Survol de la souris : un tour complet (retour sur la même face), sauf si elle tourne déjà.
  const spinning = useRef(false)
  const onHover = (e) => {
    if (e.pointerType !== 'mouse' || spinning.current) return
    spinning.current = true
    animate(rot, rot.get() + 360, { duration: 1.8, ease: [0.3, 0.7, 0.2, 1] })
      .then(() => { spinning.current = false })
  }
  return (
    <m.span className="coin" style={{ rotateY, '--coin': `url(${coinUrl(player.id)})` }}
            onPointerEnter={onHover}>
      <img className="coin-face" src={coinUrl(player.id)} alt="" draggable="false"
           style={{ transform: `translateZ(calc(var(--d) * ${half / 100})) scaleX(-1)` }} />
      {Array.from({ length: LAYERS - 1 }, (_, k) => (
        // Tranche : même silhouette que l'image (masque), pas un cercle théorique.
        <span key={k} className="coin-layer"
              style={{ transform: `translateZ(calc(var(--d) * ${(half - ((k + 1) * 2 * half) / LAYERS) / 100}))` }} />
      ))}
      <img className="coin-face" src={coinUrl(player.id)} alt="" draggable="false"
           style={{ transform: `rotateY(180deg) translateZ(calc(var(--d) * ${half / 100})) scaleX(-1)` }} />
    </m.span>
  )
}

export default function Carousel({ nav, pair, setPair, onOpen, onIntro }) {
  const slot = useSlot()
  const prevPlace = useRef({})   // place précédente de chaque carte, par file
  const leavingIds = useRef(new Set())   // cartes en train de quitter le duel
  const visualPlace = useRef(new Map()).current   // place affichée de chaque pièce de file
  const prevVisual = useRef({})   // place affichée précédente, pour repérer les sauts
  // Un seul anneau des 10 joueurs, dans l'ordre ORDRE, pour le moins de mouvement possible :
  //   [L3 L2 L1] [GAUCHE][DROITE] [R1 R2 R3]   + file d'attente (2 joueurs, cachés au fond).
  // Changer le joueur de gauche ne fait bouger que le côté gauche : L1 devient GAUCHE, L2 et L3
  // avancent d'une place, la 1re pièce de la file d'attente entre en L3, l'ancienne GAUCHE part
  // au bout de la file d'attente. Le côté droit ne bouge jamais (et inversement).
  const [ring, setRing] = useState(() => initialRing(pair))
  const lists = [[...ring.L, ...ring.Q], [...ring.R, ...ring.Q]]

  useEffect(() => { setPair([ring.L[0], ring.R[0]]) }, [ring.L[0], ring.R[0]])

  const turn = (side) => setRing((r) => step(r, side))
  // Clic sur une pièce du fond : elle entre au duel de son côté (autant de pas que sa place).
  const bring = (side, place) => setRing((r) => {
    let out = r
    for (let n = 0; n < place; n++) out = step(out, side)
    return out
  })

  // Clavier : ← fait défiler la file de gauche (comme sa flèche ‹), → celle de droite (comme
  // sa flèche ›) ; ↓ / Entrée comparent, ↑ revient à l'intro.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); turn(0) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); turn(1) }
      else if (e.key === 'ArrowDown' || e.key === 'Enter') {
        if (e.target.closest?.('button')) return
        e.preventDefault()
        onOpen({ autoplay: e.key === 'ArrowDown' })   // ↓ : rotation jouée seule (Duel.jsx)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        onIntro()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onOpen, onIntro])

  // Molette verticale : vers le bas → comparer (rotation jouée seule), vers le haut → intro.
  const cooldown = useRef(performance.now() + 800) // ignore l’inertie au retour
  useEffect(() => {
    const onWheel = (e) => {
      const now = performance.now()
      if (now < cooldown.current || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return
      if (e.deltaY > 25) { onOpen({ autoplay: true }); cooldown.current = now + 1000 }   // rotation jouée seule
      else if (e.deltaY < -25) { onIntro(); cooldown.current = now + 1000 }
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [onOpen, onIntro])

  // Tactile : glisser vers le haut → comparer, vers le bas → intro.
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
    if (c.clientY - t.y < -60) onOpen({ autoplay: true })
    else if (c.clientY - t.y > 60) onIntro()
  }

  return (
    <m.main
      className="carousel"
      custom={nav}
      variants={carouselVariants}
      initial="hidden"
      animate="shown"
      exit="exit"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <h1 className="sr-only">Ballon d'Or 2026 — le duel</h1>

      {(() => {
        // Toujours BACK pièces visibles de chaque côté, jamais de vide ni de doublon : les deux
        // pièces du duel d'abord, puis, en alternant les côtés, chaque file prend le joueur
        // suivant de son ordre qui n'est pas encore affiché. visualPlace : place réelle à l'écran
        // (1 = voisine du duel) ; les autres pièces restent masquées au bout de leur côté.
        const shown = new Set([lists[0][0], lists[1][0]])
        const next = [1, 1]
        visualPlace.clear()
        for (let v = 1; v <= BACK; v++) {
          for (const side of [0, 1]) {
            const list = lists[side]
            while (next[side] < list.length && shown.has(list[next[side]])) next[side]++
            if (next[side] >= list.length) continue
            const k = list[next[side]++]
            shown.add(k)
            visualPlace.set(`${side}-${k}`, v)
          }
        }
        return null
      })()}
      {lists.map((list, side) => (
        <ul key={side} className="row">
          {list.map((k, place) => {
            const p = players[k]
            const duel = place === 0
            const dir = side ? 1 : -1                     // vers le bord de ce côté
            // Disposition façon Ciao Energy : les pièces flottent sur un grand anneau vu de face.
            // Le duel est au premier plan, au centre ; chaque file part de son côté sur l'arc, les
            // pièces rapetissant et remontant vers le fond de l'anneau. Chaque pièce est un peu
            // penchée (angle fixe par joueur), comme en apesanteur.
            const Rx = slot.vw * 0.56                      // rayon horizontal de l'anneau
            const theta0 = Math.asin(Math.min(0.9, (slot.spacing / 2) / Rx))
            // Place affichée : 0 au duel, 1…BACK pour les pièces visibles, au-delà masquée.
            const vp = duel ? 0 : (visualPlace.get(`${side}-${k}`) ?? BACK + 1 + place)
            const theta = dir * (theta0 + vp * ARC_STEP)
            const depth = (1 + Math.cos(theta)) / 2           // 1 devant, 0 derrière
            // Au-delà du quart d'anneau, la pièce est cachée (fond de l'anneau) : on la garde
            // sur le bord de son côté, sans jamais repasser devant le duel.
            const hidden = !duel && vp > BACK
            const edge = dir * Math.min(Math.abs(theta), Math.PI / 2)
            const x = slot.vw / 2 + Rx * Math.sin(edge) - slot.w / 2
            // Anneau incliné (côté droit plus haut, comme chez Ciao) et fond qui remonte.
            const y = -(1 - Math.cos(theta)) * slot.w * ARC_RISE - Math.sin(theta) * slot.w * ARC_TILT
            const scale = duel ? 1 : 0.3 + 0.6 * depth
            // La pièce suit la courbe de l'anneau (montre sa tranche vers les bords).
            const yaw = duel ? 0 : -(theta * 180) / Math.PI * 0.55
            // Pièces du duel droites (leur nom reste centré au-dessus) ; les autres penchées.
            const rotate = duel ? 0 : TILTS[k % TILTS.length]
            // La carte qui quitte le duel pour le bout de sa file disparaît aussitôt, sans
            // transition, et réapparaît au bout de la file (hors écran).
            const id = `${side}-${p.id}`
            // (mémorisé jusqu'à la fin de l'animation : la page peut être redessinée entre-temps)
            if (prevPlace.current[id] === 0 && place === list.length - 1) leavingIds.current.add(id)
            if (place !== list.length - 1) leavingIds.current.delete(id)
            prevPlace.current[id] = place
            const leaving = leavingIds.current.has(id)
            // Changement non voisin (la pièce apparaît, disparaît ou saute de plus d'une place,
            // par ex. quand elle doit passer de l'autre côté) : pas de trajet visible.
            const before = prevVisual.current[id]
            const jumping = before !== undefined && before !== vp && (
              hidden || before > BACK || Math.abs(before - vp) > 1)
            prevVisual.current[id] = hidden ? BACK + 1 : vp
            const motion = leaving
              ? {
                  // Disparaît aussitôt : masquée d'un coup, replacée au bout de la file, puis
                  // de nouveau visible (hors écran), sans aucune transition.
                  animate: { x, y, scale, rotate, opacity: hidden ? 0 : [0, 0, 1] },
                  transition: { duration: 0.05, x: { duration: 0 }, scale: { duration: 0 }, times: [0, 0.99, 1] },
                  onAnimationComplete: () => leavingIds.current.delete(id),
                }
              : jumping
                ? {
                    // Échange invisible : la pièce saute directement à sa nouvelle place (ou
                    // disparaît) sans traverser l'écran, puis réapparaît en fondu sur place.
                    animate: { x, y, scale, rotate, opacity: hidden ? 0 : [0, 1] },
                    transition: { x: { duration: 0 }, y: { duration: 0 }, scale: { duration: 0 },
                                  rotate: { duration: 0 }, opacity: { duration: hidden ? 0 : 0.35 } },
                  }
                : { animate: { x, y, scale, rotate, opacity: hidden ? 0 : 1 }, transition: SPRING }
            return (
              // Une carte qui arrive au duel reste sous la carte du duel pendant son trajet et
              // ne remonte qu'à l'arrivée (transition CSS retardée de z-index, .row-item.is-duel).
              <m.li key={p.id} className={`row-item${duel ? ' is-duel' : ''}`}
                    initial={false} {...motion}
                    style={{ width: slot.w, height: slot.h, bottom: slot.bottom, originY: 0.5,
                             '--d': `${slot.w}px`, '--depth': depth.toFixed(3), zIndex: duel ? 20 : 20 - place }}>
                {/* Même élément que la pièce soit au duel ou non : elle garde sa rotation. */}
                <SwipeCard enabled={duel} onSwipe={() => turn(side)}
                           onTap={() => (duel ? onOpen() : bring(side, place))}
                           label={duel ? `Comparer ${p.nom}` : `Choisir ${p.nom}`}>
                  <Coin player={p} front={duel} yaw={yaw} />
                </SwipeCard>
              </m.li>
            )
          })}
        </ul>
      ))}


      {/* Duel en toutes lettres, en bas entre les deux flèches : « OLISE VS DEMBÉLÉ ». */}
      <p className="duel-line" aria-live="polite">
        {[0, 1].map((side) => {
          const pl = players[side ? ring.R[0] : ring.L[0]]
          return (
            <m.span key={`${side}-${pl.id}`} className={`duel-name is-${side ? 'right' : 'left'}`}
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}>
              {SHORT_NAMES[pl.id] ?? pl.nom.split(' ').slice(-1)[0]}
            </m.span>
          )
        }).flatMap((el, i) => (i ? [<span key="vs" className="duel-vs">VS</span>, el] : [el]))}
      </p>

      {/* Flèches en bas de l'écran, au milieu de chaque demi-écran : ‹ à gauche (change le
          joueur de gauche), › à droite. */}
      {[0, 1].map((side) => (
        <button key={side} className="arrow duel-arrow" onClick={() => turn(side)}
                aria-label={side ? 'Changer le joueur de droite' : 'Changer le joueur de gauche'}
                style={{ left: `${side ? 75 : 25}%`, bottom: '12%' }}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {side ? <path d="M9 5l7 7-7 7" /> : <path d="M15 5l-7 7 7 7" />}
          </svg>
        </button>
      ))}

    </m.main>
  )
}
