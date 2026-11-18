import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { reducedMotion } from '../motion'
import CountUp from './CountUp'

/** Confidence from the classifier for this object; shows nothing if it was not among the top 3 guesses. */
function ConfidenceBadge({ objectId }) {
  const prediction = useStore((s) => s.prediction)
  const guess = prediction?.top3?.find((g) => g.id === objectId)
  if (!guess) return null
  const pct = Math.round(guess.prob * 100)
  // Bands from the plan: green above 80%, amber 55-80%, red below 55%.
  const band =
    pct > 80
      ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-200'
      : pct >= 55
        ? 'border-amber-300/40 bg-amber-400/15 text-amber-200'
        : 'border-rose-300/40 bg-rose-400/15 text-rose-200'
  return (
    <span data-testid="confidence-badge" className={`rounded-full border px-3 py-1 text-xs ${band}`}>
      {pct}% match
    </span>
  )
}

/** The short card for one object, built entirely from its objects.json entry. */
export default function BriefCard({ obj }) {
  const prediction = useStore((s) => s.prediction)
  const setPanelView = useStore((s) => s.setPanelView)
  const ref = useRef(null)

  // Each new object: the card's lines slide in one after another (GSAP stagger = the same animation
  // started on each element in turn, a fixed delay apart).
  useLayoutEffect(() => {
    if (reducedMotion() || !ref.current) return undefined
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '[data-reveal]',
        { opacity: 0, x: 18 },
        { opacity: 1, x: 0, duration: 0.45, ease: 'power2.out', stagger: 0.06, clearProps: 'opacity,transform' },
      )
    }, ref)
    return () => ctx.revert()
  }, [obj.id])

  return (
    <article ref={ref} data-testid="brief-card" className="flex flex-col gap-5">
      <header data-reveal>
        <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">
          {obj.constellation ? `In ${obj.constellation}` : 'Solar System'}
        </p>
        <h2 data-testid="card-name" className="mt-1 text-3xl font-semibold text-white">
          {obj.name}
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1 text-xs text-sky-100">
            {obj.type}
          </span>
          <ConfidenceBadge objectId={obj.id} />
        </div>
      </header>

      <dl className="grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10">
        {Object.entries(obj.facts).map(([label, value]) => (
          <div key={label} data-reveal className="bg-slate-950/50 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wider text-slate-400">{label}</dt>
            <dd data-testid="fact-value" className="text-sm text-slate-100">
              <CountUp key={`${obj.id}:${label}`} text={value} />
            </dd>
          </div>
        ))}
      </dl>

      <p data-reveal data-testid="card-summary" className="text-sm leading-relaxed text-slate-200">
        {obj.summary}
      </p>

      <div data-reveal className="flex gap-2">
        <button
          type="button"
          onClick={() => setPanelView('chat')}
          className="flex-1 rounded-lg bg-sky-500/80 px-3 py-2 text-sm font-medium text-white hover:bg-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300"
        >
          Chat more
        </button>
        <button
          type="button"
          data-testid="top3-button"
          onClick={() => setPanelView('guesses')}
          disabled={!prediction}
          title={prediction ? undefined : 'Available after a photo upload'}
          className="flex-1 rounded-lg border border-white/20 px-3 py-2 text-sm text-slate-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Top-3 guesses
        </button>
      </div>

      <footer className="text-xs text-slate-400">
        <p className="mb-1 uppercase tracking-wider">Sources</p>
        <ul className="flex flex-col gap-1">
          {obj.sources.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer" className="text-sky-300 hover:text-sky-200 hover:underline">
                {new URL(url).hostname.replace(/^www\./, '')}
                {new URL(url).pathname.replace(/\/$/, '')}
              </a>
            </li>
          ))}
        </ul>
      </footer>
    </article>
  )
}
