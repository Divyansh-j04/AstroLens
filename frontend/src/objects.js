// The one place the page reads object data from: backend/app/data/objects.json
// (imported through the "@data" alias in vite.config.js, so there is no second copy).
import objects from '@data/objects.json'

export const OBJECTS = objects
export const OBJECTS_BY_ID = Object.fromEntries(objects.map((o) => [o.id, o]))

const num = (x) => x.toLocaleString('en', { maximumFractionDigits: 2 })

/** One line under the arrival title, built only from objects.json fields:
 *  "Gas giant · 5.2 AU from the Sun", "Moon of Mars · 9,375 km from Mars",
 *  "Diffuse emission nebula · 1,267 light-years away". The Sun gets its type alone. */
export function subtitleFor(obj) {
  if (obj.scene_mode === 'deep_space') return `${obj.type} · ${num(obj.distance_ly)} light-years away`
  if (obj.parent) return `${obj.type} · ${num(obj.orbit_km)} km from ${OBJECTS_BY_ID[obj.parent].name}`
  if (obj.orbit_au) return `${obj.type} · ${num(obj.orbit_au)} AU from the Sun`
  return obj.type
}
