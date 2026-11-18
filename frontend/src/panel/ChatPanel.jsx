import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { OBJECTS_BY_ID } from '../objects'
import { GENERAL_CHAT, useStore } from '../store'
import { reducedMotion } from '../motion'

const SECONDS_PER_PIECE = 0.035 // typing speed: a word and its space take about 0.07 s
const MAX_TYPING_SECONDS = 5 // long answers type faster, never longer than this
const typedAlready = new WeakSet() // answers already typed out once (reopening the chat never retypes them)

const cleanAnswer = (text) => text.replace(/\*\*(.+?)\*\*/g, '$1') // the model sometimes writes **bold**
const answerPieces = (text) => cleanAnswer(text).split(/(\[\d+\]|\s+)/g).filter(Boolean) // words, spaces, [n]

// Starter questions when the chat is opened without an object (each object's first suggested question).
const STARTER_OBJECTS = ['mars', 'saturn', 'eagle_nebula', 'crab_nebula']

/**
 * "[2]" in an answer becomes a small link to source 2; plain text is kept as it is.
 * `shown` limits how many pieces are visible (the typing effect); each citation pops in as it appears.
 */
function AnswerText({ text, citations, shown = Infinity, hidden = false }) {
  const byNumber = Object.fromEntries((citations ?? []).map((c) => [c.n, c]))
  return (
    <p aria-hidden={hidden || undefined} className="whitespace-pre-line text-sm leading-relaxed text-slate-100">
      {answerPieces(text).slice(0, shown).map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/)
        const c = m && byNumber[Number(m[1])]
        if (!c) return <span key={i}>{part}</span>
        return (
          <a
            key={i}
            href={c.url}
            target="_blank"
            rel="noreferrer"
            title={`${c.title} - ${c.section}`}
            className="mx-0.5 inline-block animate-pop rounded bg-sky-400/20 px-1 align-super text-[10px] text-sky-200 hover:bg-sky-400/40 motion-reduce:animate-none"
          >
            {c.n}
          </a>
        )
      })}
    </p>
  )
}

/** Numbered sources under an answer: the ones the answer cites. */
function SourceList({ citations }) {
  const cited = citations.filter((c) => c.cited)
  if (!cited.length) return null
  return (
    <ol data-testid="chat-sources" className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2">
      {cited.map((c) => (
        <li key={c.n} className="text-[11px] leading-snug text-slate-400">
          <span className="mr-1 text-sky-300">[{c.n}]</span>
          <a href={c.url} target="_blank" rel="noreferrer" className="text-sky-300 hover:text-sky-200 hover:underline">
            {c.title}
          </a>
          {' · '}
          {c.section}
          <span className="text-slate-500"> ({new URL(c.url).hostname.replace(/^www\./, '')})</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * One message. A new answer types itself out piece by piece (data-typing="true" meanwhile), its
 * citation numbers pop in, and its sources appear once it has finished. Screen readers get the
 * whole answer at once. Error messages and "reduce motion" show the text straight away.
 */
function Message({ msg, onGrow }) {
  const total = msg.role === 'assistant' ? answerPieces(msg.content).length : 0
  const instant = msg.role !== 'assistant' || msg.error || typedAlready.has(msg) || reducedMotion()
  const [shown, setShown] = useState(instant ? total : 0)
  const typing = shown < total

  useEffect(() => {
    if (!typing) {
      typedAlready.add(msg)
      return undefined
    }
    const state = { k: shown }
    const tween = gsap.to(state, {
      k: total,
      duration: Math.min(MAX_TYPING_SECONDS, total * SECONDS_PER_PIECE),
      ease: 'none',
      onUpdate: () => {
        setShown(Math.floor(state.k))
        onGrow()
      },
      onComplete: () => setShown(total),
    })
    return () => {
      tween.kill()
      typedAlready.add(msg) // left the chat mid-answer: show it whole next time
    }
  }, [typing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (msg.role === 'user') {
    return (
      <li className="self-end rounded-2xl rounded-br-sm bg-sky-500/30 px-3 py-2 text-sm text-white" data-testid="chat-question">
        {msg.content}
      </li>
    )
  }
  return (
    <li
      data-testid="chat-answer"
      data-refused={msg.refused ? 'true' : 'false'}
      data-typing={typing}
      className={`rounded-2xl rounded-bl-sm border px-3 py-2 ${
        msg.error ? 'border-rose-300/30 bg-rose-500/10' : 'border-white/10 bg-slate-900/50'
      }`}
    >
      <AnswerText text={msg.content} citations={msg.citations} shown={shown} hidden={typing} />
      {typing && <span className="sr-only">{cleanAnswer(msg.content)}</span>}
      {!typing && msg.citations && (
        <div className="animate-fade-in motion-reduce:animate-none">
          <SourceList citations={msg.citations} />
        </div>
      )}
    </li>
  )
}

/** The chat view: suggested questions, the conversation with numbered sources, and a question box. */
export default function ChatPanel({ obj }) {
  const chats = useStore((s) => s.chats)
  const pending = useStore((s) => s.chatPending)
  const sendChat = useStore((s) => s.sendChat)
  const setPanelView = useStore((s) => s.setPanelView)
  const chatKey = obj?.id ?? GENERAL_CHAT
  const draft = useStore((s) => s.drafts[chatKey] ?? '') // kept in the store, so closing the chat never loses it
  const saveDraft = useStore((s) => s.setDraft)
  const setDraft = (text) => saveDraft(chatKey, text)
  const endRef = useRef(null)
  const messages = chats[chatKey] ?? []

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) // keep the newest message in view
  }, [messages.length, pending])
  const followTyping = () => endRef.current?.scrollIntoView({ block: 'end' }) // an answer is growing

  const submit = (text) => {
    if (!text.trim() || pending) return
    sendChat(text)
    setDraft('')
  }

  return (
    <div data-testid="chat-panel" className="flex h-full flex-col gap-3">
      <header className="flex flex-col gap-1">
        {obj && (
          <button type="button" onClick={() => setPanelView('card')} className="self-start text-xs text-slate-400 hover:text-white">
            ‹ Back to card
          </button>
        )}
        <h2 className="text-xl font-semibold text-white">{obj ? `Ask about ${obj.name}` : 'Ask AstroLens'}</h2>
        <p className="text-[11px] text-slate-400">Answers come only from collected Wikipedia and NASA pages, with numbered sources.</p>
      </header>

      {messages.length === 0 && (
        <div className="flex flex-col gap-2" data-testid="question-chips">
          {(obj ? obj.suggested_questions : STARTER_OBJECTS.map((id) => OBJECTS_BY_ID[id].suggested_questions[0])).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => submit(q)}
              className="rounded-2xl border border-white/15 px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-3" data-testid="chat-messages">
        {messages.map((m, i) => (
          <Message key={i} msg={m} onGrow={followTyping} />
        ))}
        {pending && (
          <li data-testid="chat-typing" className="flex items-center gap-2 text-xs text-slate-400">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-300 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-300 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-300" />
            </span>
            Searching the sources…
          </li>
        )}
      </ul>
      <div ref={endRef} />

      <form
        className="sticky bottom-0 mt-auto flex gap-2 bg-slate-950/60 py-2 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault()
          submit(draft)
        }}
      >
        <input
          data-testid="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          placeholder={obj ? `Ask about ${obj.name}…` : 'Ask a question…'}
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
        />
        <button
          type="submit"
          data-testid="chat-send"
          data-magnetic
          disabled={pending || !draft.trim()}
          className="rounded-lg bg-sky-500/80 px-3 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  )
}
