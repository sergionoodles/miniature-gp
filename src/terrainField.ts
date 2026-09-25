import * as THREE from 'three'
import type { CircuitEnvironment, Side, WaterFeature } from './circuitEnvironments'

export const GROUND_LEVEL = -0.12
export const WATER_LEVEL = -0.2
const WATER_BED = -0.9
// Keeps water clear of the verges, run-off and kerbs.
export const TRACK_CLEARANCE = 6
const SHORE_BLEND = 4
const TRACK_SAMPLE_STEP = 6
const LAKE_SCAN_STEP = 3
const LAKE_MAX_RADIUS = 38
const POND_ATTEMPTS_PER_POND = 40
export const PAD_BLEND = 5
// Mountains start this far beyond the track and fade out before the terrain edges.
const MOUNTAIN_GAP = 50
const MOUNTAIN_RAMP = 70
const MOUNTAIN_EDGE_FADE = 30

export const SIDE_DIRECTIONS: Record<Side, [number, number]> = { back: [0, -1], front: [0, 1], left: [-1, 0], right: [1, 0] }

// Seeded PRNG (FNV-1a hash + mulberry32) so a circuit renders identically on every load.
export function createRandom(seedText: string) {
  let seed = 2166136261
  for (let index = 0; index < seedText.length; index++) seed = Math.imul(seed ^ seedText.charCodeAt(index), 16777619)
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export type Pool = { x: number; z: number; radius: number; phase: number }
// A flat, dry foundation for a grandstand or landmark; halfLength runs across the outward direction.
export type Pad = { x: number; z: number; outwardX: number; outwardZ: number; halfLength: number; halfDepth: number; height: number }
// mountain is the share of the configured mountain height at this point (0 on the plain, ~1 on peaks).
export type TerrainSample = { distance: number; water: number; height: number; mountain: number }
export type TerrainField = {
  width: number
  depth: number
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  pools: Pool[]
  // Distance along a side's direction where open water starts, used to extend the sea past the terrain.
  shorelines: { side: Side; position: number }[]
  extentToward: (side: Side) => number
  distanceToTrack: (x: number, z: number) => number
  sample: (x: number, z: number) => TerrainSample
}

function poolAmount(pool: Pool, x: number, z: number) {
  const angle = Math.atan2(z - pool.z, x - pool.x)
  const radius = pool.radius * (1 + 0.16 * Math.sin(3 * angle + pool.phase) + 0.07 * Math.sin(5 * angle + 2 * pool.phase))
  return 1 - THREE.MathUtils.smoothstep(Math.hypot(x - pool.x, z - pool.z) - radius, -SHORE_BLEND / 2, SHORE_BLEND / 2)
}

function padWeight(pad: Pad, x: number, z: number) {
  const offsetX = x - pad.x
  const offsetZ = z - pad.z
  const along = Math.abs(offsetX * pad.outwardZ - offsetZ * pad.outwardX) - pad.halfLength
  const across = Math.abs(offsetX * pad.outwardX + offsetZ * pad.outwardZ) - pad.halfDepth
  return 1 - THREE.MathUtils.smoothstep(Math.max(along, across), 0, PAD_BLEND)
}

function mountainShare(x: number, z: number, side: Side, start: number, width: number, depth: number) {
  const [directionX, directionZ] = SIDE_DIRECTIONS[side]
  const across = x * directionX + z * directionZ
  const along = x * directionZ - z * directionX
  const halfAcross = directionX ? width / 2 : depth / 2
  const halfAlong = directionX ? depth / 2 : width / 2
  const profile = THREE.MathUtils.smoothstep(across, start + MOUNTAIN_GAP, start + MOUNTAIN_GAP + MOUNTAIN_RAMP)
    * (1 - THREE.MathUtils.smoothstep(across, halfAcross - MOUNTAIN_EDGE_FADE, halfAcross - 6))
    * (1 - THREE.MathUtils.smoothstep(Math.abs(along), halfAlong - MOUNTAIN_EDGE_FADE * 2, halfAlong - 6))
  const peaks = (Math.sin(along * 0.045 + 0.7) * 0.5 + Math.sin(along * 0.11 + across * 0.03) * 0.3 + Math.sin(across * 0.07 - along * 0.02) * 0.2 + 1) / 2
  return profile * (0.45 + 0.55 * peaks)
}

function placeLake(bounds: TerrainField['bounds'], distanceToTrack: TerrainField['distanceToTrack']): Pool | null {
  let best = { x: 0, z: 0, distance: 0 }
  for (let x = bounds.minX; x <= bounds.maxX; x += LAKE_SCAN_STEP) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += LAKE_SCAN_STEP) {
      const distance = distanceToTrack(x, z)
      if (distance > best.distance) best = { x, z, distance }
    }
  }
  const radius = Math.min(best.distance - TRACK_CLEARANCE - 5, LAKE_MAX_RADIUS)
  return radius < 5 ? null : { x: best.x, z: best.z, radius, phase: 1.3 }
}

function placePonds(count: number, bounds: TerrainField['bounds'], existing: Pool[], distanceToTrack: TerrainField['distanceToTrack'], random: () => number) {
  const ponds: Pool[] = []
  const margin = 50
  for (let attempt = 0; attempt < count * POND_ATTEMPTS_PER_POND && ponds.length < count; attempt++) {
    const x = THREE.MathUtils.lerp(bounds.minX - margin, bounds.maxX + margin, random())
    const z = THREE.MathUtils.lerp(bounds.minZ - margin, bounds.maxZ + margin, random())
    const radius = 4 + random() * 5
    const phase = random() * Math.PI * 2
    if (distanceToTrack(x, z) < radius * 1.3 + TRACK_CLEARANCE + 2) continue
    if ([...existing, ...ponds].some((pool) => Math.hypot(pool.x - x, pool.z - z) < pool.radius + radius + 6)) continue
    ponds.push({ x, z, radius, phase })
  }
  return ponds
}

