import * as THREE from 'three'
import type { BuildingStyle, CircuitEnvironment, LandmarkKind, Side, TreeKind } from './circuitEnvironments'
import { canPlaceStructure } from './circuitGeometry'
import { distanceToTrack, PIT_LANE_OFFSET, PIT_LANE_WIDTH, type PitLane } from './pitLane'
import { runsWhere, TRACK_WIDTH } from './trackside'
import { createRandom, createTerrainField, GROUND_LEVEL, PAD_BLEND, SIDE_DIRECTIONS, TRACK_CLEARANCE, type Pad, type TerrainField } from './terrainField'

export type StandFootprint = { center: THREE.Vector3; outward: THREE.Vector3; length: number }
export type TreePlacement = { kind: TreeKind; x: number; y: number; z: number; size: number; rotation: number; tint: number }
export type GrovePlacement = { kind: TreeKind; x: number; y: number; z: number; spread: number; height: number; rotation: number; tint: number }
export type BuildingPlacement = { style: BuildingStyle; x: number; y: number; z: number; width: number; depth: number; height: number; rotation: number; tint: number }
export type LandmarkPlacement = { kind: LandmarkKind; x: number; y: number; z: number; rotation: number }
export type YachtPlacement = { x: number; z: number; rotation: number; size: number }

const TREE_ATTEMPTS_PER_TREE = 8
const BASE_TREE_COUNT = 760
const TREE_TRACK_DISTANCE: [number, number] = [7, 60]
const BASE_GROVE_COUNT = 1800
const GROVE_TRACK_DISTANCE = 22
const BUILDING_ATTEMPTS_PER_BUILDING = 12
const SIDE_SECTOR_COSINE = 0.45
const SITE_SCAN_STEP = 4
const YACHT_COUNT = 22
const YACHT_SPACING = 5
const DRY_LAND = 0.01
// Share of the mountain height above which trees and buildings stop.
const TREE_LINE = 0.3
const BUILDING_LINE = 0.15
const MAX_STANDS = 5
const STAND_SPACING = 90
const STAND_OFFSET = 10
// Grandstand and paddock models reach about 3.3 units either side of their centre line.
const STAND_HALF_DEPTH = 4
const PAD_MARGIN = 1
const PADDOCK_LENGTHS = [24, 18, 12]
// The pit building reaches this far either side of its centre line; its garages face the lane
// across a narrow apron.
const PADDOCK_HALF_DEPTH = 2.6
const PADDOCK_APRON = 0.8
const PADDOCK_SETBACK = PIT_LANE_WIDTH / 2 + PADDOCK_APRON + PADDOCK_HALF_DEPTH
const PADDOCK_MARGIN = 0.4
const SEPARATED_TOLERANCE = 0.25
const TANGENT_WINDOW = 6
// Keeps a landmark's whole pad, including its blend, clear of the track's flat strip.
const SITE_TRACK_GAP = TRACK_CLEARANCE + PAD_BLEND + PAD_MARGIN

export const LANDMARK_RADIUS: Record<LandmarkKind, number> = {
  stadium: 14, controlTower: 4, sphere: 9, yachts: 0, ferrisWheel: 7, skyPark: 9, flameTowers: 7,
  palace: 11, exhibitionHalls: 15, hangars: 10, parking: 10, themePark: 12, cityWalls: 11,
}

const BUILDING_FOOTPRINT: Record<BuildingStyle, [number, number]> = {
  towers: [2.5, 6], lowrise: [2, 5], industrial: [5, 10], stone: [2, 4], riviera: [2.5, 5], resort: [4, 8], casino: [4, 9],
}

export type Occupancy = {
  isBlocked: (x: number, z: number, radius: number) => boolean
  reserveInPlace: (x: number, z: number, radius: number) => void
}

// Tracks grandstand rectangles plus circles already claimed by landmarks and buildings.
export function createOccupancy(stands: StandFootprint[]): Occupancy {
  const circles: { x: number; z: number; radius: number }[] = []
  return {
    isBlocked: (x, z, radius) => {
      const point = new THREE.Vector3(x, 0, z)
      return stands.some(({ center, outward, length }) => !canPlaceStructure([point], center, outward, length + radius * 2) || center.distanceTo(point) < radius + 7.5)
        || circles.some((circle) => Math.hypot(circle.x - x, circle.z - z) < circle.radius + radius)
    },
    reserveInPlace: (x, z, radius) => { circles.push({ x, z, radius }) },
  }
}

