import * as THREE from 'three'

// Star clusters switch between their photo (far away) and a 3D ball of stars (close up).
const NEAR = 60 // camera distance where the 3D stars are fully shown
const FAR = 150 // ...and where only the photo is shown

/** 1 when the camera is close to the cluster (3D stars), 0 when far (photo). */
export function clusterNearness(distance) {
  return 1 - THREE.MathUtils.smoothstep(distance, NEAR, FAR)
}

export const isCluster = (obj) => obj.group === 'star_cluster'
