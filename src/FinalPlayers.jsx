import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'
import { FRAMES, asset, decimal, photoUrl, posteLabel } from './data'
import { frameAt, hasFrames, open, subscribe } from './sequence'
import { ClubLogo, Flag } from './Nameplate'
import Tip from './Tip'

// Copie du bloc des deux joueurs de la page 2 (Duel.jsx), pour la page finale (Final.jsx) :
// même disposition (palmarès · joueur · stats face à face · joueur · palmarès), même contenu,
// mêmes classes. Tout est affiché d'emblée. À l'arrivée de la page (et à chaque changement de
// joueur), chaque joueur fait un tour complet (360°), comme à l'ouverture de la page 2 :
// séquence 000 → 047 → 000, puis la photo nette de face (Turn).

const TURN_S = 2.5   // durée du tour complet (comme le défilement automatique de la page 2)

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

/** Prénom et nom en arc de cercle au-dessus de la tête du joueur (taille des lettres selon
    la longueur du nom). */
export function ArcName({ id, name }) {
  const fontSize = Math.min(135, 880 / (name.length * 0.5))
  return (
    <svg className="arc-name" viewBox="0 0 1000 260" aria-hidden="true">
      <path id={`final-name-${id}`} d="M 80 250 A 520 520 0 0 1 920 250" />
      <text fontSize={fontSize}>
        <textPath href={`#final-name-${id}`} startOffset="50%" textAnchor="middle">{name}</textPath>
      </text>
    </svg>
  )
}

const same = (n) => n
// Contributions comparées sur les valeurs arrondies affichées (1,20 contre 1,25).
const round2 = (n) => Math.round(n * 100) / 100

/** Une ligne du face-à-face : valeur de gauche · libellé · valeur de droite (meilleur score
    mis en avant, sauf matchs). */
function CompareRow({ label, tip, left, right, format, compare }) {
  const better = (a, b) => (compare && a > b ? 'is-better' : undefined)
  return (
    <div className="compare-row">
      <strong className={better(left, right)}>{format(left)}</strong>
      <span>{tip ? <Tip label={tip}>{label}</Tip> : label}</span>
      <strong className={better(right, left)}>{format(right)}</strong>
    </div>
  )
}

/** Stats au milieu, entre les deux joueurs. */
function Compare({ a, b }) {
  const rows = [
    { label: 'Titres collectifs', get: (p) => p.collectif.length, format: same, compare: true },
    // Seuls les titres majeurs (1er) comptent ; les places d'honneur (2e, 3e) non.
    { label: 'Titres individuels', get: (p) => p.individuel.filter((t) => t.rang === 1).length,
      format: same, compare: true },
    { label: 'Matches', get: (p) => p.stats.matchs, format: same, compare: false },
    { label: 'Buts', get: (p) => p.stats.buts, format: same, compare: true },
    { label: 'Assists', get: (p) => p.stats.passes, format: same, compare: true },
    { label: 'Ratio', tip: 'Buts + Assists / match', get: (p) => round2(p.stats.contributionsParMatch),
      format: decimal, compare: true },
  ]
  return (
    <div className="compare">
      {rows.map((r) => (
        <CompareRow key={r.label} label={r.label} tip={r.tip} left={r.get(a)} right={r.get(b)}
                    format={r.format} compare={r.compare} />
      ))}
    </div>
  )
}

/** Club, drapeau et poste, puis les titres collectifs et individuels. */
export function Palmares({ player, side }) {
  return (
    <div className={`palmares is-${side}`}>
      <div className="badges">
        <ClubLogo player={player} />
        <div className="flag-row">
          <Flag player={player} />
          <Tip label={posteLabel(player.poste)}><span className="poste">{player.poste}</span></Tip>
        </div>
      </div>
      <div className="block">
        <h3>Collectif</h3>
        {player.collectif.length ? (
          <ul>
            {player.collectif.map((t) => (
              <li key={t.titre}>
                <img className="comp" src={asset(t.icone)} alt="" loading="lazy" width="36" height="36" />
                <span className="award">{t.titre}</span>
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
          {player.individuel.map((t) => (
            // Places d'honneur (2e, 3e) grisées : seuls les titres majeurs (1er) comptent.
            <li key={t.titre} title={t.titre} className={t.rang > 1 ? `is-minor is-rank-${t.rang}` : undefined}>
              <img className="comp" src={asset(t.logo)} alt={t.competition} loading="lazy" width="36" height="36" />
              <span className="award">{t.titre.split(' — ')[0]}</span>
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
        <div key={i ? 'right' : 'left'} className={`figure is-${i ? 'right' : 'left'}`}>
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
      <Compare a={a} b={b} />
      <Palmares player={b} side="right" />
    </>
  )
}
