// The one place the page reads object data from: backend/app/data/objects.json
// (imported through the "@data" alias in vite.config.js, so there is no second copy).
import objects from '@data/objects.json'

export const OBJECTS = objects
export const OBJECTS_BY_ID = Object.fromEntries(objects.map((o) => [o.id, o]))
