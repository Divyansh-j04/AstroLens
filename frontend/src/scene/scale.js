/**
 * Display-scale maths for the 3D scene.
 *
 * Every real number about an object (radius, orbit, RA, Dec, distance) comes from
 * objects.json. This file only decides how to squeeze those numbers onto one screen,
 * which is why the page says "not to scale".
 *
 * Axes: three.js treats y as "up". We put the celestial north pole on +y and
 * right ascension 0h on +x, the same frame as the HYG star file.
 */
import { OBJECTS, OBJECTS_BY_ID } from '../objects'
import { layout } from './layout'

const DEG = Math.PI / 180
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)) // spreads planets round the Sun so none line up

// Solar-system mode (square-root compression of sizes and distances)
export const SUN_RADIUS = 3 // the Sun is shrunk the most, so it does not swallow Mercury
const RADIUS_PER_SQRT_KM = 0.0075 // radius = 0.0075 x sqrt(radius_km): Earth 0.6, Jupiter 2.0
const ORBIT_START = 6 // orbit = 6 + 10 x sqrt(AU): Mercury 12, Earth 16, Neptune 61
const ORBIT_PER_SQRT_AU = 10
const MOON_ORBIT_PER_SQRT_KM = 0.004 // Moon gap above Earth's surface = 0.004 x sqrt(orbit_km)
const MOON_ANGLE = 2.0 // where the Moon sits on its orbit (radians), a display choice
const MIN_MOON_RADIUS = 0.06 // tiny moons (Phobos 11 km, Deimos 6 km) are enlarged to stay visible
export const RINGED = new Set(['saturn']) // planets drawn with rings (a display extra)
export const RING_INNER = 1.25 // ring edges, as multiples of the planet's display radius
export const RING_OUTER = 2.3

// Deep-space mode
export const LY_SCALE = 4 // distance = 4 x sqrt(light-years): Pleiades 84, M13 621
export const TRUE_LY_SCALE = 0.1 // "True distances" layout: 100 units = 1,000 light-years (Pleiades 44, M13 2,410)
export const SPRITE_SIZE = 14 // size of a nebula or cluster picture up close
export const DEEP_VIEW_DISTANCE = 35 // a fly-to stops this far in front of a nebula or cluster

// Sky and camera
export const STAR_SPHERE_RADIUS = 4000 // stars sit on a far sphere that moves with the camera
export const CAMERA_FAR = 10000
export const MODE_SWITCH_SECONDS = 2.5

export const HOME_VIEWS = {
  solar_system: { position: [0, 55, 105], target: [0, 0, 0] },
  deep_space: { position: [0, 700, 1250], target: [0, 0, 0] },
}

/** The overview for a scene mode, for the current deep-space layout (see layout.js). */
export function homeView(mode) {
  if (mode !== 'deep_space') return HOME_VIEWS[mode]
  const t = layout.t
  const mix = (a, b) => a.map((v, i) => v + (b[i] - v) * t)
  return {
    position: mix(HOME_VIEWS.deep_space.position, TRUE_DEEP_HOME.position),
    target: mix(HOME_VIEWS.deep_space.target, TRUE_DEEP_HOME.target),
  }
}

/** Equatorial x, y, z (x to RA 0h, y to RA 6h, z to the north pole) to scene x, y, z (y up). */
export function equatorialToScene(x, y, z) {
  return [x, z, -y]
}

/** Right ascension and declination (degrees) plus a distance to scene x, y, z. */
export function skyToScene(raDeg, decDeg, distance) {
  const ra = raDeg * DEG
  const dec = decDeg * DEG
  return equatorialToScene(
    distance * Math.cos(dec) * Math.cos(ra),
    distance * Math.cos(dec) * Math.sin(ra),
    distance * Math.sin(dec),
  )
}

/** Sphere radius on screen for a Solar-system body. */
export function displayRadius(obj) {
  if (obj.orbit_au === 0) return SUN_RADIUS
  const r = RADIUS_PER_SQRT_KM * Math.sqrt(obj.radius_km)
  return obj.parent ? Math.max(MIN_MOON_RADIUS, r) : r
}

/** Radius of the orbit ring: around the Sun, or around the parent planet for a moon. */
export function orbitRadius(obj) {
  if (obj.parent) {
    // count from the planet's edge, or from the outer edge of its rings (Saturn's moons orbit outside them)
    const edge = displayRadius(OBJECTS_BY_ID[obj.parent]) * (RINGED.has(obj.parent) ? RING_OUTER : 1)
    return edge + MOON_ORBIT_PER_SQRT_KM * Math.sqrt(obj.orbit_km)
  }
  return ORBIT_START + ORBIT_PER_SQRT_AU * Math.sqrt(obj.orbit_au)
}

