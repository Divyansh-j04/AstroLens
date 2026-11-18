import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { reducedMotion } from '../motion'

// A number at the very start of a fact: "1,267 light-years", "5,777 K", "0.387 AU", "27.3 days".
// Facts that do not start with a number ("Apollo 11", "Orion") are shown as they are.
const LEADING_NUMBER = /^\d[\d,]*(?:\.\d+)?/

/** Shows a fact, counting its leading number up from 0 to its value (about 1 second). The text
 * around the number never changes, and the number always ends exactly as written in objects.json. */
export default function CountUp({ text, animate = true }) {
  const ref = useRef(null)
  const match = text.match(LEADING_NUMBER)
  const written = match?.[0]

  useLayoutEffect(() => {
    const el = ref.current
    if (!written || !el || !animate || reducedMotion()) return undefined
    const value = parseFloat(written.replace(/,/g, ''))
    const decimals = (written.split('.')[1] || '').length
    const withCommas = written.includes(',')
    const format = (v) =>
      withCommas
        ? v.toLocaleString('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : v.toFixed(decimals)
    const state = { v: 0 }
    el.textContent = format(0)
    const tween = gsap.to(state, {
      v: value,
      duration: 1.1,
      ease: 'power2.out',
      onUpdate: () => (el.textContent = format(state.v)),
      onComplete: () => (el.textContent = written),
    })
    return () => {
      tween.kill()
      el.textContent = written
    }
  }, [written, animate])

  if (!written) return text
  return (
    <>
      <span ref={ref} data-testid="count-up" className="tabular-nums">
        {written}
      </span>
      {text.slice(written.length)}
    </>
  )
}
