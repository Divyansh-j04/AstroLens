// The browser's or phone's "reduce motion" setting. When it is on, the page skips decorative
// animation: no warp streaks, the arrival title and card appear without letter-by-letter or
// counting effects. Read at the moment an animation would start, so changing the setting applies
// straight away.
export const reducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
