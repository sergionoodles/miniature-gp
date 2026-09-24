import * as THREE from 'three'
import { createProjection, createRibbonGeometry } from './circuitGeometry'
import { box, createGrandstand, createMergedMesh, createPaddock } from './sceneAssets'

// Centerline traced clockwise from the flag on the supplied 1920 × 1080 map.
const TRACK_PIXELS: [number, number][] = [
  [838, 477], [873, 378], [907, 285], [938, 191], [954, 143],
  [974, 103], [997, 79], [1025, 68], [1053, 75], [1076, 92], [1085, 114],
  [1087, 137], [1080, 160], [1067, 178], [1049, 187], [1032, 184],
  [1019, 173], [1008, 157], [990, 144], [974, 143], [958, 151],
  [950, 166], [951, 182], [961, 204], [978, 226], [1001, 243],
  [1027, 248], [1074, 242], [1150, 229], [1225, 217], [1301, 209],
  [1322, 211], [1405, 235], [1487, 256], [1540, 271], [1556, 281],
  [1554, 294], [1543, 303], [1516, 314], [1480, 324], [1440, 328],
  [1375, 325], [1299, 319], [1241, 316], [1210, 319], [1183, 329],
  [1159, 347], [1139, 374], [1127, 404], [1121, 434], [1127, 461],
  [1144, 492], [1164, 525], [1180, 553], [1189, 582], [1190, 613],
  [1180, 643], [1161, 668], [1132, 691], [1105, 700], [1073, 700],
  [1039, 693], [1021, 694], [1006, 703], [993, 720], [994, 739],
  [1002, 765], [1012, 793], [1024, 810], [1042, 816], [1110, 819],
  [1200, 821], [1300, 824], [1400, 826], [1479, 828], [1498, 827],
  [1506, 816], [1504, 802], [1497, 781], [1495, 762], [1503, 746],
  [1521, 735], [1542, 730], [1565, 735], [1587, 749], [1607, 769],
  [1618, 794], [1622, 821], [1617, 845], [1605, 869], [1588, 890],
  [1565, 907], [1536, 918], [1511, 924], [1410, 925], [1270, 925],
  [1120, 925], [970, 926], [820, 926], [670, 926], [520, 926],
  [370, 926], [313, 926], [290, 922], [288, 916], [299, 902],
  [320, 888], [349, 876], [378, 874], [465, 870], [550, 866],
  [629, 863], [644, 859], [651, 847], [680, 769], [714, 677],
  [749, 581], [784, 484],
]

export const SHANGHAI_TRACK: [number, number][] = TRACK_PIXELS.map(([x, y]) => [-y, -x])
const project = createProjection(SHANGHAI_TRACK)
const at = (x: number, y: number, height = 0) => project(-y, -x, height)

function surface(name: string, pixels: [number, number][], color: number, height = -0.06) {
  const shape = new THREE.Shape(pixels.map(([x, y]) => {
    const point = at(x, y)
    return new THREE.Vector2(point.x, -point.z)
  }))
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, height, 0),
    new THREE.MeshStandardMaterial({ color, roughness: name === 'Infield water' ? 0.32 : 1, metalness: name === 'Infield water' ? 0.12 : 0 }),
  )
  mesh.name = name
  mesh.receiveShadow = true
  return mesh
}

function rectangle(x: number, y: number, width: number, depth: number): [number, number][] {
  return [[x - width / 2, y - depth / 2], [x + width / 2, y - depth / 2], [x + width / 2, y + depth / 2], [x - width / 2, y + depth / 2]]
}

function addGroundDetails(group: THREE.Group) {
  group.add(surface('Turn 1 paved runoff', [
    [872, 132], [920, 58], [971, 26], [1035, 22], [1095, 53], [1125, 111],
    [1116, 187], [1068, 217], [990, 228], [937, 202],
  ], 0x858a83))
  group.add(surface('Turn 6 paved runoff', [
    [1390, 185], [1580, 223], [1610, 259], [1594, 318], [1510, 356], [1400, 355],
  ], 0x91968e))
  group.add(surface('Final hairpin runoff', [
    [1450, 692], [1550, 679], [1636, 714], [1670, 781], [1666, 852],
    [1620, 930], [1550, 958], [1450, 948],
  ], 0x92978e))
  group.add(surface('Paddock apron', [
    [742, 385], [887, 313], [1000, 639], [916, 850], [671, 851],
  ], 0xa3a59a))
  group.add(surface('Infield water', [
    [1265, 360], [1375, 358], [1454, 385], [1428, 437], [1344, 460], [1260, 433],
  ], 0x467f86, -0.04))
  group.add(surface('Infield water', [
    [1300, 472], [1422, 475], [1475, 508], [1442, 555], [1333, 547],
  ], 0x467f86, -0.04))
  group.add(surface('Infield lawn', rectangle(1340, 635, 285, 105), 0x71955e))
  group.add(surface('Service and parking area', rectangle(515, 785, 290, 95), 0xa7a99d))
}

