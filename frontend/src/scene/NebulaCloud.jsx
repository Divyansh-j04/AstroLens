import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { DEEP_VIEW_DISTANCE, POSITIONS, SPRITE_SIZE } from './scale'
import { fade } from './fade'
import { useStore } from '../store'
import { nearness, stepFocus } from './lod'

/**
 * A nebula as a 3D cloud of glowing particles, built from its own photo and shown when the camera
 * is close (from far away the photo itself is shown).
 *
 * The photo is read at about SAMPLE pixels across; every pixel brighter than THRESHOLD becomes a
 * particle of that pixel's colour. Each particle gets a depth: a random spread that is thicker in
 * the middle of the nebula and thinner at its edges, with brighter gas pulled slightly towards the
 * viewer. The depth is ILLUSTRATIVE: the real 3D shape of most nebulae is not known.
 * The cloud faces Earth, and each particle is shifted sideways to undo perspective, so from the
 * fly-to viewpoint every particle lands exactly on its pixel and the cloud looks like the photo;
 * orbiting around it shows the depth. Only the selected nebula turns 3D (see stepFocus). A fixed seed per nebula gives the same cloud on every visit.
 */

const SAMPLE = 170 // pixels across the longer side of the photo
const THRESHOLD = 0.07 // darker pixels are empty space and get no particle
const THICKNESS = 4.5 // scene units: how deep the cloud is in the middle
const PARTICLE_SIZE = 3.4 // particle size relative to one sampled pixel (overlap keeps the gas smooth)

function rng(seedText) {
  let a = 2166136261
  for (let i = 0; i < seedText.length; i++) a = Math.imul(a ^ seedText.charCodeAt(i), 16777619)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const gauss = (rand) => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand())

function buildCloud(obj, image) {
  const aspect = image.width / image.height
  const w = aspect >= 1 ? SAMPLE : Math.round(SAMPLE * aspect)
  const h = aspect >= 1 ? Math.round(SAMPLE / aspect) : SAMPLE
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0, w, h)
  const px = ctx.getImageData(0, 0, w, h).data

  const worldH = SPRITE_SIZE // the same size as the photo sprite up close
  const worldW = SPRITE_SIZE * aspect
  const cell = worldH / h
  const rand = rng(obj.id)
  const positions = []
  const colors = []
  const sizes = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const r = px[i] / 255
      const g = px[i + 1] / 255
      const b = px[i + 2] / 255
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      if (lum < THRESHOLD) continue
      // The photo's soft round edge (the same glow mask as the sprite) also thins the cloud's edge.
      const nx = (x + 0.5) / w - 0.5
      const ny = (y + 0.5) / h - 0.5
      const edge = Math.hypot(nx * 2, ny * 2) // 0 in the middle, 1 at the edge
      if (edge > 1) continue
      const thickness = THICKNESS * (0.25 + 0.75 * (1 - edge * edge))
      const z = gauss(rand) * thickness * 0.5 + (lum - 0.3) * thickness * 0.6
      // undo perspective for the fly-to viewpoint, DEEP_VIEW_DISTANCE in front (+z faces the viewer)
      const k0 = (DEEP_VIEW_DISTANCE - z) / DEEP_VIEW_DISTANCE
      positions.push(nx * worldW * k0, -ny * worldH * k0, z)
      const fadeEdge = 1 - THREE.MathUtils.smoothstep(edge, 0.7, 1)
      const k = 0.3 * fadeEdge // faint particles that overlap blend into smooth gas
      colors.push(r * k, g * k, b * k)
      sizes.push(cell * PARTICLE_SIZE * (0.8 + 0.5 * Math.min(1, lum * 2)))
    }
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setAttribute('gasColor', new THREE.Float32BufferAttribute(colors, 3))
  geom.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1))
  geom.computeBoundingSphere()
  return geom
}

// Particle size is in scene units, so the cloud stays continuous however close the camera flies.
const vertexShader = /* glsl */ `
  attribute float size;
  attribute vec3 gasColor;
  uniform float projScale;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Seen edge-on, the line of sight crosses the whole cloud and the light piles up to white;
    // particles dim as the view turns edge-on (full brightness head-on, as in the photo).
    vec3 facingAxis = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));
    float facing = abs(dot(facingAxis, normalize(-mv.xyz)));
    vColor = gasColor * mix(0.3, 1.0, facing);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, size * projScale / -mv.z);
  }
`

const fragmentShader = /* glsl */ `
  uniform float opacity;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.0, d) * opacity);
  }
`

export default function NebulaCloud({ obj, texture }) {
  const ref = useRef()
  const focus = useRef(0)
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera)
  const pixelRatio = useThree((s) => s.gl.getPixelRatio())
  const geometry = useMemo(() => buildCloud(obj, texture.image), [obj, texture])
  const uniforms = useMemo(() => ({ projScale: { value: 1 }, opacity: { value: 0 } }), [])
  const position = POSITIONS[obj.id]
  // Face Earth (the Sun, at the origin) so the fly-to view matches the photo.
  const quaternion = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.set(...position)
    o.lookAt(0, 0, 0)
    return o.quaternion.clone()
  }, [position])

  useFrame((_, dt) => {
    focus.current = stepFocus(focus.current, useStore.getState().currentObjectId === obj.id, dt)
    const near = nearness(camera.position.distanceTo(ref.current.position)) * focus.current
    const opacity = fade.deep * near
    uniforms.opacity.value = opacity
    // screen pixels per scene unit at distance 1 (point sizes are in device pixels)
    uniforms.projScale.value = (pixelRatio * size.height) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
    ref.current.visible = opacity > 0.01
  })

  return (
    <points ref={ref} position={position} quaternion={quaternion} geometry={geometry}>
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
