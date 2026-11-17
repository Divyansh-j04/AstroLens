import * as THREE from 'three'

const ORIGIN = new THREE.Vector3()

// Nebulae and star clusters switch between their photo (far away) and a 3D version (close up).
const NEAR = 60 // camera distance where the 3D version is fully shown
const FAR = 150 // ...and where only the photo is shown

/** 1 when the camera is close (3D version), 0 when far (photo). */
export function nearness(distance) {
  return 1 - THREE.MathUtils.smoothstep(distance, NEAR, FAR)
}

/**
 * How much an object is "in focus", easing towards 1 when it is the selected object and 0 otherwise
 * (about half a second), so only the selected nebula or cluster turns 3D: nearby objects such as
 * the Orion and Horsehead nebulae (3 degrees apart) do not pile up as overlapping 3D clouds.
 */
export function stepFocus(current, selected, dt) {
  const target = selected ? 1 : 0
  return current + (target - current) * Math.min(1, dt * 4)
}

/**
 * 1 when the camera looks at a nebula from the front (from Earth's side, like the photo was taken),
 * falling to 0 at about 30 degrees off that line. Head-on the sharp photo is shown; as the camera
 * orbits away, the 3D particle cloud takes over.
 */
export function headOn(objectPosition, cameraPosition, sunPosition = ORIGIN) {
  const toCamera = new THREE.Vector3().subVectors(cameraPosition, objectPosition).normalize()
  const toEarth = new THREE.Vector3().subVectors(sunPosition, objectPosition).normalize()
  return THREE.MathUtils.smoothstep(toCamera.dot(toEarth), 0.86, 0.985)
}

export const isCluster = (obj) => obj.group === 'star_cluster'
export const isNebula = (obj) => obj.group === 'nebula'