function isTowardSide(x: number, z: number, side: Side | 'around') {
  if (side === 'around') return true
  const length = Math.hypot(x, z) || 1
  const [directionX, directionZ] = SIDE_DIRECTIONS[side]
  return (x * directionX + z * directionZ) / length > SIDE_SECTOR_COSINE
}

const footprintSamples = (field: TerrainField, x: number, z: number, radius: number) =>
  [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]].map(([offsetX, offsetZ]) => field.sample(x + offsetX, z + offsetZ))

function isDryFootprint(field: TerrainField, x: number, z: number, radius: number) {
  return footprintSamples(field, x, z, radius).every(({ water }) => water < DRY_LAND)
}

function isOutsideFootprint(points: THREE.Vector3[], center: THREE.Vector3, outward: THREE.Vector3, halfLength: number, halfDepth: number) {
  const tangent = new THREE.Vector3(outward.z, 0, -outward.x)
  return points.every((point) => {
    const offset = point.clone().sub(center)
    return Math.abs(offset.dot(tangent)) > halfLength || Math.abs(offset.dot(outward)) > halfDepth
  })
}

// The pit building stands behind the middle of the lane's longest stretch at full offset, facing
// it, in the longest length that stays clear of the lane and every section of track.
export function planPaddock(track: THREE.Vector3[], { path, side }: PitLane): StandFootprint | null {
  const runs = runsWhere(path.length, (index) => distanceToTrack(track, path[index]) >= PIT_LANE_OFFSET - SEPARATED_TOLERANCE, 1)
  if (!runs.length) return null
  const run = runs.reduce((best, candidate) => candidate.length > best.length ? candidate : best)
  const middle = run[Math.floor(run.length / 2)]
  const tangent = path[Math.min(middle + TANGENT_WINDOW, path.length - 1)].clone().sub(path[Math.max(middle - TANGENT_WINDOW, 0)]).normalize()
  const outward = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(side)
  const center = path[middle].clone().addScaledVector(outward, PADDOCK_SETBACK)
  const length = PADDOCK_LENGTHS.find((candidate) =>
    isOutsideFootprint(track, center, outward, candidate / 2 + TRACK_WIDTH / 2, PADDOCK_HALF_DEPTH + TRACK_WIDTH / 2 + PADDOCK_MARGIN)
    && isOutsideFootprint(path, center, outward, candidate / 2, PADDOCK_HALF_DEPTH + PIT_LANE_WIDTH / 2 + PADDOCK_MARGIN))
  return length ? { center, outward, length } : null
}

// Place stands beside actual straight sections, rejecting footprints near another section or the
// pit lane. The paddock comes first: behind the pit lane when there is one, otherwise near the start.
export function planStands(track: THREE.Vector3[], width: number, depth: number, pitLane: PitLane | null = null) {
  const paddock = pitLane ? planPaddock(track, pitLane) : null
  const stands: StandFootprint[] = paddock ? [paddock] : []
  const obstacles = [...track, ...(pitLane?.path ?? [])]
  for (let index = 20; index < track.length && stands.length < MAX_STANDS; index += STAND_SPACING) {
    const point = track[index]
    const tangent = track[(index + 12) % track.length].clone().sub(track[(index - 12 + track.length) % track.length]).normalize()
    const outward = new THREE.Vector3(-tangent.z, 0, tangent.x)
    if (outward.dot(point) < 0) outward.negate()
    const center = point.clone().addScaledVector(outward, STAND_OFFSET)
    if (Math.abs(center.x) > width / 2 - 14 || Math.abs(center.z) > depth / 2 - 14) continue
    const length = 15 + stands.length % 2 * 7
    const isApart = stands.every((other) => other.center.distanceTo(center) > (other.length + length) / 2 + STAND_HALF_DEPTH)
    if (isApart && canPlaceStructure(obstacles, center, outward, length)) stands.push({ center, outward, length })
  }
  return stands
}

const standPad = ({ center, outward, length }: StandFootprint): Pad => ({
  x: center.x, z: center.z, outwardX: outward.x, outwardZ: outward.z, halfLength: length / 2 + PAD_MARGIN, halfDepth: STAND_HALF_DEPTH, height: GROUND_LEVEL,
})

