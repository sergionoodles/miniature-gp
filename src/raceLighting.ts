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
const CLEAR_FOG: [number, number] = [210, 540]
const RAIN_FOG: [number, number] = [160, 520]
const OVERCAST_FOG_SHARE = 0.25
const HAZE_AIR_TEMPERATURE: [number, number] = [26, 36]
const COLD_AIR_TEMPERATURE: [number, number] = [8, 18]
const HEAT_HAZE_STRENGTH = 0.35
const COLD_TINT_STRENGTH = 0.3

export function createRaceLighting(scene: THREE.Scene) {
  const daySky = new THREE.Color(0xd9e5e6)
  const overcastSky = new THREE.Color(0xa9b3b7)
  const stormSky = new THREE.Color(0x5f6b71)
  const nightSky = new THREE.Color(0x09151f)
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
  const background = new THREE.Color()
  const dayColor = new THREE.Color()
  const fog = new THREE.Fog(0, CLEAR_FOG[0], CLEAR_FOG[1])
  const fill = new THREE.HemisphereLight()
  const sun = new THREE.DirectionalLight()
  sun.position.set(-70, 110, 50)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 1, far: 300 })
  sun.shadow.normalBias = 0.2
  sun.shadow.bias = -0.0002
  scene.background = background
  scene.fog = fog
  scene.add(fill, sun)
  let previous = ''
  return (daylight: number, weather: WeatherState, isIsolated: boolean) => {
    const key = [daylight, weather.rain, weather.cloudCover, weather.wetness, weather.airTemperature, isIsolated].join()
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
    fill.intensity = THREE.MathUtils.lerp(0.65, 2.2 * (1 + cloudCover * OVERCAST_FILL_GAIN), daylight)

    dayColor.copy(daySun).lerp(coldSun, cold * COLD_TINT_STRENGTH).lerp(hotSun, heat * HEAT_HAZE_STRENGTH).lerp(overcastSun, cloudCover)
    sun.color.copy(nightSun).lerp(dayColor, daylight)
    sun.intensity = THREE.MathUtils.lerp(0.85, 3.2 * (1 - cloudCover * OVERCAST_SUN_LOSS), daylight)
    if (isIsolated) {
      const luminance = background.r * 0.2126 + background.g * 0.7152 + background.b * 0.0722
      background.setRGB(luminance, luminance, luminance)
    }
  }
}
