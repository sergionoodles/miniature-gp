import * as THREE from 'three'
import type { GridEntry } from './replay'

const CIRCUIT_SPAN = 180
const GRID_START_OFFSET = 2
const GRID_ROW_SPACING = 3.5
const GRID_LANE_OFFSET = 0.72
export const START_TRANSITION_SECONDS = 3

export function createProjection(points: [number, number][]) {
  if (!points.length) throw new Error('Circuit requires points')
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const scale = CIRCUIT_SPAN / Math.max(maxX - minX, maxY - minY, 1)
  return (x: number, y: number, height = 0) =>
    new THREE.Vector3(((minY + maxY) / 2 - y) * scale, height, ((minX + maxX) / 2 - x) * scale)
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

export function createRibbonGeometry(points: THREE.Vector3[], width: number, height: number, offset = 0) {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  let distance = 0
  for (let index = 0; index <= points.length; index++) {
    const current = index % points.length
    const previous = points[(current - 1 + points.length) % points.length]
    const next = points[(current + 1) % points.length]
    const direction = next.clone().sub(previous).normalize()
    const across = new THREE.Vector3(-direction.z, 0, direction.x)
    const center = points[current]
    if (index) distance += center.distanceTo(points[index - 1])
    for (const side of [-1, 1]) {
      const point = center.clone().addScaledVector(across, offset + side * width / 2)
      positions.push(point.x, height, point.z)
      uvs.push(side === -1 ? 0 : 1, distance / 4)
    }
    if (index < points.length) {
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

export function canPlaceStructure(track: THREE.Vector3[], center: THREE.Vector3, outward: THREE.Vector3, length: number) {
  const tangent = new THREE.Vector3(outward.z, 0, -outward.x)
  const clearance = 4
  const halfDepth = 3.5
  return track.every((point) => {
    const offset = point.clone().sub(center)
    return Math.abs(offset.dot(tangent)) > length / 2 + clearance || Math.abs(offset.dot(outward)) > halfDepth + clearance
  })
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