const landmarkPad = ({ kind, x, y, z }: LandmarkPlacement): Pad => ({
  x, z, outwardX: 0, outwardZ: 1, halfLength: LANDMARK_RADIUS[kind] + PAD_MARGIN, halfDepth: LANDMARK_RADIUS[kind] + PAD_MARGIN, height: y,
})

// Scans outward from the circuit for the closest open, dry site so landmarks sit beside the track.
export function findOpenSite(field: TerrainField, radius: number, occupancy: Occupancy, side?: Side) {
  const { minX, maxX, minZ, maxZ } = field.bounds
  const margin = radius + 40
  let best: { x: number; z: number; distance: number } | null = null
  for (let x = minX - margin; x <= maxX + margin; x += SITE_SCAN_STEP) {
    for (let z = minZ - margin; z <= maxZ + margin; z += SITE_SCAN_STEP) {
      const distance = field.distanceToTrack(x, z)
      if (distance < radius + SITE_TRACK_GAP || (best && distance >= best.distance)) continue
      if (side && !isTowardSide(x, z, side)) continue
      if (occupancy.isBlocked(x, z, radius) || !isDryFootprint(field, x, z, radius)) continue
      best = { x, z, distance }
    }
  }
  return best
}

export function planLandmarks(field: TerrainField, environment: CircuitEnvironment, occupancy: Occupancy) {
  const landmarks: LandmarkPlacement[] = []
  for (const { kind, side } of environment.landmarks) {
    if (kind === 'yachts') continue
    const radius = LANDMARK_RADIUS[kind]
    const site = findOpenSite(field, radius, occupancy, side)
    if (!site) continue
    occupancy.reserveInPlace(site.x, site.z, radius)
    // Face the track: rotate so local +z points back toward the circuit centre.
    landmarks.push({ kind, x: site.x, y: field.sample(site.x, site.z).height, z: site.z, rotation: Math.atan2(-site.x, -site.z) })
  }
  return landmarks
}

export function planYachts(field: TerrainField, environment: CircuitEnvironment) {
  if (!environment.landmarks.some(({ kind }) => kind === 'yachts')) return []
  const { minX, maxX, minZ, maxZ } = field.bounds
  const candidates: { x: number; z: number; distance: number }[] = []
  for (let x = minX - 60; x <= maxX + 60; x += 3) {
    for (let z = minZ - 60; z <= maxZ + 60; z += 3) {
      const { distance, water } = field.sample(x, z)
      if (water > 0.99 && distance > 14 && distance < 50) candidates.push({ x, z, distance })
    }
  }
  candidates.sort((first, second) => first.distance - second.distance || first.x - second.x || first.z - second.z)
  const random = createRandom(`${environment.id}:yachts`)
  const yachts: YachtPlacement[] = []
  for (const candidate of candidates) {
    if (yachts.length >= YACHT_COUNT) break
    if (yachts.some((yacht) => Math.hypot(yacht.x - candidate.x, yacht.z - candidate.z) < YACHT_SPACING)) continue
    yachts.push({ x: candidate.x, z: candidate.z, rotation: random() * Math.PI, size: 0.8 + random() * 0.7 })
  }
  return yachts
}

export function planBuildings(field: TerrainField, environment: CircuitEnvironment, occupancy: Occupancy) {
  const random = createRandom(`${environment.id}:buildings`)
  const buildings: BuildingPlacement[] = []
  const halfWidth = field.width / 2 - 10
  const halfDepth = field.depth / 2 - 10
  for (const skyline of environment.skylines) {
    const [minSize, maxSize] = BUILDING_FOOTPRINT[skyline.style]
    let placed = 0
    for (let attempt = 0; attempt < skyline.count * BUILDING_ATTEMPTS_PER_BUILDING && placed < skyline.count; attempt++) {
      const x = (random() * 2 - 1) * halfWidth
      const z = (random() * 2 - 1) * halfDepth
      const width = THREE.MathUtils.lerp(minSize, maxSize, random())
      const depth = THREE.MathUtils.lerp(minSize, maxSize, random())
      // Squaring the roll keeps most buildings low with a few tall ones.
      const height = THREE.MathUtils.lerp(skyline.height[0], skyline.height[1], random() ** 2)
      const rotation = random() * Math.PI
      const tint = Math.floor(random() * 4)
      const radius = Math.hypot(width, depth) / 2
      if (!isTowardSide(x, z, skyline.side)) continue
      const { distance, water, mountain } = field.sample(x, z)
      if (distance < skyline.distance[0] + radius || distance > skyline.distance[1] || water > DRY_LAND || mountain > BUILDING_LINE) continue
      if (occupancy.isBlocked(x, z, radius)) continue
      const footprint = footprintSamples(field, x, z, radius)
      if (footprint.some((sample) => sample.water >= DRY_LAND)) continue
      occupancy.reserveInPlace(x, z, radius)
      // Sink the base to the lowest corner so buildings on slopes never float.
      buildings.push({ style: skyline.style, x, y: Math.min(...footprint.map((sample) => sample.height)) - 0.3, z, width, depth, height, rotation, tint })
      placed++
    }
  }
  return buildings
}

