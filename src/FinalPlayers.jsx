import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, cubicBezier, useReducedMotion } from 'framer-motion'
import { FRAMES, asset, clubLogo, decimal, kitStyle, photoUrl, posteLabel } from './data'
import { frameAt, hasFrames, open, subscribe } from './sequence'
import Tip from './Tip'

// Copie du bloc des deux joueurs de la page 2 (Duel.jsx), pour la page finale (Final.jsx) :
// même disposition (palmarès · joueur · stats face à face · joueur · palmarès), même contenu,
// mêmes classes. Tout est affiché d'emblée. À l'arrivée de la page (et à chaque changement de
// joueur), chaque joueur fait un tour complet (360°), comme à l'ouverture de la page 2 :
// séquence 000 → 047 → 000, puis la photo nette de face (Turn).

const TURN_S = 2.5   // durée du tour complet (comme le défilement automatique de la page 2)
const SWAP = 2       // SwapTurn : fondu entre les deux joueurs sur ±2 images autour du dos
const SWAP_S = 1.6   // SwapTurn : durée du tour d'un duel au suivant (plus court que l'arrivée)

/** Joueur qui fait un tour complet sur lui-même quand `play` devient vrai (ou à son arrivée si
    `play` l'est déjà) : canvas de la séquence de rotation, photo nette de face avant et après.
    Mouvement réduit : la photo seule. Si une image n'est pas encore chargée, la dernière reste
    affichée. */
export function Turn({ id, name, play }) {
  const reduced = useReducedMotion()
  const canvas = useRef(null)
  const frame = useRef(0)
  const drawn = useRef(null)
  const [turning, setTurning] = useState(false)
  const draw = () => {
    const c = canvas.current
    const img = c && frameAt(id, frame.current)
    if (!img || img === drawn.current) return
    const ctx = c.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    drawn.current = img
  }
  useLayoutEffect(() => {
    const c = canvas.current
    if (!c) return
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      c.width = Math.round(c.clientWidth * dpr)
      c.height = Math.round(c.clientHeight * dpr)
      drawn.current = null
      draw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(c)
    return () => ro.disconnect()
  }, [id])
  useEffect(() => {
    open(id)
    return subscribe(id, () => { drawn.current = null; draw() })
  }, [id])
  useEffect(() => {
    if (!play || reduced) return
    let anim
    let cancelled = false
    ;(async () => {
      // Attend les images de la séquence (au plus 1,5 s).
      for (let t = 0; t < 30 && !hasFrames(id, 0, FRAMES - 1); t++) {
        await new Promise((r) => setTimeout(r, 50))
        if (cancelled) return
      }
      frame.current = 0
      drawn.current = null
      draw()
      setTurning(true)
      anim = animate(0, FRAMES, {
        duration: TURN_S,
        ease: 'easeInOut',
        onUpdate: (v) => { frame.current = Math.round(v) % FRAMES; draw() },
        onComplete: () => setTurning(false),
      })
    })()
    return () => { cancelled = true; anim?.stop() }
  }, [play, id, reduced])
  return (
    <>
      <canvas ref={canvas} className={`rotation${turning ? '' : ' is-hidden'}`} aria-hidden="true" />
      <img className={`still${turning ? '' : ' is-on'}`} src={photoUrl(id)} alt={name} width="810" height="1440" />
    </>
  )
}

/** Joueur qui passe à un autre en tournant (duels de Mon classement) : à l'arrivée, un tour
    complet comme Turn ; quand `id` change, le joueur affiché fait un tour complet et, au milieu
    (de dos, image 24), la séquence du nouveau joueur prend le relais jusqu'à sa face. `onMid` :
    appelé à ce moment (le reste de la page change en même temps). Mouvement réduit : la photo du
    nouveau joueur, directement. */
