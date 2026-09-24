import * as THREE from 'three'
import { createProjection, createRibbonGeometry } from './circuitGeometry'
import { box, createGrandstand, createMergedMesh, createPaddock } from './sceneAssets'

// Centerline traced from the supplied 2048 × 1152 map, starting westbound at the flag.
const TRACK_PIXELS: [number, number][] = [
  [1146, 930], [1020, 931], [880, 929], [849, 927], [838, 913],
  [825, 883], [800, 860], [769, 849], [730, 847], [665, 851],
  [550, 847], [485, 840], [413, 825], [345, 807], [320, 792],
  [326, 774], [350, 736], [369, 695], [359, 675], [301, 623],
  [254, 578], [250, 556], [263, 457], [278, 407], [309, 340],
  [330, 267], [340, 247], [379, 241], [411, 230], [464, 191],
  [508, 169], [546, 165], [582, 169], [629, 193], [694, 235],
  [753, 281], [776, 316], [794, 374], [816, 429], [855, 487],
  [900, 533], [951, 568], [999, 591], [1043, 604], [1128, 606],
  [1209, 601], [1240, 589], [1268, 557], [1299, 524], [1340, 520],
  [1450, 508], [1506, 505], [1545, 511], [1589, 530], [1698, 590],
  [1809, 650], [1791, 679], [1759, 735], [1727, 802], [1712, 824],
  [1680, 838], [1647, 833], [1593, 815], [1538, 803], [1520, 806],
  [1516, 826], [1520, 872], [1513, 899], [1495, 918], [1457, 928],
  [1340, 930], [1220, 930],
]
export const ALBERT_PARK_TRACK: [number, number][] = TRACK_PIXELS.map(([x, y]) => [-y, -x])
const project = createProjection(ALBERT_PARK_TRACK)
const at = (x: number, y: number, height = 0) => project(-y, -x, height)
const TREE_CLEARANCE = 6
const TREE_COUNT = 650

const LAKE_PIXELS: [number, number][] = [
  [438, 441], [470, 393], [526, 362], [592, 365], [650, 400],
  [701, 453], [756, 552], [816, 605], [893, 640], [1003, 661],
  [1110, 663], [1220, 655], [1350, 620], [1424, 643], [1435, 679],
  [1388, 720], [1290, 749], [1170, 766], [1030, 770], [885, 752],
  [746, 725], [623, 683], [536, 631], [471, 555],
]

function surface(name: string, pixels: [number, number][], color: number, height: number) {
  const shape = new THREE.Shape(pixels.map(([x, y]) => {
    const point = at(x, y)
    return new THREE.Vector2(point.x, -point.z)
  }))
  const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, height, 0)
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: name === 'Albert Park Lake' ? 0.3 : 1, metalness: name === 'Albert Park Lake' ? 0.18 : 0 }))
  mesh.name = name
  mesh.receiveShadow = true
  return mesh
}

function containsPoint(polygon: THREE.Vector3[], point: THREE.Vector3) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]
    const b = polygon[previous]
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

function addLake(group: THREE.Group) {
  const lake = surface('Albert Park Lake', LAKE_PIXELS, 0x407b80, -0.045)
  group.add(lake)
  const shore = LAKE_PIXELS.map(([x, y]) => at(x, y))
  const edging = new THREE.Mesh(createRibbonGeometry(shore, 0.7, -0.035), new THREE.MeshStandardMaterial({ color: 0xb4bb8d, roughness: 1 }))
  edging.name = 'Lake shoreline'
  group.add(edging)
  for (const [x, y, radius] of [[595, 468, 22], [639, 493, 15], [1265, 695, 16]]) {
    const island = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.115, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x678458, roughness: 1 }))
    island.name = 'Lake island'
    island.position.copy(at(x, y, 0.01))
    group.add(island)
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), new THREE.MeshStandardMaterial({ color: 0x365b43, roughness: 1 }))
    canopy.position.copy(at(x, y, 1))
    canopy.scale.set(1.4, 0.7, 1)
    group.add(canopy)
  }
  return shore
}

function addPitLane(group: THREE.Group) {
  const control = [[1520, 840], [1505, 889], [1477, 904], [1370, 905], [1180, 906], [1080, 908], [986, 923]].map(([x, y]) => at(x, y))
  const points = new THREE.CatmullRomCurve3(control).getPoints(100)
  const positions: number[] = []
  const indices: number[] = []
  for (let index = 0; index < points.length; index++) {
    const tangent = points[Math.min(index + 1, points.length - 1)].clone().sub(points[Math.max(0, index - 1)]).normalize()
    for (const side of [-1, 1]) positions.push(points[index].x - tangent.z * side * 0.58, 0.07, points[index].z + tangent.x * side * 0.58)
    if (index < points.length - 1) {
      const vertex = index * 2
      indices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const lane = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x626e70, roughness: 0.9 }))
  lane.name = 'Pit lane'
  group.add(lane)
  const walls = createMergedMesh([box([44, 0.45, 0.18], at(1245, 916, 0.225).toArray())], new THREE.MeshStandardMaterial({ color: 0xe3deca, roughness: 0.9 }))
  walls.name = 'Pit wall'
  group.add(walls)
}

