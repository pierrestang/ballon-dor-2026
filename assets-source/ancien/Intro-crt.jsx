import { useEffect, useRef, useState } from 'react'
import { m, useReducedMotion } from 'framer-motion'
import players, { coinUrl } from './data'
import { introVariants } from './transitions'

// Intro : un vieux moniteur cathodique au centre d'une pièce sombre (dessiné en CSS). Son écran
// s'allume (allumage CRT : une ligne lumineuse s'étire puis s'ouvre), une barre de chargement se
// remplit en vert phosphore, puis
// « BALLON D'OR 2026 » se décode caractère par caractère, dans la même forme que « CHARGEMENT ».
// Pour entrer, l'écran s'éteint (extinction CRT : ligne, puis point) avant de passer à la page 1.
// Au retour depuis la page 1, ou en mouvement réduit, tout est affiché d'emblée.

const TITLE = "BALLON D'OR 2026"   // titre complet, année comprise
const BOOT_MS = 2150   // allumage CRT de l'écran (2,15 s)
const LOAD_MS = 1400   // remplissage de la barre de chargement
const END = BOOT_MS + LOAD_MS + 250   // barre effacée, le titre prend sa place
const SCREEN_OFF_MS = 750  // extinction de l'écran avant de passer à la page 1

/** Temps écoulé depuis le montage (ms), mis à jour à chaque image jusqu'à `until` ;
    Infinity d'emblée si `instant`. */
function useElapsed(instant, until) {
  const [t, setT] = useState(instant ? Infinity : 0)
  useEffect(() => {
    if (instant) return
    const t0 = performance.now()
    let raf = requestAnimationFrame(function tick(now) {
      setT(now - t0)
      if (now - t0 < until) raf = requestAnimationFrame(tick)
      else setT(Infinity)
    })
    return () => cancelAnimationFrame(raf)
  }, [])
  return t
}

// Textes fictifs de l'écran, tirés des données du site.
const total = (key) => players.reduce((n, p) => n + p.stats[key], 0)
const lastName = (p) => p.nom.split(' ').slice(1).join(' ') || p.nom
// Journal de démarrage, écrit au-dessus de la barre pendant le chargement (une ligne par palier).
const BOOT_LOG = [
  'CONNEXION AU SERVEUR DE LA CÉRÉMONIE… OK',
  'SAISON 03.08.2025 → 19.07.2026',
  `${players.length} CANDIDATS · ${total('matchs')} MATCHS · ${total('buts')} BUTS · ${total('passes')} ASSISTS`,
  'VÉRIFICATION DES PALMARÈS… OK',
  'OUVERTURE DU SCRUTIN…',
]
// Bandeau défilant sous le titre : chaque candidat et ses chiffres.
const TICKER = players.map((p) =>
  `${lastName(p).toUpperCase()} · ${p.club.toUpperCase()} · ${p.stats.buts} B · ${p.stats.passes} A · ${p.collectif.length} TITRE${p.collectif.length > 1 ? 'S' : ''}`,
).join('   ◆   ')

/** Date et heure de l'écran, qui défilent à la seconde. */
function ScreenClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const p = (n) => String(n).padStart(2, '0')
  return <span>{p(now.getDate())}.{p(now.getMonth() + 1)}.{now.getFullYear()} · {p(now.getHours())}:{p(now.getMinutes())}:{p(now.getSeconds())}</span>
}

/** Relevés de l'écran : bandeau du haut et coins du bas, une fois l'écran allumé. */
function ScreenHud({ t }) {
  if (t < BOOT_MS) return null
  return (
    <div className="screen-hud" aria-hidden="true">
      <div className="screen-hud-row">
        <span>BO-OS v2.6</span>
        <span>CANAL 26 · CÉRÉMONIE</span>
        <ScreenClock />
      </div>
      <div className="screen-hud-row">
        <span>CANDIDATS {players.length}/{players.length}</span>
        <span>SIGNAL ▮▮▮▮▯ 98% &nbsp; <span className="screen-rec">● REC</span></span>
      </div>
    </div>
  )
}

/** Journal de démarrage : une ligne de plus à chaque palier du chargement. */
function BootLog({ t }) {
  if (t < BOOT_MS || t >= END) return null
  const shown = Math.min(BOOT_LOG.length, 1 + Math.floor(((t - BOOT_MS) / LOAD_MS) * BOOT_LOG.length))
  return (
    <div className="boot-log" aria-hidden="true">
      {BOOT_LOG.slice(0, shown).map((l) => <p key={l}>&gt; {l}</p>)}
    </div>
  )
}

/** Bandeau d'infos qui défile sous le titre, une fois celui-ci décodé. */
function Ticker({ on }) {
  return (
    <div className={`ticker${on ? ' is-on' : ''}`} aria-hidden="true">
      {/* Texte doublé : le défilement boucle sans saut. */}
      <div><span>{TICKER}   ◆   </span><span>{TICKER}   ◆   </span></div>
    </div>
  )
}

