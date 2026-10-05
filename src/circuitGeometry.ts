import * as THREE from 'three'
import type { GridEntry } from './replay'

const CIRCUIT_SPAN = 180
// Room around the circuit's outline, so its edge never sits on the frame.
export const CIRCUIT_MARGIN = 38
const UP = new THREE.Vector3(0, 1, 0)
const GRID_START_OFFSET = 2
const GRID_ROW_SPACING = 3.5
const GRID_LANE_OFFSET = 0.72
// Samples this close along the lap belong to the same pass of the track.
const SAME_PASS_SAMPLES = 20
// Passes further apart in height than this (a bridge over its underpass) don't crowd each other.
const SAME_LEVEL_HEIGHT = 0.5
export const START_TRANSITION_SECONDS = 3

function projectionFrame(points: [number, number][]) {
  if (!points.length) throw new Error('Circuit requires points')
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2, scale: CIRCUIT_SPAN / Math.max(maxX - minX, maxY - minY, 1) }
}

export function createProjection(points: [number, number][]) {
  const { centerX, centerY, scale } = projectionFrame(points)
  return (x: number, y: number, height = 0) => new THREE.Vector3((centerY - y) * scale, height, (centerX - x) * scale)
}

// Maps a scene position back to telemetry coordinates, the inverse of createProjection.
export function createUnprojection(points: [number, number][]) {
  const { centerX, centerY, scale } = projectionFrame(points)
  return (point: THREE.Vector3): [number, number] => [centerX - point.z / scale, centerY - point.x / scale]
}

export function startingGridLocations(track: THREE.Vector3[], grid: GridEntry[]) {
  const locations = new Map<number, { position: THREE.Vector3; rotation: number }>()
  for (const [driver, place] of grid) {
    let remaining = GRID_START_OFFSET + Math.floor((place - 1) / 2) * GRID_ROW_SPACING
    let index = 0
    while (remaining > 0) {
      const previous = (index - 1 + track.length) % track.length
      const segment = track[index].distanceTo(track[previous])
      if (remaining <= segment) {
        const forward = track[index].clone().sub(track[previous]).normalize()
        const center = track[index].clone().addScaledVector(forward, -remaining)
        center.addScaledVector(new THREE.Vector3(-forward.z, 0, forward.x), place % 2 ? -GRID_LANE_OFFSET : GRID_LANE_OFFSET)
        center.y = 0.08
        locations.set(driver, { position: center, rotation: Math.atan2(forward.x, forward.z) })
        break
      }
      remaining -= segment
      index = previous
    }
  }
  return locations
}

export function interpolateStartPose(grid: { position: THREE.Vector3; rotation: number }, telemetry: { position: THREE.Vector3; rotation: number }, time: number) {
  const fraction = THREE.MathUtils.smoothstep(time, 0, START_TRANSITION_SECONDS)
  const turn = Math.atan2(Math.sin(telemetry.rotation - grid.rotation), Math.cos(telemetry.rotation - grid.rotation))
  return {
    position: grid.position.clone().lerp(telemetry.position, fraction),
    rotation: grid.rotation + turn * fraction,
  }
}

// sideLimits caps, per point, how far the ribbon may reach on its [left, right] side.
export function createRibbonGeometry(points: THREE.Vector3[], width: number, height: number, offset = 0, isClosed = true, sideLimits?: [number, number][]) {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const segments = isClosed ? points.length : points.length - 1
  let distance = 0
  for (let index = 0; index <= segments; index++) {
    const current = index % points.length
    const previous = points[isClosed ? (current - 1 + points.length) % points.length : Math.max(0, current - 1)]
    const next = points[isClosed ? (current + 1) % points.length : Math.min(points.length - 1, current + 1)]
    const direction = next.clone().sub(previous).setY(0).normalize()
    const across = new THREE.Vector3(-direction.z, 0, direction.x)
    const center = points[current]
    if (index) distance += center.distanceTo(points[index - 1])
    for (const side of [-1, 1]) {
      const reach = Math.max(0, Math.min(width / 2, sideLimits?.[current][side === -1 ? 0 : 1] ?? Infinity))
      const point = center.clone().addScaledVector(across, offset + side * reach)
      positions.push(point.x, center.y + height, point.z)
      uvs.push(side === -1 ? 0 : 1, distance / 4)
    }
    if (index < segments) {
      const vertex = index * 2
      indices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

// Half the distance from each sample to the nearest other pass on its [left, right] side, where
// two sections of the same level run side by side. Each side of the gap belongs to one section.
export function roadSideRoom(track: THREE.Vector3[], elevations: number[]) {
  return track.map((center, index): [number, number] => {
    const direction = track[(index + 1) % track.length].clone().sub(track[(index - 1 + track.length) % track.length]).setY(0).normalize()
    const room: [number, number] = [Infinity, Infinity]
    track.forEach((other, otherIndex) => {
      const gap = Math.abs(otherIndex - index)
      if (Math.min(gap, track.length - gap) <= SAME_PASS_SAMPLES || Math.abs(elevations[otherIndex] - elevations[index]) > SAME_LEVEL_HEIGHT) return
      const offsetX = other.x - center.x
      const offsetZ = other.z - center.z
      const side = offsetX * -direction.z + offsetZ * direction.x < 0 ? 0 : 1
      room[side] = Math.min(room[side], Math.hypot(offsetX, offsetZ) / 2)
    })
    return room
  })
}

export function canPlaceStructure(track: THREE.Vector3[], center: THREE.Vector3, outward: THREE.Vector3, length: number) {
  const tangent = new THREE.Vector3(outward.z, 0, -outward.x)
  const clearance = 4
  const halfDepth = 3.5
  return track.every((point) => {
    const offset = point.clone().sub(center)
    return Math.abs(offset.dot(tangent)) > length / 2 + clearance || Math.abs(offset.dot(outward)) > halfDepth + clearance
  })
}

// The camera turn about the vertical that lays the start straight across the screen. Of the two
// turns that do, this is the smaller, so circuits already lying that way keep their view.
export function startStraightViewYaw(track: THREE.Vector3[]) {
  const forward = track[0].clone().sub(track[track.length - 1])
  if (!forward.x && !forward.z) return 0
  return Math.atan(-forward.z / forward.x)
}

// The circuit's width and depth as seen from a camera turned by yaw. The camera stays centred on
// the origin, so each extent covers the farther side twice.
export function circuitViewExtent(track: THREE.Vector3[], yaw: number) {
  const turned = track.map((point) => point.clone().applyAxisAngle(UP, -yaw))
  const reach = (axis: 'x' | 'z') => Math.max(...turned.map((point) => Math.abs(point[axis])))
  return { width: reach('x') * 2 + CIRCUIT_MARGIN, depth: reach('z') * 2 + CIRCUIT_MARGIN }
}

export function frameCircuitCameraInPlace(camera: THREE.OrthographicCamera, width: number, height: number, circuitWidth: number, circuitDepth: number, sidebar: number) {
  const aspect = width / height
  const usableAspect = (width - sidebar) / height
  const vertical = Math.max(circuitDepth * 0.49 + 22, (circuitWidth * 0.56 + 12) / usableAspect)
  camera.left = -vertical * aspect
  camera.right = vertical * aspect
  camera.top = vertical
  camera.bottom = -vertical
  // A view offset preserves the HUD's pixel clearance even when OrbitControls changes zoom.
  camera.setViewOffset(width, height, -sidebar / 2, 0, width, height)
}
