import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, m, useIsPresent } from 'framer-motion'
import FinalPlayers from './FinalPlayers'
import FinalTables from './FinalTables'
import { SLIDE, finalVariants } from './transitions'

// Page du duel (après la page de sélection ; remplace depuis le 26/09/2026 l'ancienne page de comparaison et celle des tableaux) : le bloc des deux joueurs
// de la page 2 et les deux tableaux de la page 3, réunis (copies : FinalPlayers.jsx,
// FinalTables.jsx).
//
// Grand écran : la scène est épinglée (GSAP ScrollTrigger, pin + scrub). Au départ, la
// disposition de la page 2 (palmarès · joueur · stats · joueur · palmarès). Au scroll vers le
// bas, les joueurs ne bougent pas et gardent leur taille ; les listes « Collectif » et
// « Individuel », le logo du club, le drapeau et le poste s'effacent vers le haut ; les stats du milieu s'effacent et un « VS » apparaît
// au centre, juste au-dessus des tableaux ; les tableaux montent du bas et se posent en bas de
// l'écran, par-dessus l'image, sur un fond noir légèrement transparent. Réversible au scroll
// vers le haut. Si les tableaux sont trop hauts (TABLES_MAX de la hauteur), leurs textes et
// icônes rapetissent (--k), sans retirer aucune ligne ni colonne.
//
// Mobile (et mouvement réduit) : pas d'épinglage ; bande des joueurs d'emblée réduite
// (BAND_FLOW, sans stats ni listes de titres, faute de place), puis les tableaux (empilés sur
// mobile) en défilement classique.
//
// GSAP n'est chargé qu'à l'arrivée sur cette page (import dynamique) : le premier chargement
// du site reste léger.

