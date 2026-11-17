import * as THREE from 'three'

// Colour index (B-V): hot stars are blue (low B-V), cool stars orange-red (high B-V).
const CI_STOPS = [
  [-0.4, new THREE.Color('#9bb0ff')],
  [0.0, new THREE.Color('#cad7ff')],
  [0.3, new THREE.Color('#f8f7ff')],
  [0.6, new THREE.Color('#fff4ea')],
  [1.0, new THREE.Color('#ffd2a1')],
  [1.5, new THREE.Color('#ffb56c')],
  [2.0, new THREE.Color('#ff8c50')],
]

export function ciToColor(ci, out) {
  if (ci <= CI_STOPS[0][0]) return out.copy(CI_STOPS[0][1])
  for (let i = 1; i < CI_STOPS.length; i++) {
    const [c1, col1] = CI_STOPS[i]
    if (ci <= c1) {
      const [c0, col0] = CI_STOPS[i - 1]
      return out.copy(col0).lerp(col1, (ci - c0) / (c1 - c0))
    }
  }
  return out.copy(CI_STOPS[CI_STOPS.length - 1][1])
}

