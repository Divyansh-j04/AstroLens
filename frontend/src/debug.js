// Development-only handle on the scene, read by frontend/scripts/check-phase1.mjs
// to prove every fly-to lands in the right place. Not included in production builds.
import { useStore } from './store'
import { OBJECTS } from './objects'
import { POSITIONS, HOME_VIEWS, equatorialToScene, objectView } from './scene/scale'
import { fade } from './scene/fade'

export const debug = {}

if (import.meta.env.DEV) {
  Object.assign(debug, { store: useStore, objects: OBJECTS, positions: POSITIONS, homeViews: HOME_VIEWS, objectView, equatorialToScene, fade })
  window.astrolens = debug
}
