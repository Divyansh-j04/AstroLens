import { useState } from 'react'
import { navigateText, UploadError } from '../api'
import { useStore } from '../store'

/**
 * Type where to go ("the red planet", "M42", "jupitr") or ask a question ("how hot is Venus?").
 * The server decides (POST /navigate): fly there, ask which of two objects was meant, or pass
 * the text to the chat. To browse all objects, use the Objects list on the right.
 */
export default function CommandBar() {
  const selectObject = useStore((s) => s.selectObject)
  const sendChat = useStore((s) => s.sendChat)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [options, setOptions] = useState(null) // two candidates when the text was ambiguous
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    const typed = text.trim()
    if (!typed || busy) return
    setBusy(true)
    setError(null)
    setOptions(null)
    try {
      const r = await navigateText(typed)
      if (r.intent === 'fly_to') {
        selectObject(r.object_id)
        setText('')
      } else if (r.intent === 'clarify') {
        setOptions(r.candidates)
      } else {
        if (r.object_id) selectObject(r.object_id) // "how hot is Venus?" -> fly to Venus and answer there
        sendChat(typed)
        setText('')
      }
    } catch (err) {
      setError(err instanceof UploadError ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pointer-events-auto relative">
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          data-testid="command-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder='Go to… or ask, e.g. "the red planet"'
          aria-label="Go to an object or ask a question"
          className="w-64 rounded-md border border-white/15 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/60 sm:w-80"
        />
        <button
          type="submit"
          data-testid="command-go"
          disabled={busy || !text.trim()}
          className="rounded-md border border-white/15 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-100 backdrop-blur hover:bg-slate-800/80 disabled:opacity-40"
        >
          {busy ? '…' : 'Go'}
        </button>
      </form>

      {options && (
        <div
          data-testid="clarify-options"
          className="absolute left-0 top-full z-40 mt-2 flex items-center gap-2 rounded-lg border border-white/15 bg-slate-950/80 px-3 py-2 text-xs text-slate-300 backdrop-blur"
        >
          <span>Did you mean</span>
          {options.map((c) => (
            <button
              key={c.id}
              type="button"
              data-testid={`clarify-${c.id}`}
              onClick={() => {
                selectObject(c.id)
                setOptions(null)
                setText('')
              }}
              className="rounded-md border border-sky-300/40 bg-sky-400/10 px-2 py-1 text-sky-100 hover:bg-sky-400/25"
            >
              {c.name}
            </button>
          ))}
          <button type="button" aria-label="Close" onClick={() => setOptions(null)} className="px-1 text-slate-500 hover:text-white">
            ×
          </button>
        </div>
      )}
      {error && (
        <p data-testid="command-error" role="alert" className="absolute left-0 top-full z-40 mt-2 w-80 rounded-lg border border-rose-300/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-100">
          {error}
        </p>
      )}
    </div>
  )
}
