import { useEffect, useRef, useState } from 'react'
import { m, useMotionValue, useTransform } from 'framer-motion'
import players, { asset, bustUrl, clubLogo } from './data'
import { carouselVariants } from './transitions'

// Page 1 : deux listes indépendantes. Au centre, les deux cartes du duel ; chacune a sa
// propre file des 9 autres joueurs (assombris), qui part vers son bord de l'écran (à gauche
// pour la carte de gauche, à droite pour celle de droite). Faire défiler une file ne touche
// jamais l'autre.
//
// Une file : [carte du duel, place 1, place 2, … place 9], place 1 = voisine immédiate.
// Flèche vers le centre : la place 1 devient la carte du duel et l'ancienne part en dernière
// place, au bout de la file ; flèche vers le bord : l'inverse. Le joueur choisi en face est
// sauté (jamais le même joueur des deux côtés du duel).

const N = players.length
// Géométrie d'une carte (cf. .card), en fractions de l'image du joueur (w × h) : elle
// déborde de 6 % de chaque côté, commence à 40 % de la hauteur de l'image (TOP négatif) et
// descend de 28 % sous l'image (bande du nom et des stats) : format de carte « Ultimate Team ».
// Infos en haut à gauche, une par ligne : nom, logo du club, drapeau.
const SIDE = 0.06
const TOP = -0.4
const BOTTOM = 0.28
const CARD = (1 + 2 * SIDE) * (540 / 960)   // largeur de carte / h
const CARD_H = 1 + TOP + BOTTOM             // hauteur de carte / h
const CARD_MID = (1 + BOTTOM - TOP) / 2     // centre de la carte depuis le haut de l'image / h
const SPLIT_MIN = 820   // px : au-delà, grand écran
// Mouvements inspirés de « Image Stack Carousel » (21st.dev, ayushmxxn) : ressort vif
// (raideur 300, amortissement 30), cartes des files légèrement réduites à mesure qu'elles
// s'éloignent, carte du duel qui se soulève au survol et bascule en
// 3D quand on la fait glisser ; un glissé assez long la renvoie au bout de sa file.
const SPRING = { type: 'spring', stiffness: 300, damping: 30 }
const STACK_SCALE = 0.035     // réduction par place dans une file
const SWIPE = 110             // px de glissé pour renvoyer la carte du duel
const TILT = 18               // degrés de bascule 3D pendant le glissé
const SMALL = 0.72   // taille des cartes des files par rapport aux cartes du duel

// Carte : largeur CARD × h, hauteur CARD_H × h. Grand écran : ~4,6 cartes dans la largeur
// (les voisines extérieures sont coupées par le bord) ; mobile : les 2 du duel.
function useSlot() {
  const measure = () => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const wide = vw > SPLIT_MIN
    const gap = wide ? 16 : 10
    const h = wide
      ? Math.min((vw - 48 - 4 * gap) / (4.6 * CARD), (vh - 40) / CARD_H)
      : Math.min((vw - 3 * gap) / (2 * CARD), (vh * 0.62) / CARD_H)
    const spacing = CARD * h + gap
    // Bord gauche de la carte de gauche du duel (duel centré) : les places en découlent.
    const duelLeft = vw / 2 - spacing + gap / 2
    return { vw, h, w: h * (540 / 960), spacing, bottom: (vh - CARD_H * h) / 2 + BOTTOM * h, duelLeft }
  }
  const [slot, setSlot] = useState(measure)
  useEffect(() => {
    const onResize = () => setSlot(measure())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return slot
}

/** File de départ d'un côté : sa carte du duel, puis les autres joueurs dans l'ordre ORDRE,
    en remontant l'ordre pour la file de gauche (step −1) et en le descendant pour celle de
    droite (step +1) : les deux files partent dans des sens opposés et ne montrent pas les
    mêmes joueurs. Le joueur d'en face est mis tout au bout (hors écran). */
function initialList(own, other, step) {
  const rest = []
  for (let k = 1; k < N; k++) {
    const p = (((own + step * k) % N) + N) % N
    if (p !== other) rest.push(p)
  }
  return [own, ...rest, other]
}

/** Défilement d'une file : dir +1 = la place 1 entre au duel, l'ancienne part au bout ;
    dir −1 = la dernière place revient au duel, l'ancienne passe en place 1. */
function shift(list, dir) {
  const [own, ...rest] = list
  return dir > 0 ? [rest[0], ...rest.slice(1), own] : [rest[rest.length - 1], own, ...rest.slice(0, -1)]
}

/** Défile en sautant le joueur choisi en face. */
function turnList(list, dir, other) {
  let out = shift(list, dir)
  if (out[0] === other) out = shift(out, dir)
  return out
}

/** Carte du duel : se soulève au survol, bascule en 3D quand on la fait glisser
    horizontalement ; au-delà de SWIPE px, onSwipe (carte renvoyée au bout de sa file). */
function SwipeCard({ children, onSwipe, onTap }) {
  const x = useMotionValue(0)
  const rotateY = useTransform(x, [-200, 200], [-TILT, TILT])
  const rotateZ = useTransform(x, [-200, 200], [-4, 4])
  const moved = useRef(false)
  return (
    <m.div className="swipe" style={{ x, rotateY, rotateZ }}
           drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.5}
           dragSnapToOrigin
           whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.99 }}
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