export function SwapTurn({ id, name, onMid }) {
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
    const k = from === to ? 1 : Math.min(1, Math.max(0, (v - (FRAMES / 2 - SWAP)) / (2 * SWAP)))
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
    if (reduced) { pos.current = { from: id, to: id, v: 0 }; setStill(id); if (!isFirst) onMid?.(); return () => offs.forEach((f) => f()) }
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
      if (!ready) { pos.current = { from: id, to: id, v: 0 }; passMid(); return }
      pos.current = { from, to: id, v: 0 }
      draw()
      setTurning(true)
      anim = animate(0, FRAMES, {
        duration: SWAP_S,
        ease: [0.45, 0, 0.55, 1],   // accélération et arrêt doux, vitesse régulière au milieu
        onUpdate: (v) => {
          pos.current.v = v
          if (v >= FRAMES / 2) passMid()
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

/** Prénom et nom en arc de cercle au-dessus de la tête du joueur (taille des lettres selon
    la longueur du nom). */
/** Nom qui défile lettre par lettre vers un autre, comme les chiffres du compteur : chaque
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
function useRollingText(text, trigger = text, onMount = false) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(text)
  const prev = useRef({ text, trigger: onMount ? {} : trigger })   // onMount : défile dès l'affichage
  useEffect(() => {
    const before = prev.current
    const old = before.text
    const changed = before.trigger !== trigger || old !== text
    prev.current = { text, trigger }
    if (!changed || reduced) { setShown(text); return }
    const t0 = performance.now(), n = text.length
    const pool = /^[\d\s,.–-]*$/.test(text) ? ROLL_DIGITS : ROLL_CHARS
    let raf
    const frame = (now) => {
      const k = rollEase(Math.min(1, (now - t0) / (ROLL.duration * 1000)))
      const len = Math.round(old.length + (n - old.length) * Math.min(1, k * 2))
      let out = ''
      for (let i = 0; i < len; i++) {
        const settle = 0.2 + (0.8 * (i + 1)) / Math.max(1, n)   // la lettre i se pose à cet instant
        const target = text[i] ?? ''
        out += k >= settle || /[\s,.–-]/.test(target) ? target : pool[Math.floor(Math.random() * pool.length)]
      }
      setShown(k >= 1 ? text : out)
      raf = k < 1 ? requestAnimationFrame(frame) : 0
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
export function Counter({ value, format = String, trigger }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(value)
  const [same, setSame] = useState(0)   // joueur changé, valeur identique : ses chiffres défilent
  const prev = useRef({ value, trigger })
  useEffect(() => {
    const start = prev.current.value
    const changedPlayer = prev.current.trigger !== trigger
    prev.current = { value, trigger }
    if (reduced || typeof value !== 'number') { setShown(value); return }
    if (value === start) { setShown(value); if (changedPlayer) setSame((n) => n + 1); return }
    const decimals = Number.isInteger(start) && Number.isInteger(value) ? 0 : 2
    const c = animate(start, value, { ...ROLL, onUpdate: (v) => setShown(Number(v.toFixed(decimals))) })
    return () => c.stop()
  }, [value, trigger, reduced])
  const text = format(shown)
  return <span className="counter">{same ? <Rolling key={same} text={text} trigger={same} onMount /> : text}</span>
}

/** Stats au milieu, entre les deux joueurs. */
export function Compare({ a, b, titles = true }) {
  // titles : lignes des titres collectifs et individuels (absentes des duels de Mon classement).
  const rows = [
    { label: 'Titres collectifs', get: (p) => p.collectif.length, format: same },
    // Seuls les titres majeurs (1er) comptent ; les places d'honneur (2e, 3e) non.
    { label: 'Titres individuels', get: (p) => p.individuel.filter((t) => t.rang === 1).length,
      format: same },
    { label: 'Matches', get: (p) => p.stats.matchs, format: same },
    { label: 'Buts', get: (p) => p.stats.buts, format: same },
    { label: 'Assists', get: (p) => p.stats.passes, format: same },
    { label: 'Ratio', tip: 'Buts + Assists / match', get: (p) => round2(p.stats.contributionsParMatch),
      format: decimal },
  ]
  return (
    <div className="compare">
      {rows.filter((r) => titles || !r.label.startsWith('Titres')).map((r) => (
        <CompareRow key={r.label} label={r.label} tip={r.tip} left={r.get(a)} right={r.get(b)}
                    format={r.format} trigger={[a.id, b.id]} />
      ))}
    </div>
  )
}

/** Club, drapeau et poste, puis les titres collectifs et individuels. */
export function Palmares({ player, side }) {
  // Au changement de joueur (Présentation, page du duel, jeu) : les lignes restent en place et
  // tous leurs textes défilent ensemble, au rythme des chiffres (Rolling, ROLL), même s'ils ne
  // changent pas ; les logos, drapeaux et icônes basculent (Flap) ; lignes en plus : fondu.
  const club = clubLogo(player.club)
  // Lignes qui apparaissent (nouveau joueur avec plus de titres) : elles défilent aussi, sauf au
  // tout premier affichage de la page.
  const shownOnce = useRef(false)
  useEffect(() => { shownOnce.current = true }, [])
  const roll = (text) => <Rolling text={text} trigger={player.id} onMount={shownOnce.current} />
  return (
    <div className={`palmares is-${side}`}>
      <div className="badges">
        {club && <Flap trigger={player.id} src={club} alt={player.club} title={player.club} className="club" width="52" height="52" />}
        <div className="flag-row">
          <Flap trigger={player.id} src={asset(player.drapeau)} alt={player.selection} title={player.selection} className="flag" width="48" height="32" />
          <Tip label={posteLabel(player.poste)}><span className="poste">{roll(player.poste)}</span></Tip>
        </div>
      </div>
      <div className="block">
        <h3>Collectif</h3>
        {player.collectif.length ? (
          <ul>
            {player.collectif.map((t, i) => (
              <li key={i}>
                <Flap trigger={player.id} className="comp" src={asset(t.icone)} alt="" loading="lazy" width="36" height="36" />
                <span className="award">{roll(t.titre)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty" aria-label="Aucun titre">/</p>
        )}
      </div>
      <div className="block">
        <h3>Individuel</h3>
        <ul>
          {player.individuel.map((t, i) => (
            // Places d'honneur (2e, 3e) grisées : seuls les titres majeurs (1er) comptent.
            <li key={i} title={t.titre} className={t.rang > 1 ? `is-minor is-rank-${t.rang}` : undefined}>
              <Flap trigger={player.id} className="comp" src={asset(t.logo)} alt={t.competition} loading="lazy" width="36" height="36" />
              <span className="award">{roll(t.titre.split(' — ')[0])}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Bloc des deux joueurs : palmarès · joueur · stats · joueur · palmarès. `onStep(side, 1)` :
    joueur suivant de ce côté (flèches, comme en page 2). */
export default function FinalPlayers({ pair, onStep, play = false }) {
  const [a, b] = pair
  return (
    <>
      <h2 className="sr-only">{a.nom} contre {b.nom}</h2>
      <Palmares player={a} side="left" />
      {[a, b].map((p, i) => (
        <div key={i ? 'right' : 'left'} className={`figure is-${i ? 'right' : 'left'}`} style={kitStyle(p.id)}>
          <ArcName id={p.id} name={p.nom} />
          <Turn key={p.id} id={p.id} name={p.nom} play={play} />
          <div className="figure-picker">
            <button className={`arrow ${i ? 'is-outer-right' : 'is-outer-left'}`}
                    onClick={() => onStep(i, 1)} aria-label="Joueur suivant">
              <svg viewBox="0 0 24 24" aria-hidden="true">{i ? <path d="M9 5l7 7-7 7" /> : <path d="M15 5l-7 7 7 7" />}</svg>
            </button>
          </div>
        </div>
      ))}
      <Compare a={a} b={b} titles={false} />
      <Palmares player={b} side="right" />
    </>
  )
}
