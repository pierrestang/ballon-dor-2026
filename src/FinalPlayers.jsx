import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, cubicBezier, useReducedMotion } from 'framer-motion'
import { FRAMES, ageOf, asset, clubLogo, decimal, kitStyle, photoUrl, posteLabel } from './data'
import { frameAt, hasFrames, open, subscribe } from './sequence'
import Tip from './Tip'
import SeasonPalmares from './SeasonPalmares'

// Copie du bloc des deux joueurs de la page 2 (Duel.jsx), pour la page finale (Final.jsx) :
// même disposition (palmarès · joueur · stats face à face · joueur · palmarès), même contenu,
// mêmes classes. Tout est affiché d'emblée. Joueurs en vidéo : SwapTurn (arrivée : rotation déjà
// lancée, de 90° à la face ; changement de joueur : relais à 90°).

const SWAP = 2       // SwapTurn : fondu entre les deux joueurs sur ±2 images autour du relais
const SWAP_S = 2     // SwapTurn : durée d'un tour complet (changement de joueur ; arrivée : ¾ de tour en 1,5 s)
const RELAY = FRAMES / 4   // relais à 90° (de profil) : image 12 sur 48 (28/09/2026)
const SWAP_EASE = [0.45, 0, 0.55, 1]   // accélération et arrêt doux, vitesse régulière au milieu
// Temps restant après le relais (s) : la courbe atteint 90° vers 41 % du tour, pas 25 % ;
// calculé par dichotomie sur la courbe (le jeu y cale le défilement de ses textes).
export const SWAP_REST_S = (() => {
  const ease = cubicBezier(...SWAP_EASE)
  let lo = 0, hi = 1
  for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (ease(mid) < RELAY / FRAMES) lo = mid; else hi = mid }
  return SWAP_S * (1 - lo)
})()

/** Joueur en vidéo qui tourne (page du duel, Présentation, duels de Mon classement). À l'arrivée,
    la rotation est déjà lancée : elle part de 90° (de profil) et finit le tour jusqu'à la face.
    Quand `id` change, le joueur affiché tourne de face à 90° ; là, la séquence du nouveau joueur
    prend le relais (bref fondu) et finit le tour jusqu'à sa face. `onMid` : appelé au relais (le
    reste de la page change en même temps, jeu). Mouvement réduit : la photo du nouveau joueur,
    directement. */
