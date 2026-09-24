import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { BAHRAIN_TRACK, createBahrainScenery } from './bahrain'
import { createProjection } from './circuitGeometry'

const project = createProjection(BAHRAIN_TRACK)
const controls = BAHRAIN_TRACK.map(([x, y]) => project(x, y))
const track = new THREE.CatmullRomCurve3(controls, true, 'centripetal').getSpacedPoints(900).slice(0, -1)

function disposeScene(scene: THREE.Group) {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => material.dispose())
  })
}

function distanceToRoad(point: THREE.Vector3) {
  return Math.min(...track.map((road) => road.distanceTo(point)))
}

function instancePositions(mesh: THREE.InstancedMesh) {
  const matrix = new THREE.Matrix4()
  return Array.from({ length: mesh.count }, (_, index) => {
    mesh.getMatrixAt(index, matrix)
    return new THREE.Vector3().setFromMatrixPosition(matrix).setY(0)
  })
}

describe('Bahrain model', () => {
  it('starts at the supplied flag and runs westbound into Turn 1 through a continuous loop', () => {
    expect(BAHRAIN_TRACK[0]).toEqual([-853, -1112])
    expect(track[1].x).toBeLessThan(track[0].x)
    const gaps = track.map((point, index) => point.distanceTo(track[(index + 1) % track.length]))
    // The lap is about 810 units, so 900 samples average 0.9 apart; any break would exceed the track width.
    expect(Math.max(...gaps)).toBeLessThan(2)
    const bounds = new THREE.Box3().setFromPoints(track).getSize(new THREE.Vector3())
    expect(bounds.x).toBeCloseTo(180, 0)
    expect(bounds.z / bounds.x).toBeCloseTo(0.65, 1)
  })

  it('runs clockwise as seen from above', () => {
    const signedArea = track.reduce((sum, point, index) => {
      const next = track[(index + 1) % track.length]
      return sum + point.x * next.z - next.x * point.z
    }, 0)
    // With x east and z south, a positive shoelace sum is clockwise on the map.
    expect(signedArea).toBeGreaterThan(0)
  })

  it('builds finite geometry without browser globals and keeps the infield lawn off the road', () => {
    const scene = createBahrainScenery(track)
    expect(scene.name).toBe('Bahrain International Circuit')
    const lawn = scene.getObjectByName('Infield lawn')
    if (!(lawn instanceof THREE.Mesh)) throw new Error('Missing infield lawn')
    const ray = new THREE.Raycaster()
    scene.updateMatrixWorld(true)
    for (const point of track) {
      ray.set(point.clone().setY(10), new THREE.Vector3(0, -1, 0))
      expect(ray.intersectObject(lawn)).toHaveLength(0)
    }
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const positions = object.geometry.getAttribute('position')
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true)
    })
    const bounds = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3())
    expect(bounds.x).toBeLessThan(240)
    expect(bounds.z).toBeLessThan(170)
    expect(bounds.y).toBeLessThan(10)
    disposeScene(scene)
  })

  it('keeps palms and desert shrubs away from the racing surface', () => {
    const scene = createBahrainScenery(track)
    const palms = scene.getObjectByName('Palm trees')
    const shrubs = scene.getObjectByName('Desert shrubs')
    if (!(palms instanceof THREE.InstancedMesh) || !(shrubs instanceof THREE.InstancedMesh)) throw new Error('Missing desert planting')
    expect(palms.count).toBeGreaterThan(20)
    expect(shrubs.count).toBeGreaterThan(250)
    for (const point of instancePositions(palms)) expect(distanceToRoad(point)).toBeGreaterThanOrEqual(5.99)
    for (const point of instancePositions(shrubs)) expect(distanceToRoad(point)).toBeGreaterThanOrEqual(6.99)
    disposeScene(scene)
  })

  it('rejects a missing circuit instead of scattering scenery over an unknown road', () => {
    expect(() => createBahrainScenery([])).toThrow('requires a circuit loop')
  })
})
