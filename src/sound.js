// Design sonore (27/09/2026), synthétisé en direct (Web Audio, aucun fichier) et coupé par
// défaut : bouton « Son » (SoundToggle, App.jsx), choix gardé dans le navigateur.
//   clink()  tintement de pièce d'or (survol d'une pièce) : contact bref + résonance du métal
//   flip() / land(id) / pick(id)  sélection d'une pièce : pichenette, puis la pièce se pose
//   swoosh() souffle au changement de version sur l'intro (← / →)
//   pad(on)  nappe grave pendant l'annonce du Ballon d'Or ; fanfare() : accord du n°1
//   ambiance de fond : accord lent et chaud, sur tout le site tant que le son est actif (baissée
//   pendant l'annonce du Ballon d'Or)
const KEY = 'bo2026-son'
let ctx = null
let enabled = (() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })()
const listeners = new Set()

export const soundOn = () => enabled
export function setSound(v) {
  enabled = v
  try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* sans stockage */ }
  if (!v) pad(false)
  ambient(v)
  listeners.forEach((fn) => fn(v))
}
export const onSound = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }

const audio = () => {
  if (!enabled) return null
  ctx ??= new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

/** Note brève : fréquence f (Hz), forme, durée d (s), volume v, départ t (s). */
function tone(a, f, { type = 'sine', d = 0.4, v = 0.12, t = 0 } = {}) {
  const o = a.createOscillator(), g = a.createGain()
  o.type = type; o.frequency.value = f
  const t0 = a.currentTime + t
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(v, t0 + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d)
  o.connect(g).connect(a.destination)
  o.start(t0); o.stop(t0 + d + 0.05)
}

let lastClink = 0
// Une note par pièce (27/09/2026) : les 10 joueurs, dans l'ordre de players.json, sur une gamme
// pentatonique de ré (ré mi fa# la si, sur deux octaves) — toujours consonante avec l'ambiance
// de fond, quel que soit l'enchaînement des survols.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]   // demi-tons au-dessus de la note de base
const NOTE_BASE = 1175   // ré 6 (Hz)
let order = []
export const setCoinNotes = (ids) => { order = ids }
const noteOf = (id) => {
  const i = order.indexOf(id)
  return i < 0 ? NOTE_BASE : NOTE_BASE * 2 ** (SCALE[i % SCALE.length] / 12)
}

/** Tintement de pièce d'or : un « tic » de contact (bruit très bref, filtré) puis la résonance
    du métal, trois partiels inharmoniques légèrement désaccordés deux à deux (battement qui
    fait vibrer le son), décroissance longue et douce. `id` : le joueur de la pièce (sa note). */
export function clink(id) {
  const a = audio()
  if (!a || a.currentTime - lastClink < 0.15) return
  lastClink = a.currentTime
  const t0 = a.currentTime
  // Contact : 12 ms de bruit, passe-haut.
  const buf = a.createBuffer(1, Math.round(a.sampleRate * 0.012), a.sampleRate)
  const ch = buf.getChannelData(0)
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length)
  const noise = a.createBufferSource(), hp = a.createBiquadFilter(), ng = a.createGain()
  noise.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 3000; ng.gain.value = 0.18
  noise.connect(hp).connect(ng).connect(a.destination)
  noise.start(t0)
  // Résonance : partiels d'une pièce (rapports ≈ 1 : 2,4 : 3,9), chacun doublé à +3 Hz.
  const base = noteOf(id) * (0.995 + Math.random() * 0.01)   // sa note, à peine variée
  ;[[1, 0.05, 1.1], [2.41, 0.032, 0.7], [3.92, 0.018, 0.45]].forEach(([ratio, v, d]) => {
    ;[0, 3].forEach((beat) => tone(a, base * ratio + beat, { d, v: v / 2 }))
  })
}

/** « Swoosh » : souffle filtré qui balaie de grave à aigu (ou l'inverse selon le sens `dir`),
    panoramique de gauche à droite dans le sens du geste ; 0,45 s. */
export function swoosh(dir = 1) {
  const a = audio()
  if (!a) return
  const t0 = a.currentTime, d = 0.45
  const buf = a.createBuffer(1, Math.round(a.sampleRate * d), a.sampleRate)
  const ch = buf.getChannelData(0)
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1
  const src = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain()
  src.buffer = buf
  bp.type = 'bandpass'; bp.Q.value = 1.4
  bp.frequency.setValueAtTime(dir > 0 ? 400 : 2600, t0)
  bp.frequency.exponentialRampToValueAtTime(dir > 0 ? 2600 : 400, t0 + d)
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(0.22, t0 + d * 0.45)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d)
  let out = g
  if (a.createStereoPanner) {
    const pan = a.createStereoPanner()
    pan.pan.setValueAtTime(-0.6 * dir, t0)
    pan.pan.linearRampToValueAtTime(0.6 * dir, t0 + d)
    g.connect(pan); out = pan
  }
  src.connect(bp).connect(g)
  out.connect(a.destination)
  src.start(t0); src.stop(t0 + d)
}

/** Sélection d'une pièce (partout : sélection du duel, candidats, vote du jeu) : la pièce est
    lancée d'une pichenette (flip : petit souffle aigu, 0,22 s), puis se pose (land : léger choc
    sourd + sa note). */
