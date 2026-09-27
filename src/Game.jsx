import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, animate, m, useMotionValue, useReducedMotion } from 'framer-motion'
import players from './data'
import { Coin, LiveCoin, useCoinTurn } from './Coin'
import { ArcText, GlitchArc, NameArc, ScrollLetters } from './Letters'
import { MODE_FONT, R_MODE } from './Carousel'   // taille et rayon du titre de la version (intro)
import { GAME_STORE, OLD_GAME_STORE } from './storage'
import { ClubLogo, Flag } from './Nameplate'
import { ArcName, Compare, Palmares, Turn } from './FinalPlayers'
import FinalTables from './FinalTables'
import { watchTitle } from './titleFit'
import { analyze, createSwiss, progress, undo, vote } from './swiss'
import { communityEnabled, fetchCommunity, submitRanking } from './community'
import { gameVariants } from './transitions'

// Mode « Mon classement » : le visiteur établit son classement /10 en votant duel après duel
// (moteur : swiss.js, système suisse). Écrans : annonce de chaque ronde (appariements) → duels
// de la ronde → … → barrages éventuels → classement dévoilé, comparé au classement
// communautaire (community.js). Partie sauvegardée dans le navigateur (reprise au retour).
// Chargé à la demande (App.jsx). Le classement n'est visible qu'à la fin : ni pendant les
// duels ni aux annonces de ronde ; l'écran final le dévoile de la 10e place au 1er.
//
// Visuel aligné sur le reste du site (27/09/2026) : titre et description frappés lettre par
// lettre (ScrollLetters, même calage que .pick-title), pièces et noms en arc, stats face à face
// de la page du duel (Compare), flèche clignotante libellée pour continuer, textes qui
// apparaissent en fondu avec une descente de 12 px, décalés ligne par ligne.

const byId = Object.fromEntries(players.map((p) => [p.id, p]))
const IDS = players.map((p) => p.id)
const VOTE_MS = 650   // le choix reste affiché avant le duel suivant
const ORDINAL = (n) => `#${n}`   // places : #1 … #10
const EASE = [0.215, 0.61, 0.355, 1]   // power3.out (--ease-out)

// Annonce du Ballon d'Or (Ceremony), avant le tableau final : la pièce de l'intro, « BALLON D'OR
// 2026 » au-dessus, prénom et nom dessous, la place en or en dessous (comme le titre de la
// version dans l'intro) ; les joueurs de la 10e place au 1er, un tour complet à chaque
// changement (image changée de profil : useCoinTurn, comme l'intro).
const HOLD = { entry: 1, rest: 1.9, podium: 3.2 }   // s : arrivée, 10e à 4e, podium
const RELAY_S = 0.9   // s : bloc de l'intro repris, jusqu'à sa place d'annonce

// Puis le tableau final (sans pièces) : ses lignes de la 10e à la 4e place, puis les trois
// premières, rapidement (l'annonce a déjà tout dévoilé). Secondes après l'arrivée de l'écran.
const REVEAL = { start: 0.4, step: 0.08, podium: [0.5, 0.25, 0], pause: 0.2 }
const revealAt = (i) => (i >= 3
  ? REVEAL.start + (9 - i) * REVEAL.step
  : REVEAL.start + 7 * REVEAL.step + REVEAL.pause + REVEAL.podium[i])

function load() {
  try {
    localStorage.removeItem(OLD_GAME_STORE)
    const saved = JSON.parse(localStorage.getItem(GAME_STORE))
    if (saved?.t?.order && saved.ui) return saved
  } catch { /* stockage indisponible : nouvelle partie */ }
  return null
}
// seenRound : dernière ronde dont l'annonce a été vue.
const fresh = () => ({ t: createSwiss(IDS), ui: { seenRound: 0, submitted: false } })

