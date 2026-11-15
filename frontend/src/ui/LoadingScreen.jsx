import { useProgress } from '@react-three/drei'

/** Black screen with a progress bar until the star file and all textures have loaded. */
export default function LoadingScreen() {
  const { active, progress } = useProgress()
  const done = !active && progress === 100

  return (
    <div
      data-testid="loading-screen"
      data-done={done}
      className={`absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black transition-opacity duration-700 ${
        done ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <p className="text-sm tracking-[0.4em] text-slate-300">ASTROLENS</p>
      <div className="h-1 w-64 overflow-hidden rounded-full bg-white/10">
        {/* width is a dynamic value, the one place an inline style is allowed */}
        <div className="h-full bg-sky-400 transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-xs text-slate-500">Loading stars and textures… {Math.round(progress)}%</p>
    </div>
  )
}
