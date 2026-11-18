// Development-only handle on the scene, read by frontend/scripts/check-phase1.mjs
// to prove every fly-to lands in the right place. Not included in production builds.
import { useStore } from './store'
import { OBJECTS } from './objects'
import { POSITIONS, HOME_VIEWS, TRUE_POSITIONS, currentPosition, equatorialToScene, objectView } from './scene/scale'
import { layout } from './scene/layout'
import { fade } from './scene/fade'
import { warp } from './scene/warp'
import { view } from './scene/universe'

export const debug = {}

if (import.meta.env.DEV) {
  Object.assign(debug, { store: useStore, objects: OBJECTS, positions: POSITIONS, truePositions: TRUE_POSITIONS, currentPosition, layout, homeViews: HOME_VIEWS, objectView, equatorialToScene, fade, warp, view })
  window.astrolens = debug
}
