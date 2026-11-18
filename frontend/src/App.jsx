import SpaceScene from './scene/SpaceScene'
import TopBar, { ScaleNote } from './ui/TopBar'
import LoadingScreen from './ui/LoadingScreen'
import GlassPanel from './panel/GlassPanel'
import UploadZone from './upload/UploadZone'
import ObjectBrowser from './panel/ObjectBrowser'
import Landing from './ui/Landing'
import RevealHint from './ui/RevealHint'
import ZoomControls from './ui/ZoomControls'
import WarpVignette from './ui/WarpVignette'
import ArrivalTitle from './ui/ArrivalTitle'
import TourCaption from './ui/TourCaption'
import CustomCursor from './ui/CustomCursor'
import { useStore } from './store'
import './debug'

export default function App() {
  const entered = useStore((s) => s.entered)
  return (
    <main className="relative h-full w-full overflow-hidden bg-black text-slate-100">
      <SpaceScene />
      <WarpVignette />
      {entered && (
        <>
          <ArrivalTitle />
          <TopBar />
          <UploadZone />
          <ScaleNote />
          <GlassPanel />
          <ObjectBrowser />
          <RevealHint />
          <ZoomControls />
          <TourCaption />
        </>
      )}
      <Landing />
      <LoadingScreen />
      <CustomCursor />
    </main>
  )
}
