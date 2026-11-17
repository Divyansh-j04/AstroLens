import SpaceScene from './scene/SpaceScene'
import TopBar, { ScaleNote } from './ui/TopBar'
import LoadingScreen from './ui/LoadingScreen'
import GlassPanel from './panel/GlassPanel'
import UploadZone from './upload/UploadZone'
import ObjectBrowser from './panel/ObjectBrowser'
import Landing from './ui/Landing'
import { useStore } from './store'
import './debug'

export default function App() {
  const entered = useStore((s) => s.entered)
  return (
    <main className="relative h-full w-full overflow-hidden bg-black text-slate-100">
      <SpaceScene />
      {entered && (
        <>
          <TopBar />
          <UploadZone />
          <ScaleNote />
          <GlassPanel />
          <ObjectBrowser />
        </>
      )}
      <Landing />
      <LoadingScreen />
    </main>
  )
}
