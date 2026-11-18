import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useStore } from '../store'
import { reducedMotion } from '../motion'

const PILL_W = 168 // px, used to keep the pill on screen
const PILL_H = 44
const PANEL_W = 240
const MARGIN = 12
const DRAG_THRESHOLD = 5 // px of movement before a press counts as a drag, not a click
const POS_KEY = 'astrolens.uploadPill' // per-viewer convenience: where the pill was left

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)
const PHONE = 640 // px: below this width the top bar takes the full width
/** Just under the top bar (it is two rows tall on a phone). */
const belowTopBar = () => (document.querySelector('main > header')?.getBoundingClientRect().bottom ?? 60) + 8
const keepOnScreen = ({ x, y }) => ({
  x: clamp(x, MARGIN, window.innerWidth - PILL_W - MARGIN),
  y: clamp(y, window.innerWidth < PHONE ? belowTopBar() : MARGIN, window.innerHeight - PILL_H - MARGIN),
})

function loadPosition() {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY))
    if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return keepOnScreen(p)
  } catch {
    // storage blocked or empty: use the default spot
  }
  return null // nothing saved: placed under the top bar once it is on screen
}

function savePosition(p) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p))
  } catch {
    // storage blocked: the pill just returns to its default spot next time
  }
}

/**
 * Upload pill: a small button the user can drag anywhere. Clicking it opens a translucent panel
 * to drop or choose a photo; after classifying it shows the photo, a Grad-CAM toggle and a
 * "Remove photo" button. Dropping a file straight onto the pill uploads it too.
 *
 * Scanning effect: while the photo is classified, a line sweeps over it. When the answer arrives,
 * the heatmap fades in over the photo for a moment and fades out again (on its own layer, so the
 * "Show heatmap" toggle is unchanged), and the top 3 guesses slide up one after another.
 */
