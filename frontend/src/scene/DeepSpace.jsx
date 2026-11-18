import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useCursor, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { OBJECTS } from '../objects'
import { useStore } from '../store'
import { POSITIONS, SPRITE_SIZE, currentPosition, spriteSize } from './scale'
import { fade } from './fade'
import { glowTexture } from './glow'
import ObjectLabel from './ObjectLabel'
import { TRUE_AU, deepScale, toRender, view } from './universe'

const FAR_DRAWN = 9000 // beyond this many drawn units an object is not drawn (camera far plane), so no label
const SUN = [0, 0, 0]
const sunAt = new THREE.Vector3()
import StarCluster from './StarCluster'
import NebulaCloud from './NebulaCloud'
import { headOn, isCluster, isNebula, nearness, stepFocus } from './lod'

const DEEP = OBJECTS.filter((o) => o.scene_mode === 'deep_space')

/**
 * One nebula or cluster: its picture on a sprite (a flat image that always faces the camera)
 * at its real RA/Dec direction. Additive blending makes the black sky in the picture invisible.
 * Up close the picture fades to a faint halo and a 3D version takes over: a ball of stars for a
 * cluster (StarCluster), a particle cloud built from the photo for a nebula (NebulaCloud).
 */
function Marker({ obj, texture }) {
  const sprite = useRef()
  const tag = useRef()
  const material = useRef()
  const [hovered, setHovered] = useState(false)
  const selectObject = useStore((s) => s.selectObject)
  useCursor(hovered)
  const aspect = texture.image.width / texture.image.height

  const cluster = isCluster(obj)
  const nebula = isNebula(obj)
  const focus = useRef(0)
  useFrame(({ camera, size }, dt) => {
    // square-root layout, or (with "True distances" on) the real position relative to the focus
    if (view.active) toRender(TRUE_AU[obj.id], sprite.current.position)
    else sprite.current.position.set(...currentPosition(obj.id))
    tag.current.position.copy(sprite.current.position)
    view.hidden[obj.id] = view.active && camera.position.distanceTo(sprite.current.position) > FAR_DRAWN
    if (view.active) toRender(SUN, sunAt)
    else sunAt.set(0, 0, 0)
    focus.current = stepFocus(focus.current, useStore.getState().currentObjectId === obj.id, dt)
    const distance = camera.position.distanceTo(sprite.current.position)
    // true view: real size (at least a few dozen pixels); the photo/3D switch is measured in object sizes
    const k = view.active ? deepScale(obj, camera, size, distance) : 1
    const s = view.active ? SPRITE_SIZE * k : spriteSize(distance)
    sprite.current.scale.set(s * aspect, s, 1)
    sprite.current.visible = fade.deep > 0.01
    // How much of the photo stays up close: a faint halo for a cluster (more for the Pleiades, whose
    // blue reflection nebula is part of its look); for a nebula the full photo
    // when seen head-on (sharpest view), fading to a soft glow as the camera orbits away.
    const keep = cluster ? (obj.id === 'pleiades' ? 0.35 : 0.1) : nebula ? 0.25 + 0.75 * headOn(sprite.current.position, camera.position, sunAt) : 1
    material.current.opacity = fade.deep * (1 - (1 - keep) * nearness(distance / k) * focus.current)
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
        onPointerOver={() => {
          if (!active()) return
          setHovered(true)
          useStore.getState().setHoverId(obj.id) // the custom cursor shows "Fly to ..."
        }}
        onPointerOut={() => {
          setHovered(false)
          if (useStore.getState().hoverId === obj.id) useStore.getState().setHoverId(null)
        }}
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
      <group ref={tag} position={POSITIONS[obj.id]}>
        <ObjectLabel obj={obj} />
      </group>
    </>
  )
}

/** "You are here" tag at the Sun's position, shown only in deep-space mode. */
function HomeTag() {
  const mode = useStore((s) => s.mode)
  const group = useRef()
  useFrame(() => {
    if (view.active) toRender(SUN, group.current.position)
    else group.current.position.set(0, 0, 0)
  })
  return (
    <group ref={group}>
    <Html center zIndexRange={[10, 0]} className="pointer-events-none">
      <p
        className={`pointer-events-none whitespace-nowrap text-[11px] text-amber-200/90 transition-opacity duration-700 ${
          mode === 'deep_space' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        ● Solar System (you are here)
      </p>
    </Html>
    </group>
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
