import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, animate, m, useMotionValue, useReducedMotion } from 'framer-motion'
import players, { coinUrl, decimal } from './data'
import { LiveCoin } from './Coin'
import { ArcText } from './Letters'
import { Flag } from './Nameplate'
import Tip from './Tip'
import BattleCard from './BattleCard'
import { POOL_NAMES, SEEDS, analyze, createTournament, progress, undo, vote } from './tournament'
import { communityEnabled, fetchCommunity, submitRanking } from './community'
import { gameVariants } from './transitions'

// Mode « Mon classement » : le visiteur établit son classement /10 en votant duel après duel
// (moteur : tournament.js). Écrans : tirage au sort des poules → duels de poule (et barrages) →
// qualifiés → poule finale → classement, comparé au classement communautaire (community.js).
// Partie sauvegardée dans le navigateur (reprise au retour). Chargé à la demande (App.jsx).

const byId = Object.fromEntries(players.map((p) => [p.id, p]))
const IDS = players.map((p) => p.id)
const STORE = 'bo2026-classement'
const VOTE_MS = 650   // le choix reste affiché avant le duel suivant
const ORDINAL = (n) => (n === 1 ? '1er' : `${n}e`)

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE))
    if (saved?.t?.pools) return saved
  } catch { /* stockage indisponible : nouvelle partie */ }
  return null
}
const fresh = () => ({ t: createTournament(IDS), ui: { started: false, qualifSeen: false, submitted: false } })