export function SwapTurn({ id, name, onMid, onStart }) {
  // onStart : appelé quand le changement commence vraiment (rotation lancée, ou changement direct
  // si les séquences manquent / mouvement réduit) — la page y lance ses textes (même départ).
  const startRef = useRef(onStart)
  startRef.current = onStart
  const reduced = useReducedMotion()
  const canvas = useRef(null)
  const pos = useRef({ from: id, to: id, v: 0 })   // joueurs et position dans le tour (0 → FRAMES)
  const [still, setStill] = useState(id)   // photo nette affichée hors rotation
  const [turning, setTurning] = useState(false)
  // Une seule image de la séquence à la fois (pas de mélange entre images voisines : il
  // dédoublait le joueur) ; autour du dos (SWAP), bref fondu de l'ancien joueur vers le nouveau.
  const draw = () => {
    const c = canvas.current
    if (!c) return
    const { from, to, v } = pos.current
    const ctx = c.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, c.width, c.height)
    const f = Math.round(v) % FRAMES
    const k = from === to ? 1 : Math.min(1, Math.max(0, (v - (RELAY - SWAP)) / (2 * SWAP)))
    const layer = (pid, alpha) => {
      const img = alpha > 0 && frameAt(pid, f)
      if (!img) return
      ctx.globalAlpha = alpha
      ctx.drawImage(img, 0, 0, c.width, c.height)
    }
    if (k < 1) layer(from, 1)       // l'ancien reste plein dessous…
    layer(to, k)                     // …le nouveau apparaît par-dessus
    ctx.globalAlpha = 1
  }
  useLayoutEffect(() => {
    const c = canvas.current
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      c.width = Math.round(c.clientWidth * dpr)
      c.height = Math.round(c.clientHeight * dpr)
      draw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(c)
    return () => ro.disconnect()
  }, [])
  const first = useRef(true)
  useEffect(() => {
    const from = first.current ? id : pos.current.to
    const isFirst = first.current
    first.current = false
    open(id)
    const offs = [subscribe(from, draw), subscribe(id, draw)]
    if (reduced) { pos.current = { from: id, to: id, v: 0 }; setStill(id); if (!isFirst) { startRef.current?.(); onMid?.() } return () => offs.forEach((f) => f()) }
    let anim, cancelled = false, mid = false
    const passMid = () => { if (mid) return; mid = true; setStill(id); if (!isFirst) onMid?.() }
    ;(async () => {
      // Les deux séquences entières avant de tourner (aucune image manquante en route) ; pas
      // chargées au bout de 1,5 s : changement direct, sans rotation (le jeu n'attend pas).
      let ready = false
      for (let t = 0; t < 30; t++) {
        if ((ready = hasFrames(from, 0, FRAMES - 1) && hasFrames(id, 0, FRAMES - 1))) break
        await new Promise((r) => setTimeout(r, 50))
        if (cancelled) return
      }
      if (!ready) { pos.current = { from: id, to: id, v: 0 }; if (!isFirst) startRef.current?.(); passMid(); return }
      // Arrivée : de 90° à la face (trois quarts de tour, déjà lancé) ; changement : tour complet,
      // relais à 90°.
      const start = isFirst ? RELAY : 0
      if (!isFirst) startRef.current?.()
      pos.current = { from, to: id, v: start }
      draw()
      setTurning(true)
      anim = animate(start, FRAMES, {
        duration: isFirst ? SWAP_S * 0.75 : SWAP_S,
        ease: isFirst ? [0.25, 0.5, 0.35, 1] : SWAP_EASE,   // arrivée : déjà en mouvement, arrêt doux
        onUpdate: (v) => {
          pos.current.v = v
          if (v >= RELAY) passMid()
          draw()
        },
        onComplete: () => { pos.current = { from: id, to: id, v: 0 }; setTurning(false) },
      })
    })()
    return () => {
      cancelled = true
      anim?.stop()
      pos.current = { from: id, to: id, v: 0 }
      passMid()
      offs.forEach((f) => f())
      setTurning(false)
    }
  }, [id, reduced])
  return (
    <>
      <canvas ref={canvas} className={`rotation${turning ? '' : ' is-hidden'}`} aria-hidden="true" />
      <img className={`still${turning ? '' : ' is-on'}`} src={photoUrl(still)} alt={name} width="810" height="1440" />
    </>
  )
}

/** Textes et chiffres des pages de joueurs au changement de joueur (façon tableau d'affichage) : chaque
    position passe par des lettres au hasard puis se pose sur la bonne, de gauche à droite
    (0,6 s en tout) ; la longueur passe de l'ancien nom au nouveau. Mouvement réduit : direct. */
