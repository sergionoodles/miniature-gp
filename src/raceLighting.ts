import * as THREE from 'three'
import type { WeatherState } from './raceWeather'

const SECONDS_PER_HOUR = 3600
const HOURS_PER_DAY = 24
const DAWN_START = 6
const DAWN_END = 7
const DUSK_START = 18
const DUSK_END = 19

export function getRaceLocalHour(start: string, offset: string | undefined, elapsed: number) {
  const match = offset?.match(/^([+-]?)(\d{2}):([0-5]\d)(?::([0-5]\d))?$/)
  const timestamp = Date.parse(start)
  if (!match || Number(match[2]) > 23 || !Number.isFinite(timestamp) || !Number.isFinite(elapsed) || !/(Z|[+-]\d{2}:\d{2})$/i.test(start)) return null
  const offsetSeconds = (Number(match[2]) * SECONDS_PER_HOUR + Number(match[3]) * 60 + Number(match[4] ?? 0)) * (match[1] === '-' ? -1 : 1)
  const localHours = (timestamp / 1000 + offsetSeconds + elapsed) / SECONDS_PER_HOUR
  return ((localHours % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY
}

export function getRaceDaylight(start: string, offset: string | undefined, elapsed: number) {
  const hour = getRaceLocalHour(start, offset, elapsed)
  if (hour === null) return 1
  // Clock-based twilight: exact solar elevation would also require circuit coordinates.
  return THREE.MathUtils.smoothstep(hour, DAWN_START, DAWN_END) * (1 - THREE.MathUtils.smoothstep(hour, DUSK_START, DUSK_END))
}

// Clouds only change how daylight looks; floodlit night races keep their contrast.
const OVERCAST_SUN_LOSS = 0.72
const OVERCAST_FILL_GAIN = 0.35
const RAIN_SKY_DARKENING = 0.55
// Visibility shrinks from clear-day haze to a curtain of spray in heavy rain.
const CLEAR_FOG: [number, number] = [280, 760]
const RAIN_FOG: [number, number] = [150, 520]
const OVERCAST_FOG_SHARE = 0.25
const HAZE_AIR_TEMPERATURE: [number, number] = [26, 36]
const COLD_AIR_TEMPERATURE: [number, number] = [8, 18]
const HEAT_HAZE_STRENGTH = 0.35
const COLD_TINT_STRENGTH = 0.3
// The sun sweeps across the back of the default view so shadows always fall toward the viewer,
// low and golden early and late in the day. The GPS frame is not north-aligned, so the arc is
// an art choice rather than a solar calculation.
const SUN_DISTANCE = 160
const SUN_ELEVATION: [number, number] = [0.26, 1.08]
const SUN_AZIMUTH: [number, number] = [-2.6, -0.55]
const DEFAULT_SUN_HOUR = 14
const MOON_DIRECTION = new THREE.Vector3(-0.35, 0.85, -0.4).normalize()
const GOLDEN_HOUR_STRENGTH = 0.6
// Image-based sky light: a clear day reflects a bright sky, overcast and night skies far less.
const DAY_ENVIRONMENT = 0.55
const NIGHT_ENVIRONMENT = 0.06
const OVERCAST_ENVIRONMENT_LOSS = 0.35
const SHADOW_MAP_SIZE = 2048

export function sunDirection(hour: number | null) {
  const progress = THREE.MathUtils.clamp(((hour ?? DEFAULT_SUN_HOUR) - DAWN_START) / (DUSK_END - DAWN_START), 0, 1)
  const elevation = THREE.MathUtils.lerp(SUN_ELEVATION[0], SUN_ELEVATION[1], Math.sin(Math.PI * progress))
  const azimuth = THREE.MathUtils.lerp(SUN_AZIMUTH[0], SUN_AZIMUTH[1], progress)
  return new THREE.Vector3(Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation))
}

export function createRaceLighting(scene: THREE.Scene, shadowExtent = 150) {
  const daySky = new THREE.Color(0xd9e5e6)
  const overcastSky = new THREE.Color(0xa9b3b7)
  const stormSky = new THREE.Color(0x5f6b71)
  const nightSky = new THREE.Color(0x101e2b)
  const dayFill = new THREE.Color(0xe8f4ff)
  const overcastFill = new THREE.Color(0xd6dde2)
  const nightFill = new THREE.Color(0x8caecb)
  const dayGround = new THREE.Color(0xa89775)
  const wetGround = new THREE.Color(0x6f6c60)
  const nightGround = new THREE.Color(0x17282c)
  const daySun = new THREE.Color(0xffefd3)
  const overcastSun = new THREE.Color(0xe3e8eb)
  const hotSun = new THREE.Color(0xffd6a0)
  const coldSun = new THREE.Color(0xdce9ff)
  const nightSun = new THREE.Color(0xb0cbe7)
  const heatHaze = new THREE.Color(0xe8dcc2)
  const goldenSun = new THREE.Color(0xffb46e)
  const background = new THREE.Color()
  const dayColor = new THREE.Color()
  const fog = new THREE.Fog(0, CLEAR_FOG[0], CLEAR_FOG[1])
  const fill = new THREE.HemisphereLight()
  const sun = new THREE.DirectionalLight()
  sun.castShadow = true
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
  Object.assign(sun.shadow.camera, { left: -shadowExtent, right: shadowExtent, top: shadowExtent, bottom: -shadowExtent, near: 1, far: SUN_DISTANCE + shadowExtent * 1.5 })
  sun.shadow.normalBias = 0.12
  sun.shadow.bias = -0.0003
  sun.shadow.radius = 2.5
  scene.background = background
  scene.fog = fog
  scene.add(fill, sun)
  let previous = ''
  return (daylight: number, weather: WeatherState, isIsolated: boolean, localHour: number | null = null) => {
    const key = [daylight, weather.rain, weather.cloudCover, weather.wetness, weather.airTemperature, isIsolated, localHour].join()
    if (key === previous) return
    previous = key
    const { rain, cloudCover, wetness, airTemperature } = weather
    const heat = THREE.MathUtils.smoothstep(airTemperature, HAZE_AIR_TEMPERATURE[0], HAZE_AIR_TEMPERATURE[1]) * (1 - cloudCover)
    const cold = 1 - THREE.MathUtils.smoothstep(airTemperature, COLD_AIR_TEMPERATURE[0], COLD_AIR_TEMPERATURE[1])
    const murk = Math.max(rain, cloudCover * OVERCAST_FOG_SHARE)

    dayColor.copy(daySky).lerp(heatHaze, heat * HEAT_HAZE_STRENGTH).lerp(overcastSky, cloudCover).lerp(stormSky, rain * RAIN_SKY_DARKENING)
    background.copy(nightSky).lerp(dayColor, daylight)
    fog.color.copy(background)
    fog.near = THREE.MathUtils.lerp(CLEAR_FOG[0], RAIN_FOG[0], murk)
    fog.far = THREE.MathUtils.lerp(CLEAR_FOG[1], RAIN_FOG[1], murk)

    fill.color.copy(nightFill).lerp(dayColor.copy(dayFill).lerp(overcastFill, cloudCover), daylight)
    fill.groundColor.copy(nightGround).lerp(dayColor.copy(dayGround).lerp(wetGround, wetness), daylight)
    fill.intensity = THREE.MathUtils.lerp(0.7, 1.5 * (1 + cloudCover * OVERCAST_FILL_GAIN), daylight)

    const direction = sunDirection(localHour)
    const lowSun = 1 - THREE.MathUtils.smoothstep(direction.y, Math.sin(SUN_ELEVATION[0]), Math.sin(SUN_ELEVATION[1]) * 0.7)
    sun.position.copy(direction.lerp(MOON_DIRECTION, 1 - daylight).normalize().multiplyScalar(SUN_DISTANCE))
    dayColor.copy(daySun).lerp(goldenSun, lowSun * GOLDEN_HOUR_STRENGTH).lerp(coldSun, cold * COLD_TINT_STRENGTH).lerp(hotSun, heat * HEAT_HAZE_STRENGTH).lerp(overcastSun, cloudCover)
    sun.color.copy(nightSun).lerp(dayColor, daylight)
    sun.intensity = THREE.MathUtils.lerp(0.9, 3.4 * (1 - cloudCover * OVERCAST_SUN_LOSS), daylight)
    scene.environmentIntensity = THREE.MathUtils.lerp(NIGHT_ENVIRONMENT, DAY_ENVIRONMENT * (1 - cloudCover * OVERCAST_ENVIRONMENT_LOSS), daylight)
    if (isIsolated) {
      const luminance = background.r * 0.2126 + background.g * 0.7152 + background.b * 0.0722
      background.setRGB(luminance, luminance, luminance)
    }
  }
}
