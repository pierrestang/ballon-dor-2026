import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, LazyMotion, MotionConfig, domMax, useReducedMotion } from 'framer-motion'
import players from './data'
import { prefetch } from './sequence'
import Carousel from './Carousel'
import Intro from './Intro'
import Final from './Final'

// requestIdleCallback n'existe pas sur Safari : repli sur un délai.
const whenIdle = (fn) =>
  'requestIdleCallback' in window
    ? cancelIdleCallback.bind(window, requestIdleCallback(fn, { timeout: 2000 }))
    : clearTimeout.bind(window, setTimeout(fn, 300))

function useWindowLoaded() {
  const [loaded, setLoaded] = useState(document.readyState === 'complete')
  useEffect(() => {
    if (loaded) return
    const done = () => setLoaded(true)
    window.addEventListener('load', done, { once: true })
    return () => window.removeEventListener('load', done)
  }, [loaded])
  return loaded
}

export default function App() {
  // Duel de départ (retour depuis la page du duel sans sélection) : Olise (0) contre Messi (3).
  const [pair, setPair] = useState([0, 3])
  const [intro, setIntro] = useState(true)
  // Page du duel (Final.jsx) : joueurs puis tableaux au scroll ; remplace, depuis le 26/09/2026,
  // l'ancienne page de comparaison et celle des tableaux (assets-source/ancien/).
  const [final, setFinal] = useState(false)
  const [nav, setNav] = useState({})   // dernier passage de page, pour le sens des transitions
  const go = (from, to, apply, extra = {}) => { setNav({ from, to, ...extra }); apply() }
  const reduced = useReducedMotion()
  const enterCarousel = useCallback(() => {
    go('intro', 'carousel', () => setIntro(false))
  }, [])
  const loaded = useWindowLoaded()
  const duo = pair.map((i) => players[i])

  // Page du duel : changer le joueur d'un côté (0 = gauche, 1 = droite), en sautant celui d'en face.
  const step = (side, delta) => setPair((pr) => {
    const n = players.length
    let next = (((pr[side] + delta) % n) + n) % n
    if (next === pr[1 - side]) next = (((next + delta) % n) + n) % n
    return side ? [pr[0], next] : [next, pr[1]]
  })

  // Préchargement des séquences des deux joueurs affichés, une fois la page chargée
  // et les disques immobiles depuis un instant.
  useEffect(() => {
    if (!loaded || final) return
    let cancelIdle = () => {}
    const t = setTimeout(() => { cancelIdle = whenIdle(() => prefetch(duo.map((p) => p.id))) }, 400)
    return () => { clearTimeout(t); cancelIdle() }
  }, [loaded, final, duo[0].id, duo[1].id])

  // GSAP (page du duel) préchargé dès que la page de sélection est affichée.
  useEffect(() => {
    if (intro || final) return
    import('gsap'); import('gsap/ScrollTrigger')
  }, [intro, final])

  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <AnimatePresence custom={nav}>
          {intro ? (
            <Intro key="intro" nav={nav} onEnter={enterCarousel} />
          ) : final ? (
            <Final key="final" pair={duo} nav={nav} reduced={reduced} onStep={step}
                   onBack={() => go('final', 'carousel', () => setFinal(false))} />
          ) : (
            <Carousel key="carousel" nav={nav} pair={pair} setPair={setPair}
                      onOpen={() => go('carousel', 'final', () => setFinal(true))}
                      onIntro={() => go('carousel', 'intro', () => setIntro(true))} />
          )}
        </AnimatePresence>
      </MotionConfig>
    </LazyMotion>
  )
}
