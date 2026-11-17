import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'
import { useStore } from '../store'
import { OBJECTS_BY_ID } from '../objects'
import { MODE_SWITCH_SECONDS, flightSeconds, homeView, objectView } from './scale'
import { fade } from './fade'
import {
  MAX_LOG_ZOOM,
  MIN_LOG_ZOOM,
  RENDER_R,
  SOLAR_SYSTEM_ZOOM,
  TRUE_AU,
  distanceText,
  view,
  viewDirection,
  zoomFor,
} from './universe'
import { debug } from '../debug'

const EASE = 'power2.inOut'
const REVEAL_DELAY = 1.0 // seconds after landing at a nebula or cluster
const REVEAL_ANGLE = 30 // degrees: far enough for the 3D version to take over from the photo
const REVEAL_SECONDS = 2.2 // each way
const DEEP_FROM_AU = 3000 // in the true view, beyond this camera distance from the Sun we are "in deep space"
const clampZoom = (z) => Math.min(MAX_LOG_ZOOM, Math.max(MIN_LOG_ZOOM, z))
const smooth = (x) => x * x * (3 - 2 * x)
const ORIGIN = new THREE.Vector3()

/**
 * flyTo: every time the store's flyRequest changes, animate the camera with GSAP.
 *  - If the target is in the other scene mode, first pull back to that mode's overview
 *    (past Neptune, or back in) while the planets and deep-space pictures cross-fade.
 *  - Then fly to the object. Mouse controls are locked for the whole flight.
 *  - At a nebula or cluster, after a short pause, swing the camera 30 degrees to one side and back
 *    so its 3D shape shows itself. Grabbing the mouse stops the swing at once.
 *
 * "True distances" (see universe.js): everything is drawn at its real distance relative to a focus,
 * with the camera always RENDER_R drawn units from it. A fly-to is then a "powers of ten" flight:
 * zoom out until start and target are both in view, travel, zoom back in. Mouse-wheel zoom and the
 * +/- buttons change view.logZoom, so the zoom has no limit from Phobos's orbit to beyond M13.
 */
