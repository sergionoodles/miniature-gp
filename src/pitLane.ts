import * as THREE from 'three'
import type { LocationSample, PitEvent, Replay } from './replay'

// A continuous run of one car's telemetry around a pit stop, in scene coordinates.
export type PitPass = THREE.Vector3[]
// centerline is the lane measured from telemetry; path is the drawn lane, pushed clear of the
// track. Both share their vertex count, so a spot on one maps straight onto the other. side is
// +1 when the lane runs along the track's sideways direction (-z, x of its travel), -1 opposite it.
export type PitLane = { centerline: THREE.Vector3[]; path: THREE.Vector3[]; side: number }
type PolylineHit = { distance: number; segment: number; fraction: number; point: THREE.Vector3 }

// Pit events are stamped near the pit exit; the lane duration reaches back to the entry. Some
// exits run on well past the timing line (Interlagos), so the window reaches further after it.
const UNKNOWN_LANE_SECONDS = 45
const ENTRY_MARGIN = 15
const EXIT_MARGIN = 30
// Racing telemetry stays within a few hundredths of the recorded lap; pit lanes run at least half a unit off it.
const OFF_TRACK_DISTANCE = 0.45
const MAX_SAMPLE_GAP = 3
// Telemetry units are about a decimetre and cars top out near 1000 a second; faster moves are GPS glitches.
const MAX_TELEMETRY_SPEED = 1500
const MIN_PASSES = 3
const MIN_LANE_LENGTH = 10
const LANE_STEP = 0.5
// Telemetry from other pit stops within this distance of the lane refines its line.
const CONSENSUS_REACH = 1.5
const MIN_CONSENSUS = 3
const SMOOTHING_PASSES = 6
export const PIT_LANE_WIDTH = 1.8
// The drawn track is several times wider than to scale, which would bury a real pit lane under
// its asphalt. The lane moves out until its inner edge clears the start gantry's legs.
export const PIT_LANE_OFFSET = 3.5
// Distance over which the entry and exit fan out from the track to the full offset.
const RAMP_LENGTH = 16
// Telemetry leaves the racing line a few samples into the lane, so its ends stop beside the track.
// Each end runs on along the track this far per unit of sideways gap, easing onto its centreline.
const JOIN_LENGTH_PER_OFFSET = 5
const MIN_JOIN_LENGTH = 4
const ON_CENTERLINE = 0.05
// A pitting car this close to the measured lane follows it; further away it is still on track.
const SNAP_DISTANCE = 1.5

function nearestOnPolyline(points: THREE.Vector3[], target: THREE.Vector3, isClosed: boolean): PolylineHit {
  let best = { distance: Infinity, segment: 0, fraction: 0, x: points[0].x, z: points[0].z }
  const segments = isClosed ? points.length : points.length - 1
  for (let segment = 0; segment < segments; segment++) {
    const start = points[segment]
    const end = points[(segment + 1) % points.length]
    const directionX = end.x - start.x
    const directionZ = end.z - start.z
    const lengthSquared = directionX * directionX + directionZ * directionZ
    const fraction = lengthSquared ? THREE.MathUtils.clamp(((target.x - start.x) * directionX + (target.z - start.z) * directionZ) / lengthSquared, 0, 1) : 0
    const x = start.x + directionX * fraction
    const z = start.z + directionZ * fraction
    const distance = Math.hypot(target.x - x, target.z - z)
    if (distance < best.distance) best = { distance, segment, fraction, x, z }
  }
  return { distance: best.distance, segment: best.segment, fraction: best.fraction, point: new THREE.Vector3(best.x, 0, best.z) }
}

export function distanceToTrack(track: THREE.Vector3[], point: THREE.Vector3) {
  return nearestOnPolyline(track, point, true).distance
}

function cumulativeLengths(points: THREE.Vector3[]) {
  const lengths = [0]
  for (let index = 1; index < points.length; index++) lengths.push(lengths[index - 1] + points[index].distanceTo(points[index - 1]))
  return lengths
}

function pathLength(points: THREE.Vector3[]) {
  return cumulativeLengths(points)[points.length - 1] ?? 0
}

function resample(points: THREE.Vector3[], step: number) {
  const lengths = cumulativeLengths(points)
  const total = lengths[lengths.length - 1]
  const count = Math.max(1, Math.round(total / step))
  let segment = 0
  return Array.from({ length: count + 1 }, (_, index) => {
    const distance = total * index / count
    while (segment < points.length - 2 && lengths[segment + 1] < distance) segment++
    const span = lengths[segment + 1] - lengths[segment]
    return points[segment].clone().lerp(points[segment + 1], span ? (distance - lengths[segment]) / span : 0)
  })
}

// Relaxes each vertex toward its neighbours; the ends stay put where they meet the track.
function smooth(points: THREE.Vector3[], passes: number) {
  let current = points
  for (let pass = 0; pass < passes; pass++) {
    current = current.map((point, index) => index === 0 || index === current.length - 1 ? point
      : point.clone().multiplyScalar(2).add(current[index - 1]).add(current[index + 1]).multiplyScalar(0.25))
  }
  return current
}

