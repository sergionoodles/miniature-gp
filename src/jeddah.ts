import * as THREE from 'three'
import { createProjection, createRibbonGeometry } from './circuitGeometry'
import { box, createGrandstand, createMergedMesh, createPaddock } from './sceneAssets'

// Centerline traced from the flag in the arrow direction on the supplied 2000 × 1250 map.
const TRACK_PIXELS: [number, number][] = [
  [1590, 293], [1510, 349], [1430, 411], [1350, 477], [1280, 534], [1251, 572],
  [1253, 586], [1270, 606], [1264, 617], [1215, 634], [1160, 648], [1111, 675],
  [1032, 720], [955, 762], [955, 796], [941, 821], [913, 843], [874, 858],
  [841, 859], [810, 852], [785, 865], [755, 891], [733, 922], [724, 946],
  [710, 959], [660, 980], [617, 990], [593, 987], [575, 974], [552, 951],
  [533, 943], [504, 947], [463, 956], [413, 955], [373, 954], [336, 960],
  [289, 977], [225, 1004], [156, 1034], [87, 1065], [64, 1082], [55, 1101],
  [55, 1128], [63, 1151], [81, 1167], [108, 1173], [136, 1166], [158, 1151],
  [176, 1129], [195, 1097], [218, 1070], [246, 1052], [284, 1037], [320, 1031],
  [357, 1032], [396, 1036], [439, 1034], [473, 1024], [501, 1021], [519, 1030],
  [539, 1053], [558, 1067], [583, 1071], [611, 1066], [650, 1053], [691, 1035],
  [726, 1014], [755, 986], [793, 946], [831, 913], [864, 898], [909, 884],
  [952, 866], [983, 848], [1010, 824], [1034, 796], [1059, 763], [1087, 734],
  [1121, 708], [1161, 688], [1206, 674], [1254, 666], [1281, 660], [1298, 646],
  [1305, 621], [1310, 600], [1324, 572], [1352, 549], [1386, 533], [1416, 530],
  [1460, 533], [1511, 539], [1565, 545], [1607, 545], [1640, 538], [1680, 523],
  [1726, 499], [1768, 468], [1807, 435], [1842, 400], [1871, 363], [1894, 325],
  [1911, 284], [1924, 239], [1936, 186], [1945, 139], [1942, 108], [1929, 86],
  [1911, 81], [1894, 88], [1857, 111], [1781, 159], [1708, 205], [1636, 253],
]

export const JEDDAH_TRACK: [number, number][] = TRACK_PIXELS.map(([x, y]) => [-y, -x])
const project = createProjection(JEDDAH_TRACK)
const at = (x: number, y: number, height = 0) => project(-y, -x, height)

// The waterfront follows the outside of the long return leg; the city is inland.
const SHORE_PIXELS: [number, number][] = [
  [-100, 1270], [100, 1240], [300, 1150], [500, 1150], [700, 1100],
  [900, 990], [1100, 880], [1300, 770], [1500, 690], [1700, 650], [1900, 590], [2100, 490],
]

function surface(name: string, pixels: [number, number][], color: number, height: number) {
  const shape = new THREE.Shape(pixels.map(([x, y]) => {
    const point = at(x, y)
    return new THREE.Vector2(point.x, -point.z)
  }))
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, height, 0),
    new THREE.MeshStandardMaterial({ color, roughness: name === 'Red Sea' ? 0.32 : 1, metalness: name === 'Red Sea' ? 0.15 : 0 }),
  )
  mesh.name = name
  mesh.receiveShadow = true
  return mesh
}

function addWaterfront(group: THREE.Group) {
  group.add(surface('Red Sea', [...SHORE_PIXELS, [2100, 1800], [-100, 1800]], 0x397f91, -0.035))
  group.add(surface('Corniche park', [
    ...SHORE_PIXELS.map(([x, y]) => [x, y - 7] as [number, number]),
    ...SHORE_PIXELS.slice().reverse().map(([x, y]) => [x, y - 42] as [number, number]),
  ], 0x789f65, -0.07))
  const shore = SHORE_PIXELS.map(([x, y]) => at(x, y))
  const promenade = new THREE.Mesh(createRibbonGeometry(shore, 1.5, -0.015, -1.2, false), new THREE.MeshStandardMaterial({ color: 0xe4dfc9, roughness: 1 }))
  promenade.name = 'Waterfront promenade'
  group.add(promenade)
  const seawall = new THREE.Mesh(createRibbonGeometry(shore, 0.24, 0.11, 0, false), new THREE.MeshStandardMaterial({ color: 0xf1eee0, roughness: 0.85 }))
  seawall.name = 'Sea wall'
  group.add(seawall)
}

function addPitAndStands(group: THREE.Group) {
  const pitPoints = [[1740, 175], [1640, 240], [1550, 301], [1450, 376], [1355, 452], [1280, 514]].map(([x, y]) => at(x, y))
  const lane = new THREE.Mesh(createRibbonGeometry(new THREE.CatmullRomCurve3(pitPoints).getPoints(80), 1.05, 0.07, 0, false), new THREE.MeshStandardMaterial({ color: 0x6b7372, roughness: 0.9 }))
  lane.name = 'Pit lane'
  group.add(lane)
  const paddock = createPaddock(24)
  paddock.name = 'Pit building and paddock'
  paddock.position.copy(at(1530, 205))
  paddock.rotation.y = 0.68
  group.add(paddock)
  for (const [x, y, length] of [[1330, 375, 18], [1730, 90, 15], [1190, 580, 13], [840, 780, 12]]) {
    const stand = createGrandstand(length)
    stand.name = 'Trackside grandstand'
    stand.position.copy(at(x, y))
    stand.rotation.y = 0.68
    group.add(stand)
  }
}

