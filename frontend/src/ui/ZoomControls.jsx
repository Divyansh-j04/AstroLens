import { useStore } from '../store'

const STEP = 3 // each press zooms by 3x

/** Zoom in / out buttons (bottom right). With "True distances" on, a dozen presses go from a planet
 * out to the nebulae; the distance readout is in the scale note (bottom left). */
export default function ZoomControls() {
  const zoomBy = useStore((s) => s.zoomBy)
  const isFlying = useStore((s) => s.isFlying)
  const panelOpen = useStore((s) => s.panelOpen)
  const button =
    'flex h-10 w-10 items-center justify-center text-xl leading-none text-slate-100 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400/60 disabled:opacity-40'
  return (
    <div
      data-testid="zoom-controls"
      // While the glass panel is open, sit just left of it (it would cover the buttons otherwise).
      className={`pointer-events-auto absolute bottom-4 z-20 flex flex-col overflow-hidden rounded-xl border border-white/15 bg-slate-950/50 backdrop-blur-[14px] transition-[right] duration-500 ease-out ${
        panelOpen ? 'right-4 sm:right-[calc(max(26%,340px)+1rem)]' : 'right-4'
      }`}
    >
      <button type="button" data-testid="zoom-in" aria-label="Zoom in" disabled={isFlying} onClick={() => zoomBy(1 / STEP)} className={button}>
        ＋
      </button>
      <span className="h-px bg-white/10" />
      <button type="button" data-testid="zoom-out" aria-label="Zoom out" disabled={isFlying} onClick={() => zoomBy(STEP)} className={button}>
        −
      </button>
    </div>
  )
}
