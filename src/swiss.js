// Moteur du mode « Mon classement » : système suisse (depuis le 27/09/2026, remplace les poules
// à têtes de série de tournament.js). Module pur : utilisé par Game.jsx et par
// scripts/comparer_formats.mjs, qui le compare à l'ancien format.
//
// Format : 10 joueurs, `rounds` rondes de 5 duels, tout le monde joue à chaque ronde. Ronde 1 :
// appariement tiré au sort (seul hasard du format, aucune tête de série). Rondes suivantes : les
// joueurs de même score s'affrontent, jamais deux fois le même duel ; une ronde n'est appariée
// qu'une fois la précédente entièrement votée. Victoire 1, défaite 0.
// Classement : points ; à égalité, le visiteur décide : confrontation directe s'ils se sont
// affrontés, sinon duel de barrage. Option `direct` (réglage du jeu : toutes les places) : au-delà
// des `direct` premières places, les égalités passent d'abord par Sonneborn-Berger (points des
// adversaires battus) et Buchholz (points de tous les adversaires) ; variantes comparées par
// scripts/comparer_formats.mjs.
//
// État (sérialisable) : { order: [id…] (tirage), rounds, direct, results: { 'r:a|b': id },
// barrages: { 'a|b': id }, history: [{ map, key }] }. Les appariements sont déduits de l'état
// (déterministes) : annuler un vote suffit à défaire ce qui en dépendait.

export const ROUNDS = 5
export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function shuffle(list, rng) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function createSwiss(ids, rng = Math.random, rounds = ROUNDS, direct = ids.length) {
  return { order: shuffle(ids, rng), rounds, direct, results: {}, barrages: {}, history: [] }
}

const resultKey = (r, a, b) => `${r}:${pairKey(a, b)}`

/** Bilan d'après les rondes appariées : j (matchs), pts, form (['V', 'D'…] ronde par ronde),
    opp (adversaires), sb (Sonneborn-Berger), bu (Buchholz). */
export function standings(ids, rounds, results) {
  const base = Object.fromEntries(ids.map((id) => [id, { id, j: 0, pts: 0, form: [], beat: [], opp: [] }]))
  rounds.forEach((pairs, r) => pairs.forEach(([a, b]) => {
    const w = results[resultKey(r, a, b)]
    if (!w) return
    const l = w === a ? b : a
    base[a].j++; base[b].j++
    base[a].opp.push(b); base[b].opp.push(a)
    base[w].pts++; base[w].beat.push(l)
    base[w].form.push('V'); base[l].form.push('D')
  }))
  return Object.fromEntries(Object.values(base).map((s) => [s.id, {
    ...s,
    sb: s.beat.reduce((sum, l) => sum + base[l].pts, 0),
    bu: s.opp.reduce((sum, o) => sum + base[o].pts, 0),
  }]))
}

/** Vainqueur de la confrontation directe (undefined : jamais affrontés, ou une victoire chacun). */
function headToHead(a, b, rounds, results) {
  const wins = rounds.flatMap((pairs, r) => pairs
    .filter(([x, y]) => pairKey(x, y) === pairKey(a, b))
    .map(([x, y]) => results[resultKey(r, x, y)]))
    .filter(Boolean)
  const wa = wins.filter((w) => w === a).length
  const wb = wins.length - wa
  return wa > wb ? a : wb > wa ? b : undefined
}

const byScore = (st, lot) => (x, y) =>
  (st[y].pts - st[x].pts) || (st[y].sb - st[x].sb) || (st[y].bu - st[x].bu) || (lot[x] - lot[y])

/** Appariement d'une ronde : parmi toutes les façons de former les paires (945 pour 10 joueurs),
    celle qui minimise la somme des carrés des écarts de points, sans duel déjà joué ; à coût
    égal, la première trouvée en suivant le classement (1 contre 2, 3 contre 4…). Si aucune n'évite
    les duels déjà joués (possible à partir de la 6e ronde), les répétitions sont permises. */
function pairRound(ids, rounds, results, lot) {
  const st = standings(ids, rounds, results)
  const sorted = [...ids].sort(byScore(st, lot))
  const met = new Set(rounds.flat().map(([a, b]) => pairKey(a, b)))
  for (const allowRepeat of [false, true]) {
    let best = null, bestCost = Infinity
    const used = new Set(), cur = []
    const search = (cost) => {
      if (cost >= bestCost) return
      const i = sorted.findIndex((id) => !used.has(id))
      if (i < 0) { best = [...cur]; bestCost = cost; return }
      const x = sorted[i]
      used.add(x)
      for (const y of sorted.slice(i + 1)) {
        if (used.has(y) || (!allowRepeat && met.has(pairKey(x, y)))) continue
        const d = st[x].pts - st[y].pts
        used.add(y); cur.push([x, y])
        search(cost + d * d + (met.has(pairKey(x, y)) ? 100 : 0))
        used.delete(y); cur.pop()
      }
      used.delete(x)
    }
    search(0)
    if (best) return best
  }
  throw new Error('appariement impossible')
}

