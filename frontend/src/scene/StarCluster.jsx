import { useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { POSITIONS, equatorialToScene } from './scale'
import { ciToColor } from './starColor'
import { fade } from './fade'
import { useStore } from '../store'
import { nearness as clusterNearness, stepFocus } from './lod'

/**
 * A star cluster as a real 3D ball of stars, shown when the camera is close (from far away the
 * cluster's photo is shown instead, see clusterNearness). The stars are generated, not catalogued:
 * open clusters are a loose Gaussian swarm, globular clusters follow a Plummer profile
 * (density ~ (1 + r²/a²)^-5/2), the standard simple model of a globular cluster.
 * A fixed seed per cluster gives the same shape on every visit. Sizes are illustrative.
 *
 * The cluster's REAL bright members are added from the HYG star catalogue the page already loads:
 * every catalogue star within MEMBER_RADIUS_DEG of the cluster's direction and at a similar distance
 * (objects.json's distance_ly, see MEMBER_DISTANCE), placed in its true sky pattern, so head-on the
 * Pleiades shows its real "little dipper" of Alcyone, Atlas, Electra, Maia, Merope, Taygeta... Their
 * depth is a small random spread (catalogue distances are too uncertain to show real depth).
 */

const STAR_FILE = '/data/hyg_stars.json'
const MEMBER_RADIUS_DEG = 1.0
const MEMBER_DISTANCE = [0.8, 1.15] // catalogue distance / distance_ly: excludes stars in front or behind
const UNITS_PER_DEG = 6 // how big one degree of sky is drawn around the cluster
const LY_PER_PARSEC = 3.2616

// Display style per cluster (colours and counts are looks, not facts; facts stay in objects.json).
const STYLE = {
  pleiades: { count: 380, spread: 4.6, bright: 7, dim: 0.6, palette: ['#9bb0ff', '#aabfff', '#cad7ff', '#e6ecff'] },
  beehive_cluster: { count: 380, spread: 3.6, bright: 5, palette: ['#fff4ea', '#f8f7ff', '#ffe2b8', '#ffd2a1'], giants: '#ffb56c' },
  hercules_cluster: { count: 22000, core: 0.9, extent: 9, palette: ['#ffe9c4', '#ffd9a0', '#fff2dc', '#ffcf8f'], giants: '#ff9c5a', blue: '#a9c1ff' },
  omega_centauri: { count: 30000, core: 1.2, extent: 11, palette: ['#ffe4b8', '#ffd59a', '#fff0d6', '#ffc985'], giants: '#ff9150', blue: '#a9c1ff' },
}
const DEFAULT_OPEN = { count: 350, spread: 3.4, bright: 5, palette: ['#f8f7ff', '#fff4ea', '#cad7ff'] }
const DEFAULT_GLOBULAR = { count: 20000, core: 1, extent: 9, palette: ['#ffe9c4', '#ffd9a0', '#fff2dc'], giants: '#ff9c5a', blue: '#a9c1ff' }

const isGlobular = (obj) => /globular/i.test(obj.type)

// Small seeded random generator (mulberry32), so each cluster always looks the same.
function rng(seedText) {
  let h = 1779033703 ^ seedText.length
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353)
  let a = (h << 13) | (h >>> 19)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const gauss = (rand) => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand())

function randomDirection(rand) {
  const z = 2 * rand() - 1
  const t = 2 * Math.PI * rand()
  const s = Math.sqrt(1 - z * z)
  return [s * Math.cos(t), s * Math.sin(t), z]
}

/** The cluster's real bright members from the HYG catalogue, as local positions, colours and sizes. */
function catalogueMembers(obj, hygText) {
  const pos = POSITIONS[obj.id]
  const d0 = new THREE.Vector3(...pos).normalize()
  const cosMax = Math.cos(THREE.MathUtils.degToRad(MEMBER_RADIUS_DEG))
  const radPerUnit = 180 / Math.PI
  const out = []
  const c = new THREE.Color()
  for (const [x, y, z, mag, ci] of JSON.parse(hygText).stars) {
    const v = new THREE.Vector3(...equatorialToScene(x, y, z))
    const ly = v.length() * LY_PER_PARSEC
    v.normalize()
    const cosAngle = v.dot(d0)
    if (cosAngle < cosMax) continue
    const ratio = ly / obj.distance_ly
    if (ratio < MEMBER_DISTANCE[0] || ratio > MEMBER_DISTANCE[1]) continue
    // gnomonic projection: the offset on the sky, perpendicular to the line of sight (radians)
    const offset = v.divideScalar(cosAngle).sub(d0).multiplyScalar(radPerUnit * UNITS_PER_DEG)
    ciToColor(ci, c)
    c.multiplyScalar(1.35) // the members are the stars you see by eye: make them stand out
    out.push({ position: offset.toArray(), color: [c.r, c.g, c.b], size: 8 + (6.5 - mag) * 4.2 })
  }
  return out
}