const ROLL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÉ'
const ROLL_DIGITS = '0123456789'
// Même rythme que le compteur des chiffres (Counter) : 0,6 s, courbe [0.16, 1, 0.3, 1] ; toutes
// les lettres d'un texte et tous les textes défilent ensemble, sans décalage.
const ROLL = { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
const rollEase = cubicBezier(...ROLL.ease)

/** Défilement vers `text` à chaque changement de `trigger` (le joueur) : même si le texte ne
    change pas, il défile. Chaque position passe par des caractères au hasard (lettres, ou
    chiffres pour un texte numérique) et se pose sur la bonne, de gauche à droite, au fil de
    la courbe ROLL ; la longueur passe de l'ancienne à la nouvelle. Mouvement réduit : direct. */
/** Durée du défilement des textes (s) : 0,6 par défaut ; les pages de joueurs la calent sur la
    rotation de la vidéo (RollDuration), pour que textes et vidéo finissent ensemble. */
export const RollDuration = createContext(ROLL.duration)

/** Texte affiché au temps u (0 → 1) du défilement de `old` vers `text` : chaque position passe par
    des caractères au hasard (lettres, ou chiffres pour un texte numérique) et se pose sur la
    bonne, à intervalles de temps réguliers, de gauche à droite ; la longueur passe de l'ancienne à
    la nouvelle. */
const ROLL_TICK_MS = 90   // une lettre au hasard change toutes les 90 ms (à chaque image, elle tournait trop vite)
// Caractère « au hasard » stable pendant un pas (position i, pas tick) : même tirage d'une image à
// l'autre tant que le pas ne change pas.
const pickAt = (pool, i, tick) => pool[Math.abs(Math.imul(i * 7919 + tick * 104729 + 1, 2654435761) >> 7) % pool.length]
function rollString(old, text, u, tick = 0) {
  const n = text.length
  const pool = /^[\d\s,.–-]*$/.test(text) ? ROLL_DIGITS : ROLL_CHARS
  const len = Math.round(old.length + (n - old.length) * Math.min(1, rollEase(u) * 2))
  let out = ''
  for (let i = 0; i < len; i++) {
    // Lettres posées sur le temps linéaire (sur la courbe ralentie, les dernières traînaient).
    const settle = 0.2 + (0.8 * (i + 1)) / Math.max(1, n)
    const target = text[i] ?? ''
    out += u >= settle || /[\s,.–-]/.test(target) ? target : pickAt(pool, i, tick)
  }
  return u >= 1 ? text : out
}

/** Même défilement, écrit directement dans la page (sans rendu React à chaque image) : pour les
    nombreux textes des tableaux. Défile à l'affichage (`onMount`) et à chaque changement de
    `trigger`. */
export function RollText({ text, trigger, onMount = false }) {
  const duration = useContext(RollDuration)
  const reduced = useReducedMotion()
  const ref = useRef(null)
  const prev = useRef({ text, trigger: onMount ? {} : trigger })
  useLayoutEffect(() => {
    const el = ref.current
    const before = prev.current
    const changed = before.trigger !== trigger || before.text !== text
    prev.current = { text, trigger }
    el.textContent = text
    if (!changed || reduced) return
    const t0 = performance.now()
    let raf = 0, done = false
    const frame = (now) => {
      const u = Math.min(1, (now - t0) / (duration * 1000))
      el.textContent = rollString(before.text, text, u, Math.floor((now - t0) / ROLL_TICK_MS))
      if (u < 1) raf = requestAnimationFrame(frame); else done = true
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); if (!done) { prev.current = before; el.textContent = text } }
  }, [text, trigger, reduced, duration])
  return <span ref={ref} />
}
export { SWAP_S }

function useRollingText(text, trigger = text, onMount = false) {
  const duration = useContext(RollDuration)
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(text)
  const prev = useRef({ text, trigger: onMount ? {} : trigger })   // onMount : défile dès l'affichage
  useEffect(() => {
    const before = prev.current
    const old = before.text
    const changed = before.trigger !== trigger || old !== text
    prev.current = { text, trigger }
    if (!changed || reduced) { setShown(text); return }
    const t0 = performance.now()
    let raf
    const frame = (now) => {
      const u = Math.min(1, (now - t0) / (duration * 1000))   // temps écoulé (linéaire)
      setShown(rollString(old, text, u, Math.floor((now - t0) / ROLL_TICK_MS)))
      raf = u < 1 ? requestAnimationFrame(frame) : 0
    }
    let done = false
    const frame0 = frame
    raf = requestAnimationFrame(function run(now) { frame0(now); if (!raf) done = true })
    // Interrompu avant la fin (effet rejoué en développement, ou texte qui rechange) : on remet
    // l'état d'avant, pour que le défilement reparte au lieu d'être tenu pour fait.
    return () => { cancelAnimationFrame(raf); if (!done) prev.current = before }
  }, [text, trigger, reduced])
  return shown
}

/** Texte qui défile à chaque changement de joueur (`trigger`), même s'il est identique. */
function Rolling({ text, trigger, onMount = false }) {
  return useRollingText(text, trigger, onMount)
}

/** Image qui bascule comme une palette de tableau d'affichage à chaque changement de joueur
    (clé : joueur + source ; animation .flap au rythme ROLL, 03-duel.css). */
const Flap = ({ trigger, ...props }) => <img key={`${trigger}|${props.src}`} {...props} className={`${props.className} flap`} />

