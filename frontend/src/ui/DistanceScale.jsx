import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { OBJECTS_BY_ID } from '../objects'
import { AU_KM, AU_PER_LY, MAX_LOG_ZOOM, MIN_LOG_ZOOM, formatAU, trueOrbitAU, view } from '../scene/universe'

// Objects marked on the scale (ids only; names and distances come from objects.json).
const MARKED = ['moon', 'neptune', 'pleiades', 'hercules_cluster']

// Unit ticks, as distances in AU.
const TICKS = [
  { au: 1000 / AU_KM, label: '1,000 km' },
  { au: 1e6 / AU_KM, label: '1 million km' },
  { au: 1, label: '1 AU' },
  { au: 100, label: '100 AU' },
  { au: AU_PER_LY, label: '1 light-year' },
  { au: 1000 * AU_PER_LY, label: '1,000 light-years' },
]

/** Height on the bar (0% bottom to 100% top) for a distance in AU, on a power-of-ten scale. */
const percent = (au) => ((Math.log10(au) - MIN_LOG_ZOOM) / (MAX_LOG_ZOOM - MIN_LOG_ZOOM)) * 100

/** How far each marked object is: a moon from its planet, a planet from the Sun, a nebula or cluster from us. */
const markDistanceAU = (obj) => (obj.scene_mode === 'deep_space' ? obj.distance_ly * AU_PER_LY : trueOrbitAU(obj))

/**
 * "True distances" only: a thin power-of-ten ruler along the right edge, from 150 km to 40,000
 * light-years. The marker shows the current zoom (how far the camera is from what it looks at) and
 * moves as you zoom. Marks show how far the Moon, Neptune, the Pleiades and M13 are; clicking one
 * flies there. In the normal view the scene is compressed, so a real-distance ruler would be wrong
 * and the bar is hidden.
 */
export default function DistanceScale() {
  const trueScale = useStore((s) => s.trueScale)
  const panelOpen = useStore((s) => s.panelOpen)
  const isFlying = useStore((s) => s.isFlying)
  const selectObject = useStore((s) => s.selectObject)
  const markerRef = useRef(null)
  const valueRef = useRef(null)

  // Follow the zoom on every animation tick (it changes every frame while zooming or flying).
  useEffect(() => {
    if (!trueScale) return undefined
    const update = () => {
      const au = 10 ** view.logZoom
      if (markerRef.current) markerRef.current.style.bottom = `${percent(au)}%` // dynamic value
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
      className={`pointer-events-none absolute bottom-32 top-28 z-20 hidden w-44 flex-col transition-[right] duration-500 ease-out sm:flex ${
        panelOpen ? 'right-[calc(max(26%,340px)+3.5rem)]' : 'right-14' // clear of the Objects / Show card tabs
      }`}
    >
      <p className="mb-2 text-right text-[10px] uppercase tracking-[0.2em] text-slate-400">
        Zoom · <span ref={valueRef} data-testid="distance-scale-value" className="normal-case tracking-normal text-sky-200" />
      </p>
      <div className="relative flex-1">
        {/* the line */}
        <span className="absolute bottom-0 right-20 top-0 w-px bg-gradient-to-t from-white/10 via-white/30 to-white/10" />

        {TICKS.map((t) => (
          <span
            key={t.label}
            className="absolute right-0 flex w-20 translate-y-1/2 items-center gap-1 whitespace-nowrap text-[10px] text-slate-500"
            style={{ bottom: `${percent(t.au)}%` }}
          >
            <span className="h-px w-2 bg-white/30" />
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
              className="group pointer-events-auto absolute right-[4.75rem] flex translate-y-1/2 whitespace-nowrap items-center gap-2 rounded-full py-0.5 pl-2 pr-0 text-[11px] text-slate-300 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:cursor-default disabled:opacity-60"
              style={{ bottom: `${percent(markDistanceAU(obj))}%` }}
            >
              {obj.name}
              <span className="h-2 w-2 rounded-full border border-white/50 bg-slate-900 group-hover:bg-sky-300" />
            </button>
          )
        })}

        {/* where we are now */}
        <span
          ref={markerRef}
          data-testid="distance-scale-marker"
          className="absolute right-[4.375rem] h-0.5 w-5 translate-y-1/2 rounded-full bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.9)]"
        />
      </div>
    </nav>
  )
}