function median(values: number[]) {
  const sorted = [...values].sort((first, second) => first - second)
  return sorted[Math.floor(sorted.length / 2)]
}

// Each pit stop's telemetry window, from before the lane entry to after its exit.
export function pitWindows(pits: PitEvent[]) {
  return pits.map(([exit, driver, , duration]) => ({ driver, start: exit - (duration ?? UNKNOWN_LANE_SECONDS) - ENTRY_MARGIN, end: exit + EXIT_MARGIN }))
}

// Splits each pit stop's telemetry at gaps and glitches, which would otherwise draw straight
// lines across the infield.
export function pitPasses(replay: Replay, project: (x: number, y: number) => THREE.Vector3): PitPass[] {
  return pitWindows(replay.pits).flatMap(({ driver, start, end }) => {
    const samples = (replay.locations[String(driver)] ?? []).filter(([time]) => time >= start && time <= end)
    const passes: PitPass[] = [[]]
    samples.forEach(([time, x, y], index) => {
      const [previousTime, previousX, previousY] = samples[Math.max(index - 1, 0)]
      const elapsed = time - previousTime
      if (elapsed > MAX_SAMPLE_GAP || Math.hypot(x - previousX, y - previousY) > MAX_TELEMETRY_SPEED * Math.max(elapsed, 1)) passes.push([])
      passes[passes.length - 1].push(project(x, y))
    })
    return passes
  })
}

// The longest stretch of a pass that leaves the racing line and comes back to it. A stretch the
// pass starts or ends in, like a car parked in its garage, is not a lane.
function offTrackStretch(track: THREE.Vector3[], pass: PitPass) {
  const runs: THREE.Vector3[][] = []
  let current: THREE.Vector3[] | null = null
  for (const point of pass) {
    const isOffTrack = nearestOnPolyline(track, point, true).distance > OFF_TRACK_DISTANCE
    if (isOffTrack) current?.push(point)
    else {
      if (current?.length) runs.push(current)
      current = []
    }
  }
  return runs.reduce((best, run) => pathLength(run) > pathLength(best) ? run : best, [])
}

// Nudges each vertex of a single pass sideways onto the median line of every pass around it.
function alignToConsensus(reference: THREE.Vector3[], cloud: THREE.Vector3[]) {
  return reference.map((point, index) => {
    const tangent = reference[Math.min(index + 1, reference.length - 1)].clone().sub(reference[Math.max(index - 1, 0)]).normalize()
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x)
    const offsets = cloud.flatMap((other) => {
      const offset = other.clone().sub(point)
      const across = offset.dot(normal)
      return Math.abs(offset.dot(tangent)) <= LANE_STEP && Math.abs(across) <= CONSENSUS_REACH ? [across] : []
    })
    return offsets.length >= MIN_CONSENSUS ? point.clone().addScaledVector(normal, median(offsets)) : point.clone()
  })
}

// The point and sideways direction a given distance along the closed track.
function trackFrameAt(track: THREE.Vector3[], lengths: number[], distance: number) {
  const total = lengths[track.length]
  const wrapped = ((distance % total) + total) % total
  let segment = 0
  while (segment < track.length - 1 && lengths[segment + 1] < wrapped) segment++
  const start = track[segment]
  const end = track[(segment + 1) % track.length]
  const span = lengths[segment + 1] - lengths[segment]
  const direction = end.clone().sub(start).normalize()
  return { point: start.clone().lerp(end, span ? (wrapped - lengths[segment]) / span : 0), across: new THREE.Vector3(-direction.z, 0, direction.x) }
}

// Extends both ends of the lane along the track onto its centreline, so the entry and exit branch
// off in the track's own direction and their square ends hide under its asphalt.
function joinTrack(centerline: THREE.Vector3[], track: THREE.Vector3[]) {
  const lengths = cumulativeLengths([...track, track[0]])
  const lead = (end: THREE.Vector3, direction: number) => {
    const hit = nearestOnPolyline(track, end, true)
    const along = lengths[hit.segment] + hit.fraction * (lengths[hit.segment + 1] - lengths[hit.segment])
    const offset = end.clone().sub(hit.point).dot(trackFrameAt(track, lengths, along).across)
    const length = Math.max(MIN_JOIN_LENGTH, Math.abs(offset) * JOIN_LENGTH_PER_OFFSET)
    const count = Math.ceil(length / LANE_STEP)
    return Array.from({ length: count }, (_, step) => {
      const share = (step + 1) / count
      const { point, across } = trackFrameAt(track, lengths, along + direction * length * share)
      return point.addScaledVector(across, offset * (1 - THREE.MathUtils.smoothstep(share, 0, 1)))
    })
  }
  return [...lead(centerline[0], -1).reverse(), ...centerline, ...lead(centerline[centerline.length - 1], 1)]
}

