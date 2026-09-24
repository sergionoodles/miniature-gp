import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createProjection } from './circuitGeometry'
import { CIRCUIT_PREVIEWS } from './circuitPreview'
import { createShanghaiScenery, SHANGHAI_TRACK } from './shanghai'

const project = createProjection(SHANGHAI_TRACK)
const controls = SHANGHAI_TRACK.map(([x, y]) => project(x, y))
const track = new THREE.CatmullRomCurve3(controls, true, 'centripetal').getSpacedPoints(900).slice(0, -1)

describe('Shanghai model', () => {
  it('follows the supplied clockwise map from the start line as a continuous loop', () => {
    expect(SHANGHAI_TRACK[0]).toEqual([-477, -838])
    expect(track[1].x).toBeGreaterThan(track[0].x)
    expect(track[1].z).toBeLessThan(track[0].z)
    expect(Math.max(...track.map((point, index) => point.distanceTo(track[(index + 1) % track.length])))).toBeLessThan(1.5)
    const size = new THREE.Box3().setFromPoints(track).getSize(new THREE.Vector3())
    expect(size.x).toBeCloseTo(180, 0)
    expect(size.z / size.x).toBeCloseTo(0.64, 1)
  })

  it('offers the model without race telemetry and builds finite venue geometry clear of the trees', () => {
    const preview = CIRCUIT_PREVIEWS['shanghai-preview']
    expect(preview?.replay.drivers).toEqual([])
    expect(preview?.replay.track).toEqual(SHANGHAI_TRACK)
    const scene = createShanghaiScenery(track)
    expect(scene.name).toBe('Shanghai International Circuit')
    for (const name of ['Pit lane', 'Shanghai pit building and paddock', 'Pedestrian bridge', 'Shanghai grandstand', 'Infield water']) {
      expect(scene.getObjectByName(name)).toBeDefined()
    }
    const trees = scene.getObjectByName('Shanghai trees')
    if (!(trees instanceof THREE.InstancedMesh)) throw new Error('Missing trees')
    expect(trees.count).toBeGreaterThan(150)
    const grandstands = scene.children.filter((object) => object.name === 'Shanghai grandstand')
    expect(grandstands).toHaveLength(5)
    for (const stand of grandstands) {
      expect(track.every((road) => road.distanceTo(stand.position) > 5)).toBe(true)
    }
    const matrix = new THREE.Matrix4()
    for (let index = 0; index < trees.count; index++) {
      trees.getMatrixAt(index, matrix)
      const point = new THREE.Vector3().setFromMatrixPosition(matrix).setY(0)
      expect(track.every((road) => road.distanceTo(point) >= 6.49)).toBe(true)
    }
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      expect(Array.from(object.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })
  })

  it('rejects missing road geometry', () => {
    expect(() => createShanghaiScenery([])).toThrow('requires a circuit loop')
  })
})
