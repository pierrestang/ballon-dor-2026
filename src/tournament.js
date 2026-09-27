// Moteur du mode « Mon classement » : tournoi de duels votés par le visiteur. Module pur (aucune
// dépendance à React ni à Vite) : utilisé par Game.jsx et par scripts/simuler_tournoi.mjs.
//
// Format : trois poules (3, 3 et 4 joueurs) en toutes rencontres, une tête de série par poule ;
// les trois premiers et les deux meilleurs deuxièmes jouent une poule finale de 5 (nouveaux
// duels, même si deux finalistes se sont déjà affrontés en poule). Victoire = 1 point, défaite = 0 ; classement
// à la moyenne de points par match (les poules n'ont pas le même nombre de matchs). Égalités :
// Sonneborn-Berger (moyenne des adversaires battus, divisée par le nombre de matchs joués), puis
// confrontation directe (deux joueurs à égalité qui se sont affrontés), puis duel de barrage.
// Classement final par phase : 1 à 5 selon la poule finale, 6 à 10 selon les poules.
//
// État (sérialisable) : { pools: [[id…]×3], results: { 'a|b': id }, final: { 'a|b': id },
// barrages: { 'a|b': id }, history: [{ map, key }] }. Tout le reste en est déduit.

export const SEEDS = ['lamine-yamal', 'harry-kane', 'khvicha-kvaratskhelia']
export const POOL_NAMES = ['A', 'B', 'C']
export const PLANNED = 22   // 3 + 3 + 6 duels de poule, 10 en finale

const EPS = 1e-9
export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function shuffle(list, rng) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Tirage au sort : une tête de série par poule (celle de la poule de 4 tirée au sort), les
    autres joueurs répartis au hasard dans les places restantes. */
export function createTournament(ids, rng = Math.random) {
  const seeds = shuffle(SEEDS.filter((id) => ids.includes(id)), rng)
  const others = shuffle(ids.filter((id) => !SEEDS.includes(id)), rng)
  const sizes = [3, 3, 4]
  const pools = sizes.map((n, i) => {
    const pool = seeds[i] ? [seeds[i]] : []
    while (pool.length < n) pool.push(others.shift())
    return pool
  })
  return { pools, results: {}, final: {}, barrages: {}, history: [] }
}

// Toutes rencontres, par journées (chaque joueur joue au plus une fois par journée).
const ROUNDS = {
  3: [[[0, 1]], [[0, 2]], [[1, 2]]],
  4: [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]],
  5: [[[0, 1], [2, 3]], [[0, 2], [1, 4]], [[0, 3], [2, 4]], [[0, 4], [1, 3]], [[1, 2], [3, 4]]],   // un exempt par journée
}

/** Calendrier des poules, entrelacé par journées (A, B, C, puis journée suivante). */
export function poolSchedule(pools) {
  const out = []
  for (let r = 0; r < 3; r++) {
    pools.forEach((pool, p) => {
      ROUNDS[pool.length][r].forEach(([i, j]) => out.push({ a: pool[i], b: pool[j], pool: p, round: r + 1 }))
    })
  }
  return out
}

/** Bilan d'un groupe de joueurs d'après les résultats entre eux : j (matchs), v (victoires),
    moy (moyenne de points par match), sb (Sonneborn-Berger normalisé). */
export function standings(ids, results) {
  const base = Object.fromEntries(ids.map((id) => [id, { id, j: 0, v: 0, beat: [] }]))
  for (let i = 0; i < ids.length; i++) {
    for (let k = i + 1; k < ids.length; k++) {
      const w = results[pairKey(ids[i], ids[k])]
      if (!w) continue
      const l = w === ids[i] ? ids[k] : ids[i]
      base[ids[i]].j++; base[ids[k]].j++
      base[w].v++; base[w].beat.push(l)
    }
  }
  const moy = (s) => (s.j ? s.v / s.j : 0)
  return Object.fromEntries(Object.values(base).map((s) => [s.id, {
    id: s.id, j: s.j, v: s.v, moy: moy(s),
    sb: s.j ? s.beat.reduce((sum, l) => sum + moy(base[l]), 0) / s.j : 0,
  }]))
}

/** Duel de barrage nécessaire pour continuer. */
class Need {
  constructor(a, b, context) { this.a = a; this.b = b; this.context = context }
}

/** Ordonne ids d'après stat(id) = { moy, sb } ; chaque groupe encore à égalité est départagé par
    la confrontation directe (deux joueurs qui se sont affrontés : h2h), par un ordre imposé
    (same : joueurs d'une même poule, déjà départagés) ou par un barrage déjà voté ; sinon Need. */
function order(ids, stat, { h2h = {}, same = null, barrages, context }) {
  const sorted = [...ids].sort((x, y) => (stat(y).moy - stat(x).moy) || (stat(y).sb - stat(x).sb))
  const tied = (x, y) => Math.abs(stat(x).moy - stat(y).moy) < EPS && Math.abs(stat(x).sb - stat(y).sb) < EPS
  const out = []
  for (let i = 0; i < sorted.length;) {
    let j = i + 1
    while (j < sorted.length && tied(sorted[i], sorted[j])) j++
    const group = sorted.slice(i, j)
    if (group.length === 2 && h2h[pairKey(group[0], group[1])]) {
      const w = h2h[pairKey(group[0], group[1])]
      out.push(w, w === group[0] ? group[1] : group[0])
    } else {
      // Insertion : chaque comparaison vient d'un ordre imposé ou d'un barrage.
      const g = []
      for (const x of group) {
        let at = g.length
        for (let k = 0; k < g.length; k++) {
          const first = same?.(x, g[k]) ?? barrages[pairKey(x, g[k])]
          if (first === undefined) throw new Need(x, g[k], context)
          if (first === x) { at = k; break }
        }
        g.splice(at, 0, x)
      }
      out.push(...g)
    }
    i = j
  }
  return out
}