/** Barre de chargement au centre de l'écran, après l'allumage ; elle s'efface une fois pleine. */
function Loader({ t }) {
  if (t < BOOT_MS || t >= END) return null
  // Remplissage par à-coups, comme un vrai chargement (paliers irréguliers).
  const x = Math.min(1, (t - BOOT_MS) / LOAD_MS)
  const pct = Math.round(Math.min(1, x < 0.35 ? x * 1.4 : x < 0.6 ? 0.49 + (x - 0.35) * 0.4 : 0.59 + (x - 0.6) * 1.03) * 100)
  return (
    <div className={`loader${x >= 1 ? ' is-full' : ''}`} aria-hidden="true">
      <div className="loader-track"><div className="loader-fill" style={{ width: `${pct}%` }} /></div>
      <p className="loader-label"><span>CHARGEMENT</span><span>{String(pct).padStart(3, '\u00a0')}%</span></p>
    </div>
  )
}

// Glyphes du décodage : capitales, chiffres et symboles de code.
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789{}[]<>/\\#@$%&*=+_'
const randomGlyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]

/** Texte qui se décode : chaque caractère défile au hasard puis se fixe, de gauche à droite,
    à partir de `start` (ms). Espaces et apostrophes restent fixes. */
function scramble(text, t, start, step, spin) {
  if (t === Infinity) return text
  return text.split('').map((ch, i) => {
    if (ch === ' ' || ch === "'") return ch
    const local = t - start - i * step
    if (local < 0) return ' '
    return local >= spin ? ch : randomGlyph()
  }).join('')
}

const TITLE_STEP = 55    // ms entre deux lettres qui se décodent
const TITLE_SPIN = 260   // ms de défilement de chaque lettre
const TITLE_AT = END     // le titre se décode une fois le chargement terminé
const TITLE_SET = TITLE_AT + TITLE.length * TITLE_STEP + TITLE_SPIN

export default function Intro({ nav, onEnter }) {
  // Les pièces de la page 1 se chargent pendant l'intro : l'arrivée est instantanée.
  useEffect(() => {
    players.forEach((p) => { new Image().src = coinUrl(p.id) })
  }, [])

  // Retour depuis la page 1 ou mouvement réduit : tout est affiché d'emblée.
  const reduced = useReducedMotion()
  const instant = useRef(nav.from === 'carousel' || reduced).current

  // Entrer : l'écran du moniteur s'éteint (SCREEN_OFF_MS), puis on passe à la page 1. Un seul
  // passage, même si les gestes s'enchaînent.
  const [off, setOff] = useState(false)
  const leaving = useRef(false)
  const enter = useRef(null)
  enter.current = () => {
    if (leaving.current) return
    leaving.current = true
    if (reduced) { onEnter(); return }
    setOff(true)
    setTimeout(onEnter, SCREEN_OFF_MS)
  }

  // Entrée / ↓ / molette vers le bas / glisser vers le haut : entrer.
  const touchY = useRef(null)
  useEffect(() => {
    let lockedUntil = performance.now() + 600
    const advance = () => { if (performance.now() >= lockedUntil) enter.current() }
    const onKey = (e) => {
      if (['Enter', 'ArrowDown', ' '].includes(e.key)) { e.preventDefault(); advance() }
    }
    const onWheel = (e) => { if (e.deltaY > 25) advance() }
    const onTouchStart = (e) => { touchY.current = e.touches[0].clientY }
    const onTouchEnd = (e) => {
      if (touchY.current !== null && touchY.current - e.changedTouches[0].clientY > 60) advance()
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

  const t = useElapsed(instant, TITLE_SET + 1000)
  const titleOn = t >= TITLE_AT

  return (
    <m.main
      className="intro"
      custom={nav}
      variants={introVariants}
      initial="hidden"
      animate="shown"
      exit="exit"
    >
      {/* Moniteur cathodique : boîtier, écran bombé enfoncé dans son cadre, deux boutons. */}
      {/* Téléviseur moderne plein écran : cadre noir fin, bas un peu plus épais avec logo et voyant ; l'écran garde son rendu cathodique. */}
      <div className="tv">
        <div className={`crt-screen${instant ? '' : ' is-booting'}${off ? ' is-off' : ''}`}>
          <div className="crt-content">
            <div className="intro-scan" aria-hidden="true" />
            <ScreenHud t={t} />
            <BootLog t={t} />
            <Loader t={t} />
            {/* Titre et bandeau défilant dessous, centrés dans l'écran. */}
            <div className="screen-center">
              {/* Titre toujours en place (rien ne bouge) : il se décode après le chargement. */}
              <h1 className={`intro-title${titleOn ? ' is-on' : ''}`} aria-label={TITLE}>
                {titleOn ? scramble(TITLE, t, TITLE_AT, TITLE_STEP, TITLE_SPIN) : '\u00a0'}
                {t >= TITLE_SET && <span className="title-cursor" aria-hidden="true" />}
              </h1>
              <Ticker on={t >= TITLE_SET} />
            </div>
            {/* Flèche clignotante, en bas de l'écran : entrer (clic aussi). */}
            <m.button className="intro-down" onClick={() => enter.current()} aria-label="Découvrir les candidats"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ delay: instant ? 0 : END / 1000, duration: 0.4 }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7" /></svg>
            </m.button>
          </div>
        </div>

        {/* Bas du cadre : logo centré et voyant de marche. */}
        <div className="tv-chin" aria-hidden="true">
          <span className="tv-logo">BO·26</span>
          <span className="tv-led" />
        </div>
      </div>
    </m.main>
  )
}
