import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createRandom } from './terrainField'

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

const STAND_ROWS = 5
const ROW_RISE = 0.55
const CROWD_SHARE = 0.78
const NEUTRAL_SHIRTS = [0xf2f2ee, 0x1d2229, 0x2d4a7a, 0xd6392f, 0xf2c230, 0x8a8f96]
const STAND_SEAT_COLORS = [0x3f6f86, 0x8b2f36, 0x3b4c5e, 0x2f6b52]

function placeInstances(mesh: THREE.InstancedMesh, entries: { position: THREE.Vector3; color: THREE.Color }[]) {
  const dummy = new THREE.Object3D()
  entries.forEach(({ position, color }, index) => {
    dummy.position.copy(position)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
    mesh.setColorAt(index, color)
  })
  mesh.count = entries.length
  return mesh
}

// Local +z points away from the track; row 0 is the lowest, nearest the fence. A cantilevered
// canopy shades the upper rows and leaves the crowd in the front rows visible from above.
export function createGrandstand(length: number, teamColors: string[], seed: string, isDetailed: boolean) {
  const random = createRandom(`${seed}:crowd`)
  const group = new THREE.Group()
  const structure = new THREE.MeshStandardMaterial({ color: 0xdcdbd2, roughness: 0.85 })
  const steel = new THREE.MeshStandardMaterial({ color: 0x5a676c, metalness: 0.6, roughness: 0.4 })
  const canopy = new THREE.MeshStandardMaterial({ color: 0xf1f2ef, roughness: 0.55 })
  const concrete: THREE.BufferGeometry[] = []
  for (let row = 0; row < STAND_ROWS; row++) concrete.push(box([length, 0.5 + row * ROW_RISE, 1], [0, (0.5 + row * ROW_RISE) / 2, row - 2]))
  concrete.push(box([length, 3.4, 0.4], [0, 1.7, 2.7]), box([length + 0.3, 0.6, 0.25], [0, 0.3, -2.6]))
  const supports: THREE.BufferGeometry[] = []
  for (let x = -length / 2 + 1; x < length / 2; x += 4) supports.push(box([0.14, 4.9, 0.14], [x, 2.45, 2.8]), box([0.1, 0.1, 2.4], [x, 4.8, 1.75]))
  group.add(createMergedMesh(concrete, structure), createMergedMesh(supports, steel))
  const roof = createMergedMesh([new THREE.BoxGeometry(length + 0.8, 0.12, 2.6).rotateX(-0.12).translate(0, 4.9, 1.75)], canopy)
  group.add(roof)
  const seatColor = new THREE.Color(STAND_SEAT_COLORS[Math.floor(random() * STAND_SEAT_COLORS.length)])
  const shirts = [...teamColors.map((color) => new THREE.Color(color)), ...NEUTRAL_SHIRTS.map((color) => new THREE.Color(color))]
  const seats: { position: THREE.Vector3; color: THREE.Color }[] = []
  const crowd: { position: THREE.Vector3; color: THREE.Color }[] = []
  const heads: { position: THREE.Vector3; color: THREE.Color }[] = []
  const seatCount = Math.floor(length / 0.55)
  for (let row = 0; row < STAND_ROWS; row++) {
    for (let seat = 0; seat < seatCount; seat++) {
      const position = new THREE.Vector3((seat + 0.5) * 0.55 - length / 2, 0.52 + row * ROW_RISE, row - 2.15)
      seats.push({ position, color: seatColor })
      if (random() > CROWD_SHARE) continue
      crowd.push({ position: position.clone().add(new THREE.Vector3(0, 0.2, 0.05)), color: shirts[Math.floor(random() * shirts.length)] })
      heads.push({ position: position.clone().add(new THREE.Vector3(0, 0.45, 0.02)), color: new THREE.Color().setHSL(0.07, 0.35, 0.35 + random() * 0.4) })
    }
  }
  const seatMesh = placeInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.44, 0.12, 0.4), new THREE.MeshStandardMaterial({ roughness: 0.6 }), seats.length), seats)
  const crowdMesh = placeInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.34, 0.24), new THREE.MeshStandardMaterial({ roughness: 0.9 }), crowd.length), crowd)
  seatMesh.receiveShadow = crowdMesh.receiveShadow = true
  group.add(seatMesh, crowdMesh)
  // Heads are the smallest and most numerous detail; standard quality leaves them out.
  if (isDetailed) group.add(placeInstances(new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), heads.length), heads))
  return group
}