/** Identité du joueur au-dessus de sa tête, sur mobile, à la place du nom en arc (05-page-duel.css) :
    écusson du club et drapeau, nom, poste abrégé (BU, AD…) · âge. Masqué sur grand
    écran. Au changement de joueur, le nom et le poste défilent, les images basculent. */
export function PlayerTag({ player }) {
  const club = clubLogo(player.club)
  return (
    <div className="player-tag" aria-hidden="true">
      <span className="player-tag-crest">
        {club && <Flap trigger={player.id} className="club" src={club} alt="" width="52" height="52" />}
        <Flap trigger={player.id} className="flag" src={asset(player.drapeau)} alt="" width="48" height="32" />
      </span>
      <span className="player-tag-text">
        {/* Grand écran : prénom sur une ligne, nom sur la suivante (05-page-duel.css) ; mobile : une ligne. */}
        <span className="player-tag-name">
          <span className="player-tag-first"><Rolling text={player.nom.split(' ')[0]} trigger={player.id} /></span>{' '}
          <span className="player-tag-last"><Rolling text={player.nom.split(' ').slice(1).join(' ')} trigger={player.id} /></span>
        </span>
        <span className="player-tag-poste">
          <Rolling text={ageOf(player.id) !== null ? `${player.poste} ·\u00a0${ageOf(player.id)}\u00a0ans` : player.poste} trigger={player.id} />   {/* poste abrégé (BU, AD…) ; « 39 ANS » jamais coupé */}
        </span>
      </span>
    </div>
  )
}

export function ArcName({ id, name: target, letters = false }) {
  // Taille selon le nom final (pas de saut de taille pendant le défilement des lettres).
  const fontSize = Math.min(135, 880 / (target.length * 0.5))
  const name = useRollingText(target, id)
  // letters : une lettre par <tspan>, retard de transition selon la distance au milieu du nom
  // (passage du blanc à l'or du centre vers les bords, duels de Mon classement).
  const mid = (name.length - 1) / 2
  return (
    <svg className="arc-name" viewBox="0 0 1000 260" aria-hidden="true">
      <path id={`final-name-${id}`} d="M 80 250 A 520 520 0 0 1 920 250" />
      <text fontSize={fontSize}>
        <textPath href={`#final-name-${id}`} startOffset="50%" textAnchor="middle">
          {letters ? [...name].map((ch, i) => (
            <tspan key={i} style={{ transitionDelay: `${Math.round(Math.abs(i - mid) * 38)}ms` }}>{ch}</tspan>
          )) : name}
        </textPath>
      </text>
    </svg>
  )
}

const same = (n) => n
// Contributions comparées sur les valeurs arrondies affichées (1,20 contre 1,25).
const round2 = (n) => Math.round(n * 100) / 100

/** Une ligne du face-à-face : valeur de gauche · libellé · valeur de droite (aucune couleur
    selon le meilleur score, 27/09/2026). */
function CompareRow({ label, tip, left, right, format, trigger }) {
  return (
    <div className="compare-row">
      <strong><Counter value={left} format={format} trigger={trigger?.[0]} /></strong>
      <span>{tip ? <Tip label={tip}>{label}</Tip> : label}</span>
      <strong><Counter value={right} format={format} trigger={trigger?.[1]} /></strong>
    </div>
  )
}

/** Chiffre qui défile comme un compteur mécanique vers sa nouvelle valeur quand elle change
    (0,6 s, décélération) ; à l'arrivée et en mouvement réduit, la valeur directement. */
export function Counter({ value, format = String, trigger, onMount = false }) {
  // Changement de joueur : les chiffres défilent au hasard puis se posent, de gauche à droite
  // (useRollingText, comme les textes).
  return <span className="counter">{useRollingText(format(value), trigger, onMount)}</span>
}

// Stats de la saison, dans le tableau du mobile (StatsTable) : mêmes colonnes que les détails par
// compétition.
const SEASON = [
  { label: 'Matches', get: (p) => p.stats.matchs, format: String },
  { label: 'Buts', get: (p) => p.stats.buts, format: String },
  { label: 'Passes', get: (p) => p.stats.passes, format: String },
  { label: 'B+A/Match', tip: 'Buts + passes / match', get: (p) => round2(p.stats.contributionsParMatch), format: decimal },
]

