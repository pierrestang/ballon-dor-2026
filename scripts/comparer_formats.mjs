// Compare le format en poules (src/tournament.js) et le système suisse (src/swiss.js) : des
// milliers de parties jouées par un visiteur dont le classement « vrai » est caché, puis on
// mesure à quel point chaque format le retrouve. Vérifie aussi le moteur suisse (duels jamais
// répétés, une partie par joueur et par ronde, annulation). Lancer depuis BO2026/ :
// node scripts/comparer_formats.mjs [nombre de parties]
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import * as pools from '../src/tournament.js'
import * as swiss from '../src/swiss.js'

const ids = JSON.parse(readFileSync(new URL('../players.json', import.meta.url))).map((p) => p.id)
const N = Number(process.argv[2]) || 5000

function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Visiteurs : cohérent (choisit toujours son préféré) ou hésitant (modèle logistique : plus deux
// joueurs sont proches dans son classement, plus il peut se « tromper »).
const VISITORS = [
  { name: 'cohérent', pick: (truth) => (n) => (truth.indexOf(n.a) < truth.indexOf(n.b) ? n.a : n.b) },
  ...[1.5, 3].map((T) => ({
    name: `hésitant (${Math.round(100 / (1 + Math.exp(-1 / T)))} % entre voisins)`,
    pick: (truth) => (n) => {
      const gap = truth.indexOf(n.b) - truth.indexOf(n.a)   // > 0 : a préféré
      return Math.random() < 1 / (1 + Math.exp(-gap / T)) ? n.a : n.b
    },
  })),
]

const FORMATS = [
  { name: 'Poules + têtes de série', engine: pools, create: () => pools.createTournament(ids) },
  { name: 'Suisse 5, SB + Buchholz', engine: swiss, create: () => swiss.createSwiss(ids, Math.random, 5, 0) },
  { name: 'Suisse 5 + vote top 3', engine: swiss, create: () => swiss.createSwiss(ids, Math.random, 5, 3) },
  { name: 'Suisse 5 + vote top 5', engine: swiss, create: () => swiss.createSwiss(ids, Math.random, 5, 5) },
  { name: 'Suisse 5 (jeu)', engine: swiss, create: () => swiss.createSwiss(ids, Math.random, 5, 10) },
  { name: 'Suisse 6, SB + Buchholz', engine: swiss, create: () => swiss.createSwiss(ids, Math.random, 6, 0) },
  { name: 'Suisse 6 + vote top 3', engine: swiss, create: () => swiss.createSwiss(ids, Math.random, 6, 3) },
]

// Classements cachés : au hasard (les favoris du visiteur ne sont pas forcément les têtes de
// série), ou les têtes de série en tête (cas le plus favorable aux poules).
const TRUTHS = [
  { name: 'favoris au hasard', make: () => shuffle(ids) },
  { name: 'favoris = têtes de série', make: () => [...shuffle(pools.SEEDS), ...shuffle(ids.filter((id) => !pools.SEEDS.includes(id)))] },
]

function play(engine, state, pick) {
  for (let n = 0; n < 200; n++) {
    const { next } = engine.analyze(state)
    if (!next) return state
    state = engine.vote(state, pick(next))
  }
  throw new Error('partie sans fin')
}

/** Vérifications propres au suisse. */
function checkSwiss(state, a) {
  const all = a.rounds.flat().map(([x, y]) => pools.pairKey(x, y))
  if (a.rounds.length <= 5) assert.equal(new Set(all).size, all.length, 'jamais deux fois le même duel')
  for (const pairs of a.rounds) assert.equal(new Set(pairs.flat()).size, ids.length, 'chacun joue une fois par ronde')
  let u = state
  while (u.history.length) u = swiss.undo(u)
  assert.deepEqual([u.results, u.barrages], [{}, {}])
}

const pct = (x) => `${(100 * x).toFixed(1)} %`.padStart(8)
const num = (x) => x.toFixed(2).padStart(6)

for (const truthKind of TRUTHS) {
  for (const visitor of VISITORS) {
    console.log(`\n=== Visiteur ${visitor.name} · ${truthKind.name} · ${N} parties par format ===`)
    console.log('Format                     Duels  Barr.     N°1  Podium   Top 5  Complet  Écart/place  Paires inversées /45')
    for (const f of FORMATS) {
      const m = { duels: 0, barr: 0, first: 0, podium: 0, top5: 0, exact: 0, err: 0, inv: 0, maxDuels: 0 }
      for (let t = 0; t < N; t++) {
        const truth = truthKind.make()
        const s = play(f.engine, f.create(), visitor.pick(truth))
        const a = f.engine.analyze(s)
        const r = a.ranking
        assert.equal(new Set(r).size, 10, 'le classement est une permutation')
        if (f.engine === swiss && t < 500) checkSwiss(s, a)
        const pos = (id) => r.indexOf(id)
        m.duels += s.history.length
        m.maxDuels = Math.max(m.maxDuels, s.history.length)
        m.barr += s.history.filter((h) => h.map === 'barrages').length
        m.first += r[0] === truth[0]
        m.podium += truth.slice(0, 3).every((id, i) => r[i] === id)
        m.top5 += truth.slice(0, 5).every((id) => pos(id) < 5)
        m.exact += truth.every((id, i) => r[i] === id)
        m.err += truth.reduce((sum, id, i) => sum + Math.abs(pos(id) - i), 0) / 10
        for (let i = 0; i < 10; i++) for (let k = i + 1; k < 10; k++) m.inv += pos(truth[i]) > pos(truth[k])
      }
      console.log(`${f.name.padEnd(25)} ${num(m.duels / N)} ${num(m.barr / N)} ${pct(m.first / N)}${pct(m.podium / N)}${pct(m.top5 / N)}${pct(m.exact / N)}${num(m.err / N).padStart(13)}${num(m.inv / N).padStart(22)}   (max ${m.maxDuels} duels)`)
    }
  }
}