export default function UploadZone() {
  const upload = useStore((s) => s.upload)
  const prediction = useStore((s) => s.prediction)
  const clearUpload = useStore((s) => s.clearUpload)
  const selectGuess = useStore((s) => s.selectGuess)
  const uploadPhoto = useStore((s) => s.uploadPhoto)
  const open = useStore((s) => s.uploadPanelOpen)
  const setPanel = useStore((s) => s.setUploadPanelOpen)
  const setOpen = (v) => setPanel(typeof v === 'function' ? v(useStore.getState().uploadPanelOpen) : v)
  const [pos, setPos] = useState(() => loadPosition() ?? { x: 16, y: 72 })
  // After the first paint the top bar can be measured: start just under it (it is two rows tall on a phone).
  useLayoutEffect(() => setPos((p) => (loadPosition() ? keepOnScreen(p) : { x: 16, y: belowTopBar() })), [])
  const [dragging, setDragging] = useState(false) // a file is being dragged over
  const [showHeatmap, setShowHeatmap] = useState(false)
  const inputRef = useRef(null)
  const rootRef = useRef(null)
  const drag = useRef(null) // pointer drag of the pill itself
  const revealRef = useRef(null) // the heatmap layer that fades in and out once after a scan
  const guessesRef = useRef(null)

  // Keep the pill on screen when the window is resized.
  useEffect(() => {
    const onResize = () => setPos((p) => keepOnScreen(p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Escape or a click outside closes the panel.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && setPanel(false)
    const onDown = (e) => rootRef.current && !rootRef.current.contains(e.target) && setPanel(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open, setPanel])

  const handleFile = (file) => {
    setShowHeatmap(false)
    uploadPhoto(file)
  }

  const removePhoto = () => {
    setShowHeatmap(false)
    clearUpload()
  }

  // --- dragging the pill (mouse or touch) ---
  const onPointerDown = (e) => {
    if (e.button !== 0) return
    drag.current = { startX: e.clientX, startY: e.clientY, x0: pos.x, y0: pos.y, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    d.moved = true
    setPos(keepOnScreen({ x: d.x0 + dx, y: d.y0 + dy }))
  }
  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved) savePosition(pos)
    else setOpen((o) => !o) // a click, not a drag
  }

  const loading = upload.status === 'loading'
  const heatmap = upload.status === 'done' && prediction ? `data:image/png;base64,${prediction.gradcam_png_base64}` : null

  // A new answer: the heatmap flashes in and out once, and the guesses slide up one after another.
  useEffect(() => {
    if (!heatmap || !open || reducedMotion()) return undefined
    const tl = gsap.timeline()
    if (revealRef.current)
      tl.fromTo(revealRef.current, { opacity: 0 }, { opacity: 0.9, duration: 0.5, ease: 'power2.out' })
        .to(revealRef.current, { opacity: 0, duration: 0.7, ease: 'power2.in' }, '+=0.9')
    if (guessesRef.current)
      tl.fromTo(
        guessesRef.current.children,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', stagger: 0.09, clearProps: 'opacity,transform' },
        0.25,
      )
    return () => tl.kill()
  }, [heatmap]) // eslint-disable-line react-hooks/exhaustive-deps

  // Open the panel on the side with more room.
  const openLeft = pos.x + PILL_W / 2 > window.innerWidth / 2
  const openUp = pos.y + PILL_H / 2 > window.innerHeight / 2
  const panelX = clamp(openLeft ? pos.x + PILL_W - PANEL_W : pos.x, MARGIN, window.innerWidth - PANEL_W - MARGIN)

  return (
    <div ref={rootRef} data-testid="upload-zone" data-status={upload.status}>
      <button
        type="button"
        data-testid="upload-pill"
        aria-expanded={open}
        aria-label="Upload a sky photo (drag to move)"
        title="Click to upload a photo · drag to move"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFile(e.dataTransfer.files?.[0])
        }}
        className={`fixed z-30 flex h-11 w-[168px] cursor-grab touch-none select-none items-center gap-2 rounded-full border px-2 text-sm text-slate-100 shadow-lg backdrop-blur-[14px] transition-colors active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-sky-400/60 ${
          dragging ? 'border-sky-300 bg-sky-400/30' : 'border-white/20 bg-slate-950/50 hover:bg-slate-900/70'
        }`}
        style={{ left: pos.x, top: pos.y }}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-400/20">
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-sky-300" />
          ) : upload.previewUrl ? (
            <img src={upload.previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-sky-200" strokeWidth="2" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          )}
        </span>
        <span className="truncate">{loading ? 'Classifying…' : upload.previewUrl ? 'Your photo' : 'Upload photo'}</span>
      </button>

      <input
        ref={inputRef}
        data-testid="upload-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          e.target.value = '' // allow the same file to be chosen again
        }}
      />

      {open && (
        <section
          data-testid="upload-panel"
          className="fixed z-30 flex flex-col gap-2 rounded-2xl border border-white/15 bg-slate-950/40 p-3 shadow-2xl backdrop-blur-[14px]"
          style={{
            left: panelX,
            width: PANEL_W,
            ...(openUp ? { bottom: window.innerHeight - pos.y + 8 } : { top: pos.y + PILL_H + 8 }),
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Sky photo</span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="rounded px-1.5 text-base leading-none text-slate-400 hover:bg-white/10 hover:text-white"
            >
              ×
            </button>
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              handleFile(e.dataTransfer.files?.[0])
            }}
            disabled={loading}
            className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-dashed text-center text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400/60 ${
              dragging ? 'border-sky-300 bg-sky-400/20' : 'border-white/25 bg-slate-950/30 hover:bg-slate-900/50'
            }`}
          >
            {upload.previewUrl ? (
              <>
                <img src={upload.previewUrl} alt="Your photo" className="absolute inset-0 h-full w-full object-cover" />
                {heatmap && (
                  <img
                    data-testid="gradcam-image"
                    src={heatmap}
                    alt="Grad-CAM heatmap: bright areas mattered most to the classifier"
                    className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                      showHeatmap ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                )}
                {heatmap && <img ref={revealRef} data-testid="gradcam-reveal" src={heatmap} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-0" />}
                {loading && (
                  <span className="absolute inset-0 overflow-hidden bg-sky-950/40 text-slate-100">
                    {/* the scan: a soft band with a bright leading edge, sweeping down the photo */}
                    <span
                      data-testid="upload-scan"
                      className="absolute inset-x-0 h-1/4 animate-scan border-b border-sky-200/90 bg-gradient-to-b from-transparent to-sky-300/35 motion-reduce:top-1/2 motion-reduce:animate-none"
                    />
                    <span className="absolute inset-x-0 bottom-2 px-2 text-center text-[11px] tracking-wide">
                      {upload.slow ? 'Waking up the server… this can take up to a minute' : 'Scanning…'}
                    </span>
                  </span>
                )}
              </>
            ) : (
              <span className="px-4 text-slate-300">
                <span className="block text-2xl text-sky-200">＋</span>
                Drop a sky photo here
                <br />
                or click to choose one
              </span>
            )}
          </button>

          {heatmap && (
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <button
                type="button"
                data-testid="gradcam-toggle"
                onClick={() => setShowHeatmap((v) => !v)}
                className="rounded-md border border-white/15 bg-slate-950/50 px-2 py-1 text-slate-200 hover:bg-white/10"
              >
                {showHeatmap ? 'Show photo' : 'Show heatmap'}
              </button>
              <span data-testid="upload-latency">classified in {Math.round(prediction.latency_ms)} ms</span>
            </div>
          )}
          {heatmap && showHeatmap && (
            <p className="text-[11px] leading-snug text-slate-400">Bright areas are the parts of the photo that mattered most for the top guess.</p>
          )}
          {heatmap && (
            <ol ref={guessesRef} data-testid="upload-guesses" className="flex flex-col gap-1">
              {prediction.top3.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => selectGuess(g.id)}
                    className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-[11px] text-slate-200 hover:bg-white/10"
                  >
                    <span className="w-20 truncate">{g.name}</span>
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                      {/* width is a dynamic value */}
                      <span className="block h-full rounded-full bg-sky-400/80" style={{ width: `${Math.round(g.prob * 100)}%` }} />
                    </span>
                    <span className="w-8 text-right tabular-nums text-slate-400">{Math.round(g.prob * 100)}%</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          {upload.status === 'error' && (
            <p data-testid="upload-error" role="alert" className="rounded-lg border border-rose-300/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-100">
              {upload.error}
            </p>
          )}
          {upload.previewUrl && !loading && (
            <button
              type="button"
              data-testid="upload-remove"
              onClick={removePhoto}
              className="rounded-lg border border-rose-300/30 px-3 py-1.5 text-xs text-rose-100 hover:bg-rose-500/15"
            >
              Remove photo
            </button>
          )}
        </section>
      )}
    </div>
  )
}
