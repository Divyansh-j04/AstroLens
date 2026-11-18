import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { OBJECTS_BY_ID } from '../objects'
import { TOUR_STOPS, tourCaption } from '../tour'

const DWELL_SECONDS = 7 // time at each stop before flying on

/**
 * The Grand Tour's caption card (bottom centre). While flying it says where it is going; on arrival
 * it shows the stop number, the name and the first sentence of the summary from objects.json, with
 * a bar that fills while the stop lasts. Then it flies to the next stop; after the last one the card
 * of that object opens. "Next" skips ahead; "Stop tour" or Escape ends it, and so does any flight
 * the user asks for (a click on an object, the command bar, Home, a photo).
 */
export default function TourCaption() {
  const tour = useStore((s) => s.tour)
  const landed = useStore((s) => s.landed)
  const isFlying = useStore((s) => s.isFlying)
  const tourTo = useStore((s) => s.tourTo)
  const stopTour = useStore((s) => s.stopTour)
  const [arrivedStep, setArrivedStep] = useState(-1)
  const startN = useRef(0) // landed.n when the current stop's flight began
  const barRef = useRef(null)

  const last = TOUR_STOPS.length - 1
  const next = () => (tour.step < last ? tourTo(tour.step + 1) : stopTour(true))

  // A new stop: forget the old arrival and remember the landing counter.
  useEffect(() => {
    setArrivedStep(-1)
    startN.current = useStore.getState().landed.n
  }, [tour.step, tour.active])

  // Arrival at the current stop.
  useEffect(() => {
    if (tour.active && landed.n > startN.current && landed.id === TOUR_STOPS[tour.step]) setArrivedStep(tour.step)
  }, [landed, tour])

  // Stay a while, then fly on; the bar shows the time left.
  useEffect(() => {
    if (!tour.active || arrivedStep !== tour.step) return undefined
    const tween = gsap.fromTo(barRef.current, { scaleX: 0 }, { scaleX: 1, duration: DWELL_SECONDS, ease: 'none', onComplete: next })
    return () => tween.kill()
  }, [arrivedStep, tour]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape ends the tour.
  useEffect(() => {
    if (!tour.active) return undefined
    const onKey = (e) => e.key === 'Escape' && stopTour(true)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tour.active, stopTour])

  if (!tour.active) return null
  const obj = OBJECTS_BY_ID[TOUR_STOPS[tour.step]]
  const here = arrivedStep === tour.step && !isFlying
  return (
    <section
      data-testid="tour-caption"
      data-step={tour.step}
      data-arrived={here}
      aria-live="polite"
      className="absolute bottom-6 left-1/2 z-30 w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/15 bg-slate-950/60 shadow-2xl backdrop-blur-[14px]"
    >
      <div className="px-5 pb-4 pt-3">
        <p className="text-[10px] uppercase tracking-[0.25em] text-sky-300/80">
          Grand Tour · stop {tour.step + 1} of {TOUR_STOPS.length}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">{here ? obj.name : `Flying to ${obj.name}…`}</h2>
        {here && (
          <p data-testid="tour-text" className="mt-1 animate-fade-in text-sm leading-relaxed text-slate-200 motion-reduce:animate-none">
            {tourCaption(obj)}
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            data-testid="tour-stop"
            onClick={() => stopTour(true)}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
          >
            Stop tour
          </button>
          <button
            type="button"
            data-testid="tour-next"
            data-magnetic
            onClick={next}
            className="rounded-lg bg-sky-500/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            {tour.step < last ? 'Next stop' : 'Finish'}
          </button>
        </div>
      </div>
      {/* time left at this stop */}
      <span ref={barRef} className={`block h-0.5 origin-left bg-sky-300/80 ${here ? '' : 'scale-x-0'}`} />
    </section>
  )
}
