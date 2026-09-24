import * as THREE from 'three'
import { createAlbertParkScenery } from './albertPark'
import { createBahrainScenery } from './bahrain'
import { createJeddahScenery } from './jeddah'
import { createShanghaiScenery } from './shanghai'
import { createRaceLighting } from './raceLighting'
import type { Replay } from './replay'
import { canPlaceStructure, createProjection, createRibbonGeometry } from './circuitGeometry'
import { box, createCar, createGrandstand, createLabel, createMergedMesh, createPaddock } from './sceneAssets'

const TRACK_WIDTH = 3.2
const TRACK_SAMPLES = 900

function createSurfaceTexture(base: string, grain: string) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = base
    context.fillRect(0, 0, 128, 128)
    context.fillStyle = grain
    for (let index = 0; index < 3000; index++) {
      context.fillRect((index * 73.31) % 128, (index * 37.71) % 128, 1, 1)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function terrainHeight(x: number, z: number, distance: number, width: number, depth: number, isCoastal: boolean) {
  const wave = (Math.sin(x * 0.08 + Math.cos(z * 0.06)) + Math.cos(z * 0.11 - x * 0.025) + 2) / 4
  const edge = Math.max(0, Math.min(1, (width / 2 - Math.abs(x)) / 8, (depth / 2 - Math.abs(z)) / 8))
  return -0.12 + THREE.MathUtils.smoothstep(distance, 6, 18) * edge * wave * (isCoastal ? 5 : 2)
}

function addTerrain(scene: THREE.Scene, track: THREE.Vector3[], isCoastal: boolean, width: number, depth: number, isFlat = false, isDesert = false) {
  const geometry = new THREE.PlaneGeometry(width, depth, 140, 140).rotateX(-Math.PI / 2)
  const positions = geometry.getAttribute('position')
  const colors: number[] = []
  const sand = new THREE.Color(isDesert ? 0xe0c898 : isCoastal ? 0xcfc3a0 : 0x7e9671)
  const grass = new THREE.Color(isDesert ? 0xc8a878 : isCoastal ? 0x87966b : 0x54795d)
  const sparseTrack = track.filter((_, index) => index % 6 === 0)
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index)
    const z = positions.getZ(index)
    const distance = Math.min(...sparseTrack.map((point) => Math.hypot(point.x - x, point.z - z)))
    const wave = (Math.sin(x * 0.08 + Math.cos(z * 0.06)) + Math.cos(z * 0.11 - x * 0.025) + 2) / 4
    positions.setY(index, isFlat ? -0.12 : terrainHeight(x, z, distance, width, depth, isCoastal))
    const color = sand.clone().lerp(grass, THREE.MathUtils.smoothstep(wave, 0.28, 0.86))
    colors.push(color.r, color.g, color.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  const texture = createSurfaceTexture('#ffffff', '#cccccc')
  texture.repeat.set(width / 4, depth / 4)
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, map: texture, roughness: 1 }))
  ground.receiveShadow = true
  scene.add(ground)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: isDesert ? 0xcdb487 : 0x87977c, roughness: 1 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.3
  floor.receiveShadow = true
  scene.add(floor)
}

