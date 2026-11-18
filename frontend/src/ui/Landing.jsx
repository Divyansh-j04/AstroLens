import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import gsap from 'gsap'
import classifier from '@data/classifier.json'
import { OBJECTS } from '../objects'
import { useStore } from '../store'
import { blurIn, scramble } from './textfx'
import { Corners, Letters } from './Decor'

const KICKER = 'COMPUTER VISION · NATURAL LANGUAGE'

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
 * Landing page shown over the slowly turning 3D sky. The title comes into focus letter by letter and
 * the line above it "decodes"; the main button starts the Journey (a scroll-driven story through the
 * scene). Three doors below: identify a photo (click, or drop a photo on the card), ask the guide, or
 * explore.
 */
export default function Landing() {
  const entered = useStore((s) => s.entered)
  const enterApp = useStore((s) => s.enterApp)
  const uploadPhoto = useStore((s) => s.uploadPhoto)
  const journeyTo = useStore((s) => s.journeyTo)
  const { active, progress } = useProgress()
  const loaded = !active && progress === 100
  const [dropping, setDropping] = useState(false)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const titleRef = useRef(null)
  const kickerRef = useRef(null)

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

  // The title comes into focus letter by letter, and the line above it decodes.
  useEffect(() => {
    if (!loaded || entered) return undefined
    const tweens = [blurIn(titleRef.current, { delay: 0.2, each: 0.07 }), scramble(kickerRef.current, KICKER, { duration: 1.1 })]
    return () => tweens.forEach((t) => t?.kill())
  }, [loaded, entered])

  const startWithPhoto = (file) => {
    if (!file) return
    enterApp('photo')
    uploadPhoto(file)
  }

  const doors = [
    {
      id: 'photo',
      n: '01',
      icon: 'photo',
      title: 'Identify a photo',
      text: `Upload a picture of a planet, nebula or star cluster. AstroLens recognises ${classifier.classes.length} objects, flies to it and shows what it looked at.`,
      cta: 'Choose or drop a photo',
      onClick: () => inputRef.current?.click(),
    },
    {
      id: 'chat',
      n: '02',
      icon: 'chat',
      title: 'Ask the guide',
      text: 'Ask anything about the Sun, the planets, nebulae and clusters. Answers come only from NASA and Wikipedia, with numbered sources.',
      cta: 'Start a conversation',
      onClick: () => enterApp('chat'),
    },
    {
      id: 'explore',
      n: '03',
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
        <p ref={kickerRef} data-testid="landing-kicker" className="font-mono text-[10px] tracking-[0.4em] text-sky-300/80 sm:text-[11px]">
          {KICKER}
        </p>
        <h1
          ref={titleRef}
          aria-label="AstroLens"
          data-testid="landing-title"
          className="mt-5 font-display text-5xl font-light tracking-[0.2em] text-white sm:text-8xl"
        >
          <Letters text="ASTROLENS" />
        </h1>
        <p data-anim className="mt-6 max-w-2xl font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-slate-400 sm:text-xs">
          Recognise what is in a space photo, fly to it in a 3D map of the sky, and ask questions answered from
          trusted sources.
        </p>
        <div data-anim className="mt-10">
          <button
            type="button"
            data-testid="landing-journey"
            data-magnetic
            onClick={() => journeyTo(0)}
            className="relative bg-white px-9 py-3.5 font-mono text-[11px] font-medium tracking-[0.3em] text-slate-950 transition-colors hover:bg-sky-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            <Corners className="border-white/80" />
            BEGIN THE JOURNEY
          </button>
          <p className="mt-4 font-mono text-[10px] tracking-[0.25em] text-slate-500">SCROLL THROUGH SPACE · 7 CHAPTERS</p>
        </div>

        <div className="mt-14 grid w-full gap-5 sm:grid-cols-3">
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
              className={`group relative flex w-full flex-col items-start gap-3 rounded-md border p-5 text-left backdrop-blur-[14px] transition duration-300 hover:-translate-y-1 hover:border-sky-300/50 hover:bg-slate-900/60 hover:shadow-[0_0_40px_-10px_rgba(56,189,248,0.6)] focus:outline-none focus:ring-2 focus:ring-sky-400/60 ${
                d.id === 'photo' && dropping ? 'border-sky-300 bg-sky-400/20' : 'border-white/15 bg-slate-950/45'
              }`}
            >
              <Corners className="border-sky-300/50 opacity-0 transition-opacity group-hover:opacity-100" />
              <span className="flex w-full items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-sky-400/15 text-sky-200 transition group-hover:bg-sky-400/25">
                  <Icon name={d.icon} />
                </span>
                <span className="font-mono text-[10px] tracking-[0.3em] text-slate-500">{d.n}</span>
              </span>
              <span className="font-display text-lg font-medium text-white">{d.title}</span>
              <span className="text-sm leading-relaxed text-slate-400">{d.text}</span>
              <span className="mt-auto pt-2 font-mono text-[11px] uppercase tracking-[0.15em] text-sky-300 transition group-hover:translate-x-1">{d.cta} →</span>
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

        <p data-anim className="mt-10 font-mono text-[10px] uppercase tracking-[0.15em] text-slate-500">
          {OBJECTS.length} objects · {classifier.classes.length} recognised from photos · real star positions · sizes and
          distances not to scale
        </p>
      </div>
    </section>
  )
}
