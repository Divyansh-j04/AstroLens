import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { OBJECTS_BY_ID, subtitleFor } from '../objects'
import { JOURNEY, JOURNEY_SHIFT, chapterCaption } from '../journey'
import { reducedMotion } from '../motion'
import { blurIn, scramble } from './textfx'
import { Corners, Letters } from './Decor'

const WHEEL_STEP = 60 // px of mouse-wheel scrolling that turns one chapter
const SWIPE_PX = 50 // a vertical swipe longer than this turns one chapter
const LOCK_MS = 700 // after a chapter change, input is ignored this long (one scroll = one chapter)
const PHONE = 640
const pad = (n) => String(n).padStart(2, '0')

/** Seven constellation points round the object, the same for a chapter every time (a seeded shuffle). */
function hudPoints(step, cx, cy, r) {
  let seed = (step + 1) * 7919
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  return Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2 + step * 0.9 + (rand() - 0.5) * 0.7
    const rr = r * (0.85 + rand() * 0.5)
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]
  })
}

/** Thin lines between the points, "+" markers on them and corner brackets round the object. */
function Hud({ step, width, height }) {
  const phone = width < PHONE
  // Where the object is drawn: the screen centre, moved as the picture is shifted (scene/ViewShift.jsx).
  const cx = phone ? width / 2 : width / 2 + JOURNEY_SHIFT.x * width
  const cy = phone ? height / 2 - JOURNEY_SHIFT.y * height : height / 2
  const r = Math.min(width, height) * 0.26
  const p = hudPoints(step, cx, cy, r)
  const lines = [...p.map((pt, i) => [pt, p[(i + 1) % p.length]]), [p[0], p[3]], [p[2], p[5]]]
  const b = r * 1.25 // half the size of the bracket frame
  const arm = 22
  const corners = [
    [cx - b, cy - b, 1, 1],
    [cx + b, cy - b, -1, 1],
    [cx - b, cy + b, 1, -1],
    [cx + b, cy + b, -1, -1],
  ]
  return (
    <svg data-testid="journey-hud" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {lines.map(([a, c], i) => (
        <path key={`l${i}`} data-draw d={`M${a[0]},${a[1]} L${c[0]},${c[1]}`} pathLength="1" strokeDasharray="1" className="fill-none stroke-white/35" strokeWidth="0.8" />
      ))}
      {p.map(([x, y], i) => (
        <path key={`m${i}`} data-mark d={`M${x - 6},${y} H${x + 6} M${x},${y - 6} V${y + 6}`} className="fill-none stroke-white/85" strokeWidth="1" />
      ))}
      {corners.map(([x, y, dx, dy], i) => (
        <path key={`c${i}`} data-draw d={`M${x},${y + dy * arm} V${y} H${x + dx * arm}`} pathLength="1" strokeDasharray="1" className="fill-none stroke-white/60" strokeWidth="1" />
      ))}
    </svg>
  )
}

/**
 * The Journey: a scroll-driven story through the scene, one object per chapter (journey.js). Scrolling
 * down (mouse wheel, swipe up, arrow keys, Space) flies to the next chapter, scrolling up goes back;
 * after the last chapter the Journey ends and that object's card opens. Escape or Exit ends it at once.
 * Each chapter, on arrival: a monospace line that "decodes" (number · type · distance), the name in
 * big letters coming into focus in random order, the first sentence of the summary, and constellation
 * lines drawn round the object. With "reduce motion" on, the text and lines simply appear.
 */
