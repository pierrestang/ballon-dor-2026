// Comportement commun des pages de joueurs (page du duel, Présentation ; 27/09/2026) : comme les
// duels de Mon classement, les joueurs en grand en haut de page, les tableaux détaillés dessous,
// en simple défilement. En descendant, les joueurs s'effacent (--down, sur la page) ; les
// tableaux affichés (atTables), la flèche du bas se retourne vers le haut (sans libellé).
// Clavier : ↓ tableaux ; ↑ remonte aux joueurs, puis retour à la page précédente ; Échap :
// retour ; ← / → : onArrow. Molette ou doigt vers le haut depuis le haut de la page : retour.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, useIsPresent } from 'framer-motion'

const NARROW = '(max-width: 820px)'

/** Écran étroit (mobile), suivi en direct. */
export function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches)
  useEffect(() => {
    const mq = window.matchMedia(NARROW)
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

/** pageRef : la page (reçoit --down) ; tablesRef : les tableaux ; onBack : page précédente ;
    onArrow(±1) : ← / → (facultatif) ; onSwipe(±1, x) : doigt horizontal (facultatif ; x : abscisse
    où le doigt s'est posé, pour savoir de quel joueur il s'agit sur la page du duel). */
export function usePlayerPage({ pageRef, tablesRef, reduced, onBack, onArrow, onSwipe }) {
  const isPresent = useIsPresent()
  const [atTables, setAtTables] = useState(false)
  const atTablesRef = useRef(false)

  // Toujours en haut de la page à l'arrivée ; --down et atTables suivent le défilement.
  useLayoutEffect(() => { window.scrollTo(0, 0) }, [])
  useEffect(() => {
    const onScroll = () => {
      const vh = window.innerHeight
      pageRef.current?.style.setProperty('--down', Math.min(1, window.scrollY / (vh * 0.5)).toFixed(3))
      pageRef.current?.style.setProperty('--sy', `${Math.round(window.scrollY)}px`)   // grand écran : bandeaux figés (05-page-duel.css)
      const v = window.scrollY > vh * 0.4
      if (v !== atTablesRef.current) { atTablesRef.current = v; setAtTables(v) }
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (y) => animate(window.scrollY, y, { duration: reduced ? 0 : 0.8, ease: 'easeInOut',
                                                      onUpdate: (v) => window.scrollTo(0, v) })
  const toTables = () => {
    const el = tablesRef.current
    if (el) scrollTo(window.scrollY + el.getBoundingClientRect().top)
  }
  const toTop = () => scrollTo(0)

  // Retour à la page précédente : d'abord remonter si la page a défilé. Un seul retour à la fois.
  const leaving = useRef(false)
  const back = useCallback(() => {
    if (leaving.current) return
    leaving.current = true
    const y = window.scrollY
    if (reduced || y < 5) { onBack(); return }
    animate(y, 0, { duration: Math.min(1.6, 0.4 + y / window.innerHeight), ease: 'easeInOut',
                    onUpdate: (v) => window.scrollTo(0, v), onComplete: onBack })
  }, [onBack, reduced])

  // L'élan de la molette qui a ouvert la page est ignoré (au plus 2,5 s, sans pause de 250 ms).
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
    if (!isPresent) return   // page en train de sortir : ses gestes ne comptent plus
    const onKey = (e) => {
      if (leaving.current) { e.preventDefault(); return }
      if (e.key === 'ArrowUp' && window.scrollY > 2) { e.preventDefault(); toTop() }
      else if (e.key === 'Escape' || e.key === 'ArrowUp') { e.preventDefault(); back() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); toTables() }
      else if (onArrow && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        if (!atTablesRef.current) onArrow(e.key === 'ArrowRight' ? 1 : -1)
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
    let touch = null
    const onTouchStart = (e) => { touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, top: window.scrollY <= 0 } }
    const onTouchEnd = (e) => {
      if (!touch) return
      const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y
      if (onSwipe && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (!atTablesRef.current) onSwipe(dx < 0 ? 1 : -1, touch.x) }
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
  }, [back, onArrow, onSwipe, isPresent, reduced])

  return { atTables, atTablesRef, toTables, toTop, back }
}

/** Mobile : le bloc du tableau remonte au niveau du plexus du joueur, par-dessus lui (05-page-duel.css,
    --plexus) : distance du plexus (PLEXUS de la hauteur de l'image, tête en haut) au bas du
    joueur, mesurée sur la page (tailles de joueur différentes selon la page et l'écran). */
const PLEXUS = 0.36
export function usePlexus(pageRef) {
  useLayoutEffect(() => {
    const page = pageRef.current
    const fig = page?.querySelector('.figure')
    if (!page || !fig) return
    const figs = [...page.querySelectorAll('.figure')]
    const set = () => {
      page.style.setProperty('--plexus', `${Math.round(fig.offsetHeight * (1 - PLEXUS))}px`)
      // Grand écran, deux joueurs : décalage qui centre le bandeau d'identité sur sa moitié de page (--tag-dx).
      // Gardé dans l'écran (16 px du bord) si le bandeau est large.
      for (const f of figs) {
        const r = f.getBoundingClientRect(), mid = r.left + r.width / 2, half = innerWidth / 2
        const w = f.querySelector('.player-tag')?.offsetWidth ?? 0
        const want = Math.min(Math.max(mid < half ? half / 2 : half * 1.5, w / 2 + 16), innerWidth - w / 2 - 16)
        f.style.setProperty('--tag-dx', figs.length > 1 ? `${Math.round(want - mid)}px` : '0px')
      }
    }
    set()
    const ro = new ResizeObserver(set)
    ro.observe(fig)
    page.querySelectorAll('.player-tag').forEach((t) => ro.observe(t))
    addEventListener('resize', set)
    return () => { ro.disconnect(); removeEventListener('resize', set) }
  }, [])
}
