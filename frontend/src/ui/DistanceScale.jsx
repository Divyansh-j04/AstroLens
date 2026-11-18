import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { OBJECTS_BY_ID } from '../objects'
import { AU_KM, AU_PER_LY, MAX_LOG_ZOOM, MIN_LOG_ZOOM, formatAU, trueOrbitAU, view } from '../scene/universe'

// Objects marked on the scale (ids only; names and distances come from objects.json).
const MARKED = ['moon', 'neptune', 'pleiades', 'hercules_cluster']

// One tick per unit, so the labels never crowd the object marks.
const TICKS = [
  { au: 1000 / AU_KM, label: '1,000 km' },
  { au: 1, label: '1 AU' },
  { au: AU_PER_LY, label: '1 light-year' },
]

/** Height on the gauge (0% bottom to 100% top) for a distance in AU, on a power-of-ten scale. */
const percent = (au) => ((Math.log10(au) - MIN_LOG_ZOOM) / (MAX_LOG_ZOOM - MIN_LOG_ZOOM)) * 100

/** How far each marked object is: a moon from its planet, a planet from the Sun, a nebula or cluster from us. */
const markDistanceAU = (obj) => (obj.scene_mode === 'deep_space' ? obj.distance_ly * AU_PER_LY : trueOrbitAU(obj))

/**
 * "True distances" only: a small glass card on the right with a power-of-ten gauge from 150 km to
 * 40,000 light-years. The filled part and the glowing knob show the distance from the camera to
 * what it looks at; they move as you zoom. Marks show how far the Moon, Neptune, the Pleiades and
 * M13 are, and clicking one flies there. (The readout bottom left is a different distance: from
 * the Sun.) In the normal view the scene is compressed, so a real-distance gauge would be wrong
 * and the card is hidden.
 */
export default function DistanceScale() {
  const trueScale = useStore((s) => s.trueScale)
  const panelOpen = useStore((s) => s.panelOpen)
  const isFlying = useStore((s) => s.isFlying)
  const selectObject = useStore((s) => s.selectObject)
  const knobRef = useRef(null)
  const fillRef = useRef(null)
  const valueRef = useRef(null)

  // Follow the zoom on every animation tick (it changes every frame while zooming or flying).
  useEffect(() => {
    if (!trueScale) return undefined
    const update = () => {
      const au = 10 ** view.logZoom
      const pct = `${Math.min(100, Math.max(0, percent(au)))}%` // dynamic values
      if (knobRef.current) knobRef.current.style.bottom = pct
      if (fillRef.current) fillRef.current.style.height = pct
      if (valueRef.current) valueRef.current.textContent = formatAU(au)
    }
    update()
    gsap.ticker.add(update)
    return () => gsap.ticker.remove(update)
  }, [trueScale])

  if (!trueScale) return null
  return (
    <nav
      data-testid="distance-scale"
      aria-label="Distance scale"
      className={`absolute top-1/2 z-20 hidden h-[min(56vh,440px)] w-52 -translate-y-1/2 flex-col rounded-2xl border border-white/10 bg-slate-950/55 px-4 pb-4 pt-3 shadow-2xl backdrop-blur-[14px] transition-[right] duration-500 ease-out sm:flex ${
        panelOpen ? 'right-[calc(max(26%,340px)+3.5rem)]' : 'right-14' // clear of the panel and the Objects / Show card tabs
      }`}
    >
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Distance to target</p>
      <p ref={valueRef} data-testid="distance-scale-value" className="text-sm font-medium tabular-nums text-sky-200" />

      <div className="relative mt-4 flex-1">
        {/* the gauge: an empty track, and the part filled up to the current distance */}
        <span className="absolute bottom-0 left-[7px] top-0 w-0.5 rounded-full bg-white/10" />
        <span ref={fillRef} className="absolute bottom-0 left-[7px] w-0.5 rounded-full bg-gradient-to-t from-sky-500/10 to-sky-300/80" />

        {TICKS.map((t) => (
          <span
            key={t.label}
            className="absolute left-[4px] flex translate-y-1/2 items-center gap-2 whitespace-nowrap text-[10px] italic text-slate-500"
            style={{ bottom: `${percent(t.au)}%` }}
          >
            <span className="h-px w-2 bg-white/25" />
            {t.label}
          </span>
        ))}

        {MARKED.map((id) => {
          const obj = OBJECTS_BY_ID[id]
          return (
            <button
              key={id}
              type="button"
              data-testid={`scale-mark-${id}`}
              disabled={isFlying}
              onClick={() => selectObject(id)}
              title={`Fly to ${obj.name} (${formatAU(markDistanceAU(obj))} away)`}
              className="group absolute left-0 flex translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-full pr-2 text-[11px] text-slate-200 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:cursor-default disabled:opacity-60"
              style={{ bottom: `${percent(markDistanceAU(obj))}%` }}
            >
              <span className="h-4 w-4 rounded-full border border-white/40 bg-slate-950 transition-colors group-hover:border-sky-300 group-hover:bg-sky-400/30" />
              {obj.name}
            </button>
          )
        })}

        {/* where the camera is now */}
        <span
          ref={knobRef}
          data-testid="distance-scale-marker"
          className="pointer-events-none absolute left-[2px] h-3 w-3 translate-y-1/2 rounded-full bg-sky-300 shadow-[0_0_12px_3px_rgba(125,211,252,0.7)]"
        />
      </div>
    </nav>
  )
}
