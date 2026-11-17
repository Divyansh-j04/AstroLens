import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { useStore } from '../store'
import { OBJECTS_BY_ID } from '../objects'
import { HOME_VIEWS, MODE_SWITCH_SECONDS, flightSeconds, objectView } from './scale'
import { fade } from './fade'
import { debug } from '../debug'

const EASE = 'power2.inOut'
const REVEAL_DELAY = 1.0 // seconds after landing at a nebula or cluster
const REVEAL_ANGLE = 30 // degrees: far enough for the 3D version to take over from the photo
const REVEAL_SECONDS = 2.2 // each way

/**
 * flyTo: every time the store's flyRequest changes, animate the camera with GSAP.
 *  - If the target is in the other scene mode, first pull back to that mode's overview
 *    (past Neptune, or back in) while the planets and deep-space pictures cross-fade.
 *  - Then fly to the object. Mouse controls are locked for the whole flight.
 *  - At a nebula or cluster, after a short pause, swing the camera 30 degrees to one side and back
 *    so its 3D shape shows itself. Grabbing the mouse stops the swing at once.
 */
export default function CameraRig() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  const flyRequest = useStore((s) => s.flyRequest)

  useEffect(() => {
    debug.camera = camera
    debug.controls = controls
  }, [camera, controls])

  useEffect(() => {
    if (!controls || flyRequest === 0) return undefined
    const { currentObjectId, mode, setMode, setFlying, setArrived } = useStore.getState()
    const obj = currentObjectId ? OBJECTS_BY_ID[currentObjectId] : null
    const targetMode = obj ? obj.scene_mode : 'solar_system'
    const finalView = obj ? objectView(obj.id) : HOME_VIEWS.solar_system
    const switching = targetMode !== mode

    // Lock the mouse controls so the user and the animation never fight over the camera.
    controls.enabled = false
    controls.enableDamping = false
    setFlying(true)
    setArrived(null)
    if (switching) setMode(targetMode)

    let reveal = null
    const stopReveal = () => reveal?.kill()
    const startReveal = () => {
      // Orbit the camera around the object about the vertical axis: out to REVEAL_ANGLE and back.
      const offset = camera.position.clone().sub(controls.target)
      const swing = { deg: 0 }
      const apply = () => {
        const rotated = offset.clone().applyAxisAngle(camera.up, (swing.deg * Math.PI) / 180)
        camera.position.copy(controls.target).add(rotated)
        controls.update()
      }
      reveal = gsap
        .timeline({ delay: REVEAL_DELAY })
        .to(swing, { deg: REVEAL_ANGLE, duration: REVEAL_SECONDS, ease: 'sine.inOut', onUpdate: apply })
        .to(swing, { deg: 0, duration: REVEAL_SECONDS, ease: 'sine.inOut', onUpdate: apply })
      controls.addEventListener('start', stopReveal) // the user grabbed the view
    }

    const tl = gsap.timeline({
      onComplete: () => {
        controls.enabled = true
        controls.enableDamping = true
        setFlying(false)
        if (obj && obj.scene_mode === 'deep_space') {
          setArrived(obj.id)
          startReveal()
        }
      },
    })
    const leg = (view, duration) => {
      tl.to(camera.position, { x: view.position[0], y: view.position[1], z: view.position[2], duration, ease: EASE })
      tl.to(
        controls.target,
        {
          x: view.target[0],
          y: view.target[1],
          z: view.target[2],
          duration,
          ease: EASE,
          onUpdate: () => controls.update(), // re-aim the camera at the moving target
        },
        '<',
      )
    }

    let from = camera.position.toArray()
    if (switching) {
      leg(HOME_VIEWS[targetMode], MODE_SWITCH_SECONDS) // the pull-back
      from = HOME_VIEWS[targetMode].position
    }
    if (obj || !switching) leg(finalView, flightSeconds(from, finalView.position))

    // Cross-fade planets and deep-space pictures (always, so an interrupted switch still finishes).
    const fadeTo = { solar: targetMode === 'solar_system' ? 1 : 0, deep: targetMode === 'deep_space' ? 1 : 0 }
    tl.to(fade, { ...fadeTo, duration: switching ? MODE_SWITCH_SECONDS : 0.6, ease: 'power1.inOut' }, 0)

    return () => {
      tl.kill() // a new request interrupts the old flight
      stopReveal()
      controls.removeEventListener('start', stopReveal)
    }
  }, [flyRequest, camera, controls])

  return null
}
