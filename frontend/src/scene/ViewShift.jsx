import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'

const PHONE = 640 // px: below this width the glass panel is a bottom sheet over 58% of the screen
const SHIFT = 0.29 // move the picture up by 29% of the screen height: from the middle (50%) to the middle of the strip above the sheet (21%)

/**
 * Phones only: while the bottom sheet (card or chat) is open, slide the 3D picture up so the object
 * being looked at sits in the visible strip above the sheet instead of behind it. Uses the camera's
 * "view offset" (it draws a window of the picture that starts lower down), so the camera itself does
 * not move and fly-to, zoom and the controls are unaffected. Eases in and out over about half a second.
 */
export default function ViewShift() {
  const offset = useRef(0)
  useFrame(({ camera, size }, dt) => {
    const want = size.width < PHONE && useStore.getState().panelOpen ? SHIFT * size.height : 0
    offset.current += (want - offset.current) * Math.min(1, dt * 6)
    if (want === 0 && Math.abs(offset.current) < 0.5) {
      offset.current = 0
      if (camera.view?.enabled) camera.clearViewOffset()
      return
    }
    camera.setViewOffset(size.width, size.height, 0, offset.current, size.width, size.height)
  })
  return null
}
