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
  const panelView = useStore((s) => s.panelView)
  const setPanelOpen = useStore((s) => s.setPanelOpen)
  const prediction = useStore((s) => s.prediction)
  const obj = currentObjectId ? OBJECTS_BY_ID[currentObjectId] : null
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
        className={`absolute right-0 top-0 z-30 flex h-full w-full flex-col border-l border-white/10 bg-slate-950/30 shadow-2xl backdrop-blur-[14px] transition-transform duration-500 ease-out sm:w-[26%] sm:min-w-[340px] ${
          panelOpen ? 'translate-x-0' : 'translate-x-full'
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
      {!panelOpen && (
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
