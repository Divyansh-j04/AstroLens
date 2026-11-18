import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { OBJECTS_BY_ID, subtitleFor } from '../objects'
import { reducedMotion } from '../motion'

const HOLD_SECONDS = 1.8 // how long the full title stays before fading out

/**
 * On landing at an object: its name appears letter by letter in large type, then a line such as
 * "Gas giant · 5.2 AU from the Sun" (built from objects.json), then both fade away; as they fade, the
 * object's card slides in (the panel stays closed during the flight and the title).
 * Centred in the part of the screen the glass panel did not cover when the title appeared; it keeps
 * that place while the card slides in, so it never jumps sideways mid-fade. With "reduce motion" on, the
 * title simply appears and disappears.
 */
export default function ArrivalTitle() {
  const landed = useStore((s) => s.landed)
  const flyRequest = useStore((s) => s.flyRequest)
  const [besidePanel, setBesidePanel] = useState(false) // was the panel open when the title appeared?
  const [shownId, setShownId] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!landed.n || useStore.getState().journey.active) return // the Journey shows its own chapter title
    setBesidePanel(useStore.getState().panelOpen) // decided once; the card opening later does not move the title
    setShownId(landed.id)
  }, [landed])
  useEffect(() => setShownId(null), [flyRequest]) // a new flight clears the old title at once

  useLayoutEffect(() => {
    if (!shownId || !ref.current) return undefined
    const hide = () => setShownId(null)
    const reveal = () => useStore.getState().revealPanel() // the card slides in as the title goes
    if (reducedMotion()) {
      const timer = setTimeout(() => {
        reveal()
        hide()
      }, (HOLD_SECONDS + 1) * 1000)
      return () => clearTimeout(timer)
    }
    const ctx = gsap.context(() => {
      gsap
        .timeline({ onComplete: hide })
        .fromTo('[data-letter]', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.045 })
        .fromTo('[data-subtitle]', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, '-=0.2')
        .call(reveal, null, `+=${HOLD_SECONDS}`)
        .to(ref.current, { opacity: 0, y: -12, duration: 0.8, ease: 'power2.in' }, '<')
    }, ref)
    return () => ctx.revert()
  }, [shownId])

  const obj = shownId ? OBJECTS_BY_ID[shownId] : null
  if (!obj) return null
  return (
    <div
      className={`pointer-events-none absolute inset-y-0 left-0 right-0 z-20 flex items-start justify-center pt-[24vh] sm:pt-[16vh] ${
        besidePanel ? 'sm:right-[max(26%,340px)]' : ''
      }`}
    >
      <div ref={ref} data-testid="arrival-title" aria-hidden="true" className="px-4 text-center">
        <h2 className="font-display text-5xl font-medium tracking-[0.08em] text-white drop-shadow-[0_2px_18px_rgba(56,189,248,0.35)] sm:text-6xl">
          {[...obj.name].map((ch, i) => (
            <span key={i} data-letter className="inline-block whitespace-pre">
              {ch}
            </span>
          ))}
        </h2>
        <p data-subtitle data-testid="arrival-subtitle" className="mt-3 font-mono text-xs tracking-[0.2em] text-sky-100/80 uppercase">
          {subtitleFor(obj)}
        </p>
      </div>
    </div>
  )
}
