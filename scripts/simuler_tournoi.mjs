// Vérifie le moteur du mode « Mon classement » (src/tournament.js) : 10 000 tournois à votes
// aléatoires, puis des cas forcés. Lancer depuis BO2026/ : node scripts/simuler_tournoi.mjs
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { SEEDS, analyze, createTournament, pairKey, standings, undo, vote } from '../src/tournament.js'

const ids = JSON.parse(readFileSync(new URL('../players.json', import.meta.url))).map((p) => p.id)

/** Joue un tournoi jusqu'au bout avec la fonction de choix pick(next, state). */
function play(state, pick, max = 200) {
  for (let n = 0; n < max; n++) {
    const { next } = analyze(state)
    if (!next) return state
    state = vote(state, pick(next, state))
  }
  throw new Error('tournoi sans fin')
}

// 1. Votes aléatoires.
const counts = {}
let seedClash = 0
for (let t = 0; t < 10000; t++) {
  let s = createTournament(ids)
  const poolOfSeed = SEEDS.map((id) => s.pools.findIndex((p) => p.includes(id)))
  if (new Set(poolOfSeed).size !== 3) seedClash++
  assert.deepEqual(s.pools.map((p) => p.length), [3, 3, 4])
  assert.equal(new Set(s.pools.flat()).size, 10)
  s = play(s, (n) => (Math.random() < 0.5 ? n.a : n.b))
  const a = analyze(s)
  assert.equal(a.ranking.length, 10)
  assert.equal(new Set(a.ranking).size, 10, 'le classement est une permutation')
  // Qualifiés = 3 premiers de poule + 2 meilleurs 2es ; ils occupent les places 1 à 5.
  assert.equal(a.finalists.length, 5)
  assert.deepEqual(a.finalists.slice(0, 3), a.poolOrders.map((o) => o[0]))
  assert.ok(a.finalists.slice(3).every((id) => a.poolOrders.map((o) => o[1]).includes(id)))
  assert.deepEqual([...a.ranking.slice(0, 5)].sort(), [...a.finalists].sort())
  assert.equal(Object.keys(s.final).length, 10, 'poule finale : 10 duels')
  const duels = s.history.length
  counts[duels] = (counts[duels] || 0) + 1
  // Annuler tous les votes ramène à l'état initial.
  let u = s
  while (u.history.length) u = undo(u)
  assert.deepEqual([u.results, u.final, u.barrages], [{}, {}, {}])
}
assert.equal(seedClash, 0, 'têtes de série toujours séparées')
console.log('10 000 tournois OK. Duels joués (22 + barrages) :')
for (const [n, c] of Object.entries(counts).sort((x, y) => x[0] - y[0])) console.log(`  ${n} duels : ${(c / 100).toFixed(1)} %`)

// 2. Cas forcés.
const fixed = () => ({ pools: [['a1', 'a2', 'a3'], ['b1', 'b2', 'b3'], ['c1', 'c2', 'c3', 'c4']], results: {}, final: {}, barrages: {}, history: [] })
const byOrder = (order) => (n) => (order.indexOf(n.a) < order.indexOf(n.b) ? n.a : n.b)

// 2a. Cycle parfait dans la poule A (a1 > a2 > a3 > a1) : Sonneborn-Berger identique → barrage.
{
  const rank = ['c1', 'b1', 'a1', 'a2', 'a3', 'b2', 'c2', 'b3', 'c3', 'c4']
  let s = fixed()
  const cycle = { [pairKey('a1', 'a2')]: 'a1', [pairKey('a2', 'a3')]: 'a2', [pairKey('a1', 'a3')]: 'a3' }
  const labels = []
  s = play(s, (n, st) => {
    labels.push(n.label)
    return n.phase === 'poule' && cycle[pairKey(n.a, n.b)] ? cycle[pairKey(n.a, n.b)] : byOrder(rank)(n)
  })
  const st = standings(['a1', 'a2', 'a3'], s.results)
  assert.ok(['a1', 'a2', 'a3'].every((id) => st[id].moy === 0.5 && st[id].sb === st.a1.sb))
  assert.ok(labels.some((l) => l === 'Barrage · Poule A'), 'barrage joué en poule A')
  assert.equal(analyze(s).poolOrders[0][0], 'a1', 'barrage gagné par a1 (préféré du visiteur)')
  console.log('Cycle parfait → barrage : OK')
}

// 2b. Égalité de moyenne tranchée par le Sonneborn-Berger, sans barrage. Poule C (w, x, y, z) :
// x bat y et z, y bat z et w, w bat x, z bat w → x et y à 2/3, w et z à 1/3.
// SB x = (2/3 + 1/3) / 3 = 1/3 > SB y = (1/3 + 1/3) / 3 = 2/9 ; SB w = (2/3) / 3 > SB z = (1/3) / 3.
{
  const s = fixed()
  s.pools[2] = ['w', 'x', 'y', 'z']
  const r = { [pairKey('x', 'y')]: 'x', [pairKey('x', 'z')]: 'x', [pairKey('y', 'z')]: 'y', [pairKey('w', 'y')]: 'y',
              [pairKey('w', 'x')]: 'w', [pairKey('w', 'z')]: 'z' }
  // Poules A et B sans égalité.
  for (const [a, b] of [['a1', 'a2'], ['a1', 'a3'], ['a2', 'a3'], ['b1', 'b2'], ['b1', 'b3'], ['b2', 'b3']]) r[pairKey(a, b)] = a
  s.results = r
  const a = analyze(s)
  assert.deepEqual(a.poolOrders[2], ['x', 'y', 'w', 'z'])
  assert.ok(!(a.next.phase === 'barrage' && a.next.label.includes('Poule C')), 'poule C départagée sans barrage')
  console.log('Égalité de moyenne → Sonneborn-Berger, sans barrage : OK')
}

// 2c. Deuxièmes à égalité à la limite : c2 (2 victoires sur 3) est le meilleur 2e ; a2 et b2
// (1 victoire sur 2, SB 0) se disputent la deuxième place qualificative → barrage entre eux.
{
  const rank = ['a1', 'b1', 'c1', 'c2', 'a2', 'b2', 'c3', 'c4', 'a3', 'b3']
  const duels = []
  const s = play(fixed(), (n) => { duels.push(n); return byOrder(rank)(n) })
  const b = duels.find((n) => n.label === 'Barrage · Meilleurs 2es')
  assert.ok(b && pairKey(b.a, b.b) === pairKey('a2', 'b2'), 'barrage entre a2 et b2')
  assert.deepEqual(analyze(s).finalists, ['a1', 'b1', 'c1', 'c2', 'a2'])
  console.log('Deuxièmes à égalité à la limite → barrage : OK')
}

// 2d. Undo au milieu : même état qu'avant le vote.
{
  let s = createTournament(ids)
  for (let i = 0; i < 7; i++) { const { next } = analyze(s); s = vote(s, next.a) }
  const before = JSON.stringify(s)
  const { next } = analyze(s)
  assert.equal(JSON.stringify(undo(vote(s, next.b))), before)
  console.log('Annulation : OK')
}
console.log('Toutes les vérifications passent.')
