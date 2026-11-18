import { useEffect } from 'react'
import { OBJECTS_BY_ID } from '../objects'
import { useStore } from '../store'
import BriefCard from './BriefCard'
import ChatPanel from './ChatPanel'
import TopGuesses from './TopGuesses'
import UnknownCard from './UnknownCard'

/** See-through panel on the right (26% wide on desktop) with a blurred background. Collapsible. */
export default function GlassPanel() {
  const currentObjectId = useStore((s) => s.currentObjectId)
  const panelOpen = useStore((s) => s.panelOpen)
  const panelPending = useStore((s) => s.panelPending)
  const panelView = useStore((s) => s.panelView)
  const setPanelOpen = useStore((s) => s.setPanelOpen)
  const prediction = useStore((s) => s.prediction)
  const obj = currentObjectId ? OBJECTS_BY_ID[currentObjectId] : null

  // Safety net: if a card is still waiting 6 s after the camera stopped (no arrival title came), open it.
  const isFlying = useStore((s) => s.isFlying)
  useEffect(() => {
    if (!panelPending || isFlying) return undefined
    const timer = setTimeout(() => useStore.getState().revealPanel(), 6000)
    return () => clearTimeout(timer)
  }, [panelPending, isFlying])

  // Escape closes the panel (keyboard users; the "Show" tab brings it back). While the Objects
  // drawer is open, Escape is the drawer's (it closes and the panel comes back).
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !useStore.getState().browserOpen && setPanelOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPanelOpen])
  // The upload views ('unknown', 'guesses') and the chat can show without an object; the card needs one.
  const view =
    (['unknown', 'guesses'].includes(panelView) && prediction) || panelView === 'chat' ? panelView : obj ? panelView : null
  if (!view) return null
  const body = {
    card: () => <BriefCard obj={obj} />,
    chat: () => <ChatPanel obj={obj} />,
    guesses: () => <TopGuesses />,
    unknown: () => <UnknownCard />,
  }[view]

  return (
    <>
      <aside
        data-testid="glass-panel"
        data-open={panelOpen}
        // Phones: a sheet over the bottom 58% of the screen, so the object stays visible above it
        // (the scene shifts up to make room: scene/ViewShift.jsx). Larger screens: the right-hand panel.
        className={`absolute bottom-0 right-0 z-30 flex h-[58%] w-full flex-col rounded-t-2xl border-t border-white/10 bg-slate-950/60 shadow-2xl backdrop-blur-[14px] transition-transform duration-500 ease-out sm:top-0 sm:h-full sm:w-[26%] sm:min-w-[340px] sm:rounded-none sm:border-l sm:border-t-0 sm:bg-slate-950/30 ${
          panelOpen ? 'translate-x-0 translate-y-0' : 'translate-y-full sm:translate-x-full sm:translate-y-0'
        }`}
      >
        <div className="flex justify-end p-2">
          <button
            type="button"
            aria-label="Collapse panel"
            onClick={() => setPanelOpen(false)}
            className="rounded-md px-2 py-1 text-lg leading-none text-slate-400 hover:bg-white/10 hover:text-white"
          >
            ›
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {body()}
        </div>
      </aside>
      {!panelOpen && !panelPending && ( // no "Show card" tab while the card is on its way
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="absolute right-0 top-1/2 z-30 -translate-y-1/2 rounded-l-lg border border-r-0 border-white/15 bg-slate-950/40 px-2 py-4 text-xs tracking-wider text-slate-200 backdrop-blur-[14px] [writing-mode:vertical-rl] hover:bg-slate-900/60"
        >
          {{ unknown: 'Show result', chat: 'Show chat' }[view] ?? 'Show card'}
        </button>
      )}
    </>
  )
}