function addVenue(group: THREE.Group) {
  const paddock = createPaddock(38)
  paddock.name = 'Pit building and paddock'
  paddock.position.copy(at(1230, 866))
  paddock.rotation.y = Math.PI
  group.add(paddock)
  for (const [x, y, length, rotation] of [[1260, 991, 37, 0], [925, 991, 22, 0], [1590, 920, 15, -0.7], [1835, 740, 14, Math.PI / 2], [381, 886, 18, 0.1], [297, 228, 12, 1.3]]) {
    const stand = createGrandstand(length)
    stand.name = 'Trackside grandstand'
    stand.position.copy(at(x, y))
    stand.rotation.y = rotation
    group.add(stand)
  }
  const tentRoofs: THREE.BufferGeometry[] = []
  const tentWalls: THREE.BufferGeometry[] = []
  for (let index = 0; index < 14; index++) {
    const point = at(940 + index % 7 * 65, 807 + Math.floor(index / 7) * 28)
    tentWalls.push(box([4.8, 0.9, 2.2], [point.x, 0.45, point.z]))
    tentRoofs.push(new THREE.ConeGeometry(1, 0.9, 4).rotateY(Math.PI / 4).scale(3.8, 1, 1.9).translate(point.x, 1.3, point.z))
  }
  group.add(createMergedMesh(tentWalls, new THREE.MeshStandardMaterial({ color: 0xd8ddd5, roughness: 0.9 })))
  const roofs = createMergedMesh(tentRoofs, new THREE.MeshStandardMaterial({ color: 0xf3efe0, roughness: 0.8 }))
  roofs.name = 'Hospitality tents'
  group.add(roofs)
  for (const [x, y, width, depth] of [[560, 280, 110, 45], [1660, 696, 95, 85], [680, 950, 140, 80]]) {
    group.add(surface('Sports lawn', [[x - width / 2, y - depth / 2], [x + width / 2, y - depth / 2], [x + width / 2, y + depth / 2], [x - width / 2, y + depth / 2]], 0x629253, -0.04))
  }
}

function addTrees(group: THREE.Group, track: THREE.Vector3[], lake: THREE.Vector3[]) {
  const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 1 }), TREE_COUNT)
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.18, 1.8, 5), new THREE.MeshStandardMaterial({ color: 0x82735b, roughness: 1 }), TREE_COUNT)
  trees.name = 'Park trees'
  trunks.name = 'Tree trunks'
  const dummy = new THREE.Object3D()
  let count = 0
  for (let attempt = 0; attempt < TREE_COUNT * 10 && count < TREE_COUNT; attempt++) {
    const x = 130 + ((attempt * 127.31) % 1800)
    const y = 70 + ((attempt * 311.73) % 990)
    const point = at(x, y)
    if (containsPoint(lake, point) || track.some((road) => road.distanceTo(point) < TREE_CLEARANCE)) continue
    if (x > 860 && x < 1510 && y > 785 && y < 950) continue
    if (x > 770 && x < 1510 && y > 960) continue
    if (x > 1510 && x < 1690 && y > 870 && y < 965) continue
    if (x > 1770 && y > 680 && y < 825) continue
    if (x > 260 && x < 510 && y > 840 && y < 930) continue
    if (x < 345 && y < 305) continue
    if ((x > 490 && x < 630 && y < 320) || (x > 1590 && x < 1730 && y > 630 && y < 760) || (x > 590 && x < 770 && y > 895)) continue
    const size = 0.7 + attempt % 9 * 0.11
    dummy.position.copy(point).setY(size * 1.9)
    dummy.scale.set(size * 1.2, size * 1.6, size)
    dummy.rotation.y = attempt
    dummy.updateMatrix()
    trees.setMatrixAt(count, dummy.matrix)
    trees.setColorAt(count, new THREE.Color([0x496948, 0x6b8050, 0x3b624a, 0x81945e][attempt % 4]))
    dummy.position.y = size * 0.7
    dummy.scale.setScalar(size)
    dummy.updateMatrix()
    trunks.setMatrixAt(count++, dummy.matrix)
  }
  trees.count = trunks.count = count
  trees.castShadow = true
  group.add(trees, trunks)
}

export function createAlbertParkScenery(track: THREE.Vector3[]) {
  if (track.length < 3) throw new Error('Albert Park scenery requires a circuit loop')
  const group = new THREE.Group()
  group.name = 'Albert Park'
  const lake = addLake(group)
  addPitLane(group)
  addVenue(group)
  addTrees(group, track, lake)
  return group
}
