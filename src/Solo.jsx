import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, m, useIsPresent } from 'framer-motion'
import players, { decimal } from './data'
import Tip from './Tip'
import { ArcName, Palmares, Turn } from './FinalPlayers'
import { SingleTable } from './FinalTables'
import { reducedPlayers, useNarrow } from './Final'
import { SLIDE, finalVariants } from './transitions'

// Page « Présentation des joueurs » (27/09/2026) : la page du duel (Final.jsx) avec un seul
// joueur, en grand. Même comportement : à l'arrivée et à chaque changement de joueur, un tour
// complet (Turn) ; grand écran, scène épinglée (GSAP ScrollTrigger, pin + scrub) : au scroll, le
// palmarès et les stats s'effacent vers le haut, un voile couvre le joueur et son tableau des
// compétitions monte au centre ; mobile et mouvement réduit : bande du joueur réduite puis le
// tableau en défilement classique. ← / → : joueur précédent / suivant ; ↓ : tableau ; ↑ / Échap :
// retour au choix du joueur (SoloPick.jsx). Classes de la page du duel (.final…), différences sous .solo (styles.css).

const TABLES_MAX = 0.62
const BAND_FLOW = 0.36
const MIN_K = 0.45
const STATS_CENTER = 0.49   // milieu de la colonne des stats, en part de la hauteur de l'écran
const round2 = (n) => Math.round(n * 100) / 100
// value : valeur brute (comparaison) ; format : affichage. Matches : jamais en or.
const ROWS = [
  { label: 'Titres collectifs', value: (p) => p.collectif.length },
  { label: 'Titres individuels', value: (p) => p.individuel.filter((t) => t.rang === 1).length },
  { label: 'Matches', value: (p) => p.stats.matchs, neutral: true },
  { label: 'Buts', value: (p) => p.stats.buts },
  { label: 'Assists', value: (p) => p.stats.passes },
  { label: 'Ratio', tip: 'Buts + Assists / match', value: (p) => p.stats.contributionsParMatch,
    format: (v) => decimal(round2(v)) },
]

// Score en or (27/09/2026) : nettement au-dessus des autres candidats, c'est-à-dire supérieur de
// plus de 2/3 à la moyenne des neuf autres (valeur > 5/3 × leur moyenne).
const STANDOUT = 5 / 3
const standout = (row, player) => {
  const others = players.filter((p) => p.id !== player.id).map(row.value)
  const mean = others.reduce((a, b) => a + b, 0) / others.length
  return !row.neutral && row.value(player) > STANDOUT * mean
}

/** Stats de la saison, à droite du joueur : pour chaque stat, l'intitulé (style de la page du
    duel : petites capitales grises ; deux mots : sur deux lignes) et le score dessous, centrés ;
    en or s'il se détache des autres candidats (STANDOUT). */
function SoloStats({ player }) {
  return (
    <div className="compare solo-stats">
      {ROWS.map((r) => {
        const label = r.label.replace(' ', '\n')
        return (
        <div key={r.label} className="compare-row">
          <span>{r.tip ? <Tip label={r.tip}>{label}</Tip> : label}</span>
          <strong className={standout(r, player) ? 'is-better' : undefined}>{(r.format ?? String)(r.value(player))}</strong>
        </div>
        )
      })}
    </div>
  )
}