/** Diamètres : pièces du duel (card) et de l'annonce des rondes (draw). */
function useSizes() {
  const measure = () => {
    const w = window.innerWidth, h = window.innerHeight
    const mobile = w <= 820
    return { mobile, card: Math.round(mobile ? Math.min(w * 0.3, 130) : Math.min(h * 0.24, w * 0.15)),
             draw: Math.round(mobile ? Math.min(w * 0.15, 64) : Math.min(h * 0.11, w * 0.06)),
             // Ronde 1 (sans classement dessous) : pièces plus grandes, sur deux lignes.
             first: Math.round(mobile ? Math.min(w * 0.17, 72) : Math.min(h * 0.17, w * 0.095)),
             // Annonce du Ballon d'Or : la pièce de l'intro (48vmin), un peu réduite pour les arcs.
             ceremony: Math.round(Math.min(w, h) * (mobile ? 0.56 : 0.4)) }
  }
  const [s, setS] = useState(measure)
  useEffect(() => {
    const on = () => setS(measure())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return s
}

/** Progression 0 → 1 rejouée à chaque changement de `key` (frappe des lettres). */
function useTyping(key, reduced, { duration, delay = 0 }) {
  const p = useMotionValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) { p.set(1); return }
    p.set(0)
    const c = animate(p, 1, { duration, delay, ease: 'linear' })
    return () => c.stop()
  }, [key, reduced])
  return p
}

/** Titre et description de l'écran, comme .pick-title (sélection du duel, Les candidats) :
    frappés lettre par lettre ; la description fait la longueur du titre quand il est plus long. */
function Heading({ title, sub, reduced, gold = false }) {
  const tRef = useRef(null), sRef = useRef(null)
  const pt = useTyping(title, reduced, { duration: 0.7 })
  const ps = useTyping(`${title}|${sub}`, reduced, { duration: 0.6, delay: 0.25 })
  useLayoutEffect(() => watchTitle(() => tRef.current, () => sRef.current), [title, sub])
  const motion = reduced ? { dist: 0, blur: 0 } : {}
  return (
    <header className="pick-title game-heading">
      <h1><ScrollLetters key={title} innerRef={tRef} text={title} progress={pt} range={[0, 1]} {...motion} /></h1>
      {sub && <p className={gold ? 'is-gold' : undefined}><ScrollLetters key={sub} innerRef={sRef} text={sub} progress={ps} range={[0, 1]} {...motion} /></p>}
    </header>
  )
}

/** « Nouvelle partie » : efface la partie en cours, donc demande une confirmation (second clic
    dans les 4 s ; sinon le lien revient à son état). */
function NewGame({ onConfirm }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button className={`game-link${armed ? ' is-gold' : ''}`} aria-live="polite"
            onClick={() => (armed ? onConfirm() : setArmed(true))} onBlur={() => setArmed(false)}>
      {armed ? 'Effacer ma partie ? Confirmer' : 'Nouvelle partie'}
    </button>
  )
}

/** Flèche clignotante du site, avec son libellé, pour continuer. */
function Next({ label, onClick }) {
  return (
    <button className="intro-down game-down" onClick={onClick}>
      <span className="intro-down-label">{label}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7" /></svg>
    </button>
  )
}

/** Annonce du Ballon d'Or : les joueurs de la 10e place au 1er sur la pièce de l'intro.
    `relay` (arrivée depuis le menu, classement déjà fait) : le bloc de l'intro est repris tel
    quel, à sa place et à sa taille à l'écran (pièce et nom du joueur de l'intro, « MON
    CLASSEMENT » en or dessous), glisse jusqu'à sa place d'annonce, puis passe au #10. */