const LABEL_WIDTH = 512
const LABEL_HEIGHT = 144

// Matches the HUD cards: dark glass panel, hairline border and an optional team-colour bar.
export function createLabel(text: string, accent?: string) {
  const canvas = document.createElement('canvas')
  canvas.width = LABEL_WIDTH
  canvas.height = LABEL_HEIGHT
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#0d1820eb'
    context.strokeStyle = '#dce4e560'
    context.lineWidth = 3
    context.beginPath()
    context.roundRect(6, 6, LABEL_WIDTH - 12, LABEL_HEIGHT - 32, 18)
    context.fill()
    context.stroke()
    context.beginPath()
    context.moveTo(LABEL_WIDTH / 2 - 16, LABEL_HEIGHT - 27)
    context.lineTo(LABEL_WIDTH / 2, LABEL_HEIGHT - 6)
    context.lineTo(LABEL_WIDTH / 2 + 16, LABEL_HEIGHT - 27)
    context.fill()
    if (accent) {
      context.fillStyle = accent
      context.beginPath()
      context.roundRect(30, 34, 10, LABEL_HEIGHT - 92, 4)
      context.fill()
    }
    context.fillStyle = '#f2f6f7'
    context.font = '600 54px Inter, "Helvetica Neue", Arial, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, LABEL_WIDTH / 2 + (accent ? 10 : 0), (LABEL_HEIGHT - 26) / 2 + 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, toneMapped: false, fog: false }))
  sprite.scale.set(8, 8 * LABEL_HEIGHT / LABEL_WIDTH, 1)
  sprite.center.set(0.5, 0)
  sprite.renderOrder = 5
  return sprite
}

const GARAGE_SPACING = 3.2

// The pit building faces the track on its local -z side: a garage per team at ground level,
// a glazed hospitality floor above and plant on the roof.
export function createPaddock(length: number, teamColors: string[]) {
  const group = new THREE.Group()
  group.add(createMergedMesh([
    box([length, 2.5, 5], [0, 1.25, 0]),
    box([length + 0.7, 0.18, 6], [0, 2.6, 0]),
    box([length, 1.6, 4], [0, 3.4, 0.4]),
    box([length + 1, 0.18, 5], [0, 4.3, 0.4]),
  ], new THREE.MeshStandardMaterial({ color: 0xeceae3, roughness: 0.7 })))
  group.add(createMergedMesh([box([length - 0.6, 1.2, 0.08], [0, 3.42, -1.64])], new THREE.MeshPhysicalMaterial({ color: 0x1c2a33, roughness: 0.05, metalness: 0.6, clearcoat: 1 })))
  const garages = new Map<string, THREE.BufferGeometry[]>()
  const plant: THREE.BufferGeometry[] = []
  let garage = 0
  for (let x = -length / 2 + 1.8; x < length / 2 - 1; x += GARAGE_SPACING, garage++) {
    const color = teamColors.length ? teamColors[garage % teamColors.length] : '#3b5155'
    garages.set(color, [...(garages.get(color) ?? []), box([2.5, 1.8, 0.08], [x, 1, -2.54]), box([2.5, 0.22, 0.16], [x, 2.04, -2.58])])
    plant.push(box([1.4, 0.45, 1.2], [x, 4.62, 1.1]))
  }
  garages.forEach((parts, color) => group.add(createMergedMesh(parts, new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2 }))))
  if (plant.length) group.add(createMergedMesh(plant, new THREE.MeshStandardMaterial({ color: 0xb9bdbc, roughness: 0.5, metalness: 0.4 })))
  return group
}
