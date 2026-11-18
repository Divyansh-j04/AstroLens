// Small pieces of the Journey and landing look: letters that can be animated one by one, and the
// corner ticks of a "viewfinder" frame.

/** A word split into letters (each its own span), so they can be animated one by one. */
export function Letters({ text }) {
  return [...text].map((ch, i) => (
    <span key={i} data-ch className="inline-block whitespace-pre">
      {ch}
    </span>
  ))
}

/** Four small corner ticks around the parent (which must be `relative`): the "viewfinder" look. */
export function Corners({ className = 'border-white/70' }) {
  const base = `pointer-events-none absolute h-2 w-2 ${className}`
  return (
    <>
      <span aria-hidden="true" className={`${base} -left-1 -top-1 border-l border-t`} />
      <span aria-hidden="true" className={`${base} -right-1 -top-1 border-r border-t`} />
      <span aria-hidden="true" className={`${base} -bottom-1 -left-1 border-b border-l`} />
      <span aria-hidden="true" className={`${base} -bottom-1 -right-1 border-b border-r`} />
    </>
  )
}
