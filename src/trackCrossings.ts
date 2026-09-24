import * as THREE from 'three'
import { GROUND_LEVEL } from './terrainField'

export const BRIDGE_HEIGHT = 1.8
// The deck is only as wide as the asphalt and its edge lines: at Suzuka the back straight runs
// within a verge's width of the Degner section, so a wider deck would cover that section's asphalt.
const DECK_HALF_WIDTH = 1.71
// Along-track distance from the crossing that stays at full height, so the deck clears the whole lower road.
const BRIDGE_PLATEAU = 8
const BRIDGE_RAMP = 34
const DECK_THICKNESS = 0.35
const PARAPET_HEIGHT = 0.4
// How many samples of the lower road around the crossing are checked to open the span above it.
const UNDERPASS_WINDOW = 40
const UNDERPASS_MARGIN = 0.6
// Telemetry drifts off the centreline, and a car only follows a raised pass when heading along it.
const ON_TRACK_DISTANCE = 4
const ALIGNED_HEADING = 0.8

// Sample indices where the two passes of a figure-eight cross.
export type TrackCrossing = { over: number; under: number }

function orientation(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
}

function segmentsCross(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
  return orientation(a, b, c) * orientation(a, b, d) < 0 && orientation(c, d, a) * orientation(c, d, b) < 0
}

// The pass driven later in the lap goes over: at Suzuka, the only figure-eight on the calendar,
// the back straight after Spoon bridges the Degner-to-hairpin section. A figure-eight crosses
// once; more crossings mean a corrupt outline that bridges would only make worse.
export function findTrackCrossings(track: THREE.Vector3[]): TrackCrossing[] {
  const crossings: TrackCrossing[] = []
  for (let first = 0; first < track.length; first++) {
    for (let second = first + 2; second < track.length; second++) {
      if (first === 0 && second === track.length - 1) continue
      if (segmentsCross(track[first], track[first + 1], track[second], track[(second + 1) % track.length])) crossings.push({ over: second, under: first })
    }
  }
  return crossings.length === 1 ? crossings : []
}

function lapDistances(track: THREE.Vector3[]) {
  const distances = [0]
  for (let index = 1; index <= track.length; index++) distances.push(distances[index - 1] + track[index % track.length].distanceTo(track[index - 1]))
  return distances
}

export function trackElevations(track: THREE.Vector3[], crossings: TrackCrossing[]) {
  const distances = lapDistances(track)
  const lap = distances[track.length]
  return track.map((_, index) => Math.max(0, ...crossings.map(({ over }) => {
    const gap = Math.abs(distances[index] - distances[over])
    return BRIDGE_HEIGHT * (1 - THREE.MathUtils.smoothstep(Math.min(gap, lap - gap), BRIDGE_PLATEAU, BRIDGE_PLATEAU + BRIDGE_RAMP))
  })))
}

function tangentAt(track: THREE.Vector3[], index: number) {
  return track[(index + 1) % track.length].clone().sub(track[(index - 1 + track.length) % track.length]).setY(0).normalize()
}

export function createTrackHeightLookup(track: THREE.Vector3[], elevations: number[]) {
  const raised = track.flatMap((point, index) => elevations[index] > 0 ? [{ point, tangent: tangentAt(track, index), height: elevations[index] }] : [])
  return (position: THREE.Vector3, forward: THREE.Vector3) => {
    let nearest = { distance: ON_TRACK_DISTANCE, height: 0 }
    for (const { point, tangent, height } of raised) {
      if (tangent.x * forward.x + tangent.z * forward.z < ALIGNED_HEADING) continue
      const distance = Math.hypot(point.x - position.x, point.z - position.z)
      if (distance < nearest.distance) nearest = { distance, height }
    }
    return nearest.height
  }
}

function distanceToUnderpass(track: THREE.Vector3[], under: number, point: THREE.Vector3) {
  let nearest = Infinity
  for (let step = -UNDERPASS_WINDOW; step <= UNDERPASS_WINDOW; step++) {
    const sample = track[(under + step + track.length) % track.length]
    nearest = Math.min(nearest, Math.hypot(sample.x - point.x, sample.z - point.z))
  }
  return nearest
}

function raisedRange(elevations: number[], center: number) {
  const indices = [center]
  for (let index = center - 1; elevations[(index + elevations.length) % elevations.length] > 0 && indices.length < elevations.length; index--) indices.unshift((index + elevations.length) % elevations.length)
  for (let index = center + 1; elevations[index % elevations.length] > 0 && indices.length < elevations.length; index++) indices.push(index % elevations.length)
  return indices
}

// Side walls of each raised pass: embankment walls with a parapet on the ramps, and only the deck
// edge over the lower road so it stays visible underneath.
export function createBridgeWallGeometry(track: THREE.Vector3[], elevations: number[], crossings: TrackCrossing[]) {
  const positions: number[] = []
  const indices: number[] = []
  for (const { over, under } of crossings) {
    const range = raisedRange(elevations, over)
    for (const side of [-1, 1]) {
      range.forEach((index, step) => {
        const tangent = tangentAt(track, index)
        const edge = track[index].clone().addScaledVector(new THREE.Vector3(-tangent.z, 0, tangent.x), side * DECK_HALF_WIDTH)
        const isOverRoad = distanceToUnderpass(track, under, edge) < DECK_HALF_WIDTH + UNDERPASS_MARGIN
        const top = elevations[index] + PARAPET_HEIGHT
        const bottom = isOverRoad ? elevations[index] - DECK_THICKNESS : GROUND_LEVEL
        const vertex = positions.length / 3
        positions.push(edge.x, bottom, edge.z, edge.x, top, edge.z)
        if (step) indices.push(vertex - 2, vertex, vertex - 1, vertex - 1, vertex, vertex + 1)
      })
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
