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
const RAIN_OPACITY = 0.3
// Caps the step after a stalled frame or background tab so drops do not jump.
const MAX_FRAME_SECONDS = 0.1

// `density` scales the number of drops, so lighter graphics settings can thin the rain.
export function createRain(width: number, depth: number, density = 1) {
  const random = createRandom('rain')
  const dropCount = Math.min(MAX_DROPS, Math.ceil(width * depth * DROPS_PER_SQUARE_UNIT * density))
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

const SPLASH_POOL = 700
const SPLASHES_PER_SECOND = 900
const SPLASH_SECONDS = 0.4
const SPLASH_SPREAD = 5
// Lifted so the camera-facing ripple sprites do not clip into the tilted ground below them.
const SPLASH_HEIGHT = 0.45
const SPLASH_SIZE = 0.9
const SPLASH_OPACITY = 0.45

const splashVertexShader = /* glsl */ `
  attribute float age;
  uniform float pixelsPerUnit;
  varying float vAge;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = ${SPLASH_SIZE.toFixed(2)} * ( 0.3 + age ) * projectionMatrix[1][1] * pixelsPerUnit;
    vAge = age;
  }`
const splashFragmentShader = /* glsl */ `
  uniform float opacity;
  varying float vAge;
  void main() {
    float radius = length( gl_PointCoord - 0.5 ) * 2.0;
    float ring = smoothstep( 0.55, 0.8, radius ) * ( 1.0 - smoothstep( 0.8, 1.0, radius ) );
    gl_FragColor = vec4( vec3( 0.85, 0.9, 0.95 ), ring * ( 1.0 - vAge ) * opacity * step( vAge, 0.999 ) );
  }`

// Expanding ripples where drops hit the racing surface and the verges beside it.
export function createRainSplashes(track: THREE.Vector3[]) {
  const random = createRandom('splashes')
  const positions = new Float32Array(SPLASH_POOL * 3)
  const ages = new Float32Array(SPLASH_POOL).fill(1)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('age', new THREE.BufferAttribute(ages, 1).setUsage(THREE.DynamicDrawUsage))
  const uniforms = { pixelsPerUnit: { value: 1 }, opacity: { value: 0 } }
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: splashVertexShader, fragmentShader: splashFragmentShader, transparent: true, depthWrite: false })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.visible = false
  const bufferSize = new THREE.Vector2()
  points.onBeforeRender = (renderer) => { uniforms.pixelsPerUnit.value = renderer.getDrawingBufferSize(bufferSize).y / 2 }
  let next = 0
  let debt = 0
  const update = (intensity: number, deltaSeconds: number) => {
    const step = THREE.MathUtils.clamp(deltaSeconds, 0, MAX_FRAME_SECONDS)
    points.visible = intensity > 0.01
    if (!points.visible) return
    uniforms.opacity.value = Math.sqrt(intensity) * SPLASH_OPACITY
    debt += SPLASHES_PER_SECOND * intensity * step
    for (; debt >= 1; debt--) {
      const center = track[Math.floor(random() * track.length)]
      positions.set([center.x + (random() - 0.5) * SPLASH_SPREAD, SPLASH_HEIGHT, center.z + (random() - 0.5) * SPLASH_SPREAD], next * 3)
      ages[next] = 0
      next = (next + 1) % SPLASH_POOL
    }
    for (let index = 0; index < SPLASH_POOL; index++) ages[index] = Math.min(1, ages[index] + step / SPLASH_SECONDS)
    geometry.getAttribute('position').needsUpdate = true
    geometry.getAttribute('age').needsUpdate = true
  }
  return { points, update }
}
