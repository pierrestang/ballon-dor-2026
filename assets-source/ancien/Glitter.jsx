// Fond « paillettes de cérémonie » de l'intro, en canvas 2D, sans dépendance.
// Des paillettes dorées tombent lentement en se balançant et tournent sur elles-mêmes :
// elles scintillent quand leur face attrape la lumière. Trois plans de profondeur
// (loin : petits reflets flous ; près : grandes paillettes nettes), sur fond noir
// éclairé d'un halo doré venant du haut. Image fixe en mouvement réduit.

import { useEffect, useRef } from 'react'

// Réglages
const SETTINGS = {
  density: 0.0004,    // paillettes par pixel CSS (≈ 520 sur 1440 × 900)
  maxCount: 700,
  bokeh: 40,          // reflets flous à l'arrière-plan
  fall: 38,           // vitesse de chute du plan le plus proche, en px/s
  colors: ['#8a6118', '#b58a33', '#d9b25f', '#f3dfa2', '#fff7e0'],
  glow: 'rgba(217, 178, 95, 0.24)', // halo en haut de l'écran
}

// Plans de profondeur : taille, vitesse et opacité croissent avec la proximité.
const LAYERS = [
  { share: 0.5, size: [2, 4], speed: 0.35, alpha: 0.5 },
  { share: 0.35, size: [4, 7], speed: 0.65, alpha: 0.75 },
  { share: 0.15, size: [8, 13], speed: 1, alpha: 1 },
]

const rand = (a, b) => a + Math.random() * (b - a)
const pick = (list) => list[Math.floor(Math.random() * list.length)]

// Reflet flou, pré-dessiné une fois puis réutilisé (plus léger qu'un shadowBlur).
function makeBokehSprite() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255, 236, 180, 0.9)')
  grad.addColorStop(0.35, 'rgba(217, 178, 95, 0.35)')
  grad.addColorStop(1, 'rgba(217, 178, 95, 0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return c
}

function makeFlake(w, h, anywhere) {
  const r = Math.random()
  const layer = r < LAYERS[0].share ? LAYERS[0]
    : r < LAYERS[0].share + LAYERS[1].share ? LAYERS[1] : LAYERS[2]
  const size = rand(...layer.size)
  return {
    x: rand(0, w),
    y: anywhere ? rand(-20, h) : rand(-60, -10),
    w: size,
    h: size * rand(0.45, 0.8),
    layer,
    color: pick(SETTINGS.colors),
    vy: SETTINGS.fall * layer.speed * rand(0.7, 1.3),
    sway: rand(8, 26) * layer.speed,
    swaySpeed: rand(0.4, 1.1),
    phase: rand(0, Math.PI * 2),
    angle: rand(0, Math.PI * 2),
    spin: rand(-1.2, 1.2),
    flip: rand(0, Math.PI * 2),
    flipSpeed: rand(1.5, 4),
  }
}

function makeBokeh(w, h) {
  return {
    x: rand(0, w),
    y: rand(0, h),
    r: rand(14, 48),
    alpha: rand(0.15, 0.45),
    vy: rand(3, 9),
    phase: rand(0, Math.PI * 2),
    pulse: rand(0.3, 0.8),
  }
}

export default function Glitter({ className }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    const sprite = makeBokehSprite()
    let w = 0
    let h = 0
    let flakes = []
    let bokeh = []

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(SETTINGS.maxCount, Math.round(w * h * SETTINGS.density))
      flakes = Array.from({ length: count }, () => makeFlake(w, h, true))
      bokeh = Array.from({ length: SETTINGS.bokeh }, () => makeBokeh(w, h))
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const draw = (t, dt) => {
      ctx.clearRect(0, 0, w, h)

      // Halo doré venant du haut, comme un projecteur de scène.
      const glow = ctx.createRadialGradient(w / 2, -h * 0.1, 0, w / 2, -h * 0.1, Math.max(w, h) * 0.9)
      glow.addColorStop(0, SETTINGS.glow)
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)

      // Reflets flous à l'arrière-plan.
      ctx.globalCompositeOperation = 'lighter'
      for (const b of bokeh) {
        b.y -= b.vy * dt
        if (b.y < -b.r * 2) { b.y = h + b.r; b.x = rand(0, w) }
        ctx.globalAlpha = b.alpha * (0.6 + 0.4 * Math.sin(t * b.pulse + b.phase))
        ctx.drawImage(sprite, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2)
      }
      ctx.globalCompositeOperation = 'source-over'

      // Paillettes : la face visible (cos du retournement) règle largeur et éclat.
      for (const f of flakes) {
        f.y += f.vy * dt
        f.angle += f.spin * dt
        f.flip += f.flipSpeed * dt
        if (f.y > h + 20) Object.assign(f, makeFlake(w, h, false))
        const x = f.x + Math.sin(t * f.swaySpeed + f.phase) * f.sway
        const face = Math.cos(f.flip)
        const shine = Math.pow(Math.abs(face), 6)
        ctx.save()
        ctx.translate(x, f.y)
        ctx.rotate(f.angle)
        ctx.scale(1, Math.max(Math.abs(face), 0.12))
        ctx.globalAlpha = f.layer.alpha * (0.45 + 0.55 * Math.abs(face))
        ctx.fillStyle = shine > 0.85 ? '#fffbea' : f.color
        ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h)
        ctx.restore()
        // Éclat : petite étoile quand une grande paillette fait face à la lumière.
        if (shine > 0.9 && f.layer === LAYERS[2]) {
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = (shine - 0.9) * 10 * 0.9
          const s = f.w * 1.6
          ctx.drawImage(sprite, x - s, f.y - s, s * 2, s * 2)
          ctx.globalCompositeOperation = 'source-over'
        }
      }
      ctx.globalAlpha = 1
    }

    // Mouvement réduit : une seule image fixe. Onglet caché : boucle en pause.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = performance.now()
    const render = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      draw(now / 1000, dt)
      raf = still || document.hidden ? 0 : requestAnimationFrame(render)
    }
    const onVisibility = () => {
      if (!document.hidden && !raf && !still) {
        last = performance.now()
        raf = requestAnimationFrame(render)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      observer.disconnect()
    }
  }, [])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
