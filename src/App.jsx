import { Suspense, lazy, useEffect, useState } from 'react'
import { AnimatePresence, LazyMotion, MotionConfig, domMax, useReducedMotion } from 'framer-motion'
import players from './data'
import { prefetch } from './sequence'
import Carousel, { MODES } from './Carousel'
import Final from './Final'
import Solo from './Solo'

// Mode « Mon classement » : chargé à la demande (hors premier chargement), préchargé une fois la
// page chargée.
const loadGame = () => import('./Game')
const Game = lazy(loadGame)

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
  // Page du duel (Final.jsx) : joueurs puis tableaux au scroll ; remplace, depuis le 26/09/2026,
  // l'ancienne page de comparaison et celle des tableaux (assets-source/ancien/).
  const [final, setFinal] = useState(false)
  const [game, setGame] = useState(false)   // mode « Mon classement »
  // Versions de l'intro (MODES, Carousel.jsx) : 0 Présentation, 1 Duel, 2 Mon classement (par défaut).
  const [mode, setMode] = useState(2)
  const [solo, setSolo] = useState(null)             // page Présentation : index du joueur, ou null
  const [introPlayer, setIntroPlayer] = useState(0)  // joueur de la pièce au retour à l'intro
  const [nav, setNav] = useState({})   // dernier passage de page, pour le sens des transitions
  const go = (from, to, apply, extra = {}) => { setNav({ from, to, ...extra }); apply() }
  const reduced = useReducedMotion()
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

  // GSAP (page du duel) préchargé une fois la page chargée.
  useEffect(() => {
    if (!loaded || final) return
    import('gsap'); import('gsap/ScrollTrigger')
  }, [loaded, final])

  // Fond de la page selon la version (styles.css, data-theme) : sur l'intro, celle choisie ;
  // sinon celle de la page affichée (la sélection et la page du duel : Duel).
  const theme = solo !== null ? 'solo' : game ? 'game' : final ? 'duel' : MODES[mode].id
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])

  // Module du mode « Mon classement » préchargé une fois la page chargée.
  useEffect(() => { if (loaded) loadGame() }, [loaded])

  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <AnimatePresence custom={nav}>
          {/* Intro et sélection : une seule scène (Carousel.jsx), transition jouée par les gestes. */}
          {solo !== null ? (
            <Solo key="solo" player={players[solo]} nav={nav} reduced={reduced}
                  onStep={(d) => setSolo((k) => (k + d + players.length) % players.length)}
                  onBack={() => go('solo', 'carousel', () => { setIntroPlayer(solo); setSolo(null) })} />
          ) : game ? (
            <Suspense key="game" fallback={null}>
              <Game nav={nav} onBack={() => go('game', 'carousel', () => setGame(false))} />
            </Suspense>
          ) : final ? (
            <Final key="final" pair={duo} nav={nav} reduced={reduced} onStep={step}
                   onBack={() => go('final', 'carousel', () => setFinal(false))} />
          ) : (
            <Carousel key="carousel" nav={nav} pair={pair} setPair={setPair}
                      onOpen={() => go('carousel', 'final', () => setFinal(true))}
                      mode={mode} setMode={setMode} introPlayer={introPlayer}
                      onSolo={(k) => go('carousel', 'solo', () => setSolo(k))}
                      onGame={(k) => go('carousel', 'game', () => { setIntroPlayer(k); setGame(true) })} />
          )}
        </AnimatePresence>
      </MotionConfig>
    </LazyMotion>
  )
}
