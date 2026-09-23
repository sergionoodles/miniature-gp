import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Driver } from './replay'

// Combine authored parts by material so detail does not multiply draw calls.
export function createMergedMesh(parts: THREE.BufferGeometry[], material: THREE.Material) {
  const geometry = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export function box(size: [number, number, number], position: [number, number, number]) {
  return new THREE.BoxGeometry(...size).translate(...position)
}

function hull(outline: [number, number][], depth: number, height: number) {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)))
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.055, bevelThickness: 0.04, bevelSegments: 1, steps: 1 })
  geometry.rotateX(-Math.PI / 2).translate(0, height, 0)
  // Extrusions are non-indexed; normalize before merging with the box parts.
  return geometry
}

export function createCar(driver: Driver) {
  const group = new THREE.Group()
  const paint = new THREE.MeshStandardMaterial({ color: driver.color, roughness: 0.3, metalness: 0.3 })
  const carbon = new THREE.MeshStandardMaterial({ color: 0x172126, roughness: 0.66 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111415, roughness: 0.93 })
  const body = hull([[-0.19, 1.55], [0.19, 1.55], [0.3, 0.35], [0.56, 0], [0.48, -0.8], [0.22, -1.22], [-0.22, -1.22], [-0.48, -0.8], [-0.56, 0], [-0.3, 0.35]], 0.3, 0.22)
  const engine = hull([[-0.22, -0.1], [0.22, -0.1], [0.12, -1.1], [-0.12, -1.1]], 0.22, 0.5)
  const rearWing = box([1.38, 0.08, 0.34], [0, 0.7, -1.22]).toNonIndexed()
  group.add(createMergedMesh([body, engine, rearWing], paint))
  const halo = new THREE.TorusGeometry(0.27, 0.035, 5, 12, Math.PI * 1.8).rotateX(Math.PI / 2).translate(0, 0.69, 0.15)
  group.add(createMergedMesh([
    box([1.22, 0.09, 2.3], [0, 0.17, -0.1]),
    box([1.64, 0.07, 0.38], [0, 0.21, 1.36]),
    box([1.58, 0.06, 0.18], [0, 0.3, 1.31]),
    box([0.38, 0.08, 0.5], [0, 0.57, 0.17]),
    box([0.08, 0.28, 0.08], [0, 0.56, 0.43]),
    box([0.08, 0.34, 0.34], [-0.69, 0.56, -1.22]),
    box([0.08, 0.34, 0.34], [0.69, 0.56, -1.22]), halo,
    box([1.32, 0.055, 0.13], [0, 0.3, 0.85]),
    box([1.32, 0.055, 0.13], [0, 0.3, -0.83]),
  ], carbon))
  const wheels = [-0.7, 0.7].flatMap((x) => [-0.85, 0.9].map((z) =>
    new THREE.CylinderGeometry(0.31, 0.31, 0.32, 12).rotateZ(Math.PI / 2).translate(x, 0.31, z)))
  group.add(createMergedMesh(wheels, rubber))
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf9f2d5, roughness: 0.3 }))
  helmet.position.set(0, 0.65, 0.07)
  group.add(helmet)
  group.visible = false
  return group
}

export function createGrandstand(length: number) {
  const group = new THREE.Group()
  const structure = new THREE.MeshStandardMaterial({ color: 0xdeddd2, roughness: 0.8 })
  const steel = new THREE.MeshStandardMaterial({ color: 0x53666a, metalness: 0.5, roughness: 0.5 })
  const concrete: THREE.BufferGeometry[] = []
  const supports: THREE.BufferGeometry[] = []
  for (let row = 0; row < 5; row++) concrete.push(box([length, 0.5 + row * 0.55, 1], [0, (0.5 + row * 0.55) / 2, row - 2]))
  for (let x = -length / 2 + 1; x < length / 2; x += 4) supports.push(box([0.16, 5, 0.16], [x, 2.5, 2.5]))
  supports.push(box([length + 1, 0.17, 6.5], [0, 5, 0]))
  group.add(createMergedMesh(concrete, structure), createMergedMesh(supports, steel))
  const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.32, 0.55), new THREE.MeshStandardMaterial({ roughness: 0.8 }), Math.floor(length) * 5)
  const dummy = new THREE.Object3D()
  let index = 0
  for (let row = 0; row < 5; row++) {
    for (let seat = 0; seat < Math.floor(length); seat++) {
      dummy.position.set(seat - length / 2 + 0.5, 0.7 + row * 0.55, row - 2)
      dummy.updateMatrix()
      seats.setMatrixAt(index, dummy.matrix)
      seats.setColorAt(index++, new THREE.Color((seat + row * 3) % 7 < 2 ? 0xe9dcc1 : 0x496970))
    }
  }
  group.add(seats)
  return group
}

export function createLabel(text: string, color = '#263b38') {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 80
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#faf7ef'
    context.beginPath()
    context.roundRect(4, 4, 248, 72, 12)
    context.fill()
    context.fillStyle = color
    context.font = 'bold 32px sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, 128, 42)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }))
  sprite.scale.set(8, 2.5, 1)
  sprite.renderOrder = 5
  return sprite
}

export function createPaddock(length: number) {
  const group = new THREE.Group()
  group.add(createMergedMesh([
    box([length, 2.5, 5], [0, 1.25, 0]),
    box([length + 0.7, 0.18, 6], [0, 2.6, 0]),
    box([length, 1.6, 4], [0, 3.4, 0.4]),
    box([length + 1, 0.18, 5], [0, 4.3, 0.4]),
  ], new THREE.MeshStandardMaterial({ color: 0xe5e2d7, roughness: 0.76 })))
  const facade = [box([length - 1, 1, 0.08], [0, 3.45, -1.64])]
  const trim: THREE.BufferGeometry[] = []
  for (let x = -length / 2 + 1.8; x < length / 2 - 1; x += 3.2) {
    facade.push(box([2.5, 1.8, 0.08], [x, 1, -2.54]))
    trim.push(box([2.5, 0.2, 0.14], [x, 2.04, -2.57]))
    facade.push(box([2, 0.3, 1.2], [x, 4.5, 0.6]))
  }
  group.add(createMergedMesh(facade, new THREE.MeshStandardMaterial({ color: 0x3b5155, metalness: 0.35, roughness: 0.38 })))
  group.add(createMergedMesh(trim, new THREE.MeshStandardMaterial({ color: 0xc95e3c, roughness: 0.6 })))
  return group
}
