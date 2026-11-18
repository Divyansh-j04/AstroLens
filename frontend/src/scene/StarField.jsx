import { useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { STAR_SPHERE_RADIUS, equatorialToScene } from './scale'
import { ciToColor } from './starColor'
import { warp } from './warp'
import { debug } from '../debug'

const STAR_FILE = '/data/hyg_stars.json'

// Magnitude: smaller numbers are brighter. Sirius (-1.5) gets about 8 px, the faintest (6.5) 1.2 px.
const magToSize = (mag) => Math.max(1.2, (7 - mag) * 0.95)
const magToBrightness = (mag) => THREE.MathUtils.clamp(1.15 - mag / 7.5, 0.25, 1)

// Warp (warp.js): each star is drawn as a streak pointing away from the screen centre, longer the
// farther the star is from the centre, as if flying forward fast. The point (a square on screen) is
// made vStretch times bigger and the streak is drawn inside it; at warp 0 it is the usual round dot.
const STREAK = 7.0 // at full warp, a star at the screen edge becomes about this many times longer

const vertexShader = /* glsl */ `
  attribute float size;
  attribute vec3 starColor;
  uniform float pixelRatio;
  uniform float warp;
  uniform float aspect;
  varying vec3 vColor;
  varying vec2 vDir;
  varying float vStretch;
  void main() {
    vColor = starColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec2 screen = vec2(gl_Position.x * aspect, gl_Position.y) / gl_Position.w; // from the centre, square units
    float r = length(screen);
    vDir = r > 0.001 ? screen / r : vec2(0.0, 1.0);
    vStretch = 1.0 + warp * ${STREAK.toFixed(1)} * min(r, 1.5);
    gl_PointSize = size * pixelRatio * vStretch;
  }
`

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying vec2 vDir;
  varying float vStretch;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    p.y = -p.y; // point coordinates run downwards; the direction runs upwards
    float hl = 0.5 - 0.5 / vStretch; // half the streak's length (0 without warp)
    float t = clamp(dot(p, vDir), -hl, hl);
    float d = length(p - vDir * t) * vStretch; // distance from the streak's centre line, in dot sizes
    float tail = hl > 0.0 ? 0.45 + 0.55 * (t + hl) / (2.0 * hl) : 1.0; // fainter towards the centre
    gl_FragColor = vec4(vColor * tail, smoothstep(0.5, 0.1, d)); // soft round dot, or a soft streak
  }
`

/** Naked-eye stars from the HYG catalogue, drawn on a far sphere that follows the camera. */
export default function StarField() {
  const text = useLoader(THREE.FileLoader, STAR_FILE)
  const pixelRatio = useThree((s) => s.gl.getPixelRatio())
  const ref = useRef()

  const geometry = useMemo(() => {
    const { stars } = JSON.parse(text)
    const positions = new Float32Array(stars.length * 3)
    const colors = new Float32Array(stars.length * 3)
    const sizes = new Float32Array(stars.length)
    const c = new THREE.Color()
    stars.forEach(([x, y, z, mag, ci], i) => {
      const [sx, sy, sz] = equatorialToScene(x, y, z)
      const k = STAR_SPHERE_RADIUS / Math.hypot(sx, sy, sz) // keep the direction, drop the distance
      positions.set([sx * k, sy * k, sz * k], i * 3)
      ciToColor(ci, c).multiplyScalar(magToBrightness(mag))
      colors.set([c.r, c.g, c.b], i * 3)
      sizes[i] = magToSize(mag)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('starColor', new THREE.BufferAttribute(colors, 3))
    g.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    debug.starCount = stars.length
    return g
  }, [text])

  const uniforms = useMemo(
    () => ({ pixelRatio: { value: pixelRatio }, warp: { value: 0 }, aspect: { value: 1 } }),
    [pixelRatio],
  )

  // The sphere moves with the camera, so stars behave like they are infinitely far away.
  useFrame(({ camera }) => {
    ref.current.position.copy(camera.position)
    uniforms.warp.value = warp.value
    uniforms.aspect.value = camera.aspect
  })

  return (
    <points ref={ref} geometry={geometry} frustumCulled={false} renderOrder={-1}>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
