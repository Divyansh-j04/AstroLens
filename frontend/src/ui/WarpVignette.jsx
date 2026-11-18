import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { warp } from '../scene/warp'

/** Darkens the screen edges during warp (strength from scene/warp.js, read on every animation tick). */
export default function WarpVignette() {
  const ref = useRef(null)
  useEffect(() => {
    const update = () => {
      if (ref.current) ref.current.style.opacity = String(warp.value) // dynamic value: set directly
    }
    gsap.ticker.add(update)
    return () => gsap.ticker.remove(update)
  }, [])
  return (
    <div
      ref={ref}
      data-testid="warp-vignette"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.85)_100%)] opacity-0"
    />
  )
}
