import { OBJECTS_BY_ID } from '../objects'
import { useStore } from '../store'

/** The classifier's three best guesses as bars. Clicking a guess flies there and opens its card. */
export function GuessList() {
  const prediction = useStore((s) => s.prediction)
  const currentObjectId = useStore((s) => s.currentObjectId)
  const selectObject = useStore((s) => s.selectObject)
  if (!prediction) return null

  return (
    <ol data-testid="guess-list" className="flex flex-col gap-2">
      {prediction.top3.map((g, i) => {
        const pct = Math.round(g.prob * 100)
        const current = g.id === currentObjectId
        return (
          <li key={g.id}>
            <button
              type="button"
              data-testid={`guess-${g.id}`}
              onClick={() => selectObject(g.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400/60 ${
                current ? 'border-sky-300/50 bg-sky-400/10' : 'border-white/15'
              }`}
            >
              <span className="flex items-baseline justify-between text-sm text-slate-100">
                <span>
                  <span className="mr-2 text-slate-500">{i + 1}.</span>
                  {g.name}
                </span>
                <span className="tabular-nums text-slate-300">{pct}%</span>
              </span>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-sky-400/80" style={{ width: `${pct}%` }} />
              </span>
              <span className="mt-1 block text-[11px] text-slate-500">{OBJECTS_BY_ID[g.id]?.type}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** Panel view: "Top-3 guesses", reached from the card's button. */
export default function TopGuesses() {
  const currentObjectId = useStore((s) => s.currentObjectId)
  const setPanelView = useStore((s) => s.setPanelView)
  return (
    <div data-testid="top-guesses" className="flex flex-col gap-4">
      {currentObjectId && (
        <button type="button" onClick={() => setPanelView('card')} className="self-start text-xs text-slate-400 hover:text-white">
          ‹ Back to card
        </button>
      )}
      <h2 className="text-xl font-semibold text-white">Top-3 guesses</h2>
      <p className="text-sm text-slate-400">How sure the classifier is about your photo. Click a guess to fly there instead.</p>
      <GuessList />
    </div>
  )
}
