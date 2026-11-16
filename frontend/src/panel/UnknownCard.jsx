import { useStore } from '../store'
import { GuessList } from './TopGuesses'

/** Shown when the best guess is below the confidence threshold. The camera stays where it is. */
export default function UnknownCard() {
  const prediction = useStore((s) => s.prediction)
  if (!prediction) return null
  const pct = Math.round(prediction.threshold * 100)

  return (
    <div data-testid="unknown-card" className="flex flex-col gap-4">
      <p className="text-[11px] uppercase tracking-[0.25em] text-amber-300/80">Not recognised</p>
      <h2 data-testid="unknown-message" className="text-2xl font-semibold text-white">
        This doesn&apos;t look like one of the {prediction.known_classes} objects I can recognise.
      </h2>
      <p className="text-sm leading-relaxed text-slate-300">
        My best guess is under {pct}% sure, so I won&apos;t fly anywhere. It may be a different object, or a photo that is
        too dark, blurry or zoomed in. These were the closest matches:
      </p>
      <GuessList />
    </div>
  )
}