function waterFeatureAmount(feature: WaterFeature, x: number, z: number, extentToward: (side: Side) => number, bounds: TerrainField['bounds']) {
  if (feature.kind === 'coast' || feature.kind === 'river') {
    const [directionX, directionZ] = SIDE_DIRECTIONS[feature.side]
    const across = x * directionX + z * directionZ
    const along = x * directionZ - z * directionX
    const shore = extentToward(feature.side) + feature.offset + Math.sin(along * 0.045 + 1) * 4
    if (feature.kind === 'coast') return THREE.MathUtils.smoothstep(across - shore, -SHORE_BLEND, SHORE_BLEND)
    const center = shore + feature.width / 2
    return 1 - THREE.MathUtils.smoothstep(Math.abs(across - center), feature.width / 2 - 2, feature.width / 2 + 2)
  }
  if (feature.kind === 'channel') {
    const wobble = Math.sin(Math.atan2(z, x) * 5) * 4
    const outside = Math.max(Math.abs(x) - Math.max(-bounds.minX, bounds.maxX), Math.abs(z) - Math.max(-bounds.minZ, bounds.maxZ)) - feature.offset - wobble
    return THREE.MathUtils.smoothstep(outside, -SHORE_BLEND, SHORE_BLEND) * (1 - THREE.MathUtils.smoothstep(outside, feature.width - SHORE_BLEND, feature.width + SHORE_BLEND))
  }
  return 0
}

// The pit lane counts as track for clearance, so water, hills and trees keep off it too.
export function createTerrainField(track: THREE.Vector3[], environment: CircuitEnvironment, width: number, depth: number, pads: Pad[] = [], pitLane: THREE.Vector3[] = []): TerrainField {
  const sparseTrack = [...track, ...pitLane].filter((_, index) => index % TRACK_SAMPLE_STEP === 0)
  const distanceToTrack = (x: number, z: number) => {
    let nearest = Infinity
    for (const point of sparseTrack) nearest = Math.min(nearest, Math.hypot(point.x - x, point.z - z))
    return nearest
  }
  const bounds = {
    minX: Math.min(...track.map((point) => point.x)), maxX: Math.max(...track.map((point) => point.x)),
    minZ: Math.min(...track.map((point) => point.z)), maxZ: Math.max(...track.map((point) => point.z)),
  }
  const extentToward = (side: Side) => ({ back: -bounds.minZ, front: bounds.maxZ, left: -bounds.minX, right: bounds.maxX })[side]
  const random = createRandom(`${environment.id}:water`)
  const pools: Pool[] = []
  for (const feature of environment.water.features) {
    if (feature.kind === 'lake') {
      const lake = placeLake(bounds, distanceToTrack)
      if (lake) pools.push(lake)
    }
    if (feature.kind === 'ponds') pools.push(...placePonds(feature.count, bounds, pools, distanceToTrack, random))
  }
  const shorelines = environment.water.features.flatMap((feature) =>
    feature.kind === 'coast' ? [{ side: feature.side, position: extentToward(feature.side) + feature.offset + SHORE_BLEND * 2 }] : [])

  const sample = (x: number, z: number): TerrainSample => {
    const distance = distanceToTrack(x, z)
    const openWater = Math.max(0, ...environment.water.features.map((feature) => waterFeatureAmount(feature, x, z, extentToward, bounds)), ...pools.map((pool) => poolAmount(pool, x, z)))
    const pad = pads.reduce<{ weight: number; height: number }>((best, candidate) => {
      const weight = padWeight(candidate, x, z)
      return weight > best.weight ? { weight, height: candidate.height } : best
    }, { weight: 0, height: GROUND_LEVEL })
    const water = openWater * THREE.MathUtils.smoothstep(distance, TRACK_CLEARANCE, TRACK_CLEARANCE + 5) * (1 - pad.weight)
    const wave = (Math.sin(x * 0.08 + Math.cos(z * 0.06)) + Math.cos(z * 0.11 - x * 0.025) + 2) / 4
    const edge = Math.max(0, Math.min(1, (width / 2 - Math.abs(x)) / 8, (depth / 2 - Math.abs(z)) / 8))
    const away = THREE.MathUtils.smoothstep(distance, 6, 18) * edge
    const rise = environment.rise
      ? THREE.MathUtils.smoothstep(x * SIDE_DIRECTIONS[environment.rise.side][0] + z * SIDE_DIRECTIONS[environment.rise.side][1], -20, 130) * environment.rise.height
      : 0
    const { mountains } = environment
    const mountain = mountains ? mountainShare(x, z, mountains.side, extentToward(mountains.side), width, depth) * away : 0
    const land = GROUND_LEVEL + away * (wave * environment.relief + rise) + mountain * (mountains?.height ?? 0)
    // The track always wins: near it a pad still keeps the ground dry but its height falls back to ground level.
    const padHeight = THREE.MathUtils.lerp(GROUND_LEVEL, pad.height, THREE.MathUtils.smoothstep(distance, TRACK_CLEARANCE, TRACK_CLEARANCE + PAD_BLEND))
    const height = THREE.MathUtils.lerp(THREE.MathUtils.lerp(land, WATER_BED, water), padHeight, pad.weight)
    return { distance, water, height, mountain: mountain * (1 - pad.weight) }
  }

  return { width, depth, bounds, pools, shorelines, extentToward, distanceToTrack, sample }
}
