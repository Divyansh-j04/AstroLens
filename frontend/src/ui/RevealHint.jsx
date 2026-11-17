import { useEffect, useState } from 'react'
import { OBJECTS_BY_ID } from '../objects'
import { useStore } from '../store'

const SHOW_SECONDS = 6

/** "Drag to look around: it's 3D" note shown on arriving at a nebula or cluster. */
export default function RevealHint() {
  const arrived = useStore((s) => s.arrived)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!arrived) {
      setVisible(false)
      return undefined
    }
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), SHOW_SECONDS * 1000)
    const hide = () => setVisible(false)
    window.addEventListener('pointerdown', hide, { once: true })
    window.addEventListener('wheel', hide, { once: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', hide)
      window.removeEventListener('wheel', hide)
    }
  }, [arrived])

  const obj = arrived ? OBJECTS_BY_ID[arrived] : null
  return (
    <p
      data-testid="reveal-hint"
      data-visible={visible}
      className={`pointer-events-none absolute bottom-16 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/15 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 shadow-lg backdrop-blur-[14px] transition-opacity duration-700 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      ↻ Drag to look around {obj ? obj.name : 'it'}: it&apos;s 3D
    </p>
  )
}