function sideOfTrack(track: THREE.Vector3[], point: THREE.Vector3) {
  const { segment } = nearestOnPolyline(track, point, true)
  const start = track[segment]
  const end = track[(segment + 1) % track.length]
  return Math.sign((end.x - start.x) * (point.z - start.z) - (end.z - start.z) * (point.x - start.x))
}

// A lane that switches sides of the track crosses it, like Yas Marina's exit tunnel, and pushing
// it clear would fold it over itself. The longest part on one side is kept.
function oneSidedPart(centerline: THREE.Vector3[], track: THREE.Vector3[]) {
  const sides = centerline.map((point) => sideOfTrack(track, point))
  const parts: THREE.Vector3[][] = [[]]
  centerline.forEach((point, index) => {
    if (index && sides[index] !== sides[index - 1]) parts.push([])
    parts[parts.length - 1].push(point)
  })
  return parts.reduce((best, part) => pathLength(part) > pathLength(best) ? part : best)
}

// Pushes the lane out to PIT_LANE_OFFSET from the track, fanning in to meet it at both ends. Right
// at the ends the lane lies on the centreline, so its side of the track sets the direction.
function clearOfTrack(centerline: THREE.Vector3[], track: THREE.Vector3[], side: number) {
  const lengths = cumulativeLengths(centerline)
  const total = lengths[lengths.length - 1]
  return centerline.map((point, index) => {
    const clearance = PIT_LANE_OFFSET * THREE.MathUtils.smoothstep(Math.min(lengths[index], total - lengths[index]), 0, RAMP_LENGTH)
    const hit = nearestOnPolyline(track, point, true)
    if (hit.distance >= clearance) return point.clone()
    const start = track[hit.segment]
    const direction = track[(hit.segment + 1) % track.length].clone().sub(start).normalize()
    const away = hit.distance > ON_CENTERLINE ? point.clone().sub(hit.point).normalize() : new THREE.Vector3(-direction.z * side, 0, direction.x * side)
    return hit.point.clone().addScaledVector(away, clearance)
  })
}

// Every pitting car drives the same lane; the pass of median length is a representative route and
// the other passes pull it onto their shared line. Stretches start once a car is off the racing
// line, so the lane's ends lie within the drawn track and its entry and exit join it seamlessly.
export function findPitLane(track: THREE.Vector3[], passes: PitPass[]): PitLane | null {
  const stretches = passes.map((pass) => offTrackStretch(track, pass)).filter((stretch) => pathLength(stretch) >= MIN_LANE_LENGTH)
  if (stretches.length < MIN_PASSES) return null
  const byLength = [...stretches].sort((first, second) => pathLength(first) - pathLength(second))
  const reference = resample(byLength[Math.floor(byLength.length / 2)], LANE_STEP)
  const cloud = stretches.flatMap((stretch) => resample(stretch, LANE_STEP / 2))
  const measured = oneSidedPart(smooth(alignToConsensus(reference, cloud), SMOOTHING_PASSES), track)
  if (pathLength(measured) < MIN_LANE_LENGTH) return null
  const centerline = smooth(joinTrack(measured, track), SMOOTHING_PASSES)
  // A second push restores the clearance that smoothing the corners of the first one gives back.
  const side = sideOfTrack(track, measured[Math.floor(measured.length / 2)])
  const path = clearOfTrack(smooth(clearOfTrack(centerline, track, side), SMOOTHING_PASSES * 2), track, side)
  return { centerline, path, side }
}

// Moves pitting cars from the measured lane onto the drawn one. The shift fades to nothing at the
// lane's ends, so cars peel off the track and rejoin it without a jump.
export function moveCarsOntoPitLane(replay: Replay, lane: PitLane, track: THREE.Vector3[], project: (x: number, y: number) => THREE.Vector3, unproject: (point: THREE.Vector3) => [number, number]) {
  const windows = pitWindows(replay.pits)
  const lastSegment = lane.centerline.length - 2
  return Object.fromEntries(Object.entries(replay.locations).map(([number, samples]) => {
    const driverWindows = windows.filter(({ driver }) => driver === Number(number))
    if (!driverWindows.length) return [number, samples]
    return [number, samples.map((sample): LocationSample => {
      const [time, x, y] = sample
      if (!driverWindows.some(({ start, end }) => time >= start && time <= end)) return sample
      const point = project(x, y)
      const hit = nearestOnPolyline(lane.centerline, point, false)
      const isAtEnd = (hit.segment === 0 && hit.fraction === 0) || (hit.segment === lastSegment && hit.fraction === 1)
      if (isAtEnd || hit.distance > SNAP_DISTANCE || hit.distance > nearestOnPolyline(track, point, true).distance) return sample
      const shift = lane.path[hit.segment].clone().sub(lane.centerline[hit.segment])
        .lerp(lane.path[hit.segment + 1].clone().sub(lane.centerline[hit.segment + 1]), hit.fraction)
      return [time, ...unproject(point.add(shift))]
    })]
  }))
}