function addTrack(scene: THREE.Scene, track: THREE.Vector3[], isDesert = false) {
  const asphaltTexture = createSurfaceTexture('#616765', '#828581')
  // Desert circuits use paved run-off rather than grass verges.
  const surfaces: [number, number, number, number][] = [
    [7.5, -0.02, 0xc4b99b, 0], [4.5, 0.01, isDesert ? 0x8f918b : 0x9caa84, 0],
    [TRACK_WIDTH + 0.22, 0.04, 0xb4d5d8, 0], [TRACK_WIDTH, 0.055, 0x8a9a9f, 0],
  ]
  for (const [width, height, color, offset] of surfaces) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.96, map: width === TRACK_WIDTH ? asphaltTexture : null })
    const mesh = new THREE.Mesh(createRibbonGeometry(track, width, height, offset), material)
    mesh.receiveShadow = true
    scene.add(mesh)
  }
  const kerbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.07, 0.6), new THREE.MeshStandardMaterial({ roughness: 0.85 }), track.length * 2)
  const dummy = new THREE.Object3D()
  let count = 0
  for (let index = 0; index < track.length; index += 2) {
    const point = track[index]
    const direction = track[(index + 3) % track.length].clone().sub(track[(index - 3 + track.length) % track.length]).normalize()
    const before = point.clone().sub(track[(index - 10 + track.length) % track.length]).normalize()
    const after = track[(index + 10) % track.length].clone().sub(point).normalize()
    if (before.dot(after) > 0.985) continue
    for (const side of [-1, 1]) {
      dummy.position.copy(point).add(new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(side * 1.83))
      dummy.position.y = 0.07
      dummy.rotation.y = Math.atan2(direction.x, direction.z)
      dummy.updateMatrix()
      kerbs.setMatrixAt(count, dummy.matrix)
      kerbs.setColorAt(count++, new THREE.Color(index % 4 ? 0xcb4936 : 0xf4f0dd))
    }
  }
  kerbs.count = count
  scene.add(kerbs)
  const start = new THREE.Group()
  const tiles: THREE.BufferGeometry[][] = [[], []]
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 10; column++) tiles[(row + column) % 2].push(box([0.32, 0.02, 0.25], [(column - 4.5) * 0.32, 0.09, row * 0.25]))
  }
  tiles.forEach((parts, index) => start.add(createMergedMesh(parts, new THREE.MeshStandardMaterial({ color: index ? 0xf6f3e4 : 0x26332f }))))
  const tangent = track[1].clone().sub(track[0]).normalize()
  start.position.copy(track[0])
  start.rotation.y = Math.atan2(tangent.x, tangent.z)
  scene.add(start)
  const label = createLabel('START / FINISH')
  label.position.copy(track[0]).add(new THREE.Vector3(0, 6, 0))
  label.scale.multiplyScalar(1.3)
  scene.add(label)
}

function addStructures(scene: THREE.Scene, track: THREE.Vector3[], width: number, depth: number) {
  // Place stands beside actual straight sections, rejecting footprints near another section.
  const footprints: { center: THREE.Vector3; outward: THREE.Vector3; length: number }[] = []
  let stands = 0
  for (let index = 20; index < track.length && stands < 5; index += 90) {
    const point = track[index]
    const tangent = track[(index + 12) % track.length].clone().sub(track[(index - 12 + track.length) % track.length]).normalize()
    const outward = new THREE.Vector3(-tangent.z, 0, tangent.x)
    if (outward.dot(point) < 0) outward.negate()
    const position = point.clone().addScaledVector(outward, 10)
    if (Math.abs(position.x) > width / 2 - 14 || Math.abs(position.z) > depth / 2 - 14) continue
    const length = 15 + stands % 2 * 7
    if (!canPlaceStructure(track, position, outward, length)) continue
    const stand = stands === 0 ? createPaddock(length) : createGrandstand(length)
    stand.position.copy(position)
    stand.rotation.y = Math.atan2(outward.x, outward.z)
    scene.add(stand)
    footprints.push({ center: position, outward, length })
    stands++
  }
  return footprints
}

function addScenery(scene: THREE.Scene, track: THREE.Vector3[], isCoastal: boolean, width: number, depth: number) {
  const dummy = new THREE.Object3D()
  const footprints = addStructures(scene, track, width, depth)
  const amount = isCoastal ? 340 : 760
  const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 1 }), amount)
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 2, 5), new THREE.MeshStandardMaterial({ color: 0x6c6451, roughness: 1 }), amount)
  const shadows = new THREE.InstancedMesh(new THREE.CircleGeometry(1.8, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x344d37, transparent: true, opacity: 0.13, depthWrite: false }), amount)
  const sparseTrack = track.filter((_, index) => index % 6 === 0)
  let count = 0
  for (let attempt = 0; attempt < amount * 8 && count < amount; attempt++) {
    const x = (Math.sin(attempt * 127.1 + 7) * 43758.5453 % 1) * (width / 2 - 4)
    const z = (Math.sin(attempt * 311.7 + 11) * 19873.234 % 1) * (depth / 2 - 4)
    const distance = Math.min(...sparseTrack.map((point) => Math.hypot(point.x - x, point.z - z)))
    if (distance < 7 || distance > 60) continue
    const point = new THREE.Vector3(x, 0, z)
    if (footprints.some(({ center, outward, length }) => !canPlaceStructure([point], center, outward, length))) continue
    const elevation = terrainHeight(x, z, distance, width + 360, depth + 360, isCoastal)
    const size = 0.7 + (attempt % 11) / 10
    const height = isCoastal ? 0.65 : 2.7
    dummy.position.set(x, elevation + height * size, z)
    dummy.scale.set(size * 1.3, size * height * 0.65, size * 1.2)
    dummy.rotation.set(0, attempt, 0)
    dummy.updateMatrix()
    trees.setMatrixAt(count, dummy.matrix)
    trees.setColorAt(count, new THREE.Color([0x58734d, 0x6f8155, 0x3c624e, 0x899264][attempt % 4]))
    dummy.scale.set(size, size, size)
    dummy.position.y = elevation + size * 0.6
    dummy.updateMatrix()
    trunks.setMatrixAt(count, dummy.matrix)
    dummy.position.y = elevation + 0.05
    dummy.updateMatrix()
    shadows.setMatrixAt(count++, dummy.matrix)
  }
  trees.count = trunks.count = shadows.count = count
  trees.castShadow = !isCoastal
  scene.add(trees, shadows)
  if (!isCoastal) scene.add(trunks)
  else { trunks.geometry.dispose(); (trunks.material as THREE.Material).dispose() }
}

