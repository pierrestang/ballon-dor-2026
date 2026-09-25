import { useEffect, useRef } from 'react'
import { m } from 'framer-motion'
import players, { bustUrl } from './data'
import { introVariants } from './transitions'

// Adapté de « Hero Shutter Text » (21st.dev, daiwiikharihar) : chaque lettre apparaît
// en sortant du flou pendant que trois lamelles (or, clair, or) la traversent.
const TITLE = "BALLON D'OR"
const SLICES = [
  { clip: 'polygon(0 0, 100% 0, 100% 35%, 0 35%)', from: '-100%', to: '100%', delay: 0, tone: 'gold' },
  { clip: 'polygon(0 35%, 100% 35%, 100% 65%, 0 65%)', from: '100%', to: '-100%', delay: 0.1, tone: 'light' },
  { clip: 'polygon(0 65%, 100% 65%, 100% 100%, 0 100%)', from: '-100%', to: '100%', delay: 0.2, tone: 'gold' },
]
const STAGGER = 0.05
const END = TITLE.length * STAGGER + 1.1   // fin de l'apparition du titre (s)

function ShutterTitle() {
  return (
    <h1 className="shutter" aria-label={TITLE}>
      {TITLE.split('').map((char, i) => (
        <span key={i} className="shutter-char" aria-hidden="true">
          <m.span
            initial={{ opacity: 0, filter: 'blur(10px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{ delay: i * STAGGER + 0.3, duration: 0.8 }}
          >
            {char === ' ' ? ' ' : char}
          </m.span>
          {SLICES.map((s) => (
            <m.span
              key={s.clip}
              className={`shutter-slice is-${s.tone}`}
              style={{ clipPath: s.clip }}
              initial={{ x: s.from, opacity: 0 }}
              animate={{ x: s.to, opacity: [0, 1, 0] }}
              transition={{ duration: 0.7, delay: i * STAGGER + s.delay, ease: 'easeInOut' }}
            >
              {char === ' ' ? ' ' : char}
            </m.span>
          ))}
        </span>
      ))}
    </h1>
  )
}

export default function Intro({ nav, onEnter }) {
  // Les posters de la page 1 se chargent pendant l'intro : l'arrivée est instantanée.
  useEffect(() => {
    players.forEach((p) => { new Image().src = bustUrl(p.id) })
  }, [])

  // Entrée / ↓ / molette vers le bas / glisser vers le haut pour entrer.
  const touchY = useRef(null)
  useEffect(() => {
    const armedAt = performance.now() + 600
    const onKey = (e) => {
      if (['Enter', 'ArrowDown', ' '].includes(e.key)) { e.preventDefault(); onEnter() }
    }
    const onWheel = (e) => { if (e.deltaY > 25 && performance.now() > armedAt) onEnter() }
    const onTouchStart = (e) => { touchY.current = e.touches[0].clientY }
    const onTouchEnd = (e) => {
      if (touchY.current !== null && touchY.current - e.changedTouches[0].clientY > 60) onEnter()
      touchY.current = null
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
  }, [onEnter])

  const after = (delay) => ({
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: END + delay, duration: 0.6, ease: 'easeOut' },
  })

  return (
    <m.main
      className="intro"
      custom={nav}
      variants={introVariants}
      initial="hidden"
      animate="shown"
      exit="exit"
    >
      <div className="intro-grid" aria-hidden="true" />
      <span className="intro-corner is-tl" aria-hidden="true" />
      <span className="intro-corner is-br" aria-hidden="true" />

      <ShutterTitle />
      <m.p className="intro-year" {...after(0)}>2026</m.p>
      {/* Flèche clignotante : faire défiler vers le bas pour entrer (clic aussi). */}
      <m.button className="intro-down" onClick={onEnter} aria-label="Découvrir les candidats"
                {...after(0.2)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7" /></svg>
      </m.button>
    </m.main>
  )
}
