// Chargement des séquences de rotation (48 images AVIF par joueur).
// Les images sont chargées dans l'ordre 000 → 047, quatre à la fois par joueur. Les
// séquences en préchargement (les deux joueurs affichés en page 1) sont interrompues si
// un autre joueur prend leur place ; celles ouvertes en page 2 ne le sont jamais.

import { FRAMES, frameUrl, posterUrl } from './data'

const PARALLEL = 4
const cache = new Map()
let prefetched = new Set()
const opened = new Set()   // joueurs ouverts, du plus ancien au plus récent (ordre d'insertion)
// Images décodées gardées en mémoire pour KEEP joueurs au plus (une séquence décodée pèse plus
// de 100 Mo) : au-delà, les plus anciens qui ne sont plus affichés (aucun abonné) sont libérés
// et rechargés au besoin (depuis le cache HTTP).
const KEEP = 6

function entry(id) {
  let e = cache.get(id)
  if (!e) {
    const poster = new Image()
    poster.src = posterUrl(id)
    e = { id, frames: new Array(FRAMES).fill(null), inFlight: new Map(), running: false,
          listeners: new Set(), poster }
    poster.onload = () => e.listeners.forEach((fn) => fn(-1))
    cache.set(id, e)
  }
  return e
}

function pump(e) {
  if (!e.running) return
  for (let i = 0; i < FRAMES && e.inFlight.size < PARALLEL; i++) {
    if (e.frames[i] || e.inFlight.has(i)) continue
    const img = new Image()
    img.decoding = 'async'
    e.inFlight.set(i, img)
    img.onload = () => {
      img.decode().catch(() => {}).then(() => {
        if (e.inFlight.get(i) !== img) return
        e.inFlight.delete(i)
        e.frames[i] = img
        e.listeners.forEach((fn) => fn(i))
        pump(e)
      })
    }
    img.onerror = () => {
      e.inFlight.delete(i)
    }
    img.src = frameUrl(e.id, i)
  }
}

function start(id) {
  const e = entry(id)
  e.running = true
  pump(e)
  return e
}

function stop(id) {
  const e = cache.get(id)
  if (!e) return
  e.running = false
  e.inFlight.forEach((img) => { img.src = '' })
  e.inFlight.clear()
}

/** Préchargement en arrière-plan des joueurs affichés (les deux du duel). */
export function prefetch(ids) {
  prefetched.forEach((id) => { if (!ids.includes(id) && !opened.has(id)) stop(id) })
  prefetched = new Set(ids)
  ids.forEach(start)
}

/** Ouverture d'un joueur en page 2 : chargement complet de sa séquence. */
export function open(id) {
  opened.delete(id)
  opened.add(id)
  for (const old of opened) {
    if (opened.size <= KEEP) break
    const e = cache.get(old)
    if (old === id || prefetched.has(old) || e?.listeners.size) continue
    stop(old)
    e?.frames.fill(null)
    opened.delete(old)
  }
  return start(id)
}

/** Image à afficher pour l'index demandé : la dernière disponible à ou avant i. */
export function frameAt(id, i) {
  const e = entry(id)
  for (let j = i; j >= 0; j--) if (e.frames[j]) return e.frames[j]
  return e.poster.complete && e.poster.naturalWidth ? e.poster : null
}

export function subscribe(id, fn) {
  const e = entry(id)
  e.listeners.add(fn)
  return () => e.listeners.delete(fn)
}

/** Vrai si les images from…to (incluses) de ce joueur sont chargées. */
export function hasFrames(id, from, to) {
  const e = entry(id)
  for (let i = from; i <= to; i++) if (!e.frames[i]) return false
  return true
}