export default function CameraRig() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  const flyRequest = useStore((s) => s.flyRequest)
  const trueScale = useStore((s) => s.trueScale)
  const zoomRequest = useStore((s) => s.zoomRequest)
  const revealRef = useRef(null)
  const zoomTween = useRef(null)

  useEffect(() => {
    debug.camera = camera
    debug.controls = controls
  }, [camera, controls])

  // True view, every frame: turn any change of camera distance (mouse wheel) into zoom, keep the
  // camera RENDER_R from the focus, switch the scene mode by distance, and update the readout.
  useFrame(() => {
    if (!view.active || !controls) return
    const d = camera.position.distanceTo(controls.target)
    if (Math.abs(d - RENDER_R) > 1e-6) {
      view.logZoom = clampZoom(view.logZoom + Math.log10(d / RENDER_R))
      camera.position.sub(controls.target).setLength(RENDER_R).add(controls.target)
    }
    const text = distanceText(camera)
    view.readout = text
    const s = useStore.getState()
    const deep = 10 ** view.logZoom + Math.hypot(...view.focus) > DEEP_FROM_AU
    const mode = deep ? 'deep_space' : 'solar_system'
    if (s.mode !== mode && !s.isFlying) s.setMode(mode)
  })

  const startRevealFor = (obj) => {
    const stopReveal = () => revealRef.current?.kill()
    if (!obj || obj.scene_mode !== 'deep_space') return stopReveal
    // Orbit the camera around the object about the vertical axis: out to REVEAL_ANGLE and back.
    const offset = camera.position.clone().sub(controls.target)
    const swing = { deg: 0 }
    const apply = () => {
      const rotated = offset.clone().applyAxisAngle(camera.up, (swing.deg * Math.PI) / 180)
      camera.position.copy(controls.target).add(rotated)
      controls.update()
    }
    revealRef.current = gsap
      .timeline({ delay: REVEAL_DELAY })
      .to(swing, { deg: REVEAL_ANGLE, duration: REVEAL_SECONDS, ease: 'sine.inOut', onUpdate: apply })
      .to(swing, { deg: 0, duration: REVEAL_SECONDS, ease: 'sine.inOut', onUpdate: apply })
    controls.addEventListener('start', stopReveal) // the user grabbed the view
    return stopReveal
  }

  useEffect(() => {
    if (!controls || flyRequest === 0) return undefined
    const { currentObjectId, mode, setMode, setFlying, setArrived } = useStore.getState()
    const obj = currentObjectId ? OBJECTS_BY_ID[currentObjectId] : null
    revealRef.current?.kill()
    zoomTween.current?.kill()

    // Lock the mouse controls so the user and the animation never fight over the camera.
    controls.enabled = false
    controls.enableDamping = false
    setFlying(true)
    setArrived(null)
    let stopReveal = () => {}
    const land = () => {
      controls.enabled = true
      controls.enableDamping = true
      setFlying(false)
      if (obj && obj.scene_mode === 'deep_space') setArrived(obj.id)
      stopReveal = startRevealFor(obj)
    }

    if (view.active) {
      // Powers-of-ten flight in the true view.
      const f0 = [...view.focus]
      const z0 = view.logZoom
      const f1 = obj ? TRUE_AU[obj.id] : [0, 0, 0]
      const z1 = obj ? zoomFor(obj.id) : SOLAR_SYSTEM_ZOOM
      const gap = Math.hypot(f1[0] - f0[0], f1[1] - f0[1], f1[2] - f0[2])
      const zMid = Math.max(z0, z1, gap > 0 ? Math.log10(gap) + 0.35 : z0)
      const dir0 = camera.position.clone().sub(controls.target).normalize()
      const dir1 = obj ? viewDirection(obj.id) : new THREE.Vector3(0, 0.45, 0.9).normalize()
      const state = { u: 0 }
      const duration = Math.min(5, 1.6 + 0.3 * (zMid - z0 + (zMid - z1)))
      const tween = gsap.to(state, {
        u: 1,
        duration,
        ease: 'none',
        onUpdate: () => {
          const u = state.u
          view.logZoom = u < 0.5 ? z0 + (zMid - z0) * smooth(u * 2) : zMid + (z1 - zMid) * smooth((u - 0.5) * 2)
          const w = smooth(Math.min(1, Math.max(0, (u - 0.2) / 0.6))) // travel mostly while zoomed out
          view.focus = f0.map((v, i) => v + (f1[i] - v) * w)
          controls.target.copy(ORIGIN)
          camera.position.copy(dir0).lerp(dir1, smooth(u)).setLength(RENDER_R)
          controls.update()
        },
        onComplete: land,
      })
      return () => {
        tween.kill()
        stopReveal()
      }
    }

    const targetMode = obj ? obj.scene_mode : 'solar_system'
    const finalView = obj ? objectView(obj.id) : homeView('solar_system')
    const switching = targetMode !== mode
    if (switching) setMode(targetMode)
    const tl = gsap.timeline({ onComplete: land })
    const leg = (v, duration) => {
      tl.to(camera.position, { x: v.position[0], y: v.position[1], z: v.position[2], duration, ease: EASE })
      tl.to(
        controls.target,
        {
          x: v.target[0],
          y: v.target[1],
          z: v.target[2],
          duration,
          ease: EASE,
          onUpdate: () => controls.update(), // re-aim the camera at the moving target
        },
        '<',
      )
    }

    let from = camera.position.toArray()
    if (switching) {
      leg(homeView(targetMode), MODE_SWITCH_SECONDS) // the pull-back
      from = homeView(targetMode).position
    }
    if (obj || !switching) leg(finalView, flightSeconds(from, finalView.position))

    // Cross-fade planets and deep-space pictures (always, so an interrupted switch still finishes).
    const fadeTo = { solar: targetMode === 'solar_system' ? 1 : 0, deep: targetMode === 'deep_space' ? 1 : 0 }
    tl.to(fade, { ...fadeTo, duration: switching ? MODE_SWITCH_SECONDS : 0.6, ease: 'power1.inOut' }, 0)

    return () => {
      tl.kill() // a new request interrupts the old flight
      stopReveal()
    }
  }, [flyRequest, camera, controls]) // eslint-disable-line react-hooks/exhaustive-deps

  // "True distances" switch: move between the normal (compressed) view and the true view, keeping
  // the same object in front of the camera.
  useEffect(() => {
    if (!controls || view.active === trueScale) return
    revealRef.current?.kill()
    zoomTween.current?.kill()
    const { currentObjectId, setMode } = useStore.getState()
    const obj = currentObjectId ? OBJECTS_BY_ID[currentObjectId] : null
    const dir = camera.position.clone().sub(controls.target).normalize()
    if (trueScale) {
      view.active = true
      view.focus = obj ? [...TRUE_AU[obj.id]] : [0, 0, 0]
      view.logZoom = obj ? zoomFor(obj.id) : SOLAR_SYSTEM_ZOOM
      fade.solar = 1
      fade.deep = 1 // everything is in one space now; distance decides what is visible
      controls.target.copy(ORIGIN)
      camera.position.copy(dir).setLength(RENDER_R)
    } else {
      view.active = false
      view.hidden = {}
      const mode = obj ? obj.scene_mode : 'solar_system'
      setMode(mode)
      fade.solar = mode === 'solar_system' ? 1 : 0
      fade.deep = mode === 'deep_space' ? 1 : 0
      const v = obj ? objectView(obj.id) : homeView(mode)
      camera.position.set(...v.position)
      controls.target.set(...v.target)
    }
    controls.update()
  }, [trueScale, camera, controls])  

  // +/- buttons: zoom by a factor (true view: change logZoom; normal view: move the camera in or out).
  useEffect(() => {
    if (!controls || !zoomRequest.n) return
    revealRef.current?.kill()
    zoomTween.current?.kill()
    if (view.active) {
      zoomTween.current = gsap.to(view, {
        logZoom: clampZoom(view.logZoom + Math.log10(zoomRequest.factor)),
        duration: 0.6,
        ease: 'power2.out',
      })
      return
    }
    const offset = camera.position.clone().sub(controls.target)
    const length = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() * zoomRequest.factor))
    const end = controls.target.clone().add(offset.setLength(length))
    zoomTween.current = gsap.to(camera.position, {
      x: end.x,
      y: end.y,
      z: end.z,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => controls.update(),
    })
  }, [zoomRequest, camera, controls])

  return null
}

