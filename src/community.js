// Classement communautaire du mode « Mon classement » : Firestore appelé en REST (fetch), sans
// SDK. Chaque classement envoyé est un document anonyme de la collection « classements » :
// { p_<id_joueur> : position (1 à 10) ×10, date }. Le classement communautaire est la position
// moyenne de chaque joueur (requêtes d'agrégation : une moyenne par requête, sans index composite).
// Configuration : .env (VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_API_KEY) ; sans elle, la
// fonctionnalité est désactivée (communityEnabled = false). Règles : firebase/firestore.rules.

const PROJECT = import.meta.env.VITE_FIREBASE_PROJECT_ID
const KEY = import.meta.env.VITE_FIREBASE_API_KEY
const COLLECTION = 'classements'
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

export const communityEnabled = Boolean(PROJECT && KEY)
const field = (id) => `p_${id.replace(/-/g, '_')}`

/** Envoie un classement (10 id dans l'ordre, du 1er au 10e). */
export async function submitRanking(ranking) {
  const fields = Object.fromEntries(ranking.map((id, i) => [field(id), { integerValue: String(i + 1) }]))
  fields.date = { timestampValue: new Date().toISOString() }
  const res = await fetch(`${BASE}/${COLLECTION}?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) throw new Error(`Envoi refusé (${res.status})`)
}

async function aggregate(aggregations) {
  const res = await fetch(`${BASE}:runAggregationQuery?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: COLLECTION }] }, aggregations } }),
  })
  if (!res.ok) throw new Error(`Lecture refusée (${res.status})`)
  const [row] = await res.json()
  return row?.result?.aggregateFields ?? {}
}
const num = (v) => (v ? Number(v.doubleValue ?? v.integerValue ?? NaN) : NaN)

/** Classement communautaire : { count, avg: { id: position moyenne } } (avg absent si aucun envoi). */
export async function fetchCommunity(ids) {
  // Une moyenne par requête : plusieurs moyennes dans la même requête exigent un index composite
  // (erreur 400 « The query requires an index ») ; seule, chacune passe par l'index automatique.
  const parts = await Promise.all([
    aggregate([{ alias: 'n', count: {} }]),
    ...ids.map((id) => aggregate([{ alias: 'a', avg: { field: { fieldPath: field(id) } } }])),
  ])
  const count = num(parts[0].n) || 0
  const avg = {}
  ids.forEach((id, k) => {
    const v = num(parts[k + 1].a)
    if (!Number.isNaN(v)) avg[id] = v
  })
  return { count, avg }
}
