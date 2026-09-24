import * as THREE from 'three'
import { resolveCircuitEnvironment, type CircuitEnvironment } from './circuitEnvironments'
import { createLandmark } from './circuitLandmarks'
import { createRaceLighting, getRaceDaylight } from './raceLighting'
import type { WeatherTimeline } from './raceWeather'
import { createRain } from './rainEffect'
import type { Replay } from './replay'
import { createProjection, createRibbonGeometry, roadSideRoom } from './circuitGeometry'
import { box, createCar, createGrandstand, createLabel, createMergedMesh, createPaddock } from './sceneAssets'
import { addBuildings, addGroves, addTrees, addWater, addYachts } from './sceneryMeshes'
import { planScenery, type LandmarkPlacement, type StandFootprint } from './sceneryPlan'
import type { TerrainField } from './terrainField'
import { createBridgeWallGeometry, createTrackHeightLookup, findTrackCrossings, trackElevations, type TrackCrossing } from './trackCrossings'

const TRACK_WIDTH = 3.2
const EDGE_LINE_WIDTH = 0.11
const KERB_OFFSET = 1.83
const KERB_WIDTH = 0.4
// A kerb needs this much room on its side so it stays clear of a neighbouring section's asphalt,
// which reaches up to half a track width back from the far end of the shared gap.
const KERB_ROOM = (KERB_OFFSET + KERB_WIDTH / 2 + TRACK_WIDTH / 2) / 2
const TRACK_SAMPLES = 900
const TERRAIN_MARGIN = 360
const TERRAIN_SEGMENTS = 160
const NIGHT_GLOW = 1.4
// Storm clouds dim the day enough for venues to switch their lights on.
const STORM_GLOW_SHARE = 0.45
const DRY_ASPHALT = new THREE.Color(0x8a9a9f)
const WET_ASPHALT = new THREE.Color(0x4f5a5e)
const DRY_ASPHALT_ROUGHNESS = 0.96
const WET_ASPHALT_ROUGHNESS = 0.3
// Mountain share ranges where grass turns to rock and rock to snow.
const ROCK_LINE: [number, number] = [0.2, 0.42]
const SNOW_LINE: [number, number] = [0.62, 0.74]
const SNOW = new THREE.Color(0xf1f4f4)

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

function addTerrain(scene: THREE.Scene, field: TerrainField, environment: CircuitEnvironment) {
  const geometry = new THREE.PlaneGeometry(field.width, field.depth, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS).rotateX(-Math.PI / 2)
  const positions = geometry.getAttribute('position')
  const colors: number[] = []
  const low = new THREE.Color(environment.ground.low)
  const high = new THREE.Color(environment.ground.high)
  const rock = new THREE.Color(environment.mountains?.color ?? 0)
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index)
    const z = positions.getZ(index)
    const wave = (Math.sin(x * 0.08 + Math.cos(z * 0.06)) + Math.cos(z * 0.11 - x * 0.025) + 2) / 4
    const { height, mountain } = field.sample(x, z)
    positions.setY(index, height)
    const color = low.clone().lerp(high, THREE.MathUtils.smoothstep(wave, 0.28, 0.86))
    if (environment.mountains) {
      color.lerp(rock, THREE.MathUtils.smoothstep(mountain, ROCK_LINE[0], ROCK_LINE[1]))
      if (environment.mountains.hasSnow) color.lerp(SNOW, THREE.MathUtils.smoothstep(mountain, SNOW_LINE[0], SNOW_LINE[1]))
    }
    colors.push(color.r, color.g, color.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  const texture = createSurfaceTexture('#ffffff', '#cccccc')
  texture.repeat.set(field.width / 4, field.depth / 4)
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, map: texture, roughness: 1 }))
  ground.receiveShadow = true
  scene.add(ground)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: environment.ground.floor, roughness: 1 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.3
  floor.receiveShadow = true
  scene.add(floor)
}