export default function Solo({ player, nav, reduced, onBack, onStep }) {
  const isPresent = useIsPresent()
  const narrow = useNarrow()
  const [gsapFailed, setGsapFailed] = useState(false)
  const pinned = !narrow && !reduced && !gsapFailed
  const stage = useRef(null)
  const band = useRef(null)
  const tables = useRef(null)
  const veil = useRef(null)
  const tablesShown = useRef(false)
  const [shownView, setShownView] = useState(false)
  const scrollToEnd = (toTables) => {
    const end = toTables ? document.documentElement.scrollHeight - window.innerHeight : 0
    if (Math.abs(window.scrollY - end) < 2) return false
    animate(window.scrollY, end, { duration: reduced ? 0 : 0.8, ease: 'easeInOut', onUpdate: (v) => window.scrollTo(0, v) })
    return true
  }
  useLayoutEffect(() => { window.scrollTo(0, 0) }, [])

  // Tableau (grand écran) : rapetissé (--k) s'il dépasse TABLES_MAX de la hauteur, centré.
  useLayoutEffect(() => {
    const el = tables.current
    if (!el) return
    const fit = () => {
      if (!pinned) { el.style.setProperty('--k', '1'); return }
      const avail = window.innerHeight * TABLES_MAX
      let k = 1
      for (let n = 0; n < 3; n++) {
        el.style.setProperty('--k', String(k))
        const h = el.scrollHeight
        if (h <= avail) break
        k = Math.max(MIN_K, k * (avail / h))
      }
      const st = stage.current
      if (st) {
        st.style.setProperty('--tables-h', `${el.offsetHeight}px`)
        st.style.setProperty('--tables-top', `${Math.max(16, (window.innerHeight - el.offsetHeight) / 2)}px`)
      }
    }
    fit()
    document.fonts?.ready.then(fit)
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [pinned, player.id])

  // Colonne des stats (grand écran) : figée, son milieu toujours à STATS_CENTER de la hauteur de
  // l'écran, quel que soit le joueur (27/09/2026 : position du palmarès de Kane).
  useLayoutEffect(() => {
    const grid = band.current
    const align = () => {
      const stats = grid?.querySelector('.solo-stats')
      if (!stats) return
      stats.style.marginTop = '0px'
      if (!pinned || !stats.offsetHeight) return
      const top = stats.getBoundingClientRect().top - (grid.getBoundingClientRect().top - grid.offsetTop)
      stats.style.marginTop = `${window.innerHeight * STATS_CENTER - stats.offsetHeight / 2 - top}px`
    }
    align()
    document.fonts?.ready.then(align)
    window.addEventListener('resize', align)
    return () => window.removeEventListener('resize', align)
  }, [pinned, player.id])

  // Mobile / mouvement réduit : bande du joueur d'emblée réduite, puis le tableau.
  const [staticBand, setStaticBand] = useState(null)
  useLayoutEffect(() => {
    if (pinned) { setStaticBand(null); return }
    const place = () => {
      const bandH = window.innerHeight * BAND_FLOW
      setStaticBand({ ...reducedPlayers(band.current, bandH), height: bandH })
    }
    place()
    document.fonts?.ready.then(place)
    const t = setTimeout(place, SLIDE.duration * 1000)
    window.addEventListener('resize', place)
    return () => { clearTimeout(t); window.removeEventListener('resize', place) }
  }, [pinned, player.id])

  // Grand écran : transition épinglée, créée à la fin réelle du glissement d'arrivée.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    if (!pinned || !entered) return
    let ctx   // gsap.context : à la sortie, revert() retire aussi les styles posés par la timeline
    let cancelled = false
    const t = setTimeout(async () => {
      let gsap, ScrollTrigger
      try {
        ;[{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
      } catch {
        if (!cancelled) setGsapFailed(true)
        return
      }
      if (cancelled) return
      gsap.registerPlugin(ScrollTrigger)
      const grid = band.current
      const panel = tables.current
      ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: stage.current,
          start: 'top top',
          end: () => `+=${window.innerHeight}`,
          pin: true,
          scrub: 0.6,
          onUpdate: (self) => {
            const v = self.progress > 0.5
            if (v !== tablesShown.current) { tablesShown.current = v; setShownView(v) }
          },
          invalidateOnRefresh: true,
        },
      })
      tl.fromTo(grid.querySelectorAll('.palmares .block, .palmares .badges, .figure-picker, .arc-name'), { opacity: 1, y: 0 }, { opacity: 0, y: -48, duration: 0.45 }, 0)
        .fromTo(grid.querySelector('.compare'), { opacity: 1, y: 0 }, { opacity: 0, y: -24, duration: 0.4 }, 0)
        .fromTo(panel, { y: () => (window.innerHeight + panel.offsetHeight) / 2 + 24 }, { y: 0, duration: 1 }, 0)
        .fromTo(veil.current, { opacity: 0 }, { opacity: 1, duration: 1 }, 0)
        .fromTo(grid.querySelectorAll('.figure'), { opacity: 1 }, { opacity: 0, duration: 0.8 }, 0.2)
      })
      ScrollTrigger.refresh()
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(t)
      ctx?.revert()   // (passage en mode empilé : tableaux et joueurs sans transformation restante)
    }
  }, [pinned, entered, player.id])

  // Retour à l'accueil : la transition est d'abord rejouée à l'envers si la page a défilé.
  const leaving = useRef(false)
  const back = useCallback(() => {
    if (leaving.current) return
    leaving.current = true
    const y = window.scrollY
    if (reduced || y < 5) { onBack(); return }
    animate(y, 0, { duration: Math.min(1.6, 0.4 + y / window.innerHeight), ease: 'easeInOut',
                    onUpdate: (v) => window.scrollTo(0, v), onComplete: onBack })
  }, [onBack, reduced])

  // Élan de la molette qui a ouvert la page : ignoré (comme la page du duel).
  useLayoutEffect(() => {
    const openedAt = performance.now()
    let last = openedAt
    let blocking = true
    const onWheel = (e) => {
      const now = performance.now()
      if (blocking && (now - last > 250 || now - openedAt > 2500)) blocking = false
      last = now
      if (blocking) { e.preventDefault(); window.scrollTo(0, 0) }
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (!isPresent) return
    const onKey = (e) => {
      if (leaving.current) { e.preventDefault(); return }
      if (e.key === 'ArrowUp' && window.scrollY > 2) { e.preventDefault(); scrollToEnd(false) }
      else if (e.key === 'Escape' || e.key === 'ArrowUp') { e.preventDefault(); back() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); scrollToEnd(true) }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (!tablesShown.current) onStep(e.key === 'ArrowRight' ? 1 : -1)
      }
    }
    const openedAt = performance.now()
    let lastWheel = 0
    let fromTop = false
    const onWheel = (e) => {
      const now = performance.now()
      if (now - lastWheel > 200) fromTop = window.scrollY <= 0
      lastWheel = now
      if (fromTop && e.deltaY < -20 && now - openedAt > 800) { fromTop = false; back() }
    }
    // Doigt : vers le bas depuis le haut de la page → accueil ; horizontal → joueur voisin.
    let touch = null
    const onTouchStart = (e) => { touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, top: window.scrollY <= 0 } }
    const onTouchEnd = (e) => {
      if (!touch) return
      const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (!tablesShown.current) onStep(dx < 0 ? 1 : -1) }
      else if (touch.top && dy > 80) back()
      touch = null
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [back, onStep, isPresent, reduced])

  const step = (d) => { if (!tablesShown.current) onStep(d) }
  return (
    <m.main className={`final solo ${pinned ? 'is-pinned' : 'is-flow'}`} custom={nav} variants={finalVariants}
            initial="hidden" animate="shown" exit="exit"
            onAnimationComplete={(def) => { if (def === 'shown') setEntered(true) }}>
      <h1 className="sr-only">Les candidats : {player.nom}</h1>
      <section ref={stage} className="final-stage">
        <div className="final-band" style={staticBand ? { height: staticBand.height } : undefined}>
          <div ref={band} className="sticky duel-grid final-players solo-grid"
               style={staticBand ? { transform: `translateY(${staticBand.y}px) scale(${staticBand.scale})` } : undefined}>
            <Palmares player={player} side="left" />
            <div className="figure is-left">
              <ArcName id={player.id} name={player.nom} />
              <Turn key={player.id} id={player.id} name={player.nom} play={entered} />
              <div className="figure-picker">
                <button className="arrow is-outer-left" onClick={() => step(-1)} aria-label="Joueur précédent">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
                </button>
                <button className="arrow is-outer-right" onClick={() => step(1)} aria-label="Joueur suivant">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
            <SoloStats player={player} />
          </div>
        </div>
        {pinned && <div ref={veil} className="final-veil" aria-hidden="true" />}
        <div ref={tables} className="details final-tables">
          <SingleTable player={player} />
        </div>
        {/* Vue des joueurs (et toujours sur mobile) : flèche vers le haut, retour à la page
            précédente, comme la flèche « Menu » des autres pages. */}
        {!(pinned && shownView) && (
          <button className="intro-down final-up page-up" onClick={back}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7" /></svg>
            <span className="intro-down-label">Les candidats</span>
          </button>
        )}
        {pinned && (<>
          <button className={`intro-down final-down${shownView ? '' : ' is-on'}`}
                  onClick={() => scrollToEnd(true)} tabIndex={shownView ? -1 : 0} aria-hidden={shownView}>
            <span className="intro-down-label">Voir le tableau détaillé</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7" /></svg>
          </button>
          <button className={`intro-down final-down final-up${shownView ? ' is-on' : ''}`}
                  onClick={() => scrollToEnd(false)} tabIndex={shownView ? 0 : -1} aria-hidden={!shownView}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7" /></svg>
            <span className="intro-down-label">Voir le joueur</span>
          </button>
        </>)}
      </section>
    </m.main>
  )
}
