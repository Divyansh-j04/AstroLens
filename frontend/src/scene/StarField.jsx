import { useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { STAR_SPHERE_RADIUS, equatorialToScene } from './scale'
import { debug } from '../debug'

const STAR_FILE = '/data/hyg_stars.json'

// Colour index (B-V): hot stars are blue (low B-V), cool stars orange-red (high B-V).
const CI_STOPS = [
  [-0.4, new THREE.Color('#9bb0ff')],
  [0.0, new THREE.Color('#cad7ff')],
  [0.3, new THREE.Color('#f8f7ff')],
  [0.6, new THREE.Color('#fff4ea')],
  [1.0, new THREE.Color('#ffd2a1')],
  [1.5, new THREE.Color('#ffb56c')],
  [2.0, new THREE.Color('#ff8c50')],
]

function ciToColor(ci, out) {
  if (ci <= CI_STOPS[0][0]) return out.copy(CI_STOPS[0][1])
  for (let i = 1; i < CI_STOPS.length; i++) {
    const [c1, col1] = CI_STOPS[i]
    if (ci <= c1) {
      const [c0, col0] = CI_STOPS[i - 1]
      return out.copy(col0).lerp(col1, (ci - c0) / (c1 - c0))
    }
  }
  return out.copy(CI_STOPS[CI_STOPS.length - 1][1])
}

// Magnitude: smaller numbers are brighter. Sirius (-1.5) gets about 8 px, the faintest (6.5) 1.2 px.
const magToSize = (mag) => Math.max(1.2, (7 - mag) * 0.95)
const magToBrightness = (mag) => THREE.MathUtils.clamp(1.15 - mag / 7.5, 0.25, 1)

const vertexShader = /* glsl */ `
  attribute float size;
  attribute vec3 starColor;
  uniform float pixelRatio;
  varying vec3 vColor;
  void main() {
    vColor = starColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * pixelRatio;
  }
`

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.1, d)); // soft round dot
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

  const uniforms = useMemo(() => ({ pixelRatio: { value: pixelRatio } }), [pixelRatio])

  // The sphere moves with the camera, so stars behave like they are infinitely far away.
  useFrame(({ camera }) => ref.current.position.copy(camera.position))

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
