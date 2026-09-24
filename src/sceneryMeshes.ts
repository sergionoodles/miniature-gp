import * as THREE from 'three'
import type { BuildingStyle, CircuitEnvironment, TreeKind } from './circuitEnvironments'
import type { BuildingPlacement, GrovePlacement, TreePlacement, YachtPlacement } from './sceneryPlan'
import { box, createMergedMesh } from './sceneAssets'
import { createRandom, SIDE_DIRECTIONS, WATER_LEVEL, type TerrainField } from './terrainField'

const FAR_WATER_SIZE = 2000
const WINDOW_COLUMNS = 4
const WINDOW_ROWS = 8

const TREE_COLORS: Record<TreeKind, number[]> = {
  broadleaf: [0x58734d, 0x6f8155, 0x3c624e, 0x899264],
  conifer: [0x2f5443, 0x3a5e45, 0x28493c, 0x46664a],
  palm: [0x6c8f4a, 0x7c9a52, 0x5a8045, 0x8aa35b],
  scrub: [0x7f8a5c, 0x8d9466, 0x6d7d55, 0x99a070],
}
const GROVE_COLORS: Record<TreeKind, number[]> = {
  broadleaf: [0x47684e, 0x5d7857, 0x395b46],
  conifer: [0x2b4d3e, 0x355a44, 0x24443a],
  palm: [0x5f804a, 0x6d8d52, 0x557642],
  scrub: [0x75815a, 0x828c62, 0x6a7652],
}
const BUILDING_COLORS: Record<BuildingStyle, number[]> = {
  towers: [0x8fa3b0, 0x6f8491, 0xb7c3c8, 0x5d6f7a],
  lowrise: [0xd8cdb8, 0xc9b79c, 0xe3dccd, 0xb8a58a],
  industrial: [0xb3b6b2, 0x9aa0a0, 0xc7c2b5, 0xa9aba2],
  stone: [0xe2d4b0, 0xd6c49b, 0xcbb892, 0xe8dcc0],
  riviera: [0xf0dcc0, 0xe8c8a8, 0xf3ead8, 0xe0b89a],
  resort: [0xf2efe6, 0xe5dfd0, 0xd0dade, 0xe9e4da],
  casino: [0xe9d6b0, 0xc9a86a, 0x8fa3b0, 0xb85c4a],
}

// Per-kind crown/trunk shapes; offsets and scales are multiples of the tree's size.
type TreeShape = { crown: THREE.BufferGeometry; crownScale: [number, number, number]; crownHeight: number; trunk?: { scale: [number, number, number]; height: number }; castsShadow: boolean }
const TREE_SHAPES: Record<TreeKind, () => TreeShape> = {
  broadleaf: () => ({ crown: new THREE.IcosahedronGeometry(1, 1), crownScale: [1.3, 1.755, 1.2], crownHeight: 2.7, trunk: { scale: [1, 1, 1], height: 0.6 }, castsShadow: true }),
  conifer: () => ({ crown: new THREE.ConeGeometry(1, 1, 7), crownScale: [0.95, 3.6, 0.95], crownHeight: 2.4, trunk: { scale: [0.8, 0.6, 0.8], height: 0.4 }, castsShadow: true }),
  palm: () => ({ crown: new THREE.IcosahedronGeometry(1, 0), crownScale: [1.3, 0.32, 1.3], crownHeight: 3.3, trunk: { scale: [0.5, 1.65, 0.5], height: 1.65 }, castsShadow: true }),
  scrub: () => ({ crown: new THREE.IcosahedronGeometry(1, 1), crownScale: [1.3, 0.42, 1.2], crownHeight: 0.65, castsShadow: false }),
}

function createInstances(geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], colors?: THREE.Color[]) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length)
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
  colors?.forEach((color, index) => mesh.setColorAt(index, color))
  return mesh
}

function composeMatrix(position: [number, number, number], scale: [number, number, number], rotation = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation), new THREE.Vector3(...scale))
}

export function addTrees(scene: THREE.Scene, trees: TreePlacement[]) {
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6c6451, roughness: 1 })
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x344d37, transparent: true, opacity: 0.13, depthWrite: false })
  const kinds = [...new Set(trees.map(({ kind }) => kind))]
  for (const kind of kinds) {
    const group = trees.filter((tree) => tree.kind === kind)
    const shape = TREE_SHAPES[kind]()
    const crowns = createInstances(shape.crown, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: kind === 'conifer' }),
      group.map(({ x, y, z, size, rotation }) => composeMatrix([x, y + shape.crownHeight * size, z], [shape.crownScale[0] * size, shape.crownScale[1] * size, shape.crownScale[2] * size], rotation)),
      group.map(({ tint }) => new THREE.Color(TREE_COLORS[kind][tint])))
    crowns.castShadow = shape.castsShadow
    scene.add(crowns)
    scene.add(createInstances(new THREE.CircleGeometry(1.8, 10).rotateX(-Math.PI / 2), shadowMaterial,
      group.map(({ x, y, z, size }) => composeMatrix([x, y + 0.05, z], [size, size, size]))))
    const { trunk } = shape
    if (!trunk) continue
    scene.add(createInstances(new THREE.CylinderGeometry(0.15, 0.22, 2, 5), trunkMaterial,
      group.map(({ x, y, z, size }) => composeMatrix([x, y + trunk.height * size, z], [trunk.scale[0] * size, trunk.scale[1] * size, trunk.scale[2] * size]))))
  }
}

