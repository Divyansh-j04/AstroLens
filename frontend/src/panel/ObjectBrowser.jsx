import { useEffect, useState } from 'react'
import classifier from '@data/classifier.json'
import { OBJECTS } from '../objects'
import { useStore } from '../store'

const GROUPS = [
  { id: 'solar_system', label: 'Solar System' },
  { id: 'nebula', label: 'Nebulae' },
  { id: 'star_cluster', label: 'Star clusters' },
]
const RECOGNISED = new Set(classifier.classes) // objects the photo classifier knows

/** Small camera icon: "recognised from photos" (drawn, so it shows on every device). */
function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-3.5 w-3.5 fill-none stroke-sky-300 align-[-2px]" strokeWidth="2" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}

/** Objects of one group, each followed by its components (e.g. the Moon under Earth). */
function tree(group) {
  const inGroup = OBJECTS.filter((o) => o.group === group)
  const ids = new Set(inGroup.map((o) => o.id))
  const out = []
  for (const o of inGroup.filter((x) => !x.parent || !ids.has(x.parent))) {
    out.push({ obj: o, depth: 0 })
    for (const child of inGroup.filter((x) => x.parent === o.id)) out.push({ obj: child, depth: 1 })
  }
  return out
}

/**
 * Right-side drawer listing every object by category, with components nested under their parent.
 * Clicking an object flies there and opens its card. The search bar stays for typed searches.
 */
export default function ObjectBrowser() {
  const open = useStore((s) => s.browserOpen)
  const setOpen = useStore((s) => s.setBrowserOpen)
  const currentObjectId = useStore((s) => s.currentObjectId)
  const selectObject = useStore((s) => s.selectObject)
  const cardShown = useStore((s) => s.panelOpen && (Boolean(s.currentObjectId) || s.panelView !== 'card'))
  const [collapsed, setCollapsed] = useState({}) // group id -> true when folded

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) {
    return (
      <button
        type="button"
        data-testid="browser-tab"
        onClick={() => setOpen(true)}
        className={`absolute top-24 z-40 rounded-l-lg border border-r-0 border-white/15 bg-slate-950/40 px-2 py-4 text-xs tracking-wider text-slate-200 backdrop-blur-[14px] [writing-mode:vertical-rl] hover:bg-slate-900/60 ${
          cardShown ? 'right-0 sm:right-[max(26%,340px)]' : 'right-0'
        }`}
      >
        Objects
      </button>
    )
  }

  return (
    <aside
      data-testid="object-browser"
      className="absolute right-0 top-0 z-40 flex h-full w-72 max-w-full flex-col border-l border-white/10 bg-slate-950/50 shadow-2xl backdrop-blur-[14px]"
    >
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-200">Objects</h2>
        <button
          type="button"
          aria-label="Close object list"
          onClick={() => setOpen(false)}
          className="rounded-md px-2 py-1 text-lg leading-none text-slate-400 hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
      </header>
      <p className="px-4 pb-3 text-[11px] text-slate-500">
        <CameraIcon /> = recognised from photos
      </p>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {GROUPS.map((g) => {
          const items = tree(g.id)
          const folded = collapsed[g.id]
          return (
            <section key={g.id} className="mb-2">
              <button
                type="button"
                data-testid={`browser-group-${g.id}`}
                aria-expanded={!folded}
                onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs uppercase tracking-wider text-slate-400 hover:bg-white/5 hover:text-slate-200"
              >
                <span>
                  {g.label} <span className="text-slate-600">({items.length})</span>
                </span>
                <span className={`transition-transform ${folded ? '-rotate-90' : ''}`}>▾</span>
              </button>
              {!folded && (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {items.map(({ obj, depth }) => {
                    const current = obj.id === currentObjectId
                    return (
                      <li key={obj.id}>
                        <button
                          type="button"
                          data-testid={`browser-item-${obj.id}`}
                          onClick={() => {
                            selectObject(obj.id)
                            setOpen(false)
                          }}
                          className={`flex w-full items-start gap-2 rounded-md py-1.5 pr-2 text-left hover:bg-white/10 ${
                            depth ? 'pl-8' : 'pl-3'
                          } ${current ? 'bg-sky-400/15 text-white' : 'text-slate-200'}`}
                        >
                          {depth > 0 && <span className="text-slate-600">└</span>}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">
                              {obj.name}
                              {RECOGNISED.has(obj.id) && (
                                <span className="ml-1.5" title="Recognised from photos">
                                  <CameraIcon />
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-[11px] text-slate-500">{obj.type}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </nav>
    </aside>
  )
}