const SUN_ORBITERS = OBJECTS.filter((o) => o.scene_mode === 'solar_system' && o.orbit_au > 0).sort(
  (a, b) => a.orbit_au - b.orbit_au,
)

function solarPosition(obj) {
  if (obj.parent) {
    const [px, py, pz] = solarPosition(OBJECTS_BY_ID[obj.parent])
    const d = orbitRadius(obj)
    // a planet's moons are spread round it by the golden angle, nearest first (one moon: MOON_ANGLE)
    const siblings = OBJECTS.filter((o) => o.parent === obj.parent).sort((a, b) => a.orbit_km - b.orbit_km)
    const angle = MOON_ANGLE + siblings.indexOf(obj) * GOLDEN_ANGLE
    return [px + d * Math.cos(angle), py, pz - d * Math.sin(angle)]
  }
  if (!obj.orbit_au) return [0, 0, 0] // the Sun sits at the centre
  const angle = (SUN_ORBITERS.indexOf(obj) + 1) * GOLDEN_ANGLE
  const r = orbitRadius(obj)
  return [r * Math.cos(angle), 0, -r * Math.sin(angle)]
}

function deepPosition(obj) {
  return skyToScene(obj.ra_deg, obj.dec_deg, LY_SCALE * Math.sqrt(obj.distance_ly))
}

/** Scene position of every object, by id. */
export const POSITIONS = Object.fromEntries(
  OBJECTS.map((o) => [o.id, o.scene_mode === 'deep_space' ? deepPosition(o) : solarPosition(o)]),
)

/** Deep-space objects at their true, linear distance (same directions). */
export const TRUE_POSITIONS = Object.fromEntries(
  OBJECTS.filter((o) => o.scene_mode === 'deep_space').map((o) => [
    o.id,
    skyToScene(o.ra_deg, o.dec_deg, TRUE_LY_SCALE * o.distance_ly),
  ]),
)

/**
 * Overview for the true layout, computed so everything fits: aim at the middle of all deep-space
 * objects and the Sun, and back off (from the same angle as the normal overview) until the
 * farthest one is inside the view.
 */
const TRUE_DEEP_HOME = (() => {
  const pts = [[0, 0, 0], ...Object.values(TRUE_POSITIONS)]
  const lo = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i])))
  const hi = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])))
  const centre = lo.map((v, i) => (v + hi[i]) / 2)
  const radius = Math.max(...pts.map((p) => Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2])))
  const [dx, dy, dz] = HOME_VIEWS.deep_space.position
  const len = Math.hypot(dx, dy, dz)
  const distance = (radius / Math.sin((25 * Math.PI) / 180)) * 1.08 // a sphere of this radius fits the 50 deg view
  return { position: centre.map((c, i) => c + ([dx, dy, dz][i] / len) * distance), target: centre }
})()

/** Where an object is drawn right now: deep-space objects move between the two layouts. */
export function currentPosition(id) {
  const a = POSITIONS[id]
  const b = TRUE_POSITIONS[id]
  if (!b || layout.t === 0) return a
  return a.map((v, i) => v + (b[i] - v) * layout.t)
}

/** Where the camera stops (position) and what it looks at (target) for one object. */
export function objectView(id) {
  const obj = OBJECTS_BY_ID[id]
  const [x, y, z] = currentPosition(id)
  if (obj.scene_mode === 'deep_space') {
    // Stop on the line from Earth to the object, so the stars behind it are its real constellation.
    const k = 1 - DEEP_VIEW_DISTANCE / Math.hypot(x, y, z)
    return { position: [x * k, y * k, z * k], target: [x, y, z] }
  }
  const d = displayRadius(obj) * 4 + 2
  const flat = Math.hypot(x, z)
  const [dx, dz] = flat > 0 ? [x / flat, z / flat] : [0, -1]
  // Sit on the Sun-facing side, a little above the orbit plane, so the lit half is in view.
  return { position: [x - dx * d * 0.85, y + d * 0.45, z - dz * d * 0.85], target: [x, y, z] }
}

/** Fly-to duration grows with distance: 1.2 s for short hops, at most 3 s. */
export function flightSeconds(from, to) {
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
  return Math.min(3, Math.max(1.2, 1 + dist / 400))
}

/** Deep-space pictures grow when the camera is far away, so they stay visible in the overview. */
export function spriteSize(cameraDistance) {
  return SPRITE_SIZE * Math.max(1, cameraDistance / (DEEP_VIEW_DISTANCE * 4))
}
