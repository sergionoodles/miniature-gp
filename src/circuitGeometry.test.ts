import { describe, expect, it } from 'vitest'
import { createProjection, createRibbonGeometry, interpolateStartPose, startingGridLocations } from './circuitGeometry'
import { Vector3 } from 'three'

describe('circuit projection', () => {
  it('preserves distances on both axes and centers the circuit', () => {
    const project = createProjection([[10, 20], [110, 220]])
    expect(project(10, 20).distanceTo(project(110, 20))).toBeCloseTo(90)
    expect(project(10, 20).distanceTo(project(10, 120))).toBeCloseTo(90)
    expect(project(60, 120).toArray()).toEqual([0, 0, 0])
  })
  it('handles a flat extent without infinite coordinates', () => {
    expect(createProjection([[5, 5], [5, 5]])(5, 5).toArray()).toEqual([0, 0, 0])
  })
  it('rejects an empty circuit', () => {
    expect(() => createProjection([])).toThrow('Circuit requires points')
  })
})

it('builds a continuous road with upward-facing normals', () => {
  const geometry = createRibbonGeometry([
    new Vector3(-10, 0, -10), new Vector3(10, 0, -10),
    new Vector3(10, 0, 10), new Vector3(-10, 0, 10),
  ], 4, 0.1)
  expect(geometry.getAttribute('position').count).toBe(10)
  expect(geometry.index?.count).toBe(24)
  expect(geometry.getAttribute('normal').getY(0)).toBeGreaterThan(0)
  geometry.dispose()
})

it('places paired grid cars on opposite sides behind the start line', () => {
  const track = [new Vector3(0, 0, 0), new Vector3(0, 0, 20), new Vector3(10, 0, 20), new Vector3(10, 0, 0)]
  const locations = startingGridLocations(track, [[1, 1], [2, 2], [3, 3]])
  expect(locations.get(1)?.position.toArray()).toEqual([2, 0.08, 0.72])
  expect(locations.get(2)?.position.toArray()).toEqual([2, 0.08, -0.72])
  expect(locations.get(3)?.position.toArray()).toEqual([5.5, 0.08, 0.72])
})

it('connects the starting grid to the first telemetry position without a jump', () => {
  const grid = { position: new Vector3(0, 0.08, 0), rotation: Math.PI - 0.1 }
  const telemetry = { position: new Vector3(12, 0.08, 0), rotation: -Math.PI + 0.1 }
  expect(interpolateStartPose(grid, telemetry, 0).position.toArray()).toEqual(grid.position.toArray())
  const middle = interpolateStartPose(grid, telemetry, 1.5)
  expect(middle.position.x).toBeCloseTo(6)
  expect(middle.rotation).toBeCloseTo(Math.PI)
  expect(interpolateStartPose(grid, telemetry, 3).position.toArray()).toEqual(telemetry.position.toArray())
})

it('keeps the whole grandstand footprint clear of the circuit', async () => {
  const { canPlaceStructure } = await import('./circuitGeometry')
  const center = new Vector3(0, 0, 0)
  const outward = new Vector3(0, 0, 1)
  expect(canPlaceStructure([new Vector3(9, 0, 0)], center, outward, 20)).toBe(false)
  expect(canPlaceStructure([new Vector3(0, 0, 5)], center, outward, 20)).toBe(false)
  expect(canPlaceStructure([new Vector3(0, 0, 10)], center, outward, 20)).toBe(true)
})

it('keeps the camera target centered in the unobscured viewport at every zoom', async () => {
  const { frameCircuitCameraInPlace } = await import('./circuitGeometry')
  const { OrthographicCamera } = await import('three')
  const camera = new OrthographicCamera()
  camera.position.set(0, 0, 100)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  frameCircuitCameraInPlace(camera, 1440, 834, 180, 110, 286)
  for (const zoom of [1, 4, 8]) {
    camera.zoom = zoom
    camera.updateProjectionMatrix()
    expect(new Vector3().project(camera).x).toBeCloseTo(286 / 1440)
  }
  frameCircuitCameraInPlace(camera, 390, 500, 180, 110, 0)
  expect(new Vector3().project(camera).x).toBeCloseTo(0)
})
