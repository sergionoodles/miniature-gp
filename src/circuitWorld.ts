import * as THREE from 'three'
import { resolveCircuitEnvironment, type CircuitEnvironment } from './circuitEnvironments'
import { createLandmark } from './circuitLandmarks'
import { createRaceLighting, getRaceDaylight, getRaceLocalHour } from './raceLighting'
import type { WeatherTimeline } from './raceWeather'
import { createRain, createRainSplashes } from './rainEffect'
import { lappedDriversAt, type Replay } from './replay'
import { createProjection } from './circuitGeometry'
import { createCarKit } from './carModel'
import type { GraphicsQuality } from './graphicsQuality'
import { createCarSpray } from './carSpray'
import { createGrandstand, createPaddock } from './sceneAssets'
import { addBuildings, addGroves, addTrees, addWater, addYachts } from './sceneryMeshes'
import { planScenery, type LandmarkPlacement, type StandFootprint } from './sceneryPlan'
import { createGroundTexture } from './proceduralTextures'
import { createCloudShadows, sceneMaterials } from './shaderPatches'
import type { TerrainField } from './terrainField'
import { createTrackHeightLookup, findTrackCrossings, trackElevations } from './trackCrossings'
import { addBridges, addTrackside, DRY_ASPHALT, DRY_ASPHALT_ROUGHNESS, WET_ASPHALT, WET_ASPHALT_ROUGHNESS } from './trackside'

const TRACK_SAMPLES = 900
const TERRAIN_MARGIN = 360
const TERRAIN_SEGMENTS = 160
const GROUND_TEXTURE_SIZE = 12
const NIGHT_GLOW = 1.4
const NIGHT_CAR_PAINT_GLOW = 0.18
// Storm clouds dim the day enough for venues to switch their lights on.
const STORM_GLOW_SHARE = 0.45
// Floodlights keep the racing surface bright at night; the masts' lamps glow hot enough to bloom.
const TRACK_FLOODLIGHT = 0.3
const FIXTURE_GLOW = 4
const DAY_BLOOM = 0.35
const NIGHT_BLOOM = 0.9
const SHADOW_MARGIN = 24
const STANDARD_RAIN_DENSITY = 0.35
const RAIN_LIGHT_WETNESS = 0.3
const RAIN_LIGHT_FLASH = 0.5
const RAIN_LIGHT_FLASH_SPEED = 20
// Mountain share ranges where grass turns to rock and rock to snow.
const ROCK_LINE: [number, number] = [0.2, 0.42]
const SNOW_LINE: [number, number] = [0.62, 0.74]
const SNOW = new THREE.Color(0xf1f4f4)
const SAND = 0xd8c89c
const MUD = 0x8c8a66
const PATCH_CONTRAST = 0.12
const SLOPE_SHADE = 0.8