/** Carte d'un joueur, style « carte Ultimate Team » (forme de blason en or texturé) : poste,
    drapeau et club à gauche, buste à droite, nom et stats de la saison en bas. Aucune marque. */
function PlayerCard({ player, className = '', ...rest }) {
  const logo = clubLogo(player.club)
  const st = player.stats
  return (
    <button className={`slot ${className}`} {...rest}>
      <span className="card" aria-hidden="true">
        {/* Buste du joueur, en haut à droite. */}
        <img className="card-photo" src={bustUrl(player.id)} alt="" width="470" height="403"
             draggable="false" />
        {/* Colonne de gauche : poste, drapeau, club. */}
        <span className="card-side">
          <span className="card-pos">{player.poste}</span>
          <img src={asset(player.drapeau)} alt="" className="card-flag" />
          {logo && <img src={logo} alt="" className="card-club" />}
        </span>
        {/* Bas : nom de famille, filet, stats de la saison. */}
        <span className="card-bottom">
          <span className="card-name">{player.nom.split(' ').slice(-1)[0]}</span>
          <span className="card-stats">
            <span><b>{st.matchs}</b>MJ</span>
            <span><b>{st.buts}</b>BUT</span>
            <span><b>{st.passes}</b>PD</span>
          </span>
        </span>
      </span>
    </button>
  )
}