function addCity(group: THREE.Group, track: THREE.Vector3[]) {
  const buildings: THREE.BufferGeometry[][] = [[], [], []]
  const roofs: THREE.BufferGeometry[] = []
  for (let index = 0; index < 70; index++) {
    const x = 160 + (index * 173.7) % 1700
    const y = 60 + (index * 91.3) % 690
    if (y > 1120 - x * 0.3 || (x > 1390 && x < 1660 && y > 130 && y < 320)) continue
    const point = at(x, y)
    if (track.some((road) => road.distanceTo(point) < 8)) continue
    const height = 3 + index % 7 * 1.6 + (x > 1280 && index % 5 === 0 ? 8 : 0)
    const width = 2.4 + index % 3 * 0.65
    const depth = 2 + index % 4 * 0.5
    buildings[index % buildings.length].push(box([width, height, depth], [point.x, height / 2, point.z]))
    roofs.push(box([width + 0.35, 0.16, depth + 0.35], [point.x, height + 0.08, point.z]))
  }
  const colors = [0xb5b7b2, 0x849ca1, 0xcac6b7]
  buildings.forEach((parts, index) => {
    if (!parts.length) return
    const mesh = createMergedMesh(parts, new THREE.MeshStandardMaterial({ color: colors[index], metalness: 0.13, roughness: 0.7 }))
    mesh.name = 'Jeddah skyline'
    group.add(mesh)
  })
  const roofMesh = createMergedMesh(roofs, new THREE.MeshStandardMaterial({ color: 0xe5e1d4, roughness: 0.8 }))
  roofMesh.name = 'Building roofs'
  group.add(roofMesh)
}

function addPalms(group: THREE.Group, track: THREE.Vector3[]) {
  const sites = new THREE.CatmullRomCurve3(SHORE_PIXELS.map(([x, y]) => at(x, y - 26))).getSpacedPoints(75)
    .filter((_, index) => index % 2 === 0)
    .filter((point) => track.every((road) => road.distanceTo(point) >= 5))
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.15, 2.7, 5), new THREE.MeshStandardMaterial({ color: 0x9a7954, roughness: 1 }), sites.length)
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x467a50, roughness: 1 }), sites.length)
  trunks.name = 'Corniche palm trunks'
  crowns.name = 'Corniche palms'
  const dummy = new THREE.Object3D()
  sites.forEach((point, index) => {
    dummy.position.copy(point).setY(1.35)
    dummy.scale.setScalar(1)
    dummy.updateMatrix()
    trunks.setMatrixAt(index, dummy.matrix)
    dummy.position.y = 2.8
    dummy.scale.set(1.3, 0.42, 1.3)
    dummy.rotation.y = index
    dummy.updateMatrix()
    crowns.setMatrixAt(index, dummy.matrix)
  })
  trunks.castShadow = crowns.castShadow = true
  group.add(trunks, crowns)
}

function addWallsAndLights(group: THREE.Group, track: THREE.Vector3[]) {
  const wallCount = Math.ceil(track.length / 5) * 2
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.65, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 }), wallCount)
  walls.name = 'Street circuit barriers'
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.09, 4.4, 5), new THREE.MeshStandardMaterial({ color: 0x87999a, metalness: 0.35, roughness: 0.55 }), Math.ceil(track.length / 22))
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffd593, emissiveIntensity: 0.9 }), Math.ceil(track.length / 22))
  poles.name = 'Floodlight poles'
  lamps.name = 'Floodlights'
  const dummy = new THREE.Object3D()
  let wallIndex = 0
  let lampIndex = 0
  for (let index = 0; index < track.length; index += 5) {
    const next = track[(index + 5) % track.length]
    const tangent = next.clone().sub(track[index])
    const across = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()
    const middle = track[index].clone().add(next).multiplyScalar(0.5)
    for (const side of [-1, 1]) {
      dummy.position.copy(middle).addScaledVector(across, side * 2.1).setY(0.34)
      dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0)
      dummy.scale.set(1, 1, tangent.length() + 0.08)
      dummy.updateMatrix()
      walls.setMatrixAt(wallIndex, dummy.matrix)
      walls.setColorAt(wallIndex++, new THREE.Color(index % 20 ? 0xecebe2 : 0x45a7a0))
    }
    if (index % 25 !== 0) continue
    const lightPosition = middle.addScaledVector(across, 3.6)
    if (track.some((road) => road.distanceTo(lightPosition) < 3)) continue
    dummy.position.copy(lightPosition).setY(2.2)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.setScalar(1)
    dummy.updateMatrix()
    poles.setMatrixAt(lampIndex, dummy.matrix)
    dummy.position.y = 4.45
    dummy.updateMatrix()
    lamps.setMatrixAt(lampIndex++, dummy.matrix)
  }
  walls.count = wallIndex
  poles.count = lamps.count = lampIndex
  group.add(walls, poles, lamps)
}

export function createJeddahScenery(track: THREE.Vector3[]) {
  if (track.length < 3) throw new Error('Jeddah scenery requires a circuit loop')
  const group = new THREE.Group()
  group.name = 'Jeddah Corniche Circuit'
  addWaterfront(group)
  addPitAndStands(group)
  addCity(group, track)
  addPalms(group, track)
  addWallsAndLights(group, track)
  return group
}
