import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, m, useMotionValue, useMotionValueEvent, useScroll, useTransform } from 'framer-motion'
import { FRAMES, asset, decimal, photoUrl } from './data'
import { ClubLogo, Flag } from './Nameplate'
import { duelVariants } from './transitions'
import { frameAt, hasFrames, open, subscribe } from './sequence'

function useNarrow() {
  const query = '(max-width: 820px)'
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

/** Mouvement réduit : seule la photo de face, sans rotation. */
function Rotation({ id, progress, spin, reduced }) {
  if (reduced) {
    return <img className="rotation" src={photoUrl(id)} alt="" width="810" height="1440" />
  }
  return <Sequence id={id} progress={progress} spin={spin} />
}

// Rotation au scroll : de face en haut de page (comme en page 1) à de face en bas, en TURNS
// tours complets (image 000 → 047 → 000).
const TURNS = 1
const frameOf = (p) => Math.round(Math.max(0, Math.min(1, p)) * FRAMES * TURNS) % FRAMES

// Quand le scroll s'arrête sur l'image 000 (début ou fin du tour), la photo studio
// nette, calée sur cette image, la remplace. Pas de photo de dos : l'image de dos de
// la vidéo diffère trop de la photo (nom et numéro dédoublés au fondu).
const STILL_DELAY = 120   // ms sans scroll avant d'afficher la photo
// Textes d'un côté, pour l'animation de changement de joueur.
const SIDE_TEXT = [
  '.figure.is-left .arc-name, .palmares.is-left :is(.badges, h3, li, .empty), .compare-row strong:first-child',
  '.figure.is-right .arc-name, .palmares.is-right :is(.badges, h3, li, .empty), .compare-row strong:last-child',
]
const LINE_SPAN = 0.42   // s : écart entre la ligne du haut et celle du bas

/** Retard de chaque texte d'un côté selon sa hauteur à l'écran : ligne par ligne, du haut vers
    le bas (entrée) ou du bas vers le haut (sortie, `upward`). */
function staggerLines(root, side, upward = false) {
  const els = [...root.querySelectorAll(SIDE_TEXT[side])]
  const tops = els.map((el) => el.getBoundingClientRect().top)
  const min = Math.min(...tops)
  const max = Math.max(...tops)
  els.forEach((el, k) => {
    const r = max > min ? (tops[k] - min) / (max - min) : 0
    el.style.setProperty('--d', `${(upward ? 1 - r : r) * LINE_SPAN}s`)
  })
}

const AUTOPLAY = 3        // s : défilement automatique après une ouverture par ↓
const SPIN_SPEED = 34     // images par seconde pendant un changement de joueur (tour ≈ 1,4 s)

/** Canvas qui affiche l'image de la séquence correspondant à la progression du scroll, ou
    à `spin` pendant un changement de joueur (spin.value ≥ 0 : numéro d'image imposé). */
function Sequence({ id, progress, spin }) {
  const canvas = useRef(null)
  const wanted = useRef(spin.value.get() >= 0 ? Math.round(spin.value.get()) % FRAMES
                                               : frameOf(progress.get()))
  const drawn = useRef(null)
  const [still, setStill] = useState(wanted.current === 0)
  const [loadedId, setLoadedId] = useState(null)   // joueur dont la photo nette est chargée
  const idle = useRef(0)

  const draw = () => {
    const c = canvas.current
    if (!c) return
    const img = frameAt(id, wanted.current)
    if (!img || img === drawn.current) return
    const ctx = c.getContext('2d')
    ctx.imageSmoothingQuality = 'high'   // 'low' par défaut : réduction crénelée
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    drawn.current = img
  }

  // Taille réelle du canvas = taille affichée × densité de pixels.
  useLayoutEffect(() => {
    const c = canvas.current
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
    // Une image vient d'arriver : on redessine si elle est plus proche de la cible.
    return subscribe(id, () => { drawn.current = null; draw() })
  }, [id])

  const update = () => {
    const s = spin.value.get()
    wanted.current = s >= 0 ? Math.round(s) % FRAMES : frameOf(progress.get())
    draw()
    // La rotation reprend : retour à la vidéo ; photo nette une fois l'image arrêtée.
    setStill(false)
    clearTimeout(idle.current)
    idle.current = setTimeout(() => setStill(wanted.current === 0), STILL_DELAY)
  }
  useMotionValueEvent(progress, 'change', () => {
    // Après un changement de joueur, le scroll reprend la main au premier mouvement.
    if (spin.value.get() >= 0 && !spin.animating.current) spin.value.set(-1)
    else update()
  })
  useMotionValueEvent(spin.value, 'change', update)
  useEffect(() => () => clearTimeout(idle.current), [])

  const shown = still && loadedId === id
  return (
    <>
      <canvas ref={canvas} className={`rotation${shown ? ' is-hidden' : ''}`}
              role="img" aria-label="Rotation du joueur" />
      <img className={`still${shown ? ' is-on' : ''}`} src={photoUrl(id)} alt=""
           width="810" height="1440" onLoad={() => setLoadedId(id)} />
    </>
  )
}

// Apparition au scroll : chaque élément met FADE (en progression du scroll) à apparaître ;
// les éléments d'une colonne sont répartis de REVEAL_START à REVEAL_END.
const FADE = 0.14
const REVEAL_START = 0.06
const REVEAL_END = 0.88
/** Moment d'apparition du i-ème de n éléments, répartis entre start et end (fin du fondu). */
const spread = (start, end) => (i, n) =>
  start + (n > 1 ? (i * (end - start - FADE)) / (n - 1) : 0)

/** Prénom et nom en arc de cercle au-dessus de la tête du joueur. La taille des lettres
    suit la longueur du nom pour que l'arc soit toujours rempli sans déborder. Au scroll,
    il apparaît en fondu en descendant légèrement, comme les stats (juste avant elles). */
function ArcName({ id, name, progress, reduced }) {
  const fontSize = Math.min(135, 880 / (name.length * 0.5))
  const opacity = useTransform(progress, [0, 0.06], [0, 1])
  const y = useTransform(progress, [0, 0.06], [-16, 0])
  return (
    <m.svg className="arc-name" viewBox="0 0 1000 260" aria-hidden="true"
           style={reduced ? undefined : { opacity, y }}>
      <path id={`arc-${id}`} d="M 80 250 A 520 520 0 0 1 920 250" />
      <text fontSize={fontSize}>
        <textPath href={`#arc-${id}`} startOffset="50%" textAnchor="middle">{name}</textPath>
      </text>
    </m.svg>
  )
}

/** Une ligne du face-à-face : valeur du joueur de gauche · libellé · valeur du joueur de
    droite. Avec `compare`, le meilleur score est en vert (aucun en cas d'égalité).
    Apparaît en fondu en descendant légèrement au fil du scroll. */
function CompareRow({ progress, at, reduced, label, left, right, format, compare, small }) {
  const opacity = useTransform(progress, [at, at + FADE], [0, 1])
  const y = useTransform(progress, [at, at + FADE], [-16, 0])
  const better = (a, b) => (compare && a > b ? 'is-better' : undefined)
  return (
    <m.div className={`compare-row${small ? ' is-small' : ''}`} style={reduced ? undefined : { opacity, y }}>
      <strong className={better(left, right)}>{format(left)}</strong>
      <span>{label}</span>
      <strong className={better(right, left)}>{format(right)}</strong>
    </m.div>
  )
}

const same = (n) => n
// Contributions comparées sur les valeurs arrondies affichées (1,20 contre 1,25).
const round2 = (n) => Math.round(n * 100) / 100

/** Stats au milieu de l'écran, entre les deux joueurs (meilleur score en vert, sauf matchs). */
function Compare({ a, b, progress, reduced, style, timing }) {
  const rows = [
    { label: 'Titres collectifs', get: (p) => p.collectif.length, format: same, compare: true },
    // Seuls les titres majeurs (1er) comptent ; les places d'honneur (2e, 3e) non.
    { label: 'Titres individuels', get: (p) => p.individuel.filter((t) => t.rang === 1).length,
      format: same, compare: true },
    { label: 'Matches', get: (p) => p.stats.matchs, format: same, compare: false },
    { label: 'Buts', get: (p) => p.stats.buts, format: same, compare: true },
    { label: 'Assists', get: (p) => p.stats.passes, format: same, compare: true },
    { label: 'Buts + Assists\n/ MATCH', get: (p) => round2(p.stats.contributionsParMatch),
      format: decimal, compare: true, small: true },
  ]
  return (
    <m.div className="compare" style={style}>
      {rows.map((r, i) => (
        <CompareRow key={r.label} progress={progress} reduced={reduced} at={timing(i, rows.length)}
                    label={r.label} left={r.get(a)} right={r.get(b)} format={r.format} compare={r.compare} small={r.small} />
      ))}
    </m.div>
  )
}

/** Élément qui apparaît au fil du scroll, comme une ligne de stats : fondu en descendant
    légèrement, à partir de la progression `at`. */
function Reveal({ as = 'div', progress, at, reduced, max = 1, className, children, ...rest }) {
  const Tag = m[as]
  const opacity = useTransform(progress, [at, at + FADE], [0, max])
  const y = useTransform(progress, [at, at + FADE], [-16, 0])
  return (
    <Tag className={className} style={reduced ? undefined : { opacity, y }} {...rest}>
      {children}
    </Tag>
  )
}

function Palmares({ player, side, progress, reduced, timing }) {
  // Ordre d'apparition : club / drapeau / poste, « Collectif », ses titres, « Individuel », ses titres.
  const count = 3 + Math.max(1, player.collectif.length) + player.individuel.length
  let n = 0
  const next = () => timing(n++, count)
  const r = { progress, reduced }
  return (
    <div className={`palmares is-${side}`}>
      <Reveal className="badges" at={next()} {...r}>
        <ClubLogo player={player} />
        <div className="flag-row">
          <Flag player={player} />
          <span className="poste">{player.poste}</span>
        </div>
      </Reveal>
      <div className="block">
        <Reveal as="h3" at={next()} {...r}>Collectif</Reveal>
        {player.collectif.length ? (
          <ul>
            {player.collectif.map((t) => (
              <Reveal as="li" key={t.titre} at={next()} {...r}>
                <img className="comp" src={asset(t.icone)} alt="" loading="lazy" width="36" height="36" />
                <span className="award">{t.titre}</span>
              </Reveal>
            ))}
          </ul>
        ) : (
          <Reveal as="p" className="empty" aria-label="Aucun titre" at={next()} {...r}>/</Reveal>
        )}
      </div>
      <div className="block">
        <Reveal as="h3" at={next()} {...r}>Individuel</Reveal>
        <ul>
          {player.individuel.map((t) => (
            // Places d'honneur (2e, 3e) grisées : seuls les titres majeurs (1er) comptent.
            <Reveal as="li" key={t.titre} title={t.titre} className={t.rang > 1 ? 'is-minor' : undefined}
                    max={t.rang > 1 ? 0.6 : 1} at={next()} {...r}>
              <img className="comp" src={asset(t.logo)} alt={t.competition}
                   loading="lazy" width="36" height="36" />
              {/* La compétition est indiquée par le logo : « Meilleur buteur — Liga » → « Meilleur buteur ». */}
              <span className="award">{t.titre.split(' — ')[0]}</span>
            </Reveal>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Page 2 — le duel : palmarès · joueur · stats face à face · joueur · palmarès ; les deux
    joueurs tournent ensemble au scroll. */
export default function Duel({ pair, reduced, onBack, onStep, autoplay = false }) {
  const section = useRef(null)
  const narrow = useNarrow()
  const { scrollYProgress: scrolled } = useScroll({ target: section, offset: ['start start', 'end end'] })
  // Recopie dans une motion value ordinaire : branchées directement sur useScroll,
  // les transformations sont confiées à une ViewTimeline native dont la plage est
  // fausse pour cette section plus haute que l'écran (stats restées transparentes).
  const progress = useMotionValue(0)
  useMotionValueEvent(scrolled, 'change', (p) => progress.set(p))

  const statsFade = useTransform(progress, [0.62, 0.7], [1, 0])
  // Grand écran : les 3 colonnes (palmarès, stats, palmarès) apparaissent ensemble, chacune
  // élément par élément, sur la même plage. Mobile : stats d'abord, puis les palmarès qui
  // prennent leur place.
  const statsTiming = narrow ? spread(0.04, 0.55) : spread(REVEAL_START, REVEAL_END)
  const palmTiming = narrow ? spread(0.66, 0.95) : spread(REVEAL_START, REVEAL_END)
  // Flèches de changement de joueur : seulement en fin de scroll (rotation terminée).
  const pickerOpacity = useTransform(progress, [0.9, 0.98], [0, 1])
  const pickerEvents = useTransform(pickerOpacity, (o) => (o > 0.5 ? 'auto' : 'none'))
  const statsStyle = narrow && !reduced ? { opacity: statsFade } : undefined

  // En haut de page à l'ouverture seulement : changer de joueur garde la position du scroll.
  useLayoutEffect(() => { window.scrollTo(0, 0) }, [])

  // Ouverture par ↓ depuis la page 1 : une fois la page arrivée, elle défile seule jusqu'en bas
  // en AUTOPLAY secondes — les joueurs font leur tour complet (image 000 → 047 → 000) pendant
  // que stats et palmarès apparaissent. Un geste de l'utilisateur (molette, doigt, touche)
  // l'interrompt et reprend la main.
  useEffect(() => {
    if (!autoplay || reduced) return
    let anim
    const stop = () => anim?.stop()
    const t = setTimeout(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      anim = animate(window.scrollY, max, {
        duration: AUTOPLAY, ease: 'easeInOut', onUpdate: (v) => window.scrollTo(0, v),
      })
    }, 850)   // après le glissement d'arrivée de la page
    const opts = { passive: true }
    window.addEventListener('wheel', stop, opts)
    window.addEventListener('touchstart', stop, opts)
    window.addEventListener('keydown', stop)
    return () => {
      clearTimeout(t)
      stop()
      window.removeEventListener('wheel', stop, opts)
      window.removeEventListener('touchstart', stop, opts)
      window.removeEventListener('keydown', stop)
    }
  }, [])

  // Le coup de molette qui a ouvert la page continue sur son élan (trackpad) et ferait
  // défiler la page 2 d'emblée : la rotation ne commencerait pas au début. On ignore cet
  // élan — tant que les événements s'enchaînent sans pause de 250 ms, au plus 2,5 s.
  useLayoutEffect(() => {
    const openedAt = performance.now()
    let last = openedAt
    let blocking = true
    const onWheel = (e) => {
      const now = performance.now()
      if (blocking && (now - last > 250 || now - openedAt > 2500)) blocking = false
      last = now
      if (blocking) {
        e.preventDefault()
        window.scrollTo(0, 0)   // annule aussi ce qui a défilé avant l'écoute
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    // ↑ ou Échap : retour à la page 1 (pour changer de joueurs).
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'ArrowUp') { e.preventDefault(); onBack() }
      // Comme en page 1 : ← change le joueur de gauche, → celui de droite.
      else if (e.key === 'ArrowLeft') { e.preventDefault(); onStep(0, 1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); onStep(1, 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack, onStep])

  // Remonter depuis le haut de la page ramène au duel de la page 1. Seul un geste commencé
  // en haut compte : l'inertie d'un scroll qui vient d'atteindre le haut est ignorée.
  useEffect(() => {
    const openedAt = performance.now()
    let lastWheel = 0
    let fromTop = false
    const onWheel = (e) => {
      const now = performance.now()
      if (now - lastWheel > 200) fromTop = window.scrollY <= 0
      lastWheel = now
      if (fromTop && e.deltaY < -20 && now - openedAt > 800) {
        fromTop = false
        onBack()
      }
    }
    let touchY = null
    const onTouchStart = (e) => { touchY = window.scrollY <= 0 ? e.touches[0].clientY : null }
    const onTouchEnd = (e) => {
      if (touchY !== null && e.changedTouches[0].clientY - touchY > 80) onBack()
      touchY = null
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [onBack])

  // Changement de joueur : le joueur affiché tourne jusqu'à être de dos, puis le nouveau
  // enchaîne, de dos, et finit son tour de face. Stats, nom et palmarès changent au passage
  // de dos. `shown` : joueurs affichés (en retard sur `pair` pendant l'animation).
  const [shown, setShown] = useState(pair)
  const latest = useRef(pair)
  latest.current = pair
  const spinA = { value: useMotionValue(-1), animating: useRef(false) }
  const spinB = { value: useMotionValue(-1), animating: useRef(false) }
  const spins = [spinA, spinB]
  const busy = useRef([false, false])
  const sticky = useRef(null)
  // Côté en cours de changement : ses textes (nom, chiffres, palmarès) s'effacent en flou
  // jusqu'au passage de dos, puis réapparaissent avec le nouveau joueur.
  const [swapping, setSwapping] = useState([false, false])
  const setSwap = (i, v) => setSwapping((cur) => (i ? [cur[0], v] : [v, cur[1]]))

  const switchSide = useCallback(async (i) => {
    if (busy.current[i]) return
    const target = latest.current[i]
    const put = (p) => setShown((cur) => (i ? [cur[0], p] : [p, cur[1]]))
    if (reduced) { put(target); return }
    busy.current[i] = true
    if (sticky.current) staggerLines(sticky.current, i, true)   // sortie : du bas vers le haut
    setSwap(i, true)
    const spin = spins[i]
    spin.animating.current = true
    open(target.id)
    const f0 = spin.value.get() >= 0 ? spin.value.get() % FRAMES : frameOf(progress.get())
    const back = f0 <= FRAMES / 2 ? FRAMES / 2 : FRAMES * 1.5
    await animate(spin.value, [f0, back], { duration: (back - f0) / SPIN_SPEED, ease: 'easeIn' })
    // Le nouveau joueur doit avoir ses images de dos → face (au plus 1,5 s d'attente).
    for (let t = 0; t < 30 && !hasFrames(target.id, FRAMES / 2, FRAMES - 1); t++) {
      await new Promise((r) => setTimeout(r, 50))
    }
    put(target)
    spin.value.set(FRAMES / 2)
    const turn = animate(spin.value, [FRAMES / 2, FRAMES], { duration: FRAMES / 2 / SPIN_SPEED, ease: 'easeOut' })
    // Textes du nouveau joueur rendus : retards calculés sur leurs positions, puis entrée.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    if (sticky.current) staggerLines(sticky.current, i)
    setSwap(i, false)
    await turn
    spin.value.set(0)   // de face, jusqu'au prochain mouvement de scroll
    spin.animating.current = false
    busy.current[i] = false
    if (latest.current[i].id !== target.id) switchSide(i)   // clic pendant l'animation
  }, [reduced])

  useEffect(() => {
    pair.forEach((p, i) => { if (p.id !== shown[i].id) switchSide(i) })
  }, [pair[0].id, pair[1].id])

  const [a, b] = shown
  return (
    <m.main
      className={`duel${reduced ? ' is-static' : ''}`}
      variants={duelVariants}
      initial="hidden"
      animate="shown"
      exit="exit"
    >

      <section ref={section} className="player-scroll">
        <div ref={sticky} className={`sticky duel-grid${swapping[0] ? ' is-swapping-left' : ''}${swapping[1] ? ' is-swapping-right' : ''}`}>
          <h1 className="sr-only">{a.nom} contre {b.nom}</h1>

          <Palmares player={a} side="left" progress={progress} reduced={reduced} timing={palmTiming} />
          {[a, b].map((p, i) => (
            <div key={i ? 'right' : 'left'} className={`figure is-${i ? 'right' : 'left'}`}>
              <ArcName id={p.id} name={p.nom} progress={progress} reduced={reduced} />
              <Rotation id={p.id} progress={progress} spin={spins[i]} reduced={reduced} />
              <m.div className="figure-picker"
                     style={reduced ? undefined : { opacity: pickerOpacity, pointerEvents: pickerEvents }}>
                {/* Une seule flèche par joueur, vers l'extérieur, comme en page 1 : ‹ à gauche,
                    › à droite (joueur suivant, celui d'en face est sauté). */}
                <button className={`arrow ${i ? 'is-outer-right' : 'is-outer-left'}`}
                        onClick={() => onStep(i, 1)} aria-label="Joueur suivant">
                  <svg viewBox="0 0 24 24" aria-hidden="true">{i ? <path d="M9 5l7 7-7 7" /> : <path d="M15 5l-7 7 7 7" />}</svg>
                </button>
              </m.div>
            </div>
          ))}
          <Compare a={a} b={b} progress={progress} reduced={reduced} style={statsStyle} timing={statsTiming} />
          <Palmares player={b} side="right" progress={progress} reduced={reduced} timing={palmTiming} />

        </div>
      </section>
    </m.main>
  )
}