function addTerrain(scene: THREE.Scene, field: TerrainField, environment: CircuitEnvironment, isDetailed: boolean) {
  const geometry = new THREE.PlaneGeometry(field.width, field.depth, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS).rotateX(-Math.PI / 2)
  const positions = geometry.getAttribute('position')
  const colors: number[] = []
  const low = new THREE.Color(environment.ground.low)
  const high = new THREE.Color(environment.ground.high)
  const rock = new THREE.Color(environment.mountains?.color ?? 0)
  const shore = new THREE.Color(environment.water.features.some(({ kind }) => kind === 'coast') ? SAND : MUD)
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index)
    const z = positions.getZ(index)
    const wave = (Math.sin(x * 0.08 + Math.cos(z * 0.06)) + Math.cos(z * 0.11 - x * 0.025) + 2) / 4
    // A finer, independent pattern breaks the broad bands into meadow patches.
    const patches = (Math.sin(x * 0.31 + z * 0.07) * Math.cos(z * 0.27 - x * 0.12) + 1) / 2
    const { height, mountain, water } = field.sample(x, z)
    positions.setY(index, height)
    const color = low.clone().lerp(high, THREE.MathUtils.smoothstep(wave, 0.28, 0.86)).multiplyScalar(1 + (patches - 0.5) * PATCH_CONTRAST)
    color.lerp(shore, THREE.MathUtils.smoothstep(water, 0.02, 0.35))
    if (environment.mountains) {
      color.lerp(rock, THREE.MathUtils.smoothstep(mountain, ROCK_LINE[0], ROCK_LINE[1]))
      if (environment.mountains.hasSnow) color.lerp(SNOW, THREE.MathUtils.smoothstep(mountain, SNOW_LINE[0], SNOW_LINE[1]))
    }
    colors.push(color.r, color.g, color.b)
  }
  geometry.computeVertexNormals()
  // Steep ground reads darker and rockier, which shapes hills even under a flat overcast sky.
  const normals = geometry.getAttribute('normal')
  for (let index = 0; index < normals.count; index++) {
    const shade = THREE.MathUtils.lerp(SLOPE_SHADE, 1, normals.getY(index) ** 6)
    for (let channel = 0; channel < 3; channel++) colors[index * 3 + channel] *= shade
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const texture = createGroundTexture()
  texture.repeat.set(field.width / GROUND_TEXTURE_SIZE, field.depth / GROUND_TEXTURE_SIZE)
  // Fully rough ground looks the same under Lambert shading, which is far cheaper across the screen.
  const groundParameters = { vertexColors: true, map: texture }
  const ground = new THREE.Mesh(geometry, isDetailed ? new THREE.MeshStandardMaterial({ ...groundParameters, roughness: 1 }) : new THREE.MeshLambertMaterial(groundParameters))
  ground.receiveShadow = true
  scene.add(ground)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: environment.ground.floor, roughness: 1 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.3
  floor.receiveShadow = true
  scene.add(floor)
}