export default function Carousel({ nav, pair, setPair, onOpen, onIntro }) {
  const slot = useSlot()
  const prevPlace = useRef({})   // place précédente de chaque carte, par file
  const leavingIds = useRef(new Set())   // cartes en train de quitter le duel
  const [lists, setLists] = useState(() => [initialList(pair[0], pair[1], -1), initialList(pair[1], pair[0], 1)])

  useEffect(() => { setPair([lists[0][0], lists[1][0]]) }, [lists[0][0], lists[1][0]])

  // side 0 = file de gauche, 1 = file de droite ; inward = flèche vers le centre.
  const turn = (side, inward) => setLists((ls) => {
    const out = [...ls]
    out[side] = turnList(ls[side], inward ? 1 : -1, ls[1 - side][0])
    return out
  })
  // Clic sur une carte d'une file : elle entre au duel de ce côté.
  const bring = (side, place) => setLists((ls) => {
    const out = [...ls]
    let l = ls[side]
    for (let n = 0; n < place; n++) {
      l = shift(l, 1)
      if (l[0] === ls[1 - side][0]) break
    }
    if (l[0] !== ls[1 - side][0]) out[side] = l
    return out
  })

  // Clavier : ← fait défiler la file de gauche (comme sa flèche ‹), → celle de droite (comme
  // sa flèche ›) ; ↓ / Entrée comparent, ↑ revient à l'intro.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); turn(0, true) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); turn(1, true) }
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

  // Molette verticale : vers le bas → comparer, vers le haut → intro.
  const cooldown = useRef(performance.now() + 800) // ignore l’inertie au retour
  useEffect(() => {
    const onWheel = (e) => {
      const now = performance.now()
      if (now < cooldown.current || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return
      if (e.deltaY > 25) { onOpen(); cooldown.current = now + 1000 }
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
    if (c.clientY - t.y < -60) onOpen()
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

      {lists.map((list, side) => (
        <ul key={side} className="row">
          {list.map((k, place) => {
            const p = players[k]
            const duel = place === 0
            const dir = side ? 1 : -1                     // vers le bord de ce côté
            // Cartes de file plus petites (SMALL), centrées verticalement sur la carte du duel
            // (mise à l'échelle autour du centre de la carte : 43,5 % de la hauteur, cf. .card).
            const cw = CARD * slot.h                       // largeur d'une carte du duel
            const gap = slot.spacing - cw
            const mainCenter = slot.duelLeft + side * slot.spacing + cw / 2
            const center = duel ? mainCenter
              : mainCenter + dir * (cw / 2 + gap + (SMALL * cw) / 2 + (place - 1) * (SMALL * cw + gap))
            const x = center - slot.w / 2
            const far = Math.min(place, 6)
            const scale = duel ? 1 : SMALL * (1 - STACK_SCALE * (far - 1))
            const rotate = 0   // files droites (plus d'inclinaison)
            // La carte qui quitte le duel pour le bout de sa file disparaît aussitôt, sans
            // transition, et réapparaît au bout de la file (hors écran).
            const id = `${side}-${p.id}`
            // (mémorisé jusqu'à la fin de l'animation : la page peut être redessinée entre-temps)
            if (prevPlace.current[id] === 0 && place === list.length - 1) leavingIds.current.add(id)
            if (place !== list.length - 1) leavingIds.current.delete(id)
            prevPlace.current[id] = place
            const leaving = leavingIds.current.has(id)
            const motion = leaving
              ? {
                  // Disparaît aussitôt : masquée d'un coup, replacée au bout de la file, puis
                  // de nouveau visible (hors écran), sans aucune transition.
                  animate: { x, y: 0, scale, rotate, opacity: [0, 0, 1] },
                  transition: { duration: 0.05, x: { duration: 0 }, scale: { duration: 0 }, times: [0, 0.99, 1] },
                  onAnimationComplete: () => leavingIds.current.delete(id),
                }
              : { animate: { x, y: 0, scale, rotate, opacity: 1 }, transition: SPRING }
            return (
              // Une carte qui arrive au duel reste sous la carte du duel pendant son trajet et
              // ne remonte qu'à l'arrivée (transition CSS retardée de z-index, .row-item.is-duel).
              <m.li key={p.id} className={`row-item${duel ? ' is-duel' : ''}`}
                    initial={false} {...motion}
                    style={{ width: slot.w, height: slot.h, bottom: slot.bottom, originY: CARD_MID,
                             fontSize: slot.w * 0.075, zIndex: duel ? 20 : 20 - place }}>
                {duel ? (
                  <SwipeCard onSwipe={() => turn(side, true)} onTap={onOpen}>
                    <PlayerCard player={p} aria-label={`Comparer ${p.nom}`} />
                  </SwipeCard>
                ) : (
                  <PlayerCard player={p} className="is-dim" aria-label={`Choisir ${p.nom}`}
                              onClick={() => bring(side, place)} />
                )}
                {duel && (
                  // Une seule flèche, vers l'extérieur : ‹ à gauche, › à droite.
                  <div className="picker">
                    <button className="arrow" onClick={() => turn(side, true)} aria-label="Joueur suivant">
                      <svg viewBox="0 0 24 24" aria-hidden="true">{side ? <path d="M9 5l7 7-7 7" /> : <path d="M15 5l-7 7 7 7" />}</svg>
                    </button>
                  </div>
                )}
              </m.li>
            )
          })}
        </ul>
      ))}

      <p className="sr-only" aria-live="polite">{players[lists[0][0]].nom} contre {players[lists[1][0]].nom}</p>
    </m.main>
  )
}
