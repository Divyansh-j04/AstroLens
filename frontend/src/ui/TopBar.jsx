import { useStore } from '../store'
import CommandBar from './CommandBar'

/** Title, the command bar (go to an object or ask a question) and the Home button. */
export default function TopBar() {
  const goHome = useStore((s) => s.goHome)
  const showLanding = useStore((s) => s.showLanding)

  return (
    <header className="pointer-events-none absolute left-0 top-0 z-20 flex flex-wrap items-center gap-3 p-4">
      <h1 className="pointer-events-auto mr-2 text-base font-semibold tracking-[0.3em] text-slate-100">
        <button type="button" data-testid="to-landing" onClick={showLanding} title="Back to the start page" className="hover:text-sky-200">
          ASTROLENS
        </button>
      </h1>
      <CommandBar />
      <button
        type="button"
        data-testid="home-button"
        onClick={goHome}
        className="pointer-events-auto rounded-md border border-white/15 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-100 backdrop-blur hover:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
      >
        Home
      </button>
    </header>
  )
}

/** Bottom-left note: which mode we are in, and that the scene is not to scale. */
export function ScaleNote() {
  const mode = useStore((s) => s.mode)
  const trueScale = useStore((s) => s.trueScale)
  const setTrueScale = useStore((s) => s.setTrueScale)
  const isFlying = useStore((s) => s.isFlying)
  const solar = mode === 'solar_system'
  return (
    <div data-testid="scale-note" className="pointer-events-none absolute bottom-4 left-4 z-20 flex max-w-xs flex-col gap-2">
      {!solar && (
        <button
          type="button"
          role="switch"
          aria-checked={trueScale}
          data-testid="true-scale-toggle"
          disabled={isFlying}
          onClick={() => setTrueScale(!trueScale)}
          className="pointer-events-auto flex items-center gap-2 self-start rounded-full border border-white/15 bg-slate-950/50 py-1 pl-1 pr-3 text-xs text-slate-200 backdrop-blur hover:bg-slate-900/70 disabled:opacity-50"
        >
          <span className={`relative block h-5 w-9 shrink-0 rounded-full transition-colors ${trueScale ? 'bg-sky-500/80' : 'bg-white/15'}`}>
            <span
              className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${trueScale ? 'translate-x-4' : 'translate-x-0.5'}`}
            />
          </span>
          True distances
        </button>
      )}
      <p className="text-[11px] leading-snug text-slate-400">
        <span className="font-semibold text-slate-200">{solar ? 'Solar system view' : 'Deep space view'}</span>
        {solar
          ? ' · Not to scale. Planet sizes and distances are compressed so everything fits on screen.'
          : trueScale
            ? ' · Directions and distances are real: 100 units = 1,000 light-years. Pictures are enlarged so far objects stay visible.'
            : ' · Not to scale. Directions are real sky positions; distances use a square-root display scale.'}
      </p>
    </div>
  )
}
