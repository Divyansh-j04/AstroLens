import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { OBJECTS_BY_ID } from '../objects'
import { reducedMotion } from '../motion'

const MAGNET = 0.25 // a [data-magnetic] button moves this fraction of the way towards the pointer

/** Custom cursor only with a mouse or trackpad (not on touch screens) and with "reduce motion" off. */
const wanted = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) && !reducedMotion()

/**
 * A ring that trails the pointer and a dot that sits on it. Over a button or link the ring grows; over
 * a planet, moon, nebula or cluster it grows more and shows "Fly to Mars". Buttons marked
 * data-magnetic pull gently towards the pointer and spring back when it leaves. Over a typing field
 * the ring hides and the normal text cursor shows. Turned off on touch screens and with "reduce
 * motion", where the normal system pointer is used.
 */
export default function CustomCursor() {
  const [enabled] = useState(wanted)
  const hoverId = useStore((s) => s.hoverId)
  const [kind, setKind] = useState('idle') // idle | link | text
  const [visible, setVisible] = useState(false)
  const wrapRef = useRef(null)
  const dotRef = useRef(null)

  useEffect(() => {
    if (!enabled) return undefined
    document.documentElement.classList.add('custom-cursor')
    const ringX = gsap.quickTo(wrapRef.current, 'x', { duration: 0.35, ease: 'power3.out' })
    const ringY = gsap.quickTo(wrapRef.current, 'y', { duration: 0.35, ease: 'power3.out' })
    const dotX = gsap.quickTo(dotRef.current, 'x', { duration: 0.06 })
    const dotY = gsap.quickTo(dotRef.current, 'y', { duration: 0.06 })
    let magnet = null // { el, cx, cy }: the magnetic button under the pointer and its resting centre

    const release = (el) => gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.45)' })
    const onMove = (e) => {
      setVisible(true)
      ringX(e.clientX)
      ringY(e.clientY)
      dotX(e.clientX)
      dotY(e.clientY)
      const t = e.target instanceof Element ? e.target : null
      setKind(t?.closest('input, textarea') ? 'text' : t?.closest('button, a, [role=switch], select, label') ? 'link' : 'idle')

      const el = t?.closest('[data-magnetic]') ?? null
      if (el !== magnet?.el) {
        if (magnet) release(magnet.el)
        if (el) {
          const r = el.getBoundingClientRect()
          const now = { x: Number(gsap.getProperty(el, 'x')) || 0, y: Number(gsap.getProperty(el, 'y')) || 0 }
          magnet = { el, cx: r.left + r.width / 2 - now.x, cy: r.top + r.height / 2 - now.y } // centre without any pull
        } else magnet = null
      }
      if (magnet) gsap.to(magnet.el, { x: (e.clientX - magnet.cx) * MAGNET, y: (e.clientY - magnet.cy) * MAGNET, duration: 0.3, ease: 'power2.out' })
    }
    const onLeave = () => {
      setVisible(false)
      if (magnet) release(magnet.el)
      magnet = null
    }
    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      document.documentElement.classList.remove('custom-cursor')
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [enabled])

  if (!enabled) return null
  const target = hoverId && kind === 'idle' ? OBJECTS_BY_ID[hoverId] : null
  const state = kind === 'text' ? 'text' : target ? 'object' : kind
  const ring = {
    idle: 'h-7 w-7 border-white/60',
    link: 'h-11 w-11 border-sky-300/80 bg-sky-300/10',
    object: 'h-16 w-16 border-sky-300 bg-sky-300/10',
    text: 'h-7 w-7 border-transparent',
  }[state]
  return (
    <div
      data-testid="custom-cursor"
      data-state={state}
      aria-hidden="true"
      className={`pointer-events-none fixed left-0 top-0 z-[60] transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <div ref={wrapRef} className="absolute left-0 top-0">
        <span
          className={`absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-[width,height,background-color,border-color] duration-200 ease-out ${ring}`}
        />
        {target && (
          <span
            data-testid="cursor-label"
            className="absolute left-10 top-0 -translate-y-1/2 whitespace-nowrap rounded-full border border-white/15 bg-slate-950/70 px-3 py-1 text-xs text-sky-100 backdrop-blur"
          >
            Fly to {target.name}
          </span>
        )}
      </div>
      <span
        ref={dotRef}
        className={`absolute left-0 top-0 -ml-[3px] -mt-[3px] h-1.5 w-1.5 rounded-full bg-white ${state === 'text' ? 'opacity-0' : ''}`}
      />
    </div>
  )
}
