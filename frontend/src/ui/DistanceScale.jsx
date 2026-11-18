import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { OBJECTS_BY_ID } from '../objects'
import { AU_KM, AU_PER_LY, MAX_LOG_ZOOM, MIN_LOG_ZOOM, formatAU, trueOrbitAU, view } from '../scene/universe'

// Objects you can jump to from the bar (ids only; names and distances come from objects.json).
const MARKED = ['moon', 'neptune', 'pleiades', 'hercules_cluster']

// Unit labels under the bar.
const TICKS = [
  { au: 1000 / AU_KM, label: 'km' },
  { au: 1, label: 'AU' },
  { au: AU_PER_LY, label: 'light-years' },
]

/** Position along the bar (0% left to 100% right) for a distance in AU, on a power-of-ten scale. */
const percent = (au) => ((Math.log10(au) - MIN_LOG_ZOOM) / (MAX_LOG_ZOOM - MIN_LOG_ZOOM)) * 100

/** How far each marked object is: a moon from its planet, a planet from the Sun, a nebula or cluster from us. */
const markDistanceAU = (obj) => (obj.scene_mode === 'deep_space' ? obj.distance_ly * AU_PER_LY : trueOrbitAU(obj))

/**
 * "True distances" only, in the bottom-left note under the camera readout: a thin power-of-ten bar
 * from 150 km to 40,000 light-years. The knob shows the zoom (how far the camera is from what it is
 * looking at) and slides as you zoom. Dots on the bar show how far the Moon, Neptune, the Pleiades
 * and M13 are; the chips under it fly there. It sits in the corner so it never covers the scene.
 */
export default function DistanceScale() {
  const isFlying = useStore((s) => s.isFlying)
  const selectObject = useStore((s) => s.selectObject)
  const knobRef = useRef(null)
  const fillRef = useRef(null)
  const valueRef = useRef(null)

  // Follow the zoom on every animation tick (it changes every frame while zooming or flying).
  useEffect(() => {
    const update = () => {
      const au = 10 ** view.logZoom
      const pct = `${Math.min(100, Math.max(0, percent(au)))}%` // dynamic values
      if (knobRef.current) knobRef.current.style.left = pct
      if (fillRef.current) fillRef.current.style.width = pct
      if (valueRef.current) valueRef.current.textContent = formatAU(au)
    }
    update()
    gsap.ticker.add(update)
    return () => gsap.ticker.remove(update)
  }, [])

  return (
    <nav data-testid="distance-scale" aria-label="Distance scale" className="pointer-events-auto w-72 max-w-full">
      <p className="text-[11px] text-slate-400">
        Zoom: <span ref={valueRef} data-testid="distance-scale-value" className="tabular-nums text-sky-200" /> to what you are looking at
      </p>

      {/* the bar: track, filled part, object dots and the knob */}
      <div className="relative mt-2 h-1 rounded-full bg-white/10">
        <span ref={fillRef} className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-500/10 to-sky-300/80" />
        {MARKED.map((id) => (
          <span
            key={id}
            className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60"
            style={{ left: `${percent(markDistanceAU(OBJECTS_BY_ID[id]))}%` }}
          />
        ))}
        <span
          ref={knobRef}
          data-testid="distance-scale-marker"
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-300 shadow-[0_0_10px_2px_rgba(125,211,252,0.7)]"
        />
      </div>
      <div className="relative mt-1 h-3">
        {TICKS.map((t) => (
          <span key={t.label} className="absolute -translate-x-1/2 text-[10px] italic text-slate-500" style={{ left: `${percent(t.au)}%` }}>
            {t.label}
          </span>
        ))}
      </div>

      {/* jump to an object */}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {MARKED.map((id) => {
          const obj = OBJECTS_BY_ID[id]
          return (
            <button
              key={id}
              type="button"
              data-testid={`scale-mark-${id}`}
              disabled={isFlying}
              onClick={() => selectObject(id)}
              title={`${formatAU(markDistanceAU(obj))} away`}
              className="rounded-full border border-white/15 bg-slate-950/50 px-2 py-0.5 text-[10px] text-slate-200 backdrop-blur hover:border-sky-300/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-50"
            >
              {obj.name}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
