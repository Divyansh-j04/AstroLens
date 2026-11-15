import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useCursor, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { OBJECTS } from '../objects'
import { useStore } from '../store'
import { POSITIONS, displayRadius, orbitRadius } from './scale'
import { fade } from './fade'
import { glowTexture } from './glow'
import ObjectLabel from './ObjectLabel'

const BODIES = OBJECTS.filter((o) => o.scene_mode === 'solar_system')
// Display extras keyed by id. These are pictures, not facts, so they live with the scene code.
const RING_TEXTURES = { saturn: '/textures/saturn_ring.png' }
const SPIN_SPEED = 0.05 // radians per second, the same slow spin for every body

/** A flat ring textured from the inside edge to the outside edge (used for Saturn). */
function PlanetRing({ radius, texture, materialRef }) {
  const geometry = useMemo(() => {
    const inner = radius * 1.25
    const outer = radius * 2.3
    const g = new THREE.RingGeometry(inner, outer, 96, 1)
    const pos = g.attributes.position
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      g.attributes.uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5) // the texture is a radial strip
    }
    return g
  }, [radius])
  return (
    <mesh geometry={geometry} rotation-x={-Math.PI / 2}>
      {/* unlit: sunlight hits the flat ring edge-on, which would make a lit ring almost black */}
      <meshBasicMaterial ref={materialRef} map={texture} transparent side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

function Body({ obj, texture, ringTexture }) {
  const group = useRef()
  const spin = useRef()
  const materials = useRef({}) // sphere, glow and ring materials, by name
  const [hovered, setHovered] = useState(false)
  const selectObject = useStore((s) => s.selectObject)
  useCursor(hovered)

  const r = displayRadius(obj)
  const isSun = obj.orbit_au === 0
  const keep = (name) => (m) => {
    if (m) materials.current[name] = m
  }

  useFrame((_, dt) => {
    spin.current.rotation.y += dt * SPIN_SPEED
    group.current.visible = fade.solar > 0.01
    for (const m of Object.values(materials.current)) m.opacity = fade.solar
  })

  const active = () => fade.solar > 0.5 // ignore clicks while the planets are faded out
  return (
    <group ref={group} position={POSITIONS[obj.id]}>
      <mesh
        ref={spin}
        onClick={(e) => {
          if (!active()) return
          e.stopPropagation()
          selectObject(obj.id)
        }}
        onPointerOver={() => active() && setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[r, 64, 32]} />
        {isSun ? (
          <meshBasicMaterial ref={keep('sphere')} map={texture} transparent />
        ) : (
          <meshStandardMaterial ref={keep('sphere')} map={texture} transparent roughness={1} metalness={0} />
        )}
      </mesh>
      {isSun && (
        <sprite scale={[r * 5, r * 5, 1]}>
          <spriteMaterial
            ref={keep('glow')}
            map={glowTexture()}
            color="#ffaa44"
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      )}
      {ringTexture && <PlanetRing radius={r} texture={ringTexture} materialRef={keep('ring')} />}
      <ObjectLabel obj={obj} offsetY={-(r * (ringTexture ? 1.6 : 1) + 0.6)} />
    </group>
  )
}

function OrbitRing({ obj }) {
  const material = useRef()
  const radius = orbitRadius(obj)
  const center = obj.parent ? POSITIONS[obj.parent] : [0, 0, 0]
  const geometry = useMemo(() => {
    const points = Array.from({ length: 160 }, (_, i) => {
      const a = (i / 160) * Math.PI * 2
      return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)
    })
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [radius])
  useFrame(() => {
    material.current.opacity = 0.28 * fade.solar
  })
  return (
    <lineLoop geometry={geometry} position={center}>
      <lineBasicMaterial ref={material} color="#8fa3c7" transparent depthWrite={false} />
    </lineLoop>
  )
}

/** The Sun, 8 planets and the Moon, with thin orbit rings. Sizes and distances are compressed. */
export default function SolarSystem() {
  const textures = useTexture(Object.fromEntries(BODIES.map((o) => [o.id, `/textures/${o.id}.jpg`])))
  const rings = useTexture(RING_TEXTURES)
  return (
    <group>
      {BODIES.map((o) => (
        <Body key={o.id} obj={o} texture={textures[o.id]} ringTexture={rings[o.id]} />
      ))}
      {BODIES.filter((o) => o.orbit_au !== 0).map((o) => (
        <OrbitRing key={o.id} obj={o} />
      ))}
    </group>
  )
}
