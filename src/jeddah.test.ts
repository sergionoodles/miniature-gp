import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createProjection } from './circuitGeometry'
import { JEDDAH_TRACK, createJeddahScenery } from './jeddah'

const project = createProjection(JEDDAH_TRACK)
const controls = JEDDAH_TRACK.map(([x, y]) => project(x, y))
const track = new THREE.CatmullRomCurve3(controls, true, 'centripetal').getSpacedPoints(900).slice(0, -1)

describe('Jeddah model', () => {
  it('starts at the flag, enters the opening chicane, and closes the coastal loop', () => {
    expect(JEDDAH_TRACK[0]).toEqual([-293, -1590])
    expect(track[1].x).toBeLessThan(track[0].x)
    expect(track[1].z).toBeGreaterThan(track[0].z)
    const gaps = track.map((point, index) => point.distanceTo(track[(index + 1) % track.length]))
    expect(Math.max(...gaps)).toBeLessThan(2)
    const size = new THREE.Box3().setFromPoints(track).getSize(new THREE.Vector3())
    expect(size.x).toBeCloseTo(180, 0)
    expect(size.z / size.x).toBeCloseTo(0.58, 1)
  })

  it('keeps the sea and palm trees clear of the road', () => {
    const scene = createJeddahScenery(track)
    const sea = scene.getObjectByName('Red Sea')
    const palms = scene.getObjectByName('Corniche palms')
    const barriers = scene.getObjectByName('Street circuit barriers')
    if (!(sea instanceof THREE.Mesh) || !(palms instanceof THREE.InstancedMesh) || !(barriers instanceof THREE.InstancedMesh)) throw new Error('Missing coastal scenery')
    scene.updateMatrixWorld(true)
    const ray = new THREE.Raycaster()
    for (const point of track) {
      ray.set(point.clone().setY(30), new THREE.Vector3(0, -1, 0))
      expect(ray.intersectObject(sea)).toHaveLength(0)
    }
    expect(palms.count).toBeGreaterThan(15)
    expect(barriers.count).toBeGreaterThan(300)
    const matrix = new THREE.Matrix4()
    for (let index = 0; index < palms.count; index++) {
      palms.getMatrixAt(index, matrix)
      const point = new THREE.Vector3().setFromMatrixPosition(matrix).setY(0)
      expect(Math.min(...track.map((road) => road.distanceTo(point)))).toBeGreaterThanOrEqual(5)
    }
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      expect(Array.from(object.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })
  })

  it('requires a loop before placing scenery', () => {
    expect(() => createJeddahScenery([])).toThrow('requires a circuit loop')
  })
})
