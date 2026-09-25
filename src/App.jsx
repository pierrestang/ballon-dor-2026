import { useEffect, useState } from 'react'
import { AnimatePresence, LazyMotion, MotionConfig, domMax, useReducedMotion } from 'framer-motion'
import players from './data'
import { prefetch } from './sequence'
import Carousel from './Carousel'
import Intro from './Intro'
import Duel from './Duel'

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
  // Duel de départ : Mbappé (0) contre Messi (3) — assez éloignés sur le disque pour que les
  // 6 joueurs visibles (2 × centre + voisins) soient tous différents.
  const [pair, setPair] = useState([0, 3])
  const [intro, setIntro] = useState(true)
  const [open, setOpen] = useState(false)
  const [nav, setNav] = useState({})   // dernier passage de page, pour le sens des transitions
  const go = (from, to, apply, extra = {}) => { setNav({ from, to, ...extra }); apply() }
  const reduced = useReducedMotion()
  const loaded = useWindowLoaded()
  const duo = pair.map((i) => players[i])

  // Page 2 : changer le joueur d'un côté (0 = gauche, 1 = droite), en sautant celui d'en face.
  const step = (side, delta) => setPair((pr) => {
    const n = players.length
    let next = (((pr[side] + delta) % n) + n) % n
    if (next === pr[1 - side]) next = (((next + delta) % n) + n) % n
    return side ? [pr[0], next] : [next, pr[1]]
  })

  // Préchargement des séquences des deux joueurs affichés, une fois la page chargée
  // et les disques immobiles depuis un instant.
  useEffect(() => {
    if (!loaded || open) return
    let cancelIdle = () => {}
    const t = setTimeout(() => { cancelIdle = whenIdle(() => prefetch(duo.map((p) => p.id))) }, 400)
    return () => { clearTimeout(t); cancelIdle() }
  }, [loaded, open, duo[0].id, duo[1].id])

  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <AnimatePresence custom={nav}>
          {intro ? (
            <Intro key="intro" nav={nav} onEnter={() => go('intro', 'carousel', () => setIntro(false))} />
          ) : open ? (
            <Duel key="duel" pair={duo} reduced={reduced} onStep={step} autoplay={!!nav.autoplay}
                  onBack={() => go('player', 'carousel', () => setOpen(false))} />
          ) : (
            <Carousel key="carousel" nav={nav} pair={pair} setPair={setPair}
                      onOpen={(opts) => go('carousel', 'player', () => setOpen(true),
                                           { autoplay: !!opts?.autoplay })}
                      onIntro={() => go('carousel', 'intro', () => setIntro(true))} />
          )}
        </AnimatePresence>
      </MotionConfig>
    </LazyMotion>
  )
}
