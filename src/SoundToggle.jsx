import { useEffect, useState } from 'react'
import { onSound, setSound, soundOn } from './sound'

// Bouton « Son » en bas à gauche de toutes les pages : coupé par défaut ; ondes sonores quand
// il est actif. Le choix est gardé dans le navigateur (sound.js).
export default function SoundToggle() {
  const [on, setOn] = useState(soundOn)
  useEffect(() => onSound(setOn), [])
  return (
    <button className={`sound-toggle${on ? ' is-on' : ''}`} onClick={() => setSound(!on)}
            aria-pressed={on} aria-label={on ? 'Couper le son' : 'Activer le son'}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" />
        {on ? <><path d="M16 9a4 4 0 0 1 0 6" /><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" /></> : <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />}
      </svg>
      <span>Son</span>
    </button>
  )
}