class Need {
  constructor(a, b, context) { this.a = a; this.b = b; this.context = context }
}

/** Classement final (voir l'en-tête) ; lance Need si un barrage est nécessaire. Égalités de
    points qui touchent les `direct` premières places : décidées par le visiteur seul
    (confrontation directe s'il y en a une, sinon barrage), sans Sonneborn-Berger ni Buchholz. */
function rank(ids, st, rounds, results, barrages, direct) {
  const out = []
  // Insertion : chaque comparaison vient d'un duel (confrontation directe si useH2h) ou d'un barrage.
  const decide = (tied, from, to, useH2h) => {
    const g = []
    for (const x of tied) {
      let at = g.length
      for (let n = 0; n < g.length; n++) {
        const first = (useH2h && headToHead(x, g[n], rounds, results)) || barrages[pairKey(x, g[n])]
        if (first === undefined) throw new Need(x, g[n], from === to ? `Place ${from}` : `Places ${from}-${to}`)
        if (first === x) { at = n; break }
      }
      g.splice(at, 0, x)
    }
    return g
  }
  // Deux joueurs à égalité qui se sont affrontés : confrontation directe.
  const pair = (group) => group.length === 2 && headToHead(group[0], group[1], rounds, results)
  const sortedPts = [...ids].sort((x, y) => st[y].pts - st[x].pts)
  for (let i = 0; i < sortedPts.length;) {
    let j = i + 1
    while (j < sortedPts.length && st[sortedPts[j]].pts === st[sortedPts[i]].pts) j++
    const group = sortedPts.slice(i, j)
    if (group.length === 1) out.push(...group)
    else if (i < direct) out.push(...decide(group, i + 1, j, true))
    else if (pair(group)) out.push(...decide(group, i + 1, j, true))
    else {
      // Sonneborn-Berger et Buchholz ; les sous-groupes encore à égalité : confrontation directe
      // (à deux), sinon barrages.
      const sub = [...group].sort((x, y) => (st[y].sb - st[x].sb) || (st[y].bu - st[x].bu))
      for (let k = 0; k < sub.length;) {
        let m = k + 1
        while (m < sub.length && st[sub[m]].sb === st[sub[k]].sb && st[sub[m]].bu === st[sub[k]].bu) m++
        const tied = sub.slice(k, m)
        out.push(...decide(tied, i + k + 1, i + m, !!pair(tied)))
        k = m
      }
    }
    i = j
  }
  return out
}

/** Déroulé déduit de l'état : rondes appariées, bilan, prochain duel, classement final. */
export function analyze(state) {
  const { order: ids, rounds: total, results, barrages } = state
  const lot = Object.fromEntries(ids.map((id, i) => [id, i]))
  const rounds = []
  for (let r = 0; r < total; r++) {
    const pairs = r === 0
      ? Array.from({ length: ids.length / 2 }, (_, i) => [ids[2 * i], ids[2 * i + 1]])
      : pairRound(ids, rounds, results, lot)
    rounds.push(pairs)
    const n = pairs.findIndex(([a, b]) => !results[resultKey(r, a, b)])
    if (n >= 0) {
      const [a, b] = pairs[n]
      return {
        rounds, stats: standings(ids, rounds, results), ranking: null,
        next: { a, b, phase: 'ronde', round: r + 1, duel: n + 1, label: `Manche ${r + 1}/${total} · Duel ${n + 1}/${pairs.length}` },
      }
    }
  }
  const stats = standings(ids, rounds, results)
  try {
    return { rounds, stats, ranking: rank(ids, stats, rounds, results, barrages, state.direct ?? 0), next: null }
  } catch (e) {
    if (!(e instanceof Need)) throw e
    return { rounds, stats, ranking: null, next: { a: e.a, b: e.b, phase: 'barrage', label: `Barrage · ${e.context}` } }
  }
}

/** Vote du visiteur pour le duel en cours ; renvoie le nouvel état. */
export function vote(state, winner) {
  const { next } = analyze(state)
  if (!next || (winner !== next.a && winner !== next.b)) return state
  const map = next.phase === 'barrage' ? 'barrages' : 'results'
  const key = next.phase === 'barrage' ? pairKey(next.a, next.b) : resultKey(next.round - 1, next.a, next.b)
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

/** Duels joués et prévus (les barrages s'ajoutent aux duels des rondes). */
export function progress(state) {
  const played = state.history.length
  const barrages = state.history.filter((h) => h.map === 'barrages').length
  return { played, planned: state.rounds * state.order.length / 2 + barrages }
}
