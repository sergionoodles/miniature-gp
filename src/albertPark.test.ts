import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ALBERT_PARK_TRACK, createAlbertParkScenery } from './albertPark'
import { createProjection } from './circuitGeometry'

const project = createProjection(ALBERT_PARK_TRACK)
const controls = ALBERT_PARK_TRACK.map(([x, y]) => project(x, y))
const track = new THREE.CatmullRomCurve3(controls, true, 'centripetal').getSpacedPoints(900).slice(0, -1)

function disposeScene(scene: THREE.Group) {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => material.dispose())
  })
}

describe('Albert Park model', () => {
  it('starts at the supplied flag and follows the leftward direction through a continuous loop', () => {
    expect(ALBERT_PARK_TRACK[0]).toEqual([-930, -1146])
    expect(track[1].x).toBeLessThan(track[0].x)
    const gaps = track.map((point, index) => point.distanceTo(track[(index + 1) % track.length]))
    expect(Math.max(...gaps)).toBeLessThan(1)
    const bounds = new THREE.Box3().setFromPoints(track).getSize(new THREE.Vector3())
    expect(bounds.x).toBeCloseTo(180, 0)
    expect(bounds.z / bounds.x).toBeCloseTo(0.49, 1)
  })

  it('builds finite geometry without browser globals and keeps the lake clear of the road', () => {
    const scene = createAlbertParkScenery(track)
    expect(scene.name).toBe('Albert Park')
    const lake = scene.getObjectByName('Albert Park Lake')
    expect(lake).toBeInstanceOf(THREE.Mesh)
    if (!(lake instanceof THREE.Mesh)) throw new Error('Missing lake')
    const ray = new THREE.Raycaster()
    scene.updateMatrixWorld(true)
    for (const point of track) {
      ray.set(point.clone().setY(10), new THREE.Vector3(0, -1, 0))
      expect(ray.intersectObject(lake)).toHaveLength(0)
    }
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const positions = object.geometry.getAttribute('position')
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true)
    })
    const bounds = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3())
    expect(bounds.x).toBeLessThan(230)
    expect(bounds.z).toBeLessThan(130)
    expect(bounds.y).toBeLessThan(8)
    disposeScene(scene)
  })

  it('keeps tree canopies away from the racing surface and lake', () => {
    const scene = createAlbertParkScenery(track)
    const trees = scene.getObjectByName('Park trees')
    const lake = scene.getObjectByName('Albert Park Lake')
    if (!(trees instanceof THREE.InstancedMesh) || !lake) throw new Error('Missing park scenery')
    expect(trees.count).toBeGreaterThan(400)
    scene.updateMatrixWorld(true)
    const matrix = new THREE.Matrix4()
    const ray = new THREE.Raycaster()
    for (let index = 0; index < trees.count; index++) {
      trees.getMatrixAt(index, matrix)
      const point = new THREE.Vector3().setFromMatrixPosition(matrix).setY(0)
      expect(Math.min(...track.map((road) => road.distanceTo(point)))).toBeGreaterThanOrEqual(5.99)
      ray.set(point.clone().setY(10), new THREE.Vector3(0, -1, 0))
      expect(ray.intersectObject(lake)).toHaveLength(0)
    }
    disposeScene(scene)
  })

  it('rejects a missing circuit instead of scattering trees over an unknown road', () => {
    expect(() => createAlbertParkScenery([])).toThrow('requires a circuit loop')
  })
})