export function addGroves(scene: THREE.Scene, groves: GrovePlacement[]) {
  const kinds = [...new Set(groves.map(({ kind }) => kind))]
  for (const kind of kinds) {
    const group = groves.filter((grove) => grove.kind === kind)
    const isConifer = kind === 'conifer'
    const geometry = isConifer ? new THREE.ConeGeometry(1, 1, 6) : new THREE.IcosahedronGeometry(1, 0)
    scene.add(createInstances(geometry, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: isConifer }),
      group.map(({ x, y, z, spread, height, rotation }) => composeMatrix([x, y + height * (isConifer ? 0.5 : 0.55), z], [spread, isConifer ? height * 1.6 : height, spread], rotation)),
      group.map(({ tint }) => new THREE.Color(GROVE_COLORS[kind][tint]))))
  }
}

// Deterministic facade texture: the map darkens window rows by day, the emissive map lights some of them at night.
function createWindowTextures(seed: string) {
  const size = 64
  const random = createRandom(seed)
  const facade = document.createElement('canvas')
  const lights = document.createElement('canvas')
  facade.width = facade.height = lights.width = lights.height = size
  const facadeContext = facade.getContext('2d')
  const lightsContext = lights.getContext('2d')
  if (facadeContext && lightsContext) {
    facadeContext.fillStyle = '#ffffff'
    facadeContext.fillRect(0, 0, size, size)
    lightsContext.fillStyle = '#000000'
    lightsContext.fillRect(0, 0, size, size)
    const cellWidth = size / WINDOW_COLUMNS
    const cellHeight = size / WINDOW_ROWS
    for (let column = 0; column < WINDOW_COLUMNS; column++) {
      for (let row = 0; row < WINDOW_ROWS; row++) {
        const rectangle: [number, number, number, number] = [column * cellWidth + 3, row * cellHeight + 2, cellWidth - 6, cellHeight - 4]
        facadeContext.fillStyle = '#9aa3a8'
        facadeContext.fillRect(...rectangle)
        if (random() > 0.45) {
          lightsContext.fillStyle = random() > 0.3 ? '#ffd79a' : '#cfe3ff'
          lightsContext.fillRect(...rectangle)
        }
      }
    }
  }
  return [facade, lights].map((canvas) => {
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  })
}

// Returns the window material so the caller can light it at night.
export function addBuildings(scene: THREE.Scene, buildings: BuildingPlacement[], seed: string) {
  if (!buildings.length) return null
  const [facade, lights] = createWindowTextures(`${seed}:windows`)
  const material = new THREE.MeshStandardMaterial({ roughness: 0.75, map: facade, emissive: 0xffffff, emissiveMap: lights, emissiveIntensity: 0 })
  const mesh = createInstances(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), material,
    buildings.map(({ x, y, z, width, depth, height, rotation }) => composeMatrix([x, y, z], [width, height, depth], rotation)),
    buildings.map(({ style, tint }) => new THREE.Color(BUILDING_COLORS[style][tint])))
  mesh.castShadow = true
  mesh.receiveShadow = true
  scene.add(mesh)
  return material
}

export function addWater(scene: THREE.Scene, field: TerrainField, environment: CircuitEnvironment) {
  const hasWater = field.pools.length > 0 || environment.water.features.some(({ kind }) => kind !== 'lake' && kind !== 'ponds')
  if (!hasWater) return
  const material = new THREE.MeshStandardMaterial({ color: environment.water.color, roughness: 0.18, metalness: 0.15 })
  // The terrain dips below this plane wherever the field reports water.
  const planes = [{ width: field.width, depth: field.depth, x: 0, z: 0 }]
  for (const { side, position } of field.shorelines) {
    const [directionX, directionZ] = SIDE_DIRECTIONS[side]
    const center = position + FAR_WATER_SIZE / 4
    planes.push({ width: directionX ? FAR_WATER_SIZE / 2 : FAR_WATER_SIZE, depth: directionZ ? FAR_WATER_SIZE / 2 : FAR_WATER_SIZE, x: directionX * center, z: directionZ * center })
  }
  for (const plane of planes) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(plane.width, plane.depth).rotateX(-Math.PI / 2), material)
    mesh.position.set(plane.x, WATER_LEVEL, plane.z)
    mesh.receiveShadow = true
    scene.add(mesh)
  }
}

export function addYachts(scene: THREE.Scene, yachts: YachtPlacement[]) {
  if (!yachts.length) return
  const hulls: THREE.BufferGeometry[] = []
  const decks: THREE.BufferGeometry[] = []
  for (const { x, z, rotation, size } of yachts) {
    const matrix = composeMatrix([x, WATER_LEVEL, z], [size, size, size], rotation)
    hulls.push(box([1, 0.45, 3.2], [0, 0.18, 0]).applyMatrix4(matrix))
    decks.push(box([0.75, 0.35, 1.5], [0, 0.55, -0.2]).applyMatrix4(matrix))
  }
  scene.add(createMergedMesh(hulls, new THREE.MeshStandardMaterial({ color: 0xf4f4ef, roughness: 0.4 })))
  scene.add(createMergedMesh(decks, new THREE.MeshStandardMaterial({ color: 0x3d4f5c, roughness: 0.3, metalness: 0.3 })))
}