/** Stats de la saison sur mobile, au format des détails par compétition (05-page-duel.css) : ligne
    d'en-tête, puis une ligne par joueur (colonne du logo laissée vide, pour l'alignement avec les
    détails ; les 4 chiffres, qui défilent au changement de joueur). Masqué sur grand écran. */
export function StatsTable({ players, short = {}, onMount = false }) {
  return (
    <div className="stats-table">
      <div className="stats-table-head">
        <span />
        {SEASON.map((c) => <span key={c.label} data-short={short[c.label]}>{c.tip ? <Tip label={c.tip}>{c.label}</Tip> : c.label}</span>)}
      </div>
      {players.map((p, i) => (
        <div key={i} className={`stats-table-row is-${i ? 'right' : 'left'}`}>
          <span className="stats-table-slot"><span className="sr-only">{p.nom}</span></span>
          {SEASON.map((c) => <strong key={c.label}><Counter value={c.get(p)} format={c.format} trigger={p.id} onMount={onMount} /></strong>)}
        </div>
      ))}
    </div>
  )
}

/** Stats au milieu, entre les deux joueurs (mobile : StatsTable). */
export function Compare({ a, b, titles = true }) {
  // titles : lignes des titres collectifs et individuels (absentes des duels de Mon classement).
  const rows = [
    { label: 'Titres collectifs', get: (p) => p.collectif.length, format: same },
    // Seuls les titres majeurs (1er) comptent ; les places d'honneur (2e, 3e) non.
    { label: 'Titres individuels', get: (p) => p.individuel.filter((t) => t.rang === 1).length,
      format: same },
    { label: 'Matches', get: (p) => p.stats.matchs, format: same },
    { label: 'Buts', get: (p) => p.stats.buts, format: same },
    { label: 'Passes', get: (p) => p.stats.passes, format: same },
    { label: 'B+A/Match', tip: 'Buts + passes / match', get: (p) => round2(p.stats.contributionsParMatch),
      format: decimal },
  ]
  return (
    <div className="compare">
      {rows.filter((r) => titles || !r.label.startsWith('Titres')).map((r) => (
        <CompareRow key={r.label} label={r.label} tip={r.tip} left={r.get(a)} right={r.get(b)}
                    format={r.format} trigger={[a.id, b.id]} />
      ))}
      <StatsTable players={[a, b]} />
    </div>
  )
}

/** Grand écran : colonne à côté du joueur — son palmarès au format du mobile (SeasonPalmares ;
    l'identité est au-dessus du joueur, PlayerTag). Masquée sur mobile (le palmarès y est dans le
    bloc du tableau). */
export function SidePanel({ player, side }) {
  return (
    <div className={`palmares is-${side}`}>
      <SeasonPalmares player={player} />
    </div>
  )
}

/** `pair` : joueurs des vidéos (changent tout de suite) ; `shown` : joueurs des textes, changés
    par la page quand la rotation commence (`onStart`), pour que textes et vidéo partent ensemble. */
export default function FinalPlayers({ pair, shown = pair, onStep, onStart }) {
  const [a, b] = shown
  return (
    <>
      <h2 className="sr-only">{a.nom} contre {b.nom}</h2>
      <SidePanel player={a} side="left" />
      {[a, b].map((p, i) => (
        <div key={i ? 'right' : 'left'} className={`figure is-${i ? 'right' : 'left'}`} style={kitStyle(p.id)}>
          <ArcName id={p.id} name={p.nom} />
          <PlayerTag player={p} />
          <SwapTurn id={pair[i].id} name={pair[i].nom} onStart={onStart} />
          <div className="figure-picker">
            <button className={`arrow ${i ? 'is-outer-right' : 'is-outer-left'}`}
                    onClick={() => onStep(i, 1)} aria-label="Joueur suivant">
              <svg viewBox="0 0 24 24" aria-hidden="true">{i ? <path d="M9 5l7 7-7 7" /> : <path d="M15 5l-7 7 7 7" />}</svg>
            </button>
          </div>
        </div>
      ))}
      <Compare a={a} b={b} titles={false} />
      <SidePanel player={b} side="right" />
    </>
  )
}
