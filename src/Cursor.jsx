import { useEffect, useRef } from 'react'

// Curseur personnalisé (27/09/2026), grand écran avec souris seulement (pointer: fine) et hors
// mouvement réduit : un point doré qui suit exactement la souris et un anneau qui le rejoint
// avec un léger retard ; l'anneau grossit sur les éléments cliquables et se resserre au clic.
// Le curseur du système est masqué (classe has-cursor sur <html>).
const CLICKABLE = 'a, button, [role="button"], .pick-coin, .figure, label, input, select'

export default function Cursor() {
  const dot = useRef(null), ring = useRef(null)
  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine) and (hover: hover)').matches
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!fine || still) return
    const root = document.documentElement
    root.classList.add('has-cursor')
    let x = -100, y = -100, rx = x, ry = y, raf
    const move = (e) => {
      x = e.clientX; y = e.clientY
      dot.current.style.transform = `translate(${x}px, ${y}px)`
      const hot = e.target.closest?.(CLICKABLE) && !e.target.closest('[disabled]')
      ring.current.classList.toggle('is-hot', !!hot)
      root.classList.remove('cursor-out')
    }
    const down = () => ring.current.classList.add('is-down')
    const up = () => ring.current.classList.remove('is-down')
    const out = (e) => { if (!e.relatedTarget) root.classList.add('cursor-out') }
    const loop = () => {
      rx += (x - rx) * 0.2; ry += (y - ry) * 0.2
      ring.current.style.transform = `translate(${rx}px, ${ry}px)`
      raf = requestAnimationFrame(loop)
    }
    loop()
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    document.addEventListener('pointerout', out)
    return () => {
      cancelAnimationFrame(raf)
      root.classList.remove('has-cursor', 'cursor-out')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      document.removeEventListener('pointerout', out)
    }
  }, [])
  return (
    <>
      <span ref={ring} className="cursor-ring" aria-hidden="true" />
      <span ref={dot} className="cursor-dot" aria-hidden="true" />
    </>
  )
}