export default function Journey() {
  const journey = useStore((s) => s.journey)
  const landed = useStore((s) => s.landed)
  const isFlying = useStore((s) => s.isFlying)
  const journeyTo = useStore((s) => s.journeyTo)
  const stopJourney = useStore((s) => s.stopJourney)
  const [arrived, setArrived] = useState(-1)
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const startN = useRef(0)
  const lock = useRef(0)
  const textRef = useRef(null)
  const titleRef = useRef(null)
  const kickerRef = useRef(null)
  const hudRef = useRef(null)

  const step = journey.step
  const last = JOURNEY.length - 1
  const obj = OBJECTS_BY_ID[JOURNEY[step]]
  const here = arrived === step && !isFlying
  const phone = size.width < PHONE
  const kicker = `${pad(step + 1)} / ${pad(JOURNEY.length)} · ${subtitleFor(obj)}`.toUpperCase()

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // A new chapter: forget the old arrival and remember the landing counter.
  useEffect(() => {
    setArrived(-1)
    startN.current = useStore.getState().landed.n
  }, [step])
  useEffect(() => {
    if (landed.n > startN.current && landed.id === JOURNEY[step]) setArrived(step)
  }, [landed, step])

  // Scroll, swipe and keys: one gesture = one chapter, never while flying.
  useEffect(() => {
    const move = (dir) => {
      const s = useStore.getState()
      if (s.isFlying || performance.now() < lock.current) return
      const next = s.journey.step + dir
      if (next < 0) return
      lock.current = performance.now() + LOCK_MS
      if (next > last) s.stopJourney(true)
      else s.journeyTo(next)
    }
    let wheel = 0
    let wheelTimer = null
    const onWheel = (e) => {
      wheel += e.deltaY
      clearTimeout(wheelTimer)
      wheelTimer = setTimeout(() => (wheel = 0), 250)
      if (Math.abs(wheel) >= WHEEL_STEP) {
        move(Math.sign(wheel))
        wheel = 0
      }
    }
    let startY = null
    const onTouchStart = (e) => (startY = e.touches[0]?.clientY ?? null)
    const onTouchEnd = (e) => {
      if (startY === null) return
      const dy = startY - (e.changedTouches[0]?.clientY ?? startY) // positive: swiped up
      startY = null
      if (Math.abs(dy) > SWIPE_PX) move(Math.sign(dy))
    }
    const onKey = (e) => {
      if (['ArrowDown', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault()
        move(1)
      } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault()
        move(-1)
      } else if (e.key === 'Escape') useStore.getState().stopJourney(true)
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(wheelTimer)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('keydown', onKey)
    }
  }, [last])

  // Arrival: the text and the lines come in.
  useLayoutEffect(() => {
    if (!here) return undefined
    const tweens = [blurIn(titleRef.current, { delay: 0.15 }), scramble(kickerRef.current, kicker, { duration: 0.8 })]
    if (!reducedMotion()) {
      tweens.push(gsap.fromTo('[data-journey-fade]', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6, delay: 0.6, ease: 'power2.out', stagger: 0.15 }))
      if (hudRef.current) {
        tweens.push(gsap.fromTo(hudRef.current.querySelectorAll('[data-draw]'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.3, ease: 'power2.out', stagger: 0.04 }))
        tweens.push(gsap.fromTo(hudRef.current.querySelectorAll('[data-mark]'), { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.08, delay: 0.4 }))
      }
    }
    return () => tweens.forEach((t) => t?.kill())
  }, [here, step]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section data-testid="journey" data-step={step} data-arrived={here} aria-label="Journey" className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* top: name and Exit */}
      <header className="absolute inset-x-0 top-0 flex items-center justify-between p-5 sm:p-8">
        <p className="font-display text-sm font-medium tracking-[0.35em] text-white">
          ASTROLENS <span className="font-mono text-[10px] tracking-[0.3em] text-sky-300/80">· JOURNEY</span>
        </p>
        <button
          type="button"
          data-testid="journey-exit"
          data-magnetic
          onClick={() => stopJourney(true)}
          className="pointer-events-auto relative px-3 py-1.5 font-mono text-[11px] tracking-[0.25em] text-slate-100 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
        >
          <Corners className="border-white/60" />
          EXIT ✕
        </button>
      </header>

      {/* constellation lines round the object */}
      {here && (
        <div ref={hudRef}>
          <Hud step={step} width={size.width} height={size.height} />
        </div>
      )}

      {/* chapter ticks (right) */}
      <nav aria-label="Chapters" className="absolute right-4 top-1/2 flex -translate-y-1/2 flex-col items-end gap-3 sm:right-8">
        {JOURNEY.map((id, i) => (
          <button
            key={id}
            type="button"
            data-testid={`journey-tick-${i}`}
            aria-label={`Chapter ${i + 1}: ${OBJECTS_BY_ID[id].name}`}
            aria-current={i === step ? 'step' : undefined}
            disabled={isFlying}
            onClick={() => {
              lock.current = performance.now() + LOCK_MS
              journeyTo(i)
            }}
            className="pointer-events-auto flex items-center gap-2 py-1 font-mono text-[10px] text-slate-400 disabled:cursor-default"
          >
            {i === step && <span className="text-sky-200">{pad(i + 1)}</span>}
            <span className={`block h-px transition-all duration-500 ${i === step ? 'w-10 bg-sky-300' : 'w-5 bg-white/30'}`} />
          </button>
        ))}
      </nav>

      {/* the chapter text (bottom left) */}
      <div ref={textRef} className="absolute bottom-24 left-5 right-16 sm:bottom-[14vh] sm:left-[6vw] sm:right-auto sm:max-w-[36rem]">
        {here ? (
          <>
            <p ref={kickerRef} data-testid="journey-kicker" className="font-mono text-[10px] tracking-[0.22em] text-sky-200/90 sm:text-[11px]">
              {kicker}
            </p>
            <h2
              ref={titleRef}
              data-testid="journey-title"
              aria-label={obj.name}
              className="mt-3 font-display text-5xl font-bold uppercase leading-[0.92] tracking-tight text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.6)] sm:text-7xl"
            >
              <Letters text={obj.name} />
            </h2>
            <p data-journey-fade data-testid="journey-caption" className="mt-4 max-w-md font-mono text-[11px] uppercase leading-relaxed tracking-[0.08em] text-slate-300">
              <span className="mr-2 text-sky-300">+</span>
              {chapterCaption(obj)}
            </p>
          </>
        ) : (
          <p data-testid="journey-en-route" className="font-mono text-[11px] tracking-[0.3em] text-slate-300">
            {pad(step + 1)} / {pad(JOURNEY.length)} · EN ROUTE TO {obj.name.toUpperCase()}…
          </p>
        )}
      </div>

      {/* bottom: what to do next */}
      {here && (
        <p
          data-journey-fade
          data-testid="journey-hint"
          className="absolute inset-x-0 bottom-6 text-center font-mono text-[10px] tracking-[0.3em] text-slate-300"
        >
          <span className="animate-blink motion-reduce:animate-none">
            {step < last ? (phone ? 'SWIPE UP TO CONTINUE ↑' : 'SCROLL TO CONTINUE ↓') : phone ? 'SWIPE UP TO FINISH ↑' : 'SCROLL TO FINISH ↓'}
          </span>
        </p>
      )}
    </section>
  )
}