const TABLES_MAX = 0.6      // grand écran : hauteur maximale des tableaux (part de l'écran)
const BAND_FLOW = 0.3        // mobile / mouvement réduit : bande des joueurs, compacte
const PIN_LENGTH = 1         // longueur du scroll de la transition (en hauteurs d'écran)
const MIN_K = 0.45           // réduction maximale des tableaux
const NARROW = '(max-width: 820px)'
// Mobile : éléments qui doivent tenir dans la bande du haut (stats et listes de titres
// masquées, de hauteur nulle, ignorées).
// Le nom en arc déborde de son SVG (lettres au-dessus du tracé) : on mesure le texte lui-même.
const KEPT = '.figure, .arc-name text, .palmares, .compare'

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches)
  useEffect(() => {
    const mq = window.matchMedia(NARROW)
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

/** Réduction du bloc des joueurs pour que ce qui reste (photos, noms, logos, drapeaux) tienne
    dans la bande du haut (bandH px) : échelle et décalage vertical, origine en haut au centre.
    Mesuré sur le bloc sans transformation. */
function reducedPlayers(grid, bandH) {
  // Mesure sur le bloc non transformé (sinon une mesure refaite lirait le bloc déjà réduit).
  const prev = grid.style.transform
  grid.style.transform = 'none'
  const g = grid.getBoundingClientRect()
  let top = Infinity
  let bottom = -Infinity
  grid.querySelectorAll(KEPT).forEach((el) => {
    const r = el.getBoundingClientRect()
    if (!r.height) return
    top = Math.min(top, r.top - g.top)
    bottom = Math.max(bottom, r.bottom - g.top)
  })
  grid.style.transform = prev
  if (!isFinite(top)) return { scale: BAND_FLOW, y: 0 }
  const scale = Math.min(1, (bandH - 16) / (bottom - top))
  return { scale, y: 8 - top * scale }
}

export default function Final({ pair, nav, reduced, onBack, onStep }) {
  // Page qui sort : ses gestes ne comptent plus (la page suivante est seule à réagir).
  const isPresent = useIsPresent()
  const narrow = useNarrow()
  // GSAP introuvable (réseau, cache) : repli sur l'affichage simple, les tableaux restent visibles.
  const [gsapFailed, setGsapFailed] = useState(false)
  const pinned = !narrow && !reduced && !gsapFailed
  const stage = useRef(null)
  const players = useRef(null)
  const tables = useRef(null)
  const veil = useRef(null)
  // Tableaux visibles (transition au-delà de la moitié) : ← / → ne changent plus de joueur.
  const tablesShown = useRef(false)
  const [shownView, setShownView] = useState(false)   // même état, pour l'affichage (aide, flèche)
  // Défilement automatique vers les tableaux (↓, flèche du bas) ou vers les joueurs (↑).
  const scrollToEnd = (toTables) => {
    const end = toTables ? document.documentElement.scrollHeight - window.innerHeight : 0
    if (Math.abs(window.scrollY - end) < 2) return false
    animate(window.scrollY, end, { duration: reduced ? 0 : 0.8, ease: 'easeInOut',
                                   onUpdate: (v) => window.scrollTo(0, v) })
    return true
  }

  // Toujours en haut de la page à l'arrivée.
  useLayoutEffect(() => { window.scrollTo(0, 0) }, [])

  // Tableaux (grand écran) : s'ils dépassent TABLES_MAX de la hauteur, textes et icônes
  // rapetissent (--k, styles.css) jusqu'à ce qu'ils soient entièrement visibles, sans
  // défilement interne.
  useLayoutEffect(() => {
    const el = tables.current
    if (!el) return
    const fit = () => {
      if (!pinned) { el.style.setProperty('--k', '1'); return }
      const avail = window.innerHeight * TABLES_MAX
      let k = 1
      for (let n = 0; n < 3; n++) {   // la hauteur ne suit pas exactement --k : on affine
        el.style.setProperty('--k', String(k))
        const h = el.scrollHeight
        if (h <= avail) break
        k = Math.max(MIN_K, k * (avail / h))
      }
      stage.current?.style.setProperty('--tables-h', `${el.offsetHeight}px`)
      // Tableaux centrés en hauteur sur l'écran (et rapetissés si nécessaire pour y tenir).
      const st = stage.current
      if (st) {
        // Les noms en arc s'effacent quand les tableaux montent : centrage sur toute la hauteur.
        const minTop = 16
        const vh = window.innerHeight
        let h = el.offsetHeight
        if (vh - minTop - 12 < h) {   // pas la place sous les noms : on réduit encore
          const kk = Math.max(MIN_K, Number(el.style.getPropertyValue('--k')) * ((vh - minTop - 12) / h))
          el.style.setProperty('--k', String(kk))
          h = el.offsetHeight
          st.style.setProperty('--tables-h', `${h}px`)
        }
        // Centrés en hauteur sur l'écran.
        st.style.setProperty('--tables-top', `${Math.max(minTop, (vh - h) / 2)}px`)
      }
    }
    fit()
    document.fonts?.ready.then(fit)
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [pinned, pair[0].id, pair[1].id])

  // Mobile / mouvement réduit : bloc des joueurs d'emblée réduit (même calcul que la fin de
  // la transition), puis les tableaux en défilement classique.
  const [staticBand, setStaticBand] = useState(null)
  useLayoutEffect(() => {
    if (pinned) { setStaticBand(null); return }
    const place = () => {
      const bandH = window.innerHeight * BAND_FLOW
      setStaticBand({ ...reducedPlayers(players.current, bandH), height: bandH })
    }
    place()
    document.fonts?.ready.then(place)
    const t = setTimeout(place, SLIDE.duration * 1000)   // une fois la page arrivée
    window.addEventListener('resize', place)
    return () => { clearTimeout(t); window.removeEventListener('resize', place) }
  }, [pinned, pair[0].id, pair[1].id])

  // Grand écran : transition épinglée pilotée par le scroll (GSAP ScrollTrigger, pin + scrub),
  // créée seulement quand le glissement d'arrivée de la page est réellement fini (onAnimationComplete
  // de la page, et non un délai fixe) : mesurée plus tôt, la page encore décalée donnerait un
  // début de transition faux, et l'épinglage en position fixe ne fonctionne qu'une fois la page
  // sans transformation.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    if (!pinned || !entered) return
    let tl
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
      const grid = players.current
      const panel = tables.current
      tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: stage.current,
          start: 'top top',
          end: () => `+=${window.innerHeight * PIN_LENGTH}`,
          pin: true,
          scrub: 0.6,
          onUpdate: (self) => {
            const v = self.progress > 0.5
            if (v !== tablesShown.current) { tablesShown.current = v; setShownView(v) }
          },
          invalidateOnRefresh: true,
        },
      })
      // Les joueurs ne bougent pas : seuls les listes de titres, les stats, le « VS » et les
      // tableaux s'animent.
      tl.fromTo(grid.querySelectorAll('.palmares .block, .palmares .badges, .figure-picker, .arc-name'), { opacity: 1, y: 0 }, { opacity: 0, y: -48, duration: 0.45 }, 0)
        .fromTo(grid.querySelector('.compare'), { opacity: 1, y: 0 }, { opacity: 0, y: -24, duration: 0.4 }, 0)
        .fromTo(panel, { y: () => (window.innerHeight + panel.offsetHeight) / 2 + 24 }, { y: 0, duration: 1 }, 0)   // tableaux centrés : moitié de l'écran + moitié du tableau
        .fromTo(veil.current, { opacity: 0 }, { opacity: 1, duration: 1 }, 0)   // voile sombre sur les joueurs
        .fromTo(grid.querySelectorAll('.figure'), { opacity: 1 }, { opacity: 0, duration: 0.8 }, 0.2)   // joueurs effacés, tableaux visibles
      ScrollTrigger.refresh()
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(t)
      tl?.scrollTrigger?.kill(true)
      tl?.kill()
    }
  }, [pinned, entered, pair[0].id, pair[1].id])

  // Retour à la page de sélection : si la page a défilé, la transition est d'abord rejouée à l'envers
  // (défilement jusqu'en haut), puis la page de sélection revient. Un seul retour à la fois.
  const leaving = useRef(false)
  const back = useCallback(() => {
    if (leaving.current) return
    leaving.current = true
    const y = window.scrollY
    if (reduced || y < 5) { onBack(); return }
    animate(y, 0, {
      duration: Math.min(1.6, 0.4 + y / window.innerHeight),
      ease: 'easeInOut',
      onUpdate: (v) => window.scrollTo(0, v),
      onComplete: onBack,
    })
  }, [onBack, reduced])

  // Le coup de molette qui a ouvert la page continue sur son élan : on l'ignore (tant que les
  // événements s'enchaînent sans pause de 250 ms, au plus 2,5 s), comme en page 2.
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

  // ↑ ou Échap : retour à la page de sélection ; ↓ : tableaux ; ← / → : joueur suivant de ce côté. Remonter depuis le
  // haut de la page (molette ou doigt, geste commencé en haut) : retour à la page de sélection.
  useEffect(() => {
    if (!isPresent) return   // page en train de sortir (glissement) : ses gestes ne comptent plus
    const onKey = (e) => {
      if (leaving.current) { e.preventDefault(); return }
      // ↑ avec les tableaux affichés : ils redescendent, retour à la vue des joueurs, sans quitter
      // la page ; ↑ depuis cette vue (haut de page) ou Échap : retour à la page de sélection.
      if (e.key === 'ArrowUp' && window.scrollY > 2) { e.preventDefault(); scrollToEnd(false) }
      else if (e.key === 'Escape' || e.key === 'ArrowUp') { e.preventDefault(); back() }
      // ↓ : les tableaux apparaissent directement (défilement jusqu'à la fin de la transition).
      else if (e.key === 'ArrowDown') { e.preventDefault(); scrollToEnd(true) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (!tablesShown.current) onStep(0, 1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (!tablesShown.current) onStep(1, 1) }
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
    let touchY = null
    const onTouchStart = (e) => { touchY = window.scrollY <= 0 ? e.touches[0].clientY : null }
    const onTouchEnd = (e) => {
      if (touchY !== null && e.changedTouches[0].clientY - touchY > 80) back()
      touchY = null
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

  return (
    <m.main className={`final ${pinned ? 'is-pinned' : 'is-flow'}`} custom={nav} variants={finalVariants}
            initial="hidden" animate="shown" exit="exit"
            onAnimationComplete={(def) => { if (def === 'shown') setEntered(true) }}>
      <h1 className="sr-only">Le duel en détail</h1>
      <section ref={stage} className="final-stage">
        {/* Bande des joueurs : grand écran, pleine hauteur (les joueurs ne bougent jamais) ;
            mobile, d'emblée réduite (staticBand). */}
        <div className="final-band" style={staticBand ? { height: staticBand.height } : undefined}>
          <div ref={players} className="sticky duel-grid final-players"
               style={staticBand ? { transform: `translateY(${staticBand.y}px) scale(${staticBand.scale})` } : undefined}>
            <FinalPlayers pair={pair} onStep={(side, d) => { if (!tablesShown.current) onStep(side, d) }} play={entered} />
          </div>
        </div>
        {/* Grand écran : voile sombre et transparent sur les joueurs, qui apparaît quand les
            tableaux montent. */}
        {pinned && <div ref={veil} className="final-veil" aria-hidden="true" />}
        <div ref={tables} className="details final-tables">
          <FinalTables pair={pair} />
        </div>
        {/* Grand écran : flèche clignotante vers les tableaux (comme l'intro et la sélection),
            masquée une fois les tableaux affichés ; aide clavier en bas, selon la vue. */}
        {pinned && (
          <>
            <button className={`intro-down final-down${shownView ? '' : ' is-on'}`}
                    onClick={() => scrollToEnd(true)} aria-label="Voir les tableaux"
                    tabIndex={shownView ? -1 : 0} aria-hidden={shownView}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7" /></svg>
            </button>
            <p className="pick-help final-help" aria-hidden="true">
              {shownView ? '↑ JOUEURS · ÉCHAP SÉLECTION' : '↓ TABLEAUX · ← → CHANGER DE JOUEUR · ↑ SÉLECTION'}
            </p>
          </>
        )}
      </section>
    </m.main>
  )
}
