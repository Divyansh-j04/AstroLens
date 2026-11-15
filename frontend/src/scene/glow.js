import * as THREE from 'three'

let cached = null

/**
 * A soft round white-to-black spot, drawn once on a canvas.
 * Used as the Sun's glow and as the round mask that hides the square edges of nebula pictures.
 */
export function glowTexture() {
  if (cached) return cached
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.55, '#bbbbbb')
  g.addColorStop(1, '#000000')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  cached = new THREE.CanvasTexture(canvas)
  return cached
}
