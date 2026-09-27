// Fond « verre cannelé » animé de l'intro, en WebGL, sans dépendance.
// Adapté de « Fluted Glass » (21st.dev Shader Builder), lui-même adapté de Paper Shaders
// (https://shaders.paper.design/fluted-glass, licence Apache-2.0). Réglé en or sur noir ;
// sans interaction au curseur. Rien n'est dessiné si WebGL est indisponible (fond noir).

import { useEffect, useRef } from 'react'

const VERT = `attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`

const FRAG = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec3 u_colors[8];
uniform vec4 u_scene;      // résolution.xy, temps, nombre de couleurs
uniform vec4 u_shape;      // échelle, intensité, cannelures, déformation
uniform vec4 u_finish;     // luminosité, vignette, grain, graine

#define u_resolution u_scene.xy
#define u_time u_scene.z
#define u_colorCount u_scene.w
#define u_scale u_shape.x
#define u_intensity u_shape.y
#define u_paramA u_shape.z
#define u_brightness u_finish.x
#define u_vignette u_finish.y
#define u_grain u_finish.z
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define u_seed u_finish.w
#else
#define u_seed mod(u_finish.w, 31.0)
#endif

float hash21(vec2 p) {
#ifndef GL_FRAGMENT_PRECISION_HIGH
  p = mod(p, 31.0);
#endif
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.2);
    a *= 0.5;
  }
  return v;
}

// Dégradé à travers les couleurs (WebGL1 : boucle à bornes constantes).
vec3 palette(float x) {
  float n = max(u_colorCount - 1.0, 1.0);
  float f = clamp(x, 0.0, 1.0) * n;
  vec3 col = u_colors[0];
  for (int i = 0; i < 7; i++) {
    if (float(i) < n)
      col = mix(col, u_colors[i + 1], smoothstep(0.0, 1.0, clamp(f - float(i), 0.0, 1.0)));
  }
  return col;
}

vec3 shade(vec2 p, float t) {
  float flutes = mix(42.0, 7.0, u_paramA);
  float cell = fract((p.x + 1.0) * flutes) - 0.5;
  float prism = sin(cell * 3.1415926) * (0.03 + u_intensity * 0.2);
  vec2 samplePoint = p + vec2(prism, sin(p.x * flutes + t * 0.2) * prism * 0.35);
  float field = fbm(samplePoint * 2.2 + vec2(t * 0.035, -t * 0.025) + u_seed);
  field += 0.24 * sin(samplePoint.y * 3.0 + samplePoint.x * 1.3);
  float highlight = pow(1.0 - abs(cell) * 2.0, mix(12.0, 2.0, u_intensity));
  float shadow = smoothstep(0.18, 0.5, abs(cell));
  vec3 glass = palette(clamp(field + highlight * 0.3, 0.0, 1.0));
  return glass * (0.72 + highlight * 0.42 - shadow * 0.12);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 col = shade(p * u_scale, u_time);
  col += u_brightness;
  if (u_vignette > 0.0001) {
    float vd = length(uv - 0.5) * 1.41421356;
    col *= 1.0 - u_vignette * smoothstep(0.35, 1.0, vd);
  }
  col += (grainHash(gl_FragCoord.xy + vec2(u_seed * 17.0, u_seed * 31.0)) - 0.5) * u_grain;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)

// Réglages : du noir à l'or pâle, assombri pour laisser le titre lisible.
const SETTINGS = {
  colors: ['#050403', '#3a2708', '#a07a2c', '#d9b25f', '#f3dfa2'].map(hex),
  scale: 1.26,
  intensity: 0.35,
  flutes: 0.28,
  brightness: -0.06,
  vignette: 0.55,
  grain: 0.042,
  seed: 1,
  timeScale: 0.575,
}

export default function FlutedGlass({ className }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const gl = canvas?.getContext('webgl', { antialias: false })
    if (!gl) return

    const compile = (type, src) => {
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const program = gl.createProgram()
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    gl.useProgram(program)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const S = SETTINGS
    const colors = [...S.colors]
    while (colors.length < 8) colors.push(colors[colors.length - 1])
    const u = (name) => gl.getUniformLocation(program, name)
    const uScene = u('u_scene')
    gl.uniform3fv(u('u_colors'), new Float32Array(colors.flat()))
    gl.uniform4f(u('u_shape'), S.scale, S.intensity, S.flutes, 0)
    gl.uniform4f(u('u_finish'), S.brightness, S.vignette, S.grain, S.seed)

    // Définition limitée à ~2 Mpx : le fond reste fluide sur les grands écrans.
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, canvas.clientWidth * dpr)
      const h = Math.max(1, canvas.clientHeight * dpr)
      const k = Math.min(1, Math.sqrt(2e6 / (w * h)))
      canvas.width = Math.round(w * k)
      canvas.height = Math.round(h * k)
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    // Mouvement réduit : une seule image fixe.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = performance.now()
    let raf = 0
    const render = (now) => {
      gl.uniform4f(uScene, canvas.width, canvas.height,
                   ((now - start) / 1000) * S.timeScale, S.colors.length)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (!still) raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      gl.deleteBuffer(buf)
      gl.deleteProgram(program)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
