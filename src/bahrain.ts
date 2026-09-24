import * as THREE from 'three'
import { createProjection, createRibbonGeometry } from './circuitGeometry'
import { box, createGrandstand, createMergedMesh, createPaddock } from './sceneAssets'

// Centerline traced from the sector line on the supplied 1920 × 1080 map, starting westbound at the flag.
const TRACK_PIXELS: [number, number][] = [
  [1112, 853], [980, 854], [847, 854], [728, 854], [608, 853], [489, 853], [369, 852], [354, 851],
  [345, 842], [346, 832], [366, 812], [402, 769], [404, 756], [380, 690], [372, 663], [370, 636],
  [386, 526], [387, 503], [398, 455], [413, 349], [429, 244], [444, 138], [453, 83], [459, 70],
  [471, 64], [485, 63], [499, 65], [511, 73], [521, 82], [593, 167], [644, 215], [666, 233],
  [678, 240], [729, 261], [751, 278], [761, 304], [762, 317], [757, 387], [760, 401], [767, 413],
  [775, 424], [786, 434], [864, 492], [942, 549], [950, 561], [948, 574], [937, 583], [924, 588],
  [911, 588], [811, 575], [801, 576], [752, 567], [739, 567], [610, 553], [596, 554], [582, 558],
  [570, 564], [558, 572], [548, 582], [516, 627], [517, 638], [638, 651], [681, 653], [814, 654],
  [947, 654], [1080, 655], [1213, 655], [1227, 654], [1240, 650], [1251, 642], [1258, 630], [1262, 616],
  [1263, 603], [1260, 574], [1256, 561], [1246, 535], [1238, 523], [1220, 502], [1187, 477], [1149, 460],
  [1109, 448], [1084, 436], [1061, 420], [1036, 387], [1030, 374], [1021, 333], [1023, 305], [1026, 292],
  [1036, 266], [1075, 177], [1091, 154], [1101, 145], [1124, 130], [1138, 127], [1152, 130], [1163, 137],
  [1183, 157], [1238, 248], [1294, 340], [1349, 431], [1428, 560], [1501, 679], [1571, 798], [1572, 812],
  [1563, 823], [1538, 836], [1500, 853], [1486, 855], [1370, 855], [1253, 855], [1137, 855],
]
export const BAHRAIN_TRACK: [number, number][] = TRACK_PIXELS.map(([x, y]) => [-y, -x])
const project = createProjection(BAHRAIN_TRACK)
const at = (x: number, y: number, height = 0) => project(-y, -x, height)
const PALM_CLEARANCE = 6
const SHRUB_CLEARANCE = 7
const SHRUB_COUNT = 420

// The paddock sits inside the main straight, from the Sakhir tower towards Turn 15.
const PADDOCK_AREA = { left: 560, right: 1180, top: 700, bottom: 845 }
const INFIELD_LAWN: [number, number][] = [[432, 700], [520, 686], [590, 700], [600, 760], [560, 800], [440, 806]]
const CAR_PARKS: [number, number, number, number][] = [[520, 1000, 260, 70], [900, 1010, 300, 60], [1640, 975, 140, 90]]

function faceToward(object: THREE.Object3D, x: number, y: number) {
  const direction = at(x, y).sub(object.position)
  object.rotation.y = Math.atan2(-direction.x, -direction.z)
}

function surface(name: string, pixels: [number, number][], color: number, height: number) {
  const shape = new THREE.Shape(pixels.map(([x, y]) => {
    const point = at(x, y)
    return new THREE.Vector2(point.x, -point.z)
  }))
  const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, height, 0)
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 1 }))
  mesh.name = name
  mesh.receiveShadow = true
  return mesh
}

function rectangle(x: number, y: number, width: number, depth: number): [number, number][] {
  return [[x - width / 2, y - depth / 2], [x + width / 2, y - depth / 2], [x + width / 2, y + depth / 2], [x - width / 2, y + depth / 2]]
}

function addPitLane(group: THREE.Group) {
  const control = [[1545, 808], [1500, 823], [1400, 824], [1100, 824], [700, 824], [480, 824], [425, 812]].map(([x, y]) => at(x, y))
  const points = new THREE.CatmullRomCurve3(control).getPoints(100)
  const lane = new THREE.Mesh(createRibbonGeometry(points, 1.16, 0.07, 0, false), new THREE.MeshStandardMaterial({ color: 0x6b6f6c, roughness: 0.9 }))
  lane.name = 'Pit lane'
  group.add(lane)
  const walls = createMergedMesh([box([100, 0.45, 0.18], at(830, 838, 0.225).toArray())], new THREE.MeshStandardMaterial({ color: 0xe6e1d4, roughness: 0.9 }))
  walls.name = 'Pit wall'
  group.add(walls)
}

function createTower() {
  const concrete = new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.8 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x3b5155, metalness: 0.35, roughness: 0.38 })
  const tower = new THREE.Group()
  tower.name = 'Sakhir tower'
  tower.add(
    createMergedMesh([new THREE.CylinderGeometry(1.1, 1.4, 6.5, 12).translate(0, 3.25, 0), new THREE.CylinderGeometry(2.7, 2.7, 0.2, 16).translate(0, 8.9, 0)], concrete),
    createMergedMesh([new THREE.CylinderGeometry(2.4, 1.6, 2.3, 16).translate(0, 7.65, 0)], glass),
  )
  return tower
}

