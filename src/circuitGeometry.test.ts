import { describe, expect, it } from 'vitest'
import { CIRCUIT_MARGIN, circuitViewExtent, createProjection, createRibbonGeometry, createUnprojection, interpolateStartPose, roadSideRoom, startingGridLocations, startStraightViewYaw } from './circuitGeometry'
import { Vector3 } from 'three'

const UP = new Vector3(0, 1, 0)

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
  it('maps scene positions back to telemetry coordinates', () => {
    const points: [number, number][] = [[10, 20], [110, 220]]
    const [x, y] = createUnprojection(points)(createProjection(points)(37, 151))
    expect(x).toBeCloseTo(37)
    expect(y).toBeCloseTo(151)
  })
})

describe('road side room', () => {
  // A long hairpin loop whose two straights run 3 apart, closer than a road width.
  const straight = Array.from({ length: 100 }, (_, index) => new Vector3(index, 0, 0))
  const loop = [...straight, ...straight.map((point) => point.clone().setZ(3)).reverse()]
  const flat = loop.map(() => 0)

  it('splits the gap to a neighbouring pass on the side facing it', () => {
    const [left, right] = roadSideRoom(loop, flat)[50]
    expect(Math.min(left, right)).toBeCloseTo(1.5)
    expect(Math.max(left, right)).toBeGreaterThan(10)
  })
  it('ignores a pass running at another level', () => {
    const bridged = loop.map((_, index) => index >= 100 ? 1.8 : 0)
    expect(Math.min(...roadSideRoom(loop, bridged)[50])).toBeGreaterThan(10)
  })
  it('keeps two ribbons within their room from overlapping', () => {
    const room = roadSideRoom(loop, flat)
    const positions = createRibbonGeometry(loop, 3.2, 0, 0, true, room).getAttribute('position')
    // Vertices of the first straight (z = 0) must stay below the midline at z = 1.5.
    for (let vertex = 20; vertex < 180; vertex++) expect(positions.getZ(vertex)).toBeLessThanOrEqual(1.5 + 1e-6)
  })
})

it('raises the road with the elevation of each point', () => {
  const geometry = createRibbonGeometry([new Vector3(0, 0, 0), new Vector3(10, 2, 0), new Vector3(20, 0, 0)], 2, 0.1, 0, false)
  expect(geometry.getAttribute('position').getY(2)).toBeCloseTo(2.1)
  expect(geometry.getAttribute('position').getY(0)).toBeCloseTo(0.1)
  geometry.dispose()
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

it('leaves an open road unjoined between its ends', () => {
  const geometry = createRibbonGeometry([new Vector3(0, 0, 0), new Vector3(10, 0, 0), new Vector3(10, 0, 10)], 2, 0.1, 0, false)
  const positions = geometry.getAttribute('position')
  expect(positions.count).toBe(6)
  expect(geometry.index?.count).toBe(12)
  expect([positions.getX(0), positions.getZ(0), positions.getX(1), positions.getZ(1)]).toEqual([0, -1, 0, 1])
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

describe('default circuit view', () => {
  // A 100 by 20 oval; the lap starts at index 0, reached from the last point.
  const oval = [new Vector3(-50, 0, 10), new Vector3(-50, 0, -10), new Vector3(50, 0, -10), new Vector3(50, 0, 10)]
  const turnedOval = (yaw: number) => oval.map((point) => point.clone().applyAxisAngle(UP, yaw))

  it('keeps a start straight that already runs across the screen', () => {
    expect(startStraightViewYaw(oval)).toBeCloseTo(0)
    expect(circuitViewExtent(oval, 0)).toEqual({ width: 100 + CIRCUIT_MARGIN, depth: 20 + CIRCUIT_MARGIN })
  })

  it('turns the camera so a start straight running into the screen lies across it', () => {
    const track = turnedOval(Math.PI / 2)
    const yaw = startStraightViewYaw(track)
    const forward = track[0].clone().sub(track[track.length - 1]).applyAxisAngle(UP, -yaw)
    expect(forward.z).toBeCloseTo(0)
    const extent = circuitViewExtent(track, yaw)
    expect(extent.width).toBeCloseTo(100 + CIRCUIT_MARGIN)
    expect(extent.depth).toBeCloseTo(20 + CIRCUIT_MARGIN)
  })

  it('takes the smaller of the two turns that lay the straight across', () => {
    expect(startStraightViewYaw(turnedOval(Math.PI * 0.8))).toBeCloseTo(Math.PI * -0.2)
    expect(startStraightViewYaw(turnedOval(Math.PI * 0.1))).toBeCloseTo(Math.PI * 0.1)
  })
})