function Ceremony({ ranking, sizes, reduced, onDone, relay }) {
  const order = [...ranking].reverse()   // 10e → 1er
  // Suite affichée : [joueur de l'intro,] 10e … 1er ; libellé en or : « MON CLASSEMENT », #10 … #1.
  const seq = relay ? [relay.id, ...order] : order
  const label = (i) => (relay && i === 0 ? 'MON CLASSEMENT' : ORDINAL(10 - (relay ? i - 1 : i)))
  const [step, setStep] = useState(0)    // étape annoncée (index dans seq)
  const [shown, rot] = useCoinTurn(step, { reduced })   // étape sur la pièce (change de profil)
  // Reprise du bloc de l'intro : de sa place à l'écran à celle de l'annonce.
  const ref = useRef(null)
  const bx = useMotionValue(0), by = useMotionValue(0), bs = useMotionValue(1)
  useLayoutEffect(() => {
    if (!relay) return
    const r = ref.current.getBoundingClientRect()
    bx.set(relay.x - (r.left + r.width / 2)); by.set(relay.y - (r.top + r.height / 2)); bs.set(relay.size / r.width)
    const opts = { duration: RELAY_S, ease: [0.65, 0, 0.35, 1] }
    const ctl = [animate(bx, 0, opts), animate(by, 0, opts), animate(bs, 1, opts)]
    return () => ctl.forEach((c) => c.stop())
  }, [])
  useEffect(() => {
    const rank = relay ? 11 - step : 10 - step
    const hold = relay && step === 0 ? RELAY_S + 0.3
      : (rank <= 3 ? HOLD.podium : HOLD.rest) + (step === 0 ? HOLD.entry : 0)
    const t = setTimeout(() => (step < seq.length - 1 ? setStep(step + 1) : onDone()), hold * 1000)
    return () => clearTimeout(t)
  }, [step])
  const player = byId[seq[shown]]
  return (
    <m.section className="game-screen game-ceremony" initial={{ opacity: relay ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <h1 className="sr-only">Ballon d’Or 2026</h1>
      <p className="sr-only" aria-live="polite">{relay && shown === 0 ? '' : `${label(shown)} : ${player.nom}`}</p>
      <m.div ref={ref} className="game-ceremony-move" style={{ '--d': `${sizes.ceremony}px`, x: bx, y: by, scale: bs }}>
        <m.div className="game-draw-coin game-ceremony-coin"
               initial={reduced || relay ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
               transition={{ duration: 0.8, ease: EASE }}>
          <ArcText text="BALLON D’OR 2026" side="top" accentFrom={12} className="arc-title" />
          <span className="game-pick-spin"><Coin player={player} rotateY={rot} /></span>
          {/* Bloc repris de l'intro : nom et « MON CLASSEMENT » d'abord fixes, comme sur l'intro. */}
          <NameArc text={player.nom} animate={!reduced && !(relay && shown === 0)} className="pick-name" dir={-0.6} />
          <GlitchArc text={label(shown)} animate={!reduced && !(relay && shown === 0)} radius={R_MODE} size={MODE_FONT} className="arc-mode" />
        </m.div>
      </m.div>
      <Next label="Voir le classement" onClick={onDone} />
    </m.section>
  )
}

/** Pièce de l'annonce d'une ronde : vole du centre de l'écran jusqu'à sa place (ronde 1, comme
    les vols de la sélection du duel : 0,7 s, 1,5 tour), ou apparaît en fondu. */
function DrawCoin({ id, size, delay, fly }) {
  const ref = useRef(null)
  const x = useMotionValue(0), y = useMotionValue(0), opacity = useMotionValue(0), rotateY = useMotionValue(0)
  useLayoutEffect(() => {
    const r = ref.current.getBoundingClientRect()
    if (!fly) { const c = animate(opacity, 1, { duration: 0.4, delay: delay / 2 }); return () => c.stop() }
    x.set(window.innerWidth / 2 - (r.left + r.width / 2))
    y.set(window.innerHeight / 2 - (r.top + r.height / 2))
    const opts = { duration: 0.7, delay, ease: [0.65, 0, 0.35, 1] }
    const ctl = [animate(x, 0, opts), animate(y, 0, opts), animate(rotateY, 540, opts),
                 animate(opacity, 1, { duration: 0.15, delay })]
    return () => ctl.forEach((c) => c.stop())
  }, [])
  return (
    <m.div ref={ref} className="game-draw-coin" style={{ '--d': `${size}px`, x, y, opacity }}>
      <LiveCoin player={byId[id]} rotateY={rotateY} phase={IDS.indexOf(id) * 0.7} />
      <ArcText text={byId[id].nom} side="bottom" className="game-card-name" />
    </m.div>
  )
}

function Round({ t, a, sizes, reduced, onStart }) {
  const round = a.next.round
  const pairs = a.rounds[round - 1]
  // 3 duels puis 2, pièces agrandies ; pas de classement : il n'est dévoilé qu'à la fin.
  const size = sizes.first
  const rows = [pairs.slice(0, 3), pairs.slice(3)]
  return (
    <m.section className="game-screen game-round" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <Heading title={`MANCHE ${round}`} reduced={reduced}
               sub={round === 1 ? `${t.rounds} MANCHES · PREMIERS DUELS TIRÉS AU SORT` : `MANCHE ${round} SUR ${t.rounds} · À ÉGALITÉ DE POINTS, FACE À FACE`} />
      <div className="game-pairings is-first" style={{ '--d': `${size}px` }}>
        {rows.map((row, r) => (
          <div key={r} className="game-pairings-row">
            {row.map(([x, y]) => {
              const k = pairs.findIndex((pr) => pr[0] === x)
              return (
                <div key={`${x}|${y}`} className="game-pairing">
                  {/* Halo du duel : apparaît avec ses deux pièces (de l'envol de la première à
                      l'arrivée de la seconde ; sinon, même fondu qu'elles). */}
                  <m.span className="game-pairing-halo" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          transition={round === 1 && !reduced
                            ? { delay: 0.2 + 2 * k * 0.1, duration: 0.8, ease: EASE }
                            : { delay: (0.2 + 2 * k * 0.1) / 2, duration: 0.4 }} />
                  {[x, y].map((id, n) => (
                    <DrawCoin key={id} id={id} size={size} fly={round === 1 && !reduced} delay={0.2 + (2 * k + n) * 0.1} />
                  ))}
                  <m.span className="game-vs is-small" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          transition={{ delay: round === 1 && !reduced ? 1.4 : 0.3, duration: 0.4 }}>VS</m.span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <Next label={`Jouer la manche ${round}`} onClick={onStart} />
    </m.section>
  )
}

/** Un joueur du duel, comme sur la page du duel : son nom en arc au-dessus de la tête et sa
    vidéo, qui fait un tour complet à l'arrivée (Turn) ; clic sur le joueur : vote. state : null
    (à voter), 'won' (choisi), 'lost' (écarté). Drapeau, poste et club : dans son palmarès. */
function Side({ player, side, state, onVote }) {
  return (
    <m.div className={`figure game-figure is-${side}${state ? ` is-${state}` : ''}`}
           animate={{ opacity: state === 'lost' ? 0.3 : 1 }} transition={{ duration: 0.4, ease: EASE }}>
      <ArcName id={`game-${player.id}`} name={player.nom} />
      <Turn id={player.id} name={player.nom} play />
      <button className="game-figure-vote" onClick={onVote} disabled={!!state} aria-label={`Voter pour ${player.nom}`} />
    </m.div>
  )
}

/** Duel d'une manche : les éléments de la page du duel (Final.jsx) : palmarès · joueur (vidéo)
    · stats face à face · joueur · palmarès, puis, en bas de page, les tableaux détaillés des deux
    joueurs (FinalTables). La flèche
    « Voir le tableau détaillé » (ou ↓) descend aux tableaux ; chaque nouveau duel repart du haut. */
function Duel({ t, a, sizes, reduced, onVote, picked, tablesRef }) {
  const { next } = a
  const barrage = next.phase === 'barrage'
  const L = byId[next.a], R = byId[next.b]
  const state = (id) => (picked ? (picked === id ? 'won' : 'lost') : null)
  const key = `${next.a}|${next.b}|${t.history.length}`
  return (
    <m.section className="game-duel-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="game-screen game-duel">
        <Heading reduced={reduced} title={barrage ? 'BARRAGE' : `MANCHE ${next.round}`}
                 sub={barrage ? `${next.label.replace('Barrage · ', '')} · DÉPARTAGEZ-LES`.toUpperCase()
                              : `DUEL ${next.duel} SUR ${a.rounds[next.round - 1].length} · CHOISISSEZ VOTRE FAVORI`} />
        <AnimatePresence mode="wait" initial={false}>
          <m.div key={key} className="game-versus is-duel"
                 initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
                 transition={{ duration: 0.35, ease: EASE }}>
            <Palmares player={L} side="left" />
            <Side player={L} side="left" state={state(L.id)} onVote={() => onVote(L.id)} />
            <Compare a={L} b={R} />
            <Side player={R} side="right" state={state(R.id)} onVote={() => onVote(R.id)} />
            <Palmares player={R} side="right" />
          </m.div>
        </AnimatePresence>
        <button className="intro-down game-down" onClick={() => tablesRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })}>
          <span className="intro-down-label">Voir le tableau détaillé</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7" /></svg>
        </button>
      </div>
      <div ref={tablesRef} className="details final-tables game-tables">
        <FinalTables pair={[L, R]} />
      </div>
    </m.section>
  )
}

function Result({ a, sizes, reduced, submitted, onSubmit }) {
  const [community, setCommunity] = useState(null)   // { count, avg } | 'error' | null
  const [sending, setSending] = useState(false)
  const refresh = () => fetchCommunity(IDS).then(setCommunity, () => setCommunity('error'))
  useEffect(() => { if (communityEnabled) refresh() }, [])
  const ok = community && community !== 'error' && community.count > 0
  const commRank = ok ? Object.fromEntries(Object.entries(community.avg).sort((x, y) => x[1] - y[1]).map(([id], i) => [id, i + 1])) : {}
  const send = async () => {
    setSending(true)
    try { await submitRanking(a.ranking); onSubmit(); await refresh() } catch { setCommunity('error') }
    setSending(false)
  }
  return (
    <m.section className="game-screen game-result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <Heading title="MON CLASSEMENT" sub="VOTRE BALLON D'OR 2026" reduced={reduced} gold />
      {/* Le classement seul (pas de pièces : elles ont été montrées par l'annonce), sur un écran. */}
      <div className="game-result-body">
      <ol className="game-ranking">
        {a.ranking.map((id, i) => {
          const c = commRank[id]
          const diff = c ? c - (i + 1) : 0
          return (
            <m.li key={id} className={i < 3 ? 'is-top' : ''}
                  initial={reduced ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE, delay: revealAt(i) }}>
              <span className="game-rank">{ORDINAL(i + 1)}</span>
              <Flag player={byId[id]} />
              <span className="game-rank-club"><ClubLogo player={byId[id]} /></span>
              <span className="game-rank-name">{byId[id].nom}</span>
              {ok && (
                <span className="game-rank-comm">
                  Communauté : {c ? ORDINAL(c) : '—'}
                  {c && diff !== 0 && <em className={diff > 0 ? 'is-up' : 'is-down'}>{diff > 0 ? '▲' : '▼'} {Math.abs(diff)}</em>}
                </span>
              )}
            </m.li>
          )
        })}
      </ol>
      </div>
      {communityEnabled && (
        <m.div className="game-comm-block" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }}
               transition={{ duration: 0.5, delay: revealAt(0) + 1 }}>
          <p className="game-comm">
            {community === 'error' ? 'Classement communautaire indisponible pour le moment.'
              : ok ? `Classement communautaire : ${community.count} classement${community.count > 1 ? 's' : ''} (position moyenne ; ▲ : la communauté le classe moins haut que vous).`
                : community ? 'Aucun classement communautaire pour l’instant : soyez le premier.' : 'Chargement du classement communautaire…'}
          </p>
          <button className="game-link is-gold" onClick={send} disabled={submitted || sending}>
            {submitted ? 'Classement ajouté' : sending ? 'Envoi…' : 'Ajouter mon classement à la communauté'}
          </button>
        </m.div>
      )}
    </m.section>
  )
}

export default function Game({ nav, relay, onBack: leave }) {
  const reduced = useReducedMotion()
  const sizes = useSizes()
  const [g, setG] = useState(() => load() ?? fresh())
  const [picked, setPicked] = useState(null)
  const mainRef = useRef(null)     // conteneur qui défile (.game)
  const tablesRef = useRef(null)   // tableaux détaillés du duel
  // Pièce de l'intro à reprendre (App.jsx, classement déjà fait) par l'annonce du Ballon d'Or ;
  // consommée au premier affichage.
  const [firstRelay] = useState(relay)
  const relayUsed = useRef(false)
  useEffect(() => { relayUsed.current = true }, [])
  // Annonce du Ballon d'Or jouée à chaque arrivée sur le résultat depuis l'intro (et à la fin
  // d'une partie) ; ↓, Entrée ou la flèche la passent. Non sauvegardé : rejouée au retour.
  const [ceremonyDone, setCeremonyDone] = useState(false)
  const { t, ui } = g
  const a = analyze(t)
  // done : classement fait (l'intro en tient compte pour sa transition, Carousel.jsx).
  useEffect(() => { try { localStorage.setItem(GAME_STORE, JSON.stringify({ ...g, done: !!a.ranking })) } catch { /* sans sauvegarde */ } }, [g])
  const screen = a.ranking ? (ceremonyDone ? 'result' : 'ceremony')
    : a.next.phase === 'ronde' && a.next.duel === 1 && ui.seenRound < a.next.round ? 'round' : 'duel'
  const setUi = (patch) => setG((x) => ({ ...x, ui: { ...x.ui, ...patch } }))
  const { played, planned } = progress(t)

  // Nouveau duel (ou nouvel écran) : on repart du haut de la page.
  const duelKey = a.next ? `${a.next.a}|${a.next.b}|${t.history.length}` : 'fin'
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }) }, [duelKey, screen])

  const castVote = (id) => {
    if (picked) return
    setPicked(id)
    setTimeout(() => { setG((x) => ({ ...x, t: vote(x.t, id) })); setPicked(null) }, reduced ? 200 : VOTE_MS)
  }
  const back = () => {
    if (picked) return
    setCeremonyDone(false)
    setG((x) => {
      // Revenu dans une ronde précédente : l'annonce de la suivante sera rejouée (ses
      // appariements peuvent changer avec le nouveau vote).
      const u = undo(x.t)
      const n = analyze(u).next
      const seenRound = n?.phase === 'ronde' ? Math.min(x.ui.seenRound, n.round) : x.ui.seenRound
      return { ...x, t: u, ui: { ...x.ui, seenRound, submitted: false } }
    })
  }
  const replay = () => { setG(fresh()); setCeremonyDone(false) }
  const start = () => setUi({ seenRound: a.next.round })
  const endCeremony = () => setCeremonyDone(true)
  const onBack = () => leave(!!a.ranking)   // classement fait : retour en fondu (transitions.js)
  const fresh1 = screen === 'round' && a.next.round === 1 && !t.history.length

  // Clavier : ← → votent (duel) ; Entrée ou ↓ lancent la ronde annoncée (annonce du Ballon d'Or :
  // passent au classement) ; Retour arrière annule
  // le dernier vote ; Échap, et ↑ pendant la ronde 1 (annonce et duels), l'annonce du Ballon d'Or
  // et le résultat,
  // reviennent au menu (l'intro ; la partie reste sauvegardée).
  const keys = useRef({})
  keys.current = { screen, castVote, back, start, endCeremony, onBack, a, main: mainRef, tables: tablesRef, reduced }
  useEffect(() => {
    const onKey = (e) => {
      const k = keys.current
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // Duel : ↓ descend aux tableaux, ↑ remonte aux joueurs (avant de revenir au menu).
      if (k.screen === 'duel' && e.key === 'ArrowDown') {
        e.preventDefault(); k.tables.current?.scrollIntoView({ behavior: k.reduced ? 'auto' : 'smooth' }); return
      }
      if (k.screen === 'duel' && e.key === 'ArrowUp' && k.main.current?.scrollTop > 2) {
        e.preventDefault(); k.main.current.scrollTo({ top: 0, behavior: k.reduced ? 'auto' : 'smooth' }); return
      }
      if (e.key === 'Escape' || (e.key === 'ArrowUp' && (k.screen === 'result' || k.screen === 'ceremony' || (k.a.next?.phase === 'ronde' && k.a.next.round === 1)))) {
        e.preventDefault(); k.onBack(); return
      }
      if (e.key === 'Backspace') { e.preventDefault(); k.back(); return }
      if (k.screen === 'duel' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        k.castVote(e.key === 'ArrowLeft' ? k.a.next.a : k.a.next.b)
      } else if ((k.screen === 'round' || k.screen === 'ceremony') && (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.target.closest?.('button')))) {
        e.preventDefault()
        if (k.screen === 'round') k.start()
        else k.endCeremony()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <m.main ref={mainRef} className="game" custom={nav} variants={gameVariants} initial="hidden" animate="shown" exit="exit">
      {screen !== 'result' && screen !== 'ceremony' && (
        <span className="game-progress" aria-hidden="true">
          <m.span initial={false} animate={{ scaleX: played / planned }} transition={{ duration: 0.4, ease: EASE }} />
        </span>
      )}
      {/* Retour au menu (l'intro) : flèche vers le haut du site (seul moyen sans clavier). */}
      <button className="intro-down final-up game-up" onClick={onBack}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7" /></svg>
        <span className="intro-down-label">Menu</span>
      </button>
      <nav className="game-nav">
        {/* Où en est la partie : duel en cours sur le total prévu (barrages compris). */}
        {(screen === 'round' || screen === 'duel') && (
          <span className="game-link game-count" aria-live="polite">Duel {Math.min(played + 1, planned)} / {planned}</span>
        )}
        {!fresh1 && <NewGame onConfirm={replay} />}
      </nav>
      <AnimatePresence mode="wait">
        {screen === 'round' && <Round key={`round-${a.next.round}-${a.rounds.at(-1).flat().join()}`} t={t} a={a} sizes={sizes}
                                      reduced={reduced} onStart={start} />}
        {screen === 'duel' && <Duel key="duel" t={t} a={a} sizes={sizes} reduced={reduced} onVote={castVote} picked={picked} tablesRef={tablesRef} />}
        {screen === 'ceremony' && <Ceremony key="ceremony" ranking={a.ranking} sizes={sizes} reduced={reduced} onDone={endCeremony}
                                            relay={relayUsed.current || reduced ? null : firstRelay} />}
        {screen === 'result' && <Result key="result" a={a} sizes={sizes} reduced={reduced} submitted={ui.submitted}
                                        onSubmit={() => setUi({ submitted: true })} />}
      </AnimatePresence>
    </m.main>
  )
}