/** Dimensions : diamètre des pièces des cartes et du tirage selon l'écran. */
function useSizes() {
  const measure = () => {
    const w = window.innerWidth, h = window.innerHeight
    const mobile = w <= 820
    return { mobile, card: Math.round(mobile ? Math.min(w * 0.26, 110) : Math.min(h * 0.14, 150)),
             draw: Math.round(mobile ? Math.min(w * 0.17, 70) : Math.min(h * 0.085, 84)) }
  }
  const [s, setS] = useState(measure)
  useEffect(() => {
    const on = () => setS(measure())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return s
}

/** Tableau d'une poule : rang, joueur, J, V, Moy., SB. order : ordre définitif (sinon provisoire) ;
    marks : { id: 'qualifié' | 'meilleur 2e' } ; hot : joueurs du duel en cours. */
function PoolTable({ title, ids, stats, order, marks = {}, hot = [] }) {
  const rows = order ?? [...ids].sort((x, y) => (stats[y].moy - stats[x].moy) || (stats[y].sb - stats[x].sb))
  return (
    <table className="game-table">
      <caption>{title}</caption>
      <thead>
        <tr><th /><th className="is-name" /><th>J</th><th>V</th><th>Moy.</th>
          <th><Tip label="Sonneborn-Berger">SB</Tip></th></tr>
      </thead>
      <tbody>
        {rows.map((id, i) => {
          const s = stats[id]
          return (
            <tr key={id} className={`${marks[id] ? 'is-qualified' : ''}${hot.includes(id) ? ' is-hot' : ''}`}>
              <td className="is-rank">{i + 1}</td>
              <td className="is-name">
                <span className="game-cell-name">
                  <img src={coinUrl(id)} alt="" width="20" height="20" />
                  <span>{byId[id].nom}</span>
                  {marks[id] === 'meilleur 2e' && <em>meilleur 2e</em>}
                </span>
              </td>
              <td>{s.j}</td><td>{s.v}</td><td>{decimal(s.moy)}</td><td>{decimal(s.sb)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Pièce du tirage : vole du centre de l'écran jusqu'à sa place dans sa poule. */
function DrawCoin({ id, size, delay, seed, reduced }) {
  const ref = useRef(null)
  const x = useMotionValue(0), y = useMotionValue(0), opacity = useMotionValue(0), rotateY = useMotionValue(0)
  useLayoutEffect(() => {
    const r = ref.current.getBoundingClientRect()
    if (reduced) { animate(opacity, 1, { duration: 0.3, delay: delay / 3 }); return }
    x.set(window.innerWidth / 2 - (r.left + r.width / 2))
    y.set(window.innerHeight / 2 - (r.top + r.height / 2))
    const opts = { duration: 0.7, delay, ease: [0.65, 0, 0.35, 1] }
    const ctl = [animate(x, 0, opts), animate(y, 0, opts), animate(rotateY, 540, opts),
                 animate(opacity, 1, { duration: 0.15, delay })]
    return () => ctl.forEach((c) => c.stop())
  }, [])
  return (
    <div className="game-draw-item">
      <m.div ref={ref} className="game-draw-coin" style={{ '--d': `${size}px`, x, y, opacity }}>
        <LiveCoin player={byId[id]} rotateY={rotateY} phase={IDS.indexOf(id) * 0.7} />
        <ArcText text={byId[id].nom} side="bottom" className="game-card-name" />
      </m.div>
      {seed && <span className="game-seed">Tête de série</span>}
    </div>
  )
}

function Draw({ t, sizes, reduced, onStart, onRedraw }) {
  // Ordre de distribution : les têtes de série d'abord, puis les autres place par place.
  const order = [...t.pools.flat().filter((id) => SEEDS.includes(id)), ...t.pools.flat().filter((id) => !SEEDS.includes(id))]
  return (
    <m.section className="game-screen game-draw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <h1 className="game-title">Tirage au sort</h1>
      <p className="game-sub">Une tête de série par poule · les 3 premiers et les 2 meilleurs 2es en poule finale</p>
      <div className="game-pools">
        {t.pools.map((pool, p) => (
          <div key={p} className="game-pool">
            <h2>Poule {POOL_NAMES[p]}</h2>
            {pool.map((id) => (
              <DrawCoin key={id} id={id} size={sizes.draw} seed={SEEDS.includes(id)} reduced={reduced}
                        delay={0.2 + order.indexOf(id) * 0.12} />
            ))}
          </div>
        ))}
      </div>
      <div className="game-actions">
        <button className="game-btn is-primary" onClick={onStart}>Commencer le tournoi</button>
        <button className="game-btn" onClick={onRedraw}>Nouveau tirage</button>
      </div>
    </m.section>
  )
}

function Duel({ t, a, sizes, reduced, onVote, picked }) {
  const { next } = a
  const { played, planned } = progress(t)
  const L = byId[next.a], R = byId[next.b]
  const finalPhase = next.phase === 'finale' || (next.phase === 'barrage' && next.label.includes('finale'))
  return (
    <m.section className="game-screen game-duel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="game-head">
        <p className={`game-phase${next.phase === 'barrage' ? ' is-barrage' : ''}`} aria-live="polite">
          {next.label}{next.phase === 'barrage' ? ' — départagez' : ''}
        </p>
        <p className="game-count">Duel {String(played + 1).padStart(2, '0')} / {planned}</p>
        <span className="game-bar"><m.span initial={false} animate={{ scaleX: played / planned }} transition={{ duration: 0.4 }} /></span>
      </header>
      <div className="game-pair">
        <AnimatePresence mode="wait" initial={!reduced}>
          <m.div key={`${next.a}|${next.b}|${played}`} className="game-pair-in">
            <BattleCard player={L} other={R} side="left" coin={sizes.card} onVote={() => onVote(L.id)}
                        state={picked ? (picked === L.id ? 'won' : 'lost') : null} />
            <span className="game-vs" aria-hidden="true">VS</span>
            <BattleCard player={R} other={L} side="right" coin={sizes.card} onVote={() => onVote(R.id)}
                        state={picked ? (picked === R.id ? 'won' : 'lost') : null} />
          </m.div>
        </AnimatePresence>
      </div>
      <div className="game-tables">
        {finalPhase && a.finalStats
          ? <PoolTable title="Poule finale" ids={a.finalists} stats={a.finalStats} hot={[next.a, next.b]} />
          : t.pools.map((pool, p) => (
            <PoolTable key={p} title={`Poule ${POOL_NAMES[p]}`} ids={pool} stats={a.poolStats[p]} hot={[next.a, next.b]} />
          ))}
      </div>
      <p className="game-help" aria-hidden="true">← → VOTER · ⌫ ANNULER · ESC ACCUEIL</p>
    </m.section>
  )
}

function Qualif({ t, a, sizes, onGo }) {
  const marks = Object.fromEntries(a.finalists.map((id, i) => [id, i >= 3 ? 'meilleur 2e' : 'qualifié']))
  return (
    <m.section className="game-screen game-qualif" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <h1 className="game-title">Qualifiés pour la poule finale</h1>
      <div className="game-finalists">
        {a.finalists.map((id) => (
          <div key={id} className="game-finalist" style={{ '--d': `${sizes.draw}px` }}>
            <span className="game-draw-coin"><LiveCoin player={byId[id]} phase={IDS.indexOf(id) * 0.7} /><ArcText text={byId[id].nom} side="bottom" className="game-card-name" /></span>
          </div>
        ))}
      </div>
      <div className="game-tables">
        {t.pools.map((pool, p) => (
          <PoolTable key={p} title={`Poule ${POOL_NAMES[p]}`} ids={pool} stats={a.poolStats[p]} order={a.poolOrders[p]} marks={marks} />
        ))}
      </div>
      <div className="game-actions">
        <button className="game-btn is-primary" onClick={onGo}>Jouer la poule finale</button>
      </div>
    </m.section>
  )
}

function Result({ a, sizes, submitted, onSubmit, onReplay, onHome }) {
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
  const podium = [a.ranking[1], a.ranking[0], a.ranking[2]]
  return (
    <m.section className="game-screen game-result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <h1 className="game-title">Mon classement</h1>
      <div className="game-podium">
        {podium.map((id, k) => {
          const rank = [2, 1, 3][k]
          return (
            <div key={id} className={`game-podium-step is-${rank}`} style={{ '--d': `${Math.round(sizes.card * (rank === 1 ? 1 : 0.75))}px` }}>
              <span className="game-podium-rank">{ORDINAL(rank)}</span>
              <span className="game-draw-coin"><LiveCoin player={byId[id]} phase={IDS.indexOf(id) * 0.7} /><ArcText text={byId[id].nom} side="bottom" className="game-card-name" /></span>
            </div>
          )
        })}
      </div>
      <ol className="game-ranking">
        {a.ranking.map((id, i) => {
          const c = commRank[id]
          const diff = c ? c - (i + 1) : 0
          return (
            <li key={id} className={i < 3 ? 'is-top' : ''}>
              <span className="game-rank">{ORDINAL(i + 1)}</span>
              <Flag player={byId[id]} />
              <span className="game-rank-name">{byId[id].nom}</span>
              {ok && (
                <span className="game-rank-comm">
                  Communauté : {c ? ORDINAL(c) : '—'}
                  {c && diff !== 0 && <em className={diff > 0 ? 'is-up' : 'is-down'}>{diff > 0 ? '▲' : '▼'} {Math.abs(diff)}</em>}
                </span>
              )}
            </li>
          )
        })}
      </ol>
      {communityEnabled && (
        <p className="game-comm">
          {community === 'error' ? 'Classement communautaire indisponible pour le moment.'
            : ok ? `Classement communautaire : ${community.count} classement${community.count > 1 ? 's' : ''} (position moyenne ; ▲ : la communauté le classe moins haut que vous).`
              : community ? 'Aucun classement communautaire pour l’instant : soyez le premier.' : 'Chargement du classement communautaire…'}
        </p>
      )}
      <div className="game-actions">
        {communityEnabled && (
          <button className="game-btn is-primary" onClick={send} disabled={submitted || sending}>
            {submitted ? 'Classement ajouté' : sending ? 'Envoi…' : 'Ajouter mon classement à la communauté'}
          </button>
        )}
        <button className={`game-btn${communityEnabled ? '' : ' is-primary'}`} onClick={onReplay}>Rejouer</button>
        <button className="game-btn" onClick={onHome}>Accueil</button>
      </div>
    </m.section>
  )
}

export default function Game({ nav, onBack }) {
  const reduced = useReducedMotion()
  const sizes = useSizes()
  const [g, setG] = useState(() => load() ?? fresh())
  const [picked, setPicked] = useState(null)
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(g)) } catch { /* sans sauvegarde */ } }, [g])
  const { t, ui } = g
  const a = analyze(t)
  const screen = !ui.started ? 'draw'
    : a.ranking ? 'result'
      : a.next.phase === 'finale' && !Object.keys(t.final).length && !ui.qualifSeen ? 'qualif' : 'duel'
  const setUi = (patch) => setG((x) => ({ ...x, ui: { ...x.ui, ...patch } }))

  const castVote = (id) => {
    if (picked) return
    setPicked(id)
    setTimeout(() => { setG((x) => ({ ...x, t: vote(x.t, id) })); setPicked(null) }, reduced ? 200 : VOTE_MS)
  }
  const back = () => {
    if (picked) return
    setG((x) => {
      const u = undo(x.t)
      return { ...x, t: u, ui: { ...x.ui, qualifSeen: Object.keys(u.final).length ? x.ui.qualifSeen : false, submitted: false } }
    })
  }
  const replay = () => setG(fresh())

  // Clavier : ← → votent (duel) ; Entrée continue (tirage, qualifiés) ; Retour arrière annule le
  // dernier vote ; Échap revient à l'accueil (la partie reste sauvegardée).
  const keys = useRef({})
  keys.current = { screen, a, castVote, back, setUi, onBack }
  useEffect(() => {
    const onKey = (e) => {
      const k = keys.current
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') { e.preventDefault(); k.onBack(); return }
      if (e.key === 'Backspace' && k.screen !== 'draw') { e.preventDefault(); k.back(); return }
      if (k.screen === 'duel' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        k.castVote(e.key === 'ArrowLeft' ? k.a.next.a : k.a.next.b)
      } else if (e.key === 'Enter' && !e.target.closest?.('button')) {
        if (k.screen === 'draw') k.setUi({ started: true })
        else if (k.screen === 'qualif') k.setUi({ qualifSeen: true })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <m.main className="game" custom={nav} variants={gameVariants} initial="hidden" animate="shown" exit="exit">
      <nav className="game-nav">
        <button className="game-link" onClick={onBack}>‹ Accueil</button>
        {ui.started && screen !== 'result' && <button className="game-link" onClick={replay}>Nouvelle partie</button>}
      </nav>
      <AnimatePresence mode="wait">
        {screen === 'draw' && <Draw key={`draw-${t.pools.flat().join()}`} t={t} sizes={sizes} reduced={reduced}
                                    onStart={() => setUi({ started: true })} onRedraw={replay} />}
        {screen === 'duel' && <Duel key="duel" t={t} a={a} sizes={sizes} reduced={reduced} onVote={castVote} picked={picked} />}
        {screen === 'qualif' && <Qualif key="qualif" t={t} a={a} sizes={sizes} onGo={() => setUi({ qualifSeen: true })} />}
        {screen === 'result' && <Result key="result" a={a} sizes={sizes} submitted={ui.submitted}
                                        onSubmit={() => setUi({ submitted: true })} onReplay={replay} onHome={onBack} />}
      </AnimatePresence>
    </m.main>
  )
}