function addVenue(group: THREE.Group) {
  const pits = createPaddock(56)
  pits.name = 'Pit building'
  pits.position.copy(at(860, 792))
  pits.rotation.y = Math.PI
  group.add(pits)
  const tower = createTower()
  tower.position.copy(at(640, 770))
  group.add(tower)
  const hospitality: THREE.BufferGeometry[] = []
  for (let index = 0; index < 8; index++) {
    const point = at(650 + index * 62, 725)
    hospitality.push(box([6.5, 1.4, 3.2], [point.x, 0.7, point.z]))
  }
  const units = createMergedMesh(hospitality, new THREE.MeshStandardMaterial({ color: 0xf1ede2, roughness: 0.8 }))
  units.name = 'Team hospitality'
  group.add(units)
  group.add(surface('Infield lawn', INFIELD_LAWN, 0x5f8a4a, -0.04))
  group.add(surface('Paddock apron', rectangle(870, 755, 620, 110), 0xb3aea3, -0.05))
  CAR_PARKS.forEach(([x, y, width, depth]) => group.add(surface('Car park', rectangle(x, y, width, depth), 0xa9a397, -0.05)))
  for (const [x, y, length, targetX, targetY] of [[1000, 912, 42, 1000, 853], [640, 912, 26, 640, 853], [300, 905, 18, 350, 842], [455, 12, 16, 475, 66], [1320, 652, 14, 1262, 620], [1630, 830, 14, 1570, 812]]) {
    const stand = createGrandstand(length)
    stand.name = 'Trackside grandstand'
    stand.position.copy(at(x, y))
    faceToward(stand, targetX, targetY)
    group.add(stand)
  }
}

function isReserved(x: number, y: number) {
  if (x > PADDOCK_AREA.left - 30 && x < PADDOCK_AREA.right && y > PADDOCK_AREA.top - 20 && y < PADDOCK_AREA.bottom) return true
  if (y > 870 && y < 950 && x > 240 && x < 1700) return true
  if (x > 420 && x < 610 && y > 670 && y < 815) return true
  if (x < 520 && y < 40) return true
  return CAR_PARKS.some(([centerX, centerY, width, depth]) => Math.abs(x - centerX) < width / 2 && Math.abs(y - centerY) < depth / 2)
}

function isNearRoad(point: THREE.Vector3, track: THREE.Vector3[], clearance: number) {
  return track.some((road) => road.distanceTo(point) < clearance)
}

function addPalms(group: THREE.Group, track: THREE.Vector3[]) {
  const sites: [number, number][] = []
  for (let x = 320; x <= 1620; x += 55) sites.push([x, 962])
  for (let x = 580; x <= 1160; x += 58) sites.push([x, 702])
  for (const [x, y] of INFIELD_LAWN) sites.push([x + (x < 520 ? 12 : -12), y + (y < 750 ? 12 : -12)])
  const positions = sites.map(([x, y]) => at(x, y)).filter((point) => !isNearRoad(point, track, PALM_CLEARANCE))
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x55773f, roughness: 1 }), positions.length)
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.13, 2.6, 5), new THREE.MeshStandardMaterial({ color: 0x8a7556, roughness: 1 }), positions.length)
  crowns.name = 'Palm trees'
  trunks.name = 'Palm trunks'
  const dummy = new THREE.Object3D()
  positions.forEach((point, index) => {
    dummy.position.copy(point).setY(2.7)
    dummy.scale.set(1.1, 0.35, 1.1)
    dummy.rotation.y = index
    dummy.updateMatrix()
    crowns.setMatrixAt(index, dummy.matrix)
    dummy.position.y = 1.3
    dummy.scale.setScalar(1)
    dummy.updateMatrix()
    trunks.setMatrixAt(index, dummy.matrix)
  })
  crowns.castShadow = trunks.castShadow = true
  group.add(crowns, trunks)
}

function addShrubs(group: THREE.Group, track: THREE.Vector3[]) {
  const shrubs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 1 }), SHRUB_COUNT)
  shrubs.name = 'Desert shrubs'
  const dummy = new THREE.Object3D()
  let count = 0
  for (let attempt = 0; attempt < SHRUB_COUNT * 10 && count < SHRUB_COUNT; attempt++) {
    const x = 200 + ((attempt * 127.31) % 1560)
    const y = -20 + ((attempt * 311.73) % 1080)
    const point = at(x, y)
    if (isReserved(x, y) || isNearRoad(point, track, SHRUB_CLEARANCE)) continue
    const size = 0.25 + attempt % 7 * 0.07
    dummy.position.copy(point).setY(size * 0.35)
    dummy.scale.set(size * 1.3, size * 0.7, size)
    dummy.rotation.y = attempt
    dummy.updateMatrix()
    shrubs.setMatrixAt(count, dummy.matrix)
    shrubs.setColorAt(count++, new THREE.Color([0x8f8a5a, 0x77764c, 0xa39a6c][attempt % 3]))
  }
  shrubs.count = count
  group.add(shrubs)
}

export function createBahrainScenery(track: THREE.Vector3[]) {
  if (track.length < 3) throw new Error('Bahrain scenery requires a circuit loop')
  const group = new THREE.Group()
  group.name = 'Bahrain International Circuit'
  addPitLane(group)
  addVenue(group)
  addPalms(group, track)
  addShrubs(group, track)
  return group
}
