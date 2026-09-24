import * as THREE from 'three'
import type { LandmarkKind } from './circuitEnvironments'
import { box, createMergedMesh } from './sceneAssets'

// Each builder returns a group centred on its site, with local +z facing the circuit.
// Materials with emissive light are returned so the caller can switch them on at night.
type LandmarkModel = { group: THREE.Group; nightMaterials: THREE.MeshStandardMaterial[] }

const standard = (color: number, options: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...options })
const glowing = (color: number, emissive: number, options: THREE.MeshStandardMaterialParameters = {}) => standard(color, { emissive, emissiveIntensity: 0, ...options })

function model(nightMaterials: THREE.MeshStandardMaterial[], ...meshes: THREE.Object3D[]): LandmarkModel {
  const group = new THREE.Group()
  group.add(...meshes)
  return { group, nightMaterials }
}

function stadium() {
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(13, 11, 5, 36, 1, true).translate(0, 2.5, 0), standard(0xd9d8d0, { side: THREE.DoubleSide }))
  const pitch = new THREE.Mesh(new THREE.CircleGeometry(10.5, 36).rotateX(-Math.PI / 2).translate(0, 0.12, 0), standard(0x5c8a4a, { roughness: 1 }))
  const lights = glowing(0x3f5560, 0xfff1d0, { metalness: 0.4 })
  const canopy = new THREE.Mesh(new THREE.TorusGeometry(12, 0.45, 6, 36).rotateX(Math.PI / 2).translate(0, 6.2, 0), lights)
  const masts = createMergedMesh([0, 1, 2, 3].map((index) => {
    const angle = index * Math.PI / 2 + Math.PI / 4
    return box([0.5, 7, 0.5], [Math.cos(angle) * 12.5, 3.5, Math.sin(angle) * 12.5])
  }), standard(0x6e7c83, { metalness: 0.4 }))
  ;[bowl, pitch, canopy].forEach((mesh) => { mesh.castShadow = mesh !== pitch; mesh.receiveShadow = true })
  return model([lights], bowl, pitch, canopy, masts)
}

function controlTower() {
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 16, 12).translate(0, 8, 0), standard(0xe7e1d2))
  const lights = glowing(0x44606b, 0xfff0c8, { metalness: 0.4, roughness: 0.3 })
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(3, 2.2, 2.4, 12).translate(0, 17, 0), lights)
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.4, 12).translate(0, 18.9, 0), standard(0xf3efe4))
  ;[shaft, cab, roof].forEach((mesh) => { mesh.castShadow = true })
  return model([lights], shaft, cab, roof)
}

// The venue's LED skin, shown as bands of saturated colour that also light it at night.
function createScreenTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height)
    ;['#ffb347', '#ff5e62', '#c43dff', '#4b3dff', '#1fb6ff'].forEach((color, index, colors) => gradient.addColorStop(index / (colors.length - 1), color))
    context.fillStyle = gradient
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function sphere() {
  const screen = createScreenTexture()
  const lights = glowing(0xffffff, 0xffffff, { map: screen, emissiveMap: screen, roughness: 0.35, metalness: 0.1 })
  const globe = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 20).translate(0, 7.2, 0), lights)
  globe.castShadow = true
  return model([lights], globe)
}

function ferrisWheel() {
  const lights = glowing(0xe8e2d6, 0xff8f6b, { metalness: 0.3 })
  const rim = new THREE.Mesh(new THREE.TorusGeometry(6, 0.18, 6, 40).translate(0, 7.5, 0), lights)
  const spokes = createMergedMesh([
    ...Array.from({ length: 8 }, (_, index) => box([0.08, 12, 0.08], [0, 0, 0]).rotateZ(index * Math.PI / 8).translate(0, 7.5, 0)),
    box([0.35, 8, 0.35], [0, 0, 0]).rotateZ(0.2).translate(-0.8, 3.7, 0.8), box([0.35, 8, 0.35], [0, 0, 0]).rotateZ(-0.2).translate(0.8, 3.7, 0.8),
  ], standard(0xb7bec2, { metalness: 0.5 }))
  rim.castShadow = true
  return model([lights], rim, spokes)
}

function skyPark() {
  const lights = glowing(0x9fb2bd, 0xfff0cf, { metalness: 0.5, roughness: 0.25 })
  const towers = createMergedMesh([-5, 0, 5].map((x) => box([3, 22, 3.4], [x, 11, 0])), lights)
  const deck = createMergedMesh([box([17, 1, 3.6], [0.5, 22.5, 0]), box([2.5, 0.6, 3.6], [9.8, 22.4, 0])], standard(0xe8ebe8))
  return model([lights], towers, deck)
}