/** Les k premiers de ids (même clés et départages que order) : seul le groupe à égalité qui
    chevauche la k-ième place est départagé. */
function topK(ids, k, stat, opts) {
  const sorted = [...ids].sort((x, y) => (stat(y).moy - stat(x).moy) || (stat(y).sb - stat(x).sb))
  const tied = (x, y) => Math.abs(stat(x).moy - stat(y).moy) < EPS && Math.abs(stat(x).sb - stat(y).sb) < EPS
  let i = k - 1, j = k - 1
  while (i > 0 && tied(sorted[i - 1], sorted[k - 1])) i--
  while (j < sorted.length - 1 && tied(sorted[j + 1], sorted[k - 1])) j++
  if (j < k) return sorted.slice(0, k)   // la limite ne coupe aucune égalité
  return [...sorted.slice(0, i), ...order(sorted.slice(i, j + 1), stat, opts)].slice(0, k)
}

/** Déroulé complet déduit de l'état : ce qui est joué, ce qui est décidé, et le prochain duel. */
export function analyze(state) {
  const { pools, results, final, barrages } = state
  const schedule = poolSchedule(pools)
  const poolStats = pools.map((pool) => standings(pool, results))
  const out = { schedule, poolStats, poolOrders: null, finalists: null, finalStats: null, ranking: null, next: null }
  const pending = schedule.find((d) => !results[pairKey(d.a, d.b)])
  if (pending) {
    out.next = { ...pending, phase: 'poule', label: `Poule ${POOL_NAMES[pending.pool]} · Journée ${pending.round}` }
    return out
  }
  try {
    // Classement de chaque poule.
    out.poolOrders = pools.map((pool, p) => order(pool, (id) => poolStats[p][id],
      { h2h: results, barrages, context: `Poule ${POOL_NAMES[p]}` }))
    const poolOf = (id) => pools.findIndex((pool) => pool.includes(id))
    const statOf = (id) => poolStats[poolOf(id)][id]
    const rankIn = (id) => out.poolOrders[poolOf(id)].indexOf(id)
    const sameOrder = (x, y) => (poolOf(x) === poolOf(y) ? (rankIn(x) < rankIn(y) ? x : y) : undefined)
    // Deux meilleurs deuxièmes (poules différentes : jamais affrontés) : seuls les 2es à égalité
    // autour de la limite (2e place) sont départagés ici ; l'ordre des autres se décide avec le
    // classement final.
    const best = topK(out.poolOrders.map((o) => o[1]), 2, statOf, { barrages, context: 'Meilleurs 2es' })
    out.finalists = [...out.poolOrders.map((o) => o[0]), ...best]
    // Poule finale : ses propres duels.
    const fs = out.finalists
    const fSchedule = ROUNDS[5].flatMap((r, n) => r.map(([i, j]) => ({ a: fs[i], b: fs[j], round: n + 1 })))
    out.finalSchedule = fSchedule
    out.finalStats = standings(fs, final)
    const fPending = fSchedule.find((d) => !final[pairKey(d.a, d.b)])
    if (fPending) {
      out.next = { ...fPending, phase: 'finale', label: `Poule finale · Journée ${fPending.round}` }
      return out
    }
    const podium = order(fs, (id) => out.finalStats[id], { h2h: final, barrages, context: 'Poule finale' })
    // Places 6 à 10 : les non-qualifiés, d'après leurs poules.
    const rest = order(pools.flat().filter((id) => !fs.includes(id)), statOf,
      { same: sameOrder, barrages, context: 'Classement 6-10' })
    out.ranking = [...podium, ...rest]
  } catch (e) {
    if (!(e instanceof Need)) throw e
    out.next = { a: e.a, b: e.b, phase: 'barrage', label: `Barrage · ${e.context}` }
  }
  return out
}

/** Vote du visiteur pour le duel en cours ; renvoie le nouvel état. */
export function vote(state, winner) {
  const { next } = analyze(state)
  if (!next || (winner !== next.a && winner !== next.b)) return state
  const map = next.phase === 'poule' ? 'results' : next.phase === 'finale' ? 'final' : 'barrages'
  const key = pairKey(next.a, next.b)
  return { ...state, [map]: { ...state[map], [key]: winner }, history: [...state.history, { map, key }] }
}

/** Annule le dernier vote. */
export function undo(state) {
  const last = state.history.at(-1)
  if (!last) return state
  const m = { ...state[last.map] }
  delete m[last.key]
  return { ...state, [last.map]: m, history: state.history.slice(0, -1) }
}

/** Duels joués et prévus (les barrages s'ajoutent aux 18 duels prévus). */
export function progress(state) {
  const played = state.history.length
  const barrages = state.history.filter((h) => h.map === 'barrages').length
  return { played, planned: PLANNED + barrages }
}
