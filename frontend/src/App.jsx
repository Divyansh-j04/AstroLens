import SpaceScene from './scene/SpaceScene'
import TopBar, { ScaleNote } from './ui/TopBar'
import LoadingScreen from './ui/LoadingScreen'
import GlassPanel from './panel/GlassPanel'
import './debug'

export default function App() {
  return (
    <main className="relative h-full w-full overflow-hidden bg-black text-slate-100">
      <SpaceScene />
      <TopBar />
      <ScaleNote />
      <GlassPanel />
      <LoadingScreen />
    </main>
  )
}