function addPitComplex(group: THREE.Group) {
  const pitPoints = [[665, 832], [706, 729], [752, 607], [799, 486], [842, 362], [897, 220]].map(([x, y]) => at(x, y))
  const lane = new THREE.Mesh(
    createRibbonGeometry(new THREE.CatmullRomCurve3(pitPoints).getPoints(100), 1.2, 0.07, 0, false),
    new THREE.MeshStandardMaterial({ color: 0x66706e, roughness: 0.94 }),
  )
  lane.name = 'Pit lane'
  group.add(lane)

  const paddock = createPaddock(60)
  paddock.name = 'Shanghai pit building and paddock'
  paddock.position.copy(at(852, 550))
  paddock.rotation.y = 1.22
  group.add(paddock)

  const roofs: THREE.BufferGeometry[] = []
  const buildings: THREE.BufferGeometry[] = []
  for (let index = 0; index < 7; index++) {
    const point = at(957 + index * 11, 365 + index * 40)
    buildings.push(box([8, 1.7, 5], [point.x, 0.85, point.z]))
    roofs.push(box([8.6, 0.22, 5.6], [point.x, 1.82, point.z]))
  }
  const hospitality = createMergedMesh(buildings, new THREE.MeshStandardMaterial({ color: 0xe2e3dd, roughness: 0.8 }))
  hospitality.name = 'Paddock hospitality buildings'
  group.add(hospitality)
  const redRoofs = createMergedMesh(roofs, new THREE.MeshStandardMaterial({ color: 0xa9483e, roughness: 0.7 }))
  redRoofs.name = 'Paddock red roofs'
  group.add(redRoofs)

  for (const [x, y, rotation] of [[730, 668, -0.35], [872, 393, -0.35]]) {
    const bridge = createMergedMesh([
      box([22, 0.35, 2.2], [0, 3.5, 0]),
      box([22, 0.18, 2.7], [0, 4.1, 0]),
      box([0.35, 3.5, 0.35], [-10.5, 1.75, 0]),
      box([0.35, 3.5, 0.35], [10.5, 1.75, 0]),
    ], new THREE.MeshStandardMaterial({ color: 0xe7e9e4, roughness: 0.75 }))
    bridge.name = 'Pedestrian bridge'
    bridge.position.copy(at(x, y))
    bridge.rotation.y = rotation
    group.add(bridge)
  }
}

function addGrandstands(group: THREE.Group) {
  for (const [x, y, length, rotation] of [
    [850, 985, 46, 0], [1200, 978, 35, 0], [1565, 651, 25, -0.4],
    [1130, 50, 27, -0.3], [357, 823, 19, 0.8],
  ]) {
    const stand = createGrandstand(length)
    stand.name = 'Shanghai grandstand'
    stand.position.copy(at(x, y))
    stand.rotation.y = rotation
    group.add(stand)
  }
}

function addTrees(group: THREE.Group, track: THREE.Vector3[]) {
  const count = 260
  const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 1 }), count)
  trees.name = 'Shanghai trees'
  const dummy = new THREE.Object3D()
  let placed = 0
  for (let index = 0; index < count * 12 && placed < count; index++) {
    const x = 190 + (index * 173.13) % 1550
    const y = 55 + (index * 319.67) % 950
    if (x > 650 && x < 1030 && y > 260 && y < 865) continue
    if (x > 1220 && x < 1500 && y > 345 && y < 560) continue
    if (x > 300 && x < 680 && y > 710 && y < 850) continue
    const point = at(x, y)
    if (track.some((road) => road.distanceTo(point) < 6.5)) continue
    const size = 1 + index % 5 * 0.18
    dummy.position.copy(point).setY(size * 1.5)
    dummy.scale.set(size, size * 1.4, size)
    dummy.rotation.y = index
    dummy.updateMatrix()
    trees.setMatrixAt(placed, dummy.matrix)
    trees.setColorAt(placed++, new THREE.Color([0x3e674c, 0x5b7c53, 0x78905a][index % 3]))
  }
  trees.count = placed
  trees.castShadow = true
  group.add(trees)
}

export function createShanghaiScenery(track: THREE.Vector3[]) {
  if (track.length < 3) throw new Error('Shanghai scenery requires a circuit loop')
  const group = new THREE.Group()
  group.name = 'Shanghai International Circuit'
  addGroundDetails(group)
  addPitComplex(group)
  addGrandstands(group)
  addTrees(group, track)
  return group
}