function addTrack(scene: THREE.Scene, track: THREE.Vector3[], elevations: number[], vergeColor: number) {
  const raisedTrack = track.map((point, index) => point.clone().setY(elevations[index]))
  // Where two sections run closer than a track width, each asphalt narrows on the facing side so
  // an edge line always separates them.
  const room = roadSideRoom(track, elevations)
  const asphaltLimits = room.map(([left, right]): [number, number] => [left - EDGE_LINE_WIDTH, right - EDGE_LINE_WIDTH])
  const asphaltTexture = createSurfaceTexture('#616765', '#828581')
  // Only the asphalt and edge lines are raised onto a bridge; wider layers stay on the ground,
  // where a neighbouring section's asphalt can cover them.
  const surfaces: [number, number, number, boolean][] = [
    [7.5, -0.02, 0xc4b99b, false], [4.5, 0.01, vergeColor, false],
    [TRACK_WIDTH + EDGE_LINE_WIDTH * 2, 0.04, 0xb4d5d8, true], [TRACK_WIDTH, 0.055, DRY_ASPHALT.getHex(), true],
  ]
  const asphalt = new THREE.MeshStandardMaterial({ color: DRY_ASPHALT, roughness: DRY_ASPHALT_ROUGHNESS, map: asphaltTexture })
  for (const [width, height, color, isRaised] of surfaces) {
    const material = width === TRACK_WIDTH ? asphalt : new THREE.MeshStandardMaterial({ color, roughness: 0.96 })
    const limits = width === TRACK_WIDTH ? asphaltLimits : isRaised ? room : undefined
    const mesh = new THREE.Mesh(createRibbonGeometry(isRaised ? raisedTrack : track, width, height, 0, true, limits), material)
    mesh.receiveShadow = true
    scene.add(mesh)
  }
  const kerbs = new THREE.InstancedMesh(new THREE.BoxGeometry(KERB_WIDTH, 0.07, 0.6), new THREE.MeshStandardMaterial({ roughness: 0.85 }), track.length * 2)
  const dummy = new THREE.Object3D()
  let count = 0
  for (let index = 0; index < track.length; index += 2) {
    const point = track[index]
    const direction = track[(index + 3) % track.length].clone().sub(track[(index - 3 + track.length) % track.length]).normalize()
    const before = point.clone().sub(track[(index - 10 + track.length) % track.length]).normalize()
    const after = track[(index + 10) % track.length].clone().sub(point).normalize()
    if (before.dot(after) > 0.985 || elevations[index] > 0) continue
    for (const side of [-1, 1]) {
      if (room[index][side === -1 ? 0 : 1] < KERB_ROOM) continue
      dummy.position.copy(point).add(new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(side * KERB_OFFSET))
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
  return asphalt
}

function addBridges(scene: THREE.Scene, track: THREE.Vector3[], elevations: number[], crossings: TrackCrossing[]) {
  if (!crossings.length) return
  const walls = new THREE.Mesh(createBridgeWallGeometry(track, elevations, crossings), new THREE.MeshStandardMaterial({ color: 0xb9b7ae, roughness: 0.9, side: THREE.DoubleSide }))
  walls.castShadow = walls.receiveShadow = true
  scene.add(walls)
}

function addStands(scene: THREE.Scene, stands: StandFootprint[]) {
  stands.forEach(({ center, outward, length }, index) => {
    const stand = index === 0 ? createPaddock(length) : createGrandstand(length)
    stand.position.copy(center)
    stand.rotation.y = Math.atan2(outward.x, outward.z)
    scene.add(stand)
  })
}

function addLandmarks(scene: THREE.Scene, landmarks: LandmarkPlacement[]) {
  return landmarks.flatMap(({ kind, x, y, z, rotation }) => {
    if (kind === 'yachts') return []
    const { group, nightMaterials } = createLandmark(kind)
    group.position.set(x, y, z)
    group.rotation.y = rotation
    scene.add(group)
    return nightMaterials
  })
}

function addScenery(scene: THREE.Scene, plan: ReturnType<typeof planScenery>, environment: CircuitEnvironment) {
  addStands(scene, plan.stands)
  const landmarkLights = addLandmarks(scene, plan.landmarks)
  const windowLights = addBuildings(scene, plan.buildings, environment.id)
  addTrees(scene, plan.trees)
  addGroves(scene, plan.groves)
  addYachts(scene, plan.yachts)
  return windowLights ? [...landmarkLights, windowLights] : landmarkLights
}

export function buildCircuit(replay: Replay, circuit: string, weatherAt: WeatherTimeline) {
  const project = createProjection(replay.track)
  const rawTrack = replay.track.map(([x, y]) => project(x, y))
  const track = new THREE.CatmullRomCurve3(rawTrack, true, 'centripetal').getSpacedPoints(TRACK_SAMPLES).slice(0, -1)
  const bounds = new THREE.Box3().setFromPoints(track)
  const size = bounds.getSize(new THREE.Vector3())
  const width = size.x + 38
  const depth = size.z + 38
  const environment = resolveCircuitEnvironment(circuit)
  const plan = planScenery(track, environment, width, depth, width + TERRAIN_MARGIN, depth + TERRAIN_MARGIN)
  const scene = new THREE.Scene()
  const updateRaceLighting = createRaceLighting(scene)
  addTerrain(scene, plan.field, environment)
  addWater(scene, plan.field, environment)
  const crossings = findTrackCrossings(track)
  const elevations = trackElevations(track, crossings)
  const asphalt = addTrack(scene, track, elevations, environment.ground.verge)
  addBridges(scene, track, elevations, crossings)
  const nightMaterials = addScenery(scene, plan, environment)
  const rain = createRain(plan.field.width, plan.field.depth)
  scene.add(rain.streaks)
  const updateAtmosphere = (elapsed: number, isIsolated: boolean, deltaSeconds: number) => {
    const daylight = getRaceDaylight(replay.start, replay.gmt_offset, elapsed)
    const weather = weatherAt(elapsed)
    updateRaceLighting(daylight, weather, isIsolated)
    rain.update(weather.rain, deltaSeconds)
    asphalt.color.copy(DRY_ASPHALT).lerp(WET_ASPHALT, weather.wetness)
    asphalt.roughness = THREE.MathUtils.lerp(DRY_ASPHALT_ROUGHNESS, WET_ASPHALT_ROUGHNESS, weather.wetness)
    const glow = Math.max(1 - daylight, weather.rain * weather.cloudCover * STORM_GLOW_SHARE)
    nightMaterials.forEach((material) => { material.emissiveIntensity = glow * NIGHT_GLOW })
  }
  updateAtmosphere(0, false, 0)
  const cars = new Map(replay.drivers.map((driver) => {
    const car = createCar(driver)
    car.children.forEach((part, index) => { part.castShadow = index === 0 })
    scene.add(car)
    return [driver.number, car] as const
  }))
  return { scene, cars, project, width, depth, track, trackHeightAt: createTrackHeightLookup(track, elevations), updateAtmosphere }
}