function flameTowers() {
  const lights = glowing(0x5f7f95, 0xff7a2e, { metalness: 0.5, roughness: 0.25 })
  const towers = createMergedMesh([[-3, 0, 17], [3, 0, 15], [0, -3.5, 20]].map(([x, z, height]) =>
    new THREE.CylinderGeometry(0.4, 2.4, height, 10).translate(x, height / 2, z)), lights)
  return model([lights], towers)
}

function palace() {
  const walls = createMergedMesh([box([18, 3.2, 3.5], [0, 1.6, -3]), box([3.5, 3.2, 7], [-7.2, 1.6, 1.8]), box([3.5, 3.2, 7], [7.2, 1.6, 1.8]), box([4, 4.2, 4], [0, 2.1, -3])], standard(0xefe0bf))
  const roofs = createMergedMesh([box([18.4, 0.5, 3.9], [0, 3.45, -3]), box([3.9, 0.5, 7.4], [-7.2, 3.45, 1.8]), box([3.9, 0.5, 7.4], [7.2, 3.45, 1.8]), box([4.4, 0.5, 4.4], [0, 4.45, -3])], standard(0x7d6f63))
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(10, 8).rotateX(-Math.PI / 2).translate(0, 0.1, 3), standard(0x6f9a5a, { roughness: 1 }))
  return model([], walls, roofs, lawn)
}

function exhibitionHalls() {
  const halls = createMergedMesh([-9, -3, 3, 9].map((x) => box([5, 3.5, 20], [x, 1.75, 0])), standard(0xd6dadb, { metalness: 0.2 }))
  const lights = glowing(0x55727c, 0xffe7bf, { metalness: 0.4 })
  const atrium = createMergedMesh([box([24, 1.2, 3], [0, 4, 11])], lights)
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(26, 6).rotateX(-Math.PI / 2).translate(0, 0.08, 12), standard(0xbcb6aa, { roughness: 1 }))
  return model([lights], halls, atrium, plaza)
}

function hangars() {
  const roofs = createMergedMesh([-6, 0, 6].map((x) => new THREE.CylinderGeometry(2.5, 2.5, 8, 14, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).translate(x, 0, 0)), standard(0x9ba3a0, { metalness: 0.4 }))
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(20, 16).rotateX(-Math.PI / 2).translate(0, 0.06, 2), standard(0xc5c3b8, { roughness: 1 }))
  return model([], roofs, apron)
}

function parking() {
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(18, 12).rotateX(-Math.PI / 2).translate(0, 0.07, 0), standard(0x5c605f, { roughness: 1 }))
  const lines = createMergedMesh(Array.from({ length: 10 }, (_, index) => box([0.12, 0.02, 4], [-8 + index * 1.8, 0.09, -3.4]))
    .concat(Array.from({ length: 10 }, (_, index) => box([0.12, 0.02, 4], [-8 + index * 1.8, 0.09, 3.4]))), standard(0xe9e7dc))
  lot.receiveShadow = true
  return model([], lot, lines)
}

function themePark() {
  const lights = glowing(0xc2372c, 0xff5a3c, { roughness: 0.4, metalness: 0.2 })
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(8, 11.5, 2.6, 3, 1).translate(0, 1.3, 0), lights)
  const tower = new THREE.Mesh(new THREE.ConeGeometry(1.4, 7, 10).translate(0, 5.5, 0), standard(0xd9d4ca))
  ;[roof, tower].forEach((mesh) => { mesh.castShadow = true })
  return model([lights], roof, tower)
}

function cityWalls() {
  const stone = standard(0xd8c79e, { roughness: 0.95 })
  const walls = [[0, -9, 18, 1], [0, 9, 18, 1], [-9, 0, 1, 18], [9, 0, 1, 18]].map(([x, z, width, depth]) => box([width, 2.4, depth], [x, 1.2, z]))
  const towers = [[-9, -9], [9, -9], [-9, 9], [9, 9], [0, -9]].map(([x, z]) => box([2, 3.4, 2], [x, 1.7, z]))
  return model([], createMergedMesh([...walls, ...towers], stone))
}

const BUILDERS: Record<Exclude<LandmarkKind, 'yachts'>, () => LandmarkModel> = {
  stadium, controlTower, sphere, ferrisWheel, skyPark, flameTowers, palace, exhibitionHalls, hangars, parking, themePark, cityWalls,
}

export function createLandmark(kind: Exclude<LandmarkKind, 'yachts'>) {
  return BUILDERS[kind]()
}
