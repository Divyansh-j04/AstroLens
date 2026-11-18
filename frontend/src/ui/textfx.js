import gsap from 'gsap'
import { reducedMotion } from '../motion'

const GLYPHS = '_/[]{}<>?!#*+=-' // characters shown while a text "decodes"

/**
 * Letters of `root` (rendered with <Letters>) come into focus in random order: each starts invisible
 * and blurred and sharpens. Returns the tween (kill it to stop), or null with "reduce motion" on.
 */
export function blurIn(root, { delay = 0, each = 0.045 } = {}) {
  if (!root || reducedMotion()) return null
  return gsap.fromTo(
    root.querySelectorAll('[data-ch]'),
    { opacity: 0, filter: 'blur(14px)' },
    { opacity: 1, filter: 'blur(0px)', duration: 0.8, ease: 'power2.out', delay, stagger: { each, from: 'random' }, clearProps: 'filter' },
  )
}

/**
 * `el`'s text "decodes" into `text`: from left to right, characters settle while the rest flicker
 * through symbols (spaces stay spaces). Returns the tween, or null with "reduce motion" on (the text
 * is then simply set).
 */
export function scramble(el, text, { duration = 0.9, delay = 0 } = {}) {
  if (!el) return null
  if (reducedMotion()) {
    el.textContent = text
    return null
  }
  const state = { p: 0 }
  const draw = () => {
    const fixed = Math.floor(state.p * text.length)
    let out = text.slice(0, fixed)
    for (let i = fixed; i < text.length; i++) out += text[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0]
    el.textContent = out
  }
  draw()
  return gsap.to(state, { p: 1, duration, delay, ease: 'none', onUpdate: draw, onComplete: () => (el.textContent = text) })
}
