import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useCursor, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { OBJECTS } from '../objects'
import { useStore } from '../store'
import { POSITIONS, spriteSize } from './scale'
import { fade } from './fade'
import { glowTexture } from './glow'
import ObjectLabel from './ObjectLabel'
import StarCluster from './StarCluster'
import NebulaCloud from './NebulaCloud'
import { isCluster, isNebula, nearness, stepFocus } from './lod'

const DEEP = OBJECTS.filter((o) => o.scene_mode === 'deep_space')

/**
 * One nebula or cluster: its picture on a sprite (a flat image that always faces the camera)
 * at its real RA/Dec direction. Additive blending makes the black sky in the picture invisible.
 * Up close the picture fades to a faint halo and a 3D version takes over: a ball of stars for a
 * cluster (StarCluster), a particle cloud built from the photo for a nebula (NebulaCloud).
 */
function Marker({ obj, texture }) {
  const sprite = useRef()
  const material = useRef()
  const [hovered, setHovered] = useState(false)
  const selectObject = useStore((s) => s.selectObject)
  useCursor(hovered)
  const aspect = texture.image.width / texture.image.height

  const cluster = isCluster(obj)
  const nebula = isNebula(obj)
  const focus = useRef(0)
  useFrame(({ camera }, dt) => {
    focus.current = stepFocus(focus.current, useStore.getState().currentObjectId === obj.id, dt)
    const distance = camera.position.distanceTo(sprite.current.position)
    const s = spriteSize(distance)
    sprite.current.scale.set(s * aspect, s, 1)
    sprite.current.visible = fade.deep > 0.01
    const keep = cluster ? 0.1 : nebula ? 0.25 : 1 // how much of the photo stays up close, as a soft glow
    material.current.opacity = fade.deep * (1 - (1 - keep) * nearness(distance) * focus.current)
  })

  const active = () => fade.deep > 0.5
  return (
    <>
      <sprite
        ref={sprite}
        position={POSITIONS[obj.id]}
        onClick={(e) => {
          if (!active()) return
          e.stopPropagation()
          selectObject(obj.id)
        }}
        onPointerOver={() => active() && setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <spriteMaterial
          ref={material}
          map={texture}
          alphaMap={glowTexture()}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      {cluster && <StarCluster obj={obj} />}
      {nebula && <NebulaCloud obj={obj} texture={texture} />}
      <group position={POSITIONS[obj.id]}>
        <ObjectLabel obj={obj} />
      </group>
    </>
  )
}

/** "You are here" tag at the Sun's position, shown only in deep-space mode. */
function HomeTag() {
  const mode = useStore((s) => s.mode)
  return (
    <Html position={[0, 0, 0]} center zIndexRange={[10, 0]} className="pointer-events-none">
      <p
        className={`pointer-events-none whitespace-nowrap text-[11px] text-amber-200/90 transition-opacity duration-700 ${
          mode === 'deep_space' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        ● Solar System (you are here)
      </p>
    </Html>
  )
}

export default function DeepSpace() {
  const textures = useTexture(Object.fromEntries(DEEP.map((o) => [o.id, `/textures/${o.id}.jpg`])))
  return (
    <group>
      {DEEP.map((o) => (
        <Marker key={o.id} obj={o} texture={textures[o.id]} />
      ))}
      <HomeTag />
    </group>
  )
}