function addOutskirts(scene: THREE.Scene, track: THREE.Vector3[], isCoastal: boolean, width: number, depth: number) {
  const count = 1800
  const groves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 1 }), count)
  const sparseTrack = track.filter((_, index) => index % 8 === 0)
  const dummy = new THREE.Object3D()
  let placed = 0
  for (let index = 0; index < count * 2 && placed < count; index++) {
    const x = Math.sin(index * 117.3) * Math.cos(index * 61.9) * width / 2
    const z = Math.sin(index * 73.1 + 3) * Math.cos(index * 27.7) * depth / 2
    const distance = Math.min(...sparseTrack.map((point) => Math.hypot(point.x - x, point.z - z)))
    if (distance < 22) continue
    const height = (isCoastal ? 1.1 : 3.5) + index % 5 * 0.5
    dummy.position.set(x, terrainHeight(x, z, distance, width, depth, isCoastal) + height * 0.55, z)
    dummy.scale.set(2 + index % 3, height, 2 + index % 3)
    dummy.rotation.y = index
    dummy.updateMatrix()
    groves.setMatrixAt(placed, dummy.matrix)
    groves.setColorAt(placed++, new THREE.Color([0x47684e, 0x5d7857, 0x395b46][index % 3]))
  }
  groves.count = placed
  scene.add(groves)
}

export function buildCircuit(replay: Replay, circuit: string) {
  const project = createProjection(replay.track)
  const rawTrack = replay.track.map(([x, y]) => project(x, y))
  const track = new THREE.CatmullRomCurve3(rawTrack, true, 'centripetal').getSpacedPoints(TRACK_SAMPLES).slice(0, -1)
  const bounds = new THREE.Box3().setFromPoints(track)
  const size = bounds.getSize(new THREE.Vector3())
  const width = size.x + 38
  const depth = size.z + 38
  const isAlbertPark = circuit === 'Albert Park Circuit'
  const isBahrain = circuit === 'Bahrain International Circuit'
  const isJeddah = circuit === 'Jeddah Corniche Circuit'
  const isShanghai = circuit === 'Shanghai International Circuit'
  const hasCustomScenery = isAlbertPark || isBahrain || isJeddah || isShanghai
  const isCoastal = circuit.includes('Zandvoort')
  const scene = new THREE.Scene()
  const updateLighting = createRaceLighting(scene, replay)
  updateLighting(0, false)
  addTerrain(scene, track, isCoastal, width + 360, depth + 360, hasCustomScenery, isBahrain || isJeddah)
  if (!hasCustomScenery) addOutskirts(scene, track, isCoastal, width + 360, depth + 360)
  addTrack(scene, track, isBahrain || isJeddah)
  if (isAlbertPark) scene.add(createAlbertParkScenery(track))
  else if (isBahrain) scene.add(createBahrainScenery(track))
  else if (isJeddah) scene.add(createJeddahScenery(track))
  else if (isShanghai) scene.add(createShanghaiScenery(track))
  else addScenery(scene, track, isCoastal, width, depth)
  const cars = new Map(replay.drivers.map((driver) => {
    const car = createCar(driver)
    car.children.forEach((part, index) => { part.castShadow = index === 0 })
    scene.add(car)
    return [driver.number, car] as const
  }))
  return { scene, cars, project, width, depth, track, updateLighting }
}
