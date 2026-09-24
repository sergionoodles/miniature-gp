import * as THREE from 'three'

const PARTICLES_PER_CAR = 16
const LIFETIME_SECONDS = 0.45
const SPAWNS_PER_SECOND = 30
// Cars slower than this (units per second) throw no spray; jumps larger than the teleport
// distance are seeks or grid transitions, not motion.
const MIN_SPRAY_SPEED = 6
const TELEPORT_DISTANCE = 25
const WHEEL_OFFSETS = [new THREE.Vector3(-0.55, 0.28, -1.05), new THREE.Vector3(0.55, 0.28, -1.05)]
const START_SIZE = 0.5
const END_SIZE = 1.6
const GRAVITY = 2.5
const MAX_FRAME_SECONDS = 0.1
const MIN_WETNESS = 0.2
// Kept faint and low so a following car stays visible through the leader's spray.
const SPRAY_OPACITY = 0.3

const vertexShader = /* glsl */ `
  attribute float age;
  attribute float strength;
  uniform float pixelsPerUnit;
  varying float vAlpha;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
    float size = mix( ${START_SIZE.toFixed(2)}, ${END_SIZE.toFixed(2)}, sqrt( age ) );
    gl_PointSize = size * projectionMatrix[1][1] * pixelsPerUnit;
    vAlpha = strength * ( 1.0 - age ) * step( age, 0.999 );
  }`
const fragmentShader = /* glsl */ `
  varying float vAlpha;
  void main() {
    float falloff = 1.0 - smoothstep( 0.15, 0.5, length( gl_PointCoord - 0.5 ) );
    gl_FragColor = vec4( vec3( 0.82, 0.86, 0.9 ), falloff * vAlpha );
  }`

// Rooster tails of water behind the rear tyres, scaled by standing water on the track.
export function createCarSpray(carCount: number) {
  const count = carCount * PARTICLES_PER_CAR
  const positions = new Float32Array(count * 3)
  const ages = new Float32Array(count).fill(1)
  const strengths = new Float32Array(count)
  const velocities = new Float32Array(count * 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('age', new THREE.BufferAttribute(ages, 1).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('strength', new THREE.BufferAttribute(strengths, 1).setUsage(THREE.DynamicDrawUsage))
  const uniforms = { pixelsPerUnit: { value: 1 } }
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.visible = false
  const bufferSize = new THREE.Vector2()
  points.onBeforeRender = (renderer) => { uniforms.pixelsPerUnit.value = renderer.getDrawingBufferSize(bufferSize).y / 2 }

  const previous = new Map<THREE.Object3D, THREE.Vector3>()
  const spawnDebt = new Map<THREE.Object3D, number>()
  const nextSlot = new Map<THREE.Object3D, number>()
  const wheel = new THREE.Vector3()

  const emit = (car: THREE.Object3D, carIndex: number, amount: number, wetness: number, speed: number, forward: THREE.Vector3) => {
    for (let spawn = 0; spawn < amount; spawn++) {
      const slot = nextSlot.get(car) ?? 0
      nextSlot.set(car, (slot + 1) % PARTICLES_PER_CAR)
      const index = carIndex * PARTICLES_PER_CAR + slot
      wheel.copy(WHEEL_OFFSETS[slot % 2]).applyQuaternion(car.quaternion).add(car.position)
      positions.set([wheel.x + (Math.random() - 0.5) * 0.3, wheel.y, wheel.z + (Math.random() - 0.5) * 0.3], index * 3)
      const kick = Math.min(speed, 60) * 0.06
      velocities.set([-forward.x * kick + (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, -forward.z * kick + (Math.random() - 0.5) * 1.2], index * 3)
      ages[index] = Math.random() * 0.1
      strengths[index] = SPRAY_OPACITY * wetness
    }
  }

  const update = (cars: THREE.Object3D[], wetness: number, deltaSeconds: number) => {
    const step = THREE.MathUtils.clamp(deltaSeconds, 0, MAX_FRAME_SECONDS)
    const forward = new THREE.Vector3()
    cars.forEach((car, carIndex) => {
      const last = previous.get(car)
      const moved = last ? car.position.distanceTo(last) : 0
      previous.set(car, (last ?? new THREE.Vector3()).copy(car.position))
      if (!car.visible || wetness < MIN_WETNESS || step === 0 || moved > TELEPORT_DISTANCE) return
      const speed = moved / step
      if (speed < MIN_SPRAY_SPEED) return
      forward.set(Math.sin(car.rotation.y), 0, Math.cos(car.rotation.y))
      const debt = (spawnDebt.get(car) ?? 0) + SPAWNS_PER_SECOND * step * wetness
      const amount = Math.floor(debt)
      spawnDebt.set(car, debt - amount)
      emit(car, carIndex, amount, wetness, speed, forward)
    })
    let isActive = false
    for (let index = 0; index < count; index++) {
      if (ages[index] >= 1) continue
      isActive = true
      ages[index] = Math.min(1, ages[index] + step / LIFETIME_SECONDS)
      velocities[index * 3 + 1] -= GRAVITY * step
      for (let axis = 0; axis < 3; axis++) positions[index * 3 + axis] += velocities[index * 3 + axis] * step
    }
    points.visible = isActive
    if (!isActive) return
    geometry.getAttribute('position').needsUpdate = true
    geometry.getAttribute('age').needsUpdate = true
    geometry.getAttribute('strength').needsUpdate = true
  }
  return { points, update }
}
