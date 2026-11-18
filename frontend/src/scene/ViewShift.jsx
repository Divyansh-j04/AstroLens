import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import { JOURNEY_SHIFT } from '../journey'

const PHONE = 640 // px: below this width the glass panel is a bottom sheet over 58% of the screen
const SHIFT = 0.29 // move the picture up by 29% of the screen height: from the middle (50%) to the middle of the strip above the sheet (21%)

/**
 * Phones: while the bottom sheet (card or chat) is open, slide the 3D picture up so the object being
 * looked at sits in the visible strip above the sheet instead of behind it. During the Journey the
 * object moves right (desktop) or up (phone) to leave room for the chapter text. Uses the camera's
 * "view offset" (it draws a window of the picture that starts lower down), so the camera itself does
 * not move and fly-to, zoom and the controls are unaffected. Eases in and out over about half a second.
 */
export default function ViewShift() {
  const offset = useRef({ x: 0, y: 0 })
  useFrame(({ camera, size }, dt) => {
    const s = useStore.getState()
    const phone = size.width < PHONE
    let want = { x: 0, y: 0 }
    if (s.journey.active) want = phone ? { x: 0, y: JOURNEY_SHIFT.y * size.height } : { x: -JOURNEY_SHIFT.x * size.width, y: 0 }
    else if (phone && s.panelOpen) want = { x: 0, y: SHIFT * size.height }
    const o = offset.current
    const k = Math.min(1, dt * 6)
    o.x += (want.x - o.x) * k
    o.y += (want.y - o.y) * k
    if (want.x === 0 && want.y === 0 && Math.abs(o.x) < 0.5 && Math.abs(o.y) < 0.5) {
      o.x = 0
      o.y = 0
      if (camera.view?.enabled) camera.clearViewOffset()
      return
    }
    camera.setViewOffset(size.width, size.height, o.x, o.y, size.width, size.height)
  })
  return null
}