export function planTrees(field: TerrainField, environment: CircuitEnvironment, occupancy: Occupancy, innerWidth: number, innerDepth: number) {
  const random = createRandom(`${environment.id}:trees`)
  const amount = Math.round(BASE_TREE_COUNT * environment.trees.density)
  const trees: TreePlacement[] = []
  for (let attempt = 0; attempt < amount * TREE_ATTEMPTS_PER_TREE && trees.length < amount; attempt++) {
    const x = (random() * 2 - 1) * (innerWidth / 2 - 4)
    const z = (random() * 2 - 1) * (innerDepth / 2 - 4)
    const size = 0.7 + random()
    const rotation = random() * Math.PI * 2
    const tint = Math.floor(random() * 4)
    const kind = environment.trees.kinds[Math.floor(random() * environment.trees.kinds.length)]
    const { distance, water, height, mountain } = field.sample(x, z)
    if (distance < TREE_TRACK_DISTANCE[0] || distance > TREE_TRACK_DISTANCE[1] || water > DRY_LAND || mountain > TREE_LINE) continue
    if (occupancy.isBlocked(x, z, 0.8)) continue
    trees.push({ kind, x, y: height, z, size, rotation, tint })
  }
  return trees
}

export function planGroves(field: TerrainField, environment: CircuitEnvironment, occupancy: Occupancy) {
  const random = createRandom(`${environment.id}:groves`)
  const amount = Math.round(BASE_GROVE_COUNT * environment.outskirts.density)
  const groves: GrovePlacement[] = []
  for (let attempt = 0; attempt < amount * 2 && groves.length < amount; attempt++) {
    const x = (random() * 2 - 1) * field.width / 2
    const z = (random() * 2 - 1) * field.depth / 2
    const spread = 2 + random() * 2
    const height = environment.outskirts.height + random() * 2
    const rotation = random() * Math.PI * 2
    const tint = Math.floor(random() * 3)
    const kind = environment.trees.kinds[Math.floor(random() * environment.trees.kinds.length)]
    const { distance, water, height: ground, mountain } = field.sample(x, z)
    if (distance < GROVE_TRACK_DISTANCE || water > DRY_LAND || mountain > TREE_LINE || occupancy.isBlocked(x, z, spread)) continue
    groves.push({ kind, x, y: ground, z, spread, height, rotation, tint })
  }
  return groves
}

// Structures are placed first and the terrain is then flattened and dried under them,
// so grandstands never stand in water and flat landmarks never clip into slopes.
export function planScenery(track: THREE.Vector3[], environment: CircuitEnvironment, width: number, depth: number, terrainWidth: number, terrainDepth: number, pitLane: PitLane | null = null) {
  const stands = planStands(track, width, depth, pitLane)
  const standPads = stands.map(standPad)
  const occupancy = createOccupancy(stands)
  const lanePath = pitLane?.path ?? []
  const landmarks = planLandmarks(createTerrainField(track, environment, terrainWidth, terrainDepth, standPads, lanePath), environment, occupancy)
  const field = createTerrainField(track, environment, terrainWidth, terrainDepth, [...standPads, ...landmarks.map(landmarkPad)], lanePath)
  return {
    field,
    stands,
    landmarks,
    buildings: planBuildings(field, environment, occupancy),
    trees: planTrees(field, environment, occupancy, width, depth),
    groves: planGroves(field, environment, occupancy),
    yachts: planYachts(field, environment),
  }
}
