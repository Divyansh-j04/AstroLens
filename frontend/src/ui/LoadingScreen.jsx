import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import gsap from 'gsap'
import { reducedMotion } from '../motion'

const TITLE = 'ASTROLENS'

/**
 * Black screen until the star file and all textures have loaded. The title appears letter by
 * letter and a large counter runs from 0 to 100%, following the real loading progress. It stays
 * until the counter reaches 100% and the title is complete, so the opening plays even when
 * everything loads at once from the browser cache. With "reduce motion" on, it shows the real
 * percentage and the whole title straight away.
 */
export default function LoadingScreen() {
  const { active, progress } = useProgress()
  const loaded = !active && progress === 100
  const calm = useRef(reducedMotion()).current
  const [shown, setShown] = useState(0) // the percentage on screen
  const [titleDone, setTitleDone] = useState(calm)
  const counter = useRef({ v: 0 })
  const titleRef = useRef(null)
  const done = loaded && titleDone && (calm || shown === 100)

  // The counter runs towards the real progress (never backwards).
  useEffect(() => {
    if (calm) return undefined
    const tween = gsap.to(counter.current, {
      v: Math.max(counter.current.v, progress),
      duration: 0.9,
      ease: 'power1.out',
      onUpdate: () => setShown(Math.floor(counter.current.v)),
      onComplete: () => setShown(Math.round(counter.current.v)),
    })
    return () => tween.kill()
  }, [progress, calm])

  // The title, letter by letter.
  useEffect(() => {
    if (calm || !titleRef.current) return undefined
    const tween = gsap.fromTo(
      titleRef.current.children,
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', stagger: 0.08, onComplete: () => setTitleDone(true) },
    )
    return () => tween.kill()
  }, [calm])

  const pct = calm ? Math.round(progress) : shown
  return (
    <div
      data-testid="loading-screen"
      data-done={done}
      className={`absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black transition-opacity duration-700 ${
        done ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <p ref={titleRef} data-testid="loading-title" aria-label={TITLE} className="text-sm tracking-[0.5em] text-slate-200">
        {[...TITLE].map((ch, i) => (
          <span key={i} aria-hidden="true" className="inline-block">
            {ch}
          </span>
        ))}
      </p>
      <p data-testid="loading-percent" className="text-6xl font-extralight tabular-nums text-white">
        {pct}
        <span className="text-2xl text-slate-500">%</span>
      </p>
      <div className="h-px w-64 overflow-hidden bg-white/10">
        {/* width is a dynamic value, the one place an inline style is allowed */}
        <div className="h-full bg-sky-400" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-slate-500">Loading stars and textures…</p>
    </div>
  )
}
