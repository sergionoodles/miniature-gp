import * as THREE from 'three'
import { createRandom } from './terrainField'

// Density is per square unit of ground so large terrains keep the same rain as small ones.
const DROPS_PER_SQUARE_UNIT = 0.13
const MAX_DROPS = 40000
const RAIN_HEIGHT = 70
const FALL_SPEED = 55
const STREAK_LENGTH = 1.6
// Without wind data the rain falls at a fixed, slight slant so streaks read as motion.
const DRIFT = new THREE.Vector3(0.18, -1, 0.08).normalize()
const RAIN_OPACITY = 0.42
// Caps the step after a stalled frame or background tab so drops do not jump.
const MAX_FRAME_SECONDS = 0.1

export function createRain(width: number, depth: number) {
  const random = createRandom('rain')
  const dropCount = Math.min(MAX_DROPS, Math.ceil(width * depth * DROPS_PER_SQUARE_UNIT))
  const drops = Array.from({ length: dropCount }, () => new THREE.Vector3((random() - 0.5) * width, random() * RAIN_HEIGHT, (random() - 0.5) * depth))
  const positions = new Float32Array(dropCount * 6)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  const material = new THREE.LineBasicMaterial({ color: 0xd4e2ea, transparent: true, opacity: 0, depthWrite: false, fog: false })
  const streaks = new THREE.LineSegments(geometry, material)
  streaks.frustumCulled = false
  streaks.visible = false
  const step = new THREE.Vector3()
  const update = (intensity: number, deltaSeconds: number) => {
    streaks.visible = intensity > 0.01
    if (!streaks.visible) return
    const count = Math.ceil(dropCount * intensity)
    material.opacity = RAIN_OPACITY * Math.sqrt(intensity)
    step.copy(DRIFT).multiplyScalar(FALL_SPEED * THREE.MathUtils.clamp(deltaSeconds, 0, MAX_FRAME_SECONDS))
    for (let index = 0; index < count; index++) {
      const drop = drops[index].add(step)
      if (drop.y < 0) drop.set((random() - 0.5) * width, RAIN_HEIGHT, (random() - 0.5) * depth)
      const offset = index * 6
      positions[offset] = drop.x
      positions[offset + 1] = drop.y
      positions[offset + 2] = drop.z
      positions[offset + 3] = drop.x - DRIFT.x * STREAK_LENGTH
      positions[offset + 4] = drop.y - DRIFT.y * STREAK_LENGTH
      positions[offset + 5] = drop.z - DRIFT.z * STREAK_LENGTH
    }
    geometry.setDrawRange(0, count * 2)
    geometry.getAttribute('position').needsUpdate = true
  }
  return { streaks, update }
}
