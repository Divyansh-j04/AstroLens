import { Html } from '@react-three/drei'
import { useStore } from '../store'

/** Clickable name tag floating next to an object; hidden when its scene mode is not active. */
export default function ObjectLabel({ obj, offsetY = 0 }) {
  const mode = useStore((s) => s.mode)
  const currentObjectId = useStore((s) => s.currentObjectId)
  const selectObject = useStore((s) => s.selectObject)
  const entered = useStore((s) => s.entered) // no name tags over the landing page
  const shown = entered && mode === obj.scene_mode && currentObjectId !== obj.id

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
