import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import gsap from 'gsap'
import classifier from '@data/classifier.json'
import { OBJECTS } from '../objects'
import { useStore } from '../store'

const GROUP_COUNT = (g) => OBJECTS.filter((o) => o.group === g).length

function Icon({ name }) {
  const common = 'h-6 w-6 fill-none stroke-current'
  if (name === 'photo')
    return (
      <svg viewBox="0 0 24 24" className={common} strokeWidth="1.8" aria-hidden="true">
        <path d="M4 8h3l2-3h6l2 3h3v11H4z" strokeLinejoin="round" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
    )
  if (name === 'chat')
    return (
      <svg viewBox="0 0 24 24" className={common} strokeWidth="1.8" aria-hidden="true">
        <path d="M4 5h16v11H9l-5 4z" strokeLinejoin="round" />
        <path d="M8 9.5h8M8 12.5h5" strokeLinecap="round" />
      </svg>
    )
  return (
    <svg viewBox="0 0 24 24" className={common} strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(-25 12 12)" />
      <circle cx="19" cy="5" r="1" className="fill-current" />
    </svg>
  )
}

/**
 * Landing page shown over the slowly turning 3D sky. Three doors into the app:
 * identify a photo (click, or drop a photo straight on the card), ask the guide, or explore.
 */
export default function Landing() {
  const entered = useStore((s) => s.entered)
  const enterApp = useStore((s) => s.enterApp)
  const uploadPhoto = useStore((s) => s.uploadPhoto)
  const { active, progress } = useProgress()
  const loaded = !active && progress === 100
  const [dropping, setDropping] = useState(false)
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  // Entrance animation once the scene has loaded (and again when coming back to the landing).
  useEffect(() => {
    if (!loaded || entered || !rootRef.current) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const ctx = gsap.context(() => {
      // fromTo with explicit end values: never read a half-finished CSS transition as the target
      gsap.fromTo(
        '[data-anim]',
        { y: 28, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.12, clearProps: 'opacity,transform' },
      )
    }, rootRef)
    return () => ctx.revert()
  }, [loaded, entered])

  const startWithPhoto = (file) => {
    if (!file) return
    enterApp('photo')
    uploadPhoto(file)
  }

  const doors = [
    {
      id: 'photo',
      icon: 'photo',
      title: 'Identify a photo',
      text: `Upload a picture of a planet, nebula or star cluster. AstroLens recognises ${classifier.classes.length} objects, flies to it and shows what it looked at.`,
      cta: 'Choose or drop a photo',
      onClick: () => inputRef.current?.click(),
    },
    {
      id: 'chat',
      icon: 'chat',
      title: 'Ask the guide',
      text: 'Ask anything about the Sun, the planets, nebulae and clusters. Answers come only from NASA and Wikipedia, with numbered sources.',
      cta: 'Start a conversation',
      onClick: () => enterApp('chat'),
    },
    {
      id: 'explore',
      icon: 'explore',
      title: 'Explore the sky',
      text: `Fly through the Solar System and out to ${GROUP_COUNT('nebula')} nebulae and ${GROUP_COUNT('star_cluster')} star clusters at their real positions in the sky.`,
      cta: 'Open the 3D map',
      onClick: () => enterApp('explore'),
    },
  ]

  return (
    <section
      ref={rootRef}
      data-testid="landing"
      aria-hidden={entered}
      className={`absolute inset-0 z-[45] overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(0,0,8,0.25)_0%,rgba(0,0,8,0.75)_60%,rgba(0,0,8,0.95)_100%)] transition-opacity duration-500 ${
        entered ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center px-4 py-12 text-center">
        <p data-anim className="text-[11px] uppercase tracking-[0.45em] text-sky-300/80">
          Computer vision · Natural language
        </p>
        <h1
          data-anim
          className="mt-4 bg-gradient-to-r from-sky-200 via-white to-amber-200 bg-clip-text text-5xl font-semibold tracking-[0.12em] text-transparent sm:text-7xl"
        >
          ASTROLENS
        </h1>
        <p data-anim className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
          Recognise what is in a space photo, fly to it in a 3D map of the sky, and ask questions answered from
          trusted sources.
        </p>

        <div className="mt-10 grid w-full gap-4 sm:grid-cols-3">
          {doors.map((d) => (
            <div key={d.id} data-anim className="flex">
            <button
              type="button"
              data-testid={`landing-${d.id}`}
              onClick={d.onClick}
              {...(d.id === 'photo'
                ? {
                    onDragOver: (e) => {
                      e.preventDefault()
                      setDropping(true)
                    },
                    onDragLeave: () => setDropping(false),
                    onDrop: (e) => {
                      e.preventDefault()
                      setDropping(false)
                      startWithPhoto(e.dataTransfer.files?.[0])
                    },
                  }
                : {})}
              className={`group flex w-full flex-col items-start gap-3 rounded-2xl border p-5 text-left backdrop-blur-[14px] transition duration-300 hover:-translate-y-1 hover:border-sky-300/50 hover:bg-slate-900/60 hover:shadow-[0_0_40px_-10px_rgba(56,189,248,0.6)] focus:outline-none focus:ring-2 focus:ring-sky-400/60 ${
                d.id === 'photo' && dropping ? 'border-sky-300 bg-sky-400/20' : 'border-white/15 bg-slate-950/45'
              }`}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-400/15 text-sky-200 transition group-hover:bg-sky-400/25">
                <Icon name={d.icon} />
              </span>
              <span className="text-lg font-semibold text-white">{d.title}</span>
              <span className="text-sm leading-relaxed text-slate-400">{d.text}</span>
              <span className="mt-auto pt-2 text-sm text-sky-300 transition group-hover:translate-x-1">{d.cta} →</span>
            </button>
            </div>
          ))}
        </div>

        <input
          ref={inputRef}
          data-testid="landing-input"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            startWithPhoto(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        <p data-anim className="mt-10 text-xs text-slate-500">
          {OBJECTS.length} objects · {classifier.classes.length} recognised from photos · real star positions · sizes and
          distances not to scale
        </p>
      </div>
    </section>
  )
}
