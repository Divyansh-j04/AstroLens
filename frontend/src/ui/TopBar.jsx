import { OBJECTS } from '../objects'
import { useStore } from '../store'

const GROUP_LABELS = { solar_system: 'Solar system', nebula: 'Nebulae', star_cluster: 'Star clusters' }

/** Title, the temporary "go to" dropdown (replaced by upload in Phase 3) and the Home button. */
export default function TopBar() {
  const currentObjectId = useStore((s) => s.currentObjectId)
  const selectObject = useStore((s) => s.selectObject)
  const goHome = useStore((s) => s.goHome)

  return (
    <header className="pointer-events-none absolute left-0 top-0 z-20 flex flex-wrap items-center gap-3 p-4">
      <h1 className="pointer-events-auto mr-2 text-base font-semibold tracking-[0.3em] text-slate-100">ASTROLENS</h1>
      <label className="pointer-events-auto flex items-center gap-2 text-xs text-slate-400">
        <span>Go to</span>
        <select
          data-testid="object-select"
          value={currentObjectId ?? ''}
          onChange={(e) => e.target.value && selectObject(e.target.value)}
          className="rounded-md border border-white/15 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 backdrop-blur focus:outline-none focus:ring-2 focus:ring-sky-400/60"
        >
          <option value="" disabled>
            Choose an object…
          </option>
          {Object.entries(GROUP_LABELS).map(([group, label]) => (
            <optgroup key={group} label={label}>
              {OBJECTS.filter((o) => o.group === group).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
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
  const solar = mode === 'solar_system'
  return (
    <p
      data-testid="scale-note"
      className="pointer-events-none absolute bottom-4 left-4 z-20 max-w-xs text-[11px] leading-snug text-slate-400"
    >
      <span className="font-semibold text-slate-200">{solar ? 'Solar system view' : 'Deep space view'}</span>
      {' · Not to scale. '}
      {solar
        ? 'Planet sizes and distances are compressed so everything fits on screen.'
        : 'Directions are real sky positions; distances use a square-root display scale.'}
    </p>
  )
}
