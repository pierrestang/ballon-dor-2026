import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { AnimatePresence, LazyMotion, MotionConfig, domMax, useReducedMotion } from 'framer-motion'
import players from './data'
import { prefetch } from './sequence'
import Carousel, { MODES } from './Carousel'
import Final from './Final'
import Solo from './Solo'
import { parseRoute, routeOf } from './routes'
import { isMenuLocked } from './storage'
import SoundToggle from './SoundToggle'
import Cursor from './Cursor'

// Mode « Mon classement » : chargé à la demande (hors premier chargement), préchargé une fois la
// page chargée.
const loadGame = () => import('./Game')
const Game = lazy(loadGame)

// Couleur de la barre du navigateur mobile par version : --bg de chaque version (11-fonds.css).
const THEME_COLOR = { game: '#050505', duel: '#04070d', solo: '#040806' }

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
  // Page ouverte par un lien (#duel/…, #joueur/…, #classement ; routes.js), sinon l'intro.
  const [start] = useState(() => parseRoute(window.location.hash))
  // Duel de départ (retour depuis la page du duel sans sélection) : Olise (0) contre Messi (3).
  const [pair, setPair] = useState(start.pair ?? [0, 3])
  // Page du duel (Final.jsx) : joueurs puis tableaux au scroll ; remplace, depuis le 26/09/2026,
  // l'ancienne page de comparaison et celle des tableaux (assets-source/ancien/).
  const [final, setFinal] = useState(start.page === 'final')
  const [game, setGame] = useState(start.page === 'game')   // mode « Mon classement »
  // Versions de l'intro (MODES, Carousel.jsx) : 0 Les candidats (par défaut : découvrir les
  // joueurs d'abord), 1 Duel, 2 Mon classement ; ouverte par un lien, celle de la page.
  const [mode, setMode] = useState({ solo: 0, final: 1, game: 2 }[start.page] ?? 0)
  const [solo, setSolo] = useState(start.solo ?? null)   // page Présentation : index du joueur, ou null
  const [introPlayer, setIntroPlayer] = useState(0)  // joueur de la pièce au retour à l'intro
  // Pièce de l'intro confiée à l'annonce du Ballon d'Or ({ id, x, y, size } : centre et diamètre
  // à l'écran), quand le classement est déjà fait (Game.jsx) ; null sinon.
  const [gameRelay, setGameRelay] = useState(null)
  const [nav, setNav] = useState({})   // dernier passage de page, pour le sens des transitions
  const go = (from, to, apply, extra = {}) => { setNav({ from, to, ...extra }); apply() }

  // Adresse de la page affichée : nouvelle entrée d'historique à chaque changement de page,
  // simple mise à jour quand seul le joueur change ; bouton Retour du navigateur : la page de
  // l'entrée précédente, avec la transition habituelle.
  const page = solo !== null ? 'solo' : game ? 'game' : final ? 'final' : 'carousel'
  const lastPage = useRef(page)
  const fromHistory = useRef(false)
  useEffect(() => {
    const { hash, title } = routeOf({ page, pair, solo })
    document.title = title
    const url = hash || window.location.pathname + window.location.search
    if (fromHistory.current || page === lastPage.current) window.history.replaceState(null, '', url)
    else window.history.pushState(null, '', url)
    fromHistory.current = false
    lastPage.current = page
  }, [page, pair[0], pair[1], solo])
  useEffect(() => {
    const onPop = () => {
      // Duels en cours : le bouton Retour ne quitte pas le jeu (on remet son adresse).
      if (isMenuLocked()) { window.history.pushState(null, '', '#classement'); return }
      const r = parseRoute(window.location.hash)
      fromHistory.current = true
      go(lastPage.current, r.page, () => {
        if (r.pair) setPair(r.pair)
        if (r.page === 'solo') setMode(0)
        if (r.page === 'final') setMode(1)
        setSolo(r.page === 'solo' ? r.solo : null)
        setGame(r.page === 'game')
        setFinal(r.page === 'final')
      })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

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

  // Préchargement des séquences des deux joueurs du duel, seulement une fois le visiteur entré
  // dans la sélection du duel (inDuel, signalé par Carousel.jsx) : l'intro ne charge aucune
  // séquence (règle de légèreté, audit du 27/09/2026).
  const [inDuel, setInDuel] = useState(false)
  useEffect(() => {
    if (!loaded || final || !inDuel) return
    let cancelIdle = () => {}
    const t = setTimeout(() => { cancelIdle = whenIdle(() => prefetch(duo.map((p) => p.id))) }, 400)
    return () => { clearTimeout(t); cancelIdle() }
  }, [loaded, final, inDuel, duo[0].id, duo[1].id])

  // Fond de la page selon la version (styles.css, data-theme) : sur l'intro, celle choisie ;
  // sinon celle de la page affichée (la sélection et la page du duel : Duel).
  const theme = solo !== null ? 'solo' : game ? 'game' : final ? 'duel' : MODES[mode].id
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    // Barre du navigateur mobile (theme-color) : couleur du bord de la page de cette version
    // (--bg, 11-fonds.css ; valeurs finales, sans attendre la transition de 0,6 s).
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme] ?? THEME_COLOR.game)
  }, [theme])

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
              <Game nav={nav} relay={gameRelay} onBack={(done) => go('game', 'carousel', () => setGame(false), { relay: done })} />
            </Suspense>
          ) : final ? (
            <Final key="final" pair={duo} nav={nav} reduced={reduced} onStep={step}
                   onBack={() => go('final', 'carousel', () => setFinal(false))} />
          ) : (
            <Carousel key="carousel" nav={nav} pair={pair} setPair={setPair}
                      onOpen={() => go('carousel', 'final', () => setFinal(true))}
                      mode={mode} setMode={setMode} introPlayer={introPlayer} onDuelLive={setInDuel}
                      onSolo={(k) => go('carousel', 'solo', () => setSolo(k))}
                      onGame={(k, rect) => go('carousel', 'game', () => {
                        setIntroPlayer(k); setGameRelay(rect ? { id: players[k].id, ...rect } : null); setGame(true)
                      }, { relay: !!rect })} />
          )}
        </AnimatePresence>
        <SoundToggle />
        <Cursor />
      </MotionConfig>
    </LazyMotion>
  )
}
