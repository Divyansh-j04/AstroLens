import { useEffect, useRef, useState } from 'react'
import { classifyImage, SLOW_AFTER_MS, UploadError } from '../api'
import { useStore } from '../store'

/**
 * Upload box (top left): drop a photo or click to choose one. Shows a thumbnail and a spinner
 * while the server classifies it, then a toggle that fades between the photo and the Grad-CAM
 * heatmap (which parts of the photo the model looked at).
 */
export default function UploadZone() {
  const upload = useStore((s) => s.upload)
  const prediction = useStore((s) => s.prediction)
  const setUpload = useStore((s) => s.setUpload)
  const applyPrediction = useStore((s) => s.applyPrediction)
  const [dragging, setDragging] = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const inputRef = useRef(null)
  const requestId = useRef(0) // only the latest upload may update the page

  useEffect(() => () => upload.previewUrl && URL.revokeObjectURL(upload.previewUrl), [upload.previewUrl])

  async function handleFile(file) {
    if (!file) return
    const id = ++requestId.current
    setShowHeatmap(false)
    setUpload({ status: 'loading', error: null, slow: false, previewUrl: URL.createObjectURL(file) })
    const slowTimer = setTimeout(() => id === requestId.current && setUpload({ slow: true }), SLOW_AFTER_MS)
    try {
      const result = await classifyImage(file)
      if (id !== requestId.current) return
      applyPrediction(result)
      setUpload({ status: 'done', slow: false })
    } catch (err) {
      if (id !== requestId.current) return
      const message = err instanceof UploadError ? err.message : 'Something went wrong while classifying that photo.'
      setUpload({ status: 'error', error: message, slow: false })
    } finally {
      clearTimeout(slowTimer)
    }
  }

  const loading = upload.status === 'loading'
  const heatmap = upload.status === 'done' && prediction ? `data:image/png;base64,${prediction.gradcam_png_base64}` : null

  return (
    <section
      data-testid="upload-zone"
      data-status={upload.status}
      className="pointer-events-auto absolute left-4 top-16 z-20 flex w-56 flex-col gap-2"
    >
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
        className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-dashed text-center text-xs backdrop-blur-[14px] transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400/60 ${
          dragging ? 'border-sky-300 bg-sky-400/20' : 'border-white/25 bg-slate-950/40 hover:bg-slate-900/60'
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
            {loading && (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-slate-100">
                <span data-testid="upload-spinner" className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-sky-300" />
                <span>{upload.slow ? 'Waking up the server… this can take up to a minute' : 'Classifying…'}</span>
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
      {upload.status === 'error' && (
        <p data-testid="upload-error" role="alert" className="rounded-lg border border-rose-300/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-100">
          {upload.error}
        </p>
      )}
    </section>
  )
}
