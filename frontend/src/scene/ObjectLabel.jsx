import { Html } from '@react-three/drei'
import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { OBJECTS } from '../objects'
import { useStore } from '../store'
import { POSITIONS } from './scale'

// In crowded moon systems (Mars, Jupiter, Saturn, Uranus) moon names show only near the planet.
const MOON_COUNT = OBJECTS.reduce((n, o) => (o.parent ? { ...n, [o.parent]: (n[o.parent] ?? 0) + 1 } : n), {})
const NEAR_PLANET = 30 // scene units

/** Clickable name tag floating next to an object; hidden when its scene mode is not active. */
export default function ObjectLabel({ obj, offsetY = 0 }) {
  const mode = useStore((s) => s.mode)
  const currentObjectId = useStore((s) => s.currentObjectId)
  const selectObject = useStore((s) => s.selectObject)
  const entered = useStore((s) => s.entered) // no name tags over the landing page
  const crowded = obj.parent && MOON_COUNT[obj.parent] > 1
  const [near, setNear] = useState(!crowded)
  const nearRef = useRef(near)
  useFrame(({ camera }) => {
    if (!crowded) return
    const p = POSITIONS[obj.parent]
    const isNear = camera.position.distanceTo({ x: p[0], y: p[1], z: p[2] }) < NEAR_PLANET
    if (isNear !== nearRef.current) {
      nearRef.current = isNear
      setNear(isNear)
    }
  })
  const shown = entered && near && mode === obj.scene_mode && currentObjectId !== obj.id

  return (
    // The Html wrapper ignores the mouse; only the visible button takes clicks, so hidden tags never block the scene.
    <Html position={[0, offsetY, 0]} center zIndexRange={[10, 0]} className="pointer-events-none">
      <button
        type="button"
        tabIndex={shown ? 0 : -1}
        onClick={() => selectObject(obj.id)}
        className={`whitespace-nowrap rounded-full bg-black/40 px-2 py-0.5 text-[11px] tracking-wide text-slate-200 transition-opacity duration-700 hover:bg-black/70 hover:text-white ${
          shown ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {obj.name}
      </button>
    </Html>
  )
}