export function flip() {
  const a = audio()
  if (!a) return
  const t0 = a.currentTime, d = 0.22
  const buf = a.createBuffer(1, Math.round(a.sampleRate * d), a.sampleRate)
  const ch = buf.getChannelData(0)
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1
  const src = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain()
  src.buffer = buf
  bp.type = 'bandpass'; bp.Q.value = 2
  bp.frequency.setValueAtTime(1800, t0); bp.frequency.exponentialRampToValueAtTime(5200, t0 + d)
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.14, t0 + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d)
  src.connect(bp).connect(g).connect(a.destination)
  src.start(t0); src.stop(t0 + d)
  tone(a, 2400, { type: 'triangle', d: 0.05, v: 0.05 })   // le « tic » du pouce
}
/** Vibration brève quand une pièce se pose ou qu'on vote (Android ; iOS l'ignore), son coupé
    ou non. */
export function haptic(ms = 12) {
  try { navigator.vibrate?.(ms) } catch { /* non pris en charge */ }
}
export function land(id) {
  haptic()
  const a = audio()
  if (!a) return
  tone(a, 160, { type: 'sine', d: 0.14, v: 0.14 })   // la pièce touche
  lastClink = 0
  clink(id)
}
/** Pichenette puis pose au bout de `delay` s (durée du vol ; 0 : tout de suite). */
export function pick(id, delay = 0.35) {
  flip()
  setTimeout(() => (enabled ? land(id) : haptic()), delay * 1000)
}

let padNodes = null
export function pad(on) {
  duckAmbient(on)
  if (!on) {
    if (padNodes && ctx) {
      const t = ctx.currentTime
      padNodes.g.gain.cancelScheduledValues(t)
      padNodes.g.gain.setTargetAtTime(0, t, 0.4)
      const { oscs } = padNodes
      setTimeout(() => oscs.forEach((o) => o.stop()), 2000)
    }
    padNodes = null
    return
  }
  const a = audio()
  if (!a || padNodes) return
  const g = a.createGain()
  const lp = a.createBiquadFilter()
  lp.type = 'lowpass'; lp.frequency.value = 700
  g.gain.value = 0
  g.gain.setTargetAtTime(0.05, a.currentTime, 1.2)
  const oscs = [55, 82.5, 110, 164.8].map((f, i) => {
    const o = a.createOscillator()
    o.type = i % 2 ? 'sine' : 'sawtooth'
    o.frequency.value = f
    o.detune.value = (i - 1.5) * 4
    o.connect(lp)
    o.start()
    return o
  })
  lp.connect(g).connect(a.destination)
  padNodes = { g, oscs }
}

export function fanfare() {
  const a = audio()
  if (!a) return
  // Accord majeur lumineux, arpégé, puis tenu.
  ;[523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(a, f, { type: 'triangle', d: 2.6, v: 0.07, t: i * 0.09 }))
  ;[2637, 3520].forEach((f, i) => tone(a, f, { d: 1.2, v: 0.03, t: 0.4 + i * 0.15 }))
}

// ——— Ambiance de fond ———
// Accord ouvert (ré – la – ré – fa# – la), sinus et triangles très doux, filtré ; chaque voix
// respire à son propre rythme (LFO lents de 9 à 23 s) : une nappe qui évolue sans jamais boucler.
let amb = null
const AMB_LEVEL = 0.035
function ambient(on) {
  if (!on) {
    if (amb && ctx) {
      const t = ctx.currentTime, { g, nodes } = amb
      g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.6)
      setTimeout(() => nodes.forEach((n) => n.stop()), 3000)
    }
    amb = null
    return
  }
  const a = audio()
  if (!a || amb) return
  const g = a.createGain(), lp = a.createBiquadFilter()
  lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.3
  g.gain.value = 0
  g.gain.setTargetAtTime(AMB_LEVEL, a.currentTime, 2.5)   // montée lente
  lp.connect(g).connect(a.destination)
  const nodes = []
  ;[[73.4, 'sine', 9], [110, 'triangle', 13], [146.8, 'sine', 17], [185, 'triangle', 23], [220, 'sine', 11]].forEach(([f, type, period], i) => {
    const o = a.createOscillator(), vg = a.createGain(), lfo = a.createOscillator(), lg = a.createGain()
    o.type = type; o.frequency.value = f; o.detune.value = (i - 2) * 3
    vg.gain.value = 0.18
    lfo.frequency.value = 1 / period; lg.gain.value = 0.14   // respiration de chaque voix
    lfo.connect(lg).connect(vg.gain)
    o.connect(vg).connect(lp)
    o.start(); lfo.start()
    nodes.push(o, lfo)
  })
  amb = { g, nodes }
}
/** Ambiance baissée (annonce du Ballon d'Or) ou remise à son niveau. */
function duckAmbient(duck) {
  if (!amb || !ctx) return
  amb.g.gain.setTargetAtTime(duck ? AMB_LEVEL * 0.3 : AMB_LEVEL, ctx.currentTime, 0.8)
}
// Son déjà activé lors d'une visite précédente : l'ambiance démarre au premier geste du
// visiteur (les navigateurs interdisent le son avant).
if (enabled) {
  const start = () => { ambient(true); window.removeEventListener('pointerdown', start); window.removeEventListener('keydown', start) }
  window.addEventListener('pointerdown', start)
  window.addEventListener('keydown', start)
}