function buildCluster(obj, members) {
  const globular = isGlobular(obj)
  const style = STYLE[obj.id] ?? (globular ? DEFAULT_GLOBULAR : DEFAULT_OPEN)
  const rand = rng(obj.id)
  const n = style.count + members.length
  const positions = new Float32Array(n * 3)
  const colors = new Float32Array(n * 3)
  const sizes = new Float32Array(n)
  const c = new THREE.Color()

  // the real bright members first, with a small random depth
  members.forEach((m, i) => {
    const [x, y, z] = m.position
    const depth = gauss(rand) * 0.8
    const d0 = new THREE.Vector3(...POSITIONS[obj.id]).normalize().multiplyScalar(depth)
    positions.set([x + d0.x, y + d0.y, z + d0.z], i * 3)
    colors.set(m.color, i * 3)
    sizes[i] = m.size
  })
  for (let i = members.length; i < n; i++) {
    let r
    if (globular) {
      // Plummer radius from a uniform number, cut at the cluster's visible edge
      do r = style.core / Math.sqrt(Math.pow(rand() * 0.999 + 0.001, -2 / 3) - 1)
      while (r > style.extent)
    } else {
      r = Math.abs(gauss(rand)) * style.spread * (rand() < 0.08 ? 2.2 : 1) // a few outlying members
    }
    const [dx, dy, dz] = randomDirection(rand)
    positions.set([dx * r, dy * r, dz * r], i * 3)

    // Brightness: many faint stars, a few bright ones (a steep power law).
    const b = Math.pow(rand(), globular ? 9 : 5)
    let size = 1.1 + b * (globular ? 4.5 : 6)
    let colour = style.palette[Math.floor(rand() * style.palette.length)]
    if (globular && rand() < 0.012) {
      colour = style.giants // red giants: the brightest stars of an old cluster
      size += 2.5
    } else if (globular && rand() < 0.006) {
      colour = style.blue // blue horizontal-branch stars
      size += 1
    } else if (!globular && style.giants && rand() < 0.03) {
      colour = style.giants
      size += 1.5
    }
    // with no catalogue members, a few generated stars stand in for the ones you see by eye
    if (!globular && !members.length && i < style.bright) size = 7 + rand() * 2.5
    // globular cores hold thousands of stars that add up; dimmer faint stars keep the core from turning pure white
    c.set(colour).multiplyScalar(((globular ? 0.28 : 0.55) + (globular ? 0.6 : 0.45) * Math.min(1, size / 5)) * (members.length ? style.dim ?? 1 : 1))
    colors.set([c.r, c.g, c.b], i * 3)
    sizes[i] = size
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('starColor', new THREE.BufferAttribute(colors, 3))
  g.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  g.computeBoundingSphere()
  if (import.meta.env.DEV) (window.__clusterMembers ??= {})[obj.id] = members.length
  return g
}

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
  uniform float opacity;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vColor, exp(-d * d * 22.0) * opacity); // soft glow; big bright stars get a halo
  }
`

export default function StarCluster({ obj }) {
  const ref = useRef()
  const focus = useRef(0)
  const pixelRatio = useThree((s) => s.gl.getPixelRatio())
  const hygText = useLoader(THREE.FileLoader, STAR_FILE) // already loaded by StarField (cached)
  const geometry = useMemo(() => buildCluster(obj, catalogueMembers(obj, hygText)), [obj, hygText])
  const uniforms = useMemo(() => ({ pixelRatio: { value: pixelRatio }, opacity: { value: 0 } }), [pixelRatio])

  useFrame(({ camera }, dt) => {
    focus.current = stepFocus(focus.current, useStore.getState().currentObjectId === obj.id, dt)
    const near = clusterNearness(camera.position.distanceTo(ref.current.position)) * focus.current
    const opacity = fade.deep * near
    uniforms.opacity.value = opacity
    ref.current.visible = opacity > 0.01
  })

  return (
    <points ref={ref} position={POSITIONS[obj.id]} geometry={geometry}>
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
