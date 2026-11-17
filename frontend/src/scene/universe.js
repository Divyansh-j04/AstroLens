// The "True distances" universe: every object at its real distance, from Phobos's orbit (9,375 km)
// to M13 (24,100 light-years, about 1.5 billion AU), about 14 powers of ten.
//
// A 3D scene cannot hold that range in one fixed set of coordinates (the graphics card works in
// 32-bit floats). So, as space simulators do, real positions are kept here in AU (JavaScript's
// 64-bit numbers) and every frame the scene is drawn RELATIVE TO THE FOCUS (the object being
// looked at), scaled by the current zoom: the camera always sits RENDER_R units from the focus,
// and view.logZoom says how many AU that is (as a power of ten). Zooming out by 10x adds 1 to
// logZoom and shrinks the drawn world 10x. This lives outside the Zustand store because it changes
// every frame (like fade.js).

import * as THREE from 'three'
import { OBJECTS, OBJECTS_BY_ID } from '../objects'
import { SPRITE_SIZE, orbitAngle, skyToScene } from './scale'

export const AU_KM = 149597870.7
export const AU_PER_LY = 63241.077
export const RENDER_R = 50 // camera distance from the focus, in drawn units
export const MIN_LOG_ZOOM = -6 // about 150 km from the focus
export const MAX_LOG_ZOOM = 9.4 // about 40,000 light-years

export const view = {
  active: false, // true while "True distances" is on
  focus: [0, 0, 0], // AU, scene axes (y up); the Sun is at the origin
  logZoom: 1.6, // log10 of the camera's distance from the focus, in AU
  hidden: {}, // object id -> true when it is too small or too far to draw (labels follow this)
  readout: '', // camera distance from the Sun, as text (for the zoom controls)
}

/** Real position of every object in AU (scene axes). Planets and moons keep the display layout's
 * angles round the Sun and their planet; only the distances are real. */
export const TRUE_AU = {}
for (const o of OBJECTS) {
  if (o.scene_mode === 'deep_space') {
    TRUE_AU[o.id] = skyToScene(o.ra_deg, o.dec_deg, o.distance_ly * AU_PER_LY)
  } else if (!o.parent) {
    const a = o.orbit_au ? orbitAngle(o) : 0
    TRUE_AU[o.id] = [o.orbit_au * Math.cos(a), 0, -o.orbit_au * Math.sin(a)]
  }
}
for (const o of OBJECTS.filter((x) => x.parent)) {
  const [px, py, pz] = TRUE_AU[o.parent]
  const d = o.orbit_km / AU_KM
  const a = orbitAngle(o)
  TRUE_AU[o.id] = [px + d * Math.cos(a), py, pz - d * Math.sin(a)]
}

/** Real radius in AU (planets, moons, the Sun). */
export const RADIUS_AU = Object.fromEntries(
  OBJECTS.filter((o) => o.radius_km).map((o) => [o.id, o.radius_km / AU_KM]),
)

/** Real orbit radius in AU: round the Sun, or round the planet for a moon. */
export function trueOrbitAU(obj) {
  return obj.parent ? obj.orbit_km / AU_KM : obj.orbit_au
}

/** Drawn units per AU at the current zoom. */
export const unitsPerAU = () => RENDER_R / 10 ** view.logZoom

/** Where a real position (AU) is drawn right now. */
export function toRender(au, out = new THREE.Vector3()) {
  const k = unitsPerAU()
  const f = view.focus
  return out.set((au[0] - f[0]) * k, (au[1] - f[1]) * k, (au[2] - f[2]) * k)
}

/** Zoom that frames an object when flying to it. */
export function zoomFor(id) {
  const o = OBJECTS_BY_ID[id]
  if (o.scene_mode === 'deep_space') return Math.log10(4 * o.radius_ly * AU_PER_LY) // camera 4 radii away
  return Math.log10(RADIUS_AU[id] * (o.orbit_au === 0 ? 5 : 8)) // the body fills about a quarter of the view
}

const MIN_PICTURE_PX = 36 // far away, a nebula or cluster picture never shrinks below this

/**
 * Size factor for a nebula or cluster in the true view, relative to its normal drawn size
 * (SPRITE_SIZE): its picture is 2.2 x its real radius (photos show some sky round the object),
 * but at least MIN_PICTURE_PX tall on screen.
 */
export function deepScale(obj, camera, size, distance) {
  const real = 2.2 * obj.radius_ly * AU_PER_LY * unitsPerAU()
  const minimum = (MIN_PICTURE_PX * 2 * Math.tan((camera.fov * Math.PI) / 360) * distance) / size.height
  return Math.max(real, minimum) / SPRITE_SIZE
}

/** Zoom of the whole Solar System (Neptune's orbit in view). */
export const SOLAR_SYSTEM_ZOOM = Math.log10(60)

/** Direction (unit vector, drawn space) the camera looks FROM at an object. Deep objects are seen
 * from Earth's side (so the photo is head-on and the stars behind are its real constellation);
 * Solar System bodies from their sunlit side, a little above. */
export function viewDirection(id) {
  const o = OBJECTS_BY_ID[id]
  const [x, y, z] = TRUE_AU[id]
  if (o.scene_mode === 'deep_space') return new THREE.Vector3(-x, -y, -z).normalize()
  const flat = Math.hypot(x, z)
  const [dx, dz] = flat > 0 ? [x / flat, z / flat] : [0, -1]
  return new THREE.Vector3(-dx * 0.85, 0.45, -dz * 0.85).normalize()
}

/** Camera distance from the Sun right now, as text: km, AU or light-years. */
export function distanceText(camera) {
  const k = unitsPerAU()
  const f = view.focus
  const au = Math.hypot(camera.position.x / k + f[0], camera.position.y / k + f[1], camera.position.z / k + f[2])
  if (au < 0.01) return `${Math.round(au * AU_KM).toLocaleString('en')} km from the Sun`
  if (au < 1000) return `${au < 10 ? au.toFixed(2) : Math.round(au).toLocaleString('en')} AU from the Sun`
  const ly = au / AU_PER_LY
  return `${ly < 10 ? ly.toFixed(2) : Math.round(ly).toLocaleString('en')} light-years from the Sun`
}

/** How far apart (drawn units) an orbiting body is from what it orbits at the current zoom; used to
 * hide planets and moons that would sit on top of the Sun or their planet when zoomed far out. */
export const orbitSeparation = (obj) => trueOrbitAU(obj) * unitsPerAU()