function addStands(scene: THREE.Scene, stands: StandFootprint[], teamColors: string[], seed: string, isDetailed: boolean) {
  stands.forEach(({ center, outward, length }, index) => {
    const stand = index === 0 ? createPaddock(length, teamColors) : createGrandstand(length, teamColors, `${seed}:${index}`, isDetailed)
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

function addScenery(scene: THREE.Scene, plan: ReturnType<typeof planScenery>, environment: CircuitEnvironment, teamColors: string[], isDetailed: boolean) {
  addStands(scene, plan.stands, teamColors, environment.id, isDetailed)
  const landmarkLights = addLandmarks(scene, plan.landmarks)
  const windowLights = addBuildings(scene, plan.buildings, environment.id)
  addTrees(scene, plan.trees, isDetailed)
  addGroves(scene, plan.groves, isDetailed)
  addYachts(scene, plan.yachts)
  return [...landmarkLights, ...windowLights]
}

// Standard quality builds a lighter scene: simpler foliage and crowds, cheaper shading, no
// cloud shadows, thinner rain and none of the per-frame water, splash or spray effects.
export function buildCircuit(replay: Replay, circuit: string, weatherAt: WeatherTimeline, quality: GraphicsQuality = 'high') {
  const isDetailed = quality === 'high'
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
  const overlay = new THREE.Scene()
  const updateRaceLighting = createRaceLighting(scene, Math.max(width, depth) / 2 + SHADOW_MARGIN)
  addTerrain(scene, plan.field, environment, isDetailed)
  const updateWater = addWater(scene, plan.field, environment, isDetailed)
  const crossings = findTrackCrossings(track)
  const elevations = trackElevations(track, crossings)
  const { asphalt, litSurfaces, fixtures } = addTrackside(scene, overlay, track, elevations, { vergeColor: environment.ground.verge, isFloodlit: Boolean(environment.isFloodlit), driverCount: replay.drivers.length, seed: environment.id })
  addBridges(scene, track, elevations, crossings)
  const teamColors = [...new Set(replay.drivers.map(({ color }) => color))]
  const nightMaterials = addScenery(scene, plan, environment, teamColors, isDetailed)
  const carPaints: THREE.MeshStandardMaterial[] = []
  const rain = createRain(plan.field.width, plan.field.depth, isDetailed ? 1 : STANDARD_RAIN_DENSITY)
  const splashes = createRainSplashes(track)
  scene.add(rain.streaks, splashes.points)
  const cloudShadows = createCloudShadows()
  let currentWeather = weatherAt(0)
  const updateAtmosphere = (elapsed: number, isIsolated: boolean, deltaSeconds: number) => {
    const daylight = getRaceDaylight(replay.start, replay.gmt_offset, elapsed)
    const weather = weatherAt(elapsed)
    currentWeather = weather
    updateRaceLighting(daylight, weather, isIsolated, getRaceLocalHour(replay.start, replay.gmt_offset, elapsed))
    cloudShadows.update(weather.cloudCover * daylight, deltaSeconds)
    rain.update(weather.rain, deltaSeconds)
    splashes.update(isDetailed ? weather.rain : 0, deltaSeconds)
    updateWater(deltaSeconds)
    asphalt.color.copy(DRY_ASPHALT).lerp(WET_ASPHALT, weather.wetness)
    asphalt.roughness = THREE.MathUtils.lerp(DRY_ASPHALT_ROUGHNESS, WET_ASPHALT_ROUGHNESS, weather.wetness)
    const glow = Math.max(1 - daylight, weather.rain * weather.cloudCover * STORM_GLOW_SHARE)
    nightMaterials.forEach((material) => { material.emissiveIntensity = glow * NIGHT_GLOW })
    fixtures.forEach((material) => { material.emissiveIntensity = glow * FIXTURE_GLOW })
    litSurfaces.forEach((material) => { material.emissiveIntensity = glow * TRACK_FLOODLIGHT })
    carPaints.forEach((paint) => { paint.emissiveIntensity = (1 - daylight) * NIGHT_CAR_PAINT_GLOW })
    return { bloom: THREE.MathUtils.lerp(DAY_BLOOM, NIGHT_BLOOM, glow) }
  }
  const carKit = createCarKit(isDetailed)
  const rainLights: THREE.Mesh[] = []
  const setCarLapped = new Map<number, (isLapped: boolean) => void>()
  const cars = new Map(replay.drivers.map((driver) => {
    const { group: car, paint, rainLight, setLapped } = carKit.createCar(driver)
    carPaints.push(paint)
    rainLights.push(rainLight)
    setCarLapped.set(driver.number, setLapped)
    scene.add(car)
    return [driver.number, car] as const
  }))
  const updateCarLivery = (time: number) => {
    const lapped = lappedDriversAt(replay.laps, time)
    setCarLapped.forEach((setLapped, driver) => setLapped(lapped.has(driver)))
  }
  const spray = createCarSpray(cars.size)
  scene.add(spray.points)
  if (isDetailed) cloudShadows.applyTo(sceneMaterials(scene))
  updateAtmosphere(0, false, 0)
  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let effectsClock = 0
  // Runs after the cars are placed for the frame, so spray leaves from where each car now is.
  const updateCarEffects = (deltaSeconds: number) => {
    effectsClock += deltaSeconds
    const isWet = currentWeather.wetness > RAIN_LIGHT_WETNESS || currentWeather.rain > RAIN_LIGHT_WETNESS
    const isFlashing = currentWeather.rain > RAIN_LIGHT_FLASH && !isReducedMotion
    const isLit = isWet && (!isFlashing || Math.sin(effectsClock * RAIN_LIGHT_FLASH_SPEED) > 0)
    rainLights.forEach((light) => { light.visible = isLit })
    spray.update([...cars.values()], isDetailed ? currentWeather.wetness : 0, deltaSeconds)
  }
  return { scene, overlay, cars, updateCarEffects, updateCarLivery, project, width, depth, track, trackHeightAt: createTrackHeightLookup(track, elevations), updateAtmosphere }
}
