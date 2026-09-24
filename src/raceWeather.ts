import * as THREE from 'three'
import { getRaceLocalHour } from './raceLighting'
import type { Replay } from './replay'

export type WeatherState = {
  rain: number
  wetness: number
  cloudCover: number
  airTemperature: number
  trackTemperature: number
}
export type WeatherTimeline = (elapsed: number) => WeatherState

const TIMELINE_STEP_SECONDS = 10
const WETTING_SECONDS = 240
const DRYING_SECONDS = 1200
// Drying speeds up by one base rate for every this many degrees of track above the reference.
const DRYING_REFERENCE_TRACK = 20
const DRYING_TRACK_SPAN = 15
// Rain alone only makes the track damp; standing water is inferred from teams choosing wet tyres.
const RAIN_DAMPNESS = 0.6
const TYRE_WETNESS: Record<string, number> = { INTERMEDIATE: 0.75, WET: 1 }
// Drivers whose last lap is this much older than the field's latest lap have retired.
const RETIRED_LAP_GAP_SECONDS = 400
// The rain flag flickers between samples, so intensity is the share of wet readings nearby.
const RAIN_WINDOW_SECONDS = 300
const RAIN_WINDOW_SAMPLES = 11
// Sunshine heats asphalt well above the air; a small gap under a high sun means cloud.
// A low morning or evening sun also leaves a small gap, so those hours are not read as cloud.
const HIGH_SUN_HOURS: [number, number, number, number] = [8, 10, 16, 18]
const OVERCAST_TRACK_GAP = 5
const CLEAR_TRACK_GAP = 15
const MAX_DRY_CLOUD = 0.85
const DEFAULT_TEMPERATURE = 20
const CLEAR_WEATHER: WeatherState = { rain: 0, wetness: 0, cloudCover: 0, airTemperature: DEFAULT_TEMPERATURE, trackTemperature: DEFAULT_TEMPERATURE }

function interpolateWeather(samples: Replay['weather'], time: number) {
  const nextIndex = samples.findIndex(([sampleTime]) => sampleTime > time)
  if (nextIndex === 0) return samples[0]
  if (nextIndex === -1) return samples[samples.length - 1]
  const before = samples[nextIndex - 1]
  const after = samples[nextIndex]
  const fraction = (time - before[0]) / (after[0] - before[0])
  return before.map((value, index) => THREE.MathUtils.lerp(value, after[index], fraction)) as Replay['weather'][number]
}

function rainIntensity(samples: Replay['weather'], time: number) {
  const offsets = Array.from({ length: RAIN_WINDOW_SAMPLES }, (_, index) => (index / (RAIN_WINDOW_SAMPLES - 1) - 0.5) * RAIN_WINDOW_SECONDS)
  return offsets.reduce((sum, offset) => sum + interpolateWeather(samples, time + offset)[1], 0) / RAIN_WINDOW_SAMPLES
}

function sunHeight(replay: Pick<Replay, 'start' | 'gmt_offset'>, time: number) {
  const hour = getRaceLocalHour(replay.start, replay.gmt_offset, time)
  if (hour === null) return 1
  const [riseStart, riseEnd, setStart, setEnd] = HIGH_SUN_HOURS
  return THREE.MathUtils.smoothstep(hour, riseStart, riseEnd) * (1 - THREE.MathUtils.smoothstep(hour, setStart, setEnd))
}

function compoundForLap(stints: Replay['stints'], driver: number, lap: number) {
  const stint = stints.find(([stintDriver, firstLap, lastLap]) => stintDriver === driver && (firstLap ?? 1) <= lap && (lastLap === null || lap <= lastLap))
  return stint?.[3] ?? null
}

function createTyreWetness(replay: Pick<Replay, 'laps' | 'stints'>) {
  const currentLaps = new Map<number, { time: number; lap: number }>()
  let nextLap = 0
  return (time: number) => {
    for (; nextLap < replay.laps.length && replay.laps[nextLap][0] <= time; nextLap++) {
      const [lapTime, driver, lap] = replay.laps[nextLap]
      currentLaps.set(driver, { time: lapTime, lap })
    }
    const latestLap = Math.max(...[...currentLaps.values()].map((entry) => entry.time))
    const running = [...currentLaps].filter(([, entry]) => latestLap - entry.time < RETIRED_LAP_GAP_SECONDS)
    if (!running.length) return 0
    const total = running.reduce((sum, [driver, { lap }]) => sum + (TYRE_WETNESS[compoundForLap(replay.stints, driver, lap) ?? ''] ?? 0), 0)
    return total / running.length
  }
}

function cloudFromTemperatures(air: number, track: number) {
  return MAX_DRY_CLOUD * (1 - THREE.MathUtils.smoothstep(track - air, OVERCAST_TRACK_GAP, CLEAR_TRACK_GAP))
}

// Weather is recorded about once a minute as a rain flag plus air and track temperatures,
// so the continuous state is integrated once per replay and interpolated while rendering.
export function createWeatherTimeline(replay: Pick<Replay, 'start' | 'gmt_offset' | 'duration' | 'weather' | 'laps' | 'stints'>): WeatherTimeline {
  if (!replay.weather.length) return () => CLEAR_WEATHER
  const tyreWetnessAt = createTyreWetness(replay)
  const states: WeatherState[] = []
  let rainSoak = 0
  for (let time = 0; time <= replay.duration + TIMELINE_STEP_SECONDS; time += TIMELINE_STEP_SECONDS) {
    const [, , airTemperature, trackTemperature] = interpolateWeather(replay.weather, time)
    const rain = rainIntensity(replay.weather, time)
    const dryingRate = 1 + Math.max(0, trackTemperature - DRYING_REFERENCE_TRACK) / DRYING_TRACK_SPAN
    const soakChange = rain * TIMELINE_STEP_SECONDS / WETTING_SECONDS - (1 - rain) * dryingRate * TIMELINE_STEP_SECONDS / DRYING_SECONDS
    rainSoak = time === 0 ? rain : THREE.MathUtils.clamp(rainSoak + soakChange, 0, 1)
    states.push({
      rain,
      wetness: Math.max(rainSoak * RAIN_DAMPNESS, tyreWetnessAt(time)),
      cloudCover: Math.max(rain, cloudFromTemperatures(airTemperature, trackTemperature) * sunHeight(replay, time)),
      airTemperature,
      trackTemperature,
    })
  }
  return (elapsed) => {
    const position = THREE.MathUtils.clamp(elapsed / TIMELINE_STEP_SECONDS, 0, states.length - 1)
    const before = states[Math.floor(position)]
    const after = states[Math.ceil(position)]
    const fraction = position - Math.floor(position)
    return {
      rain: THREE.MathUtils.lerp(before.rain, after.rain, fraction),
      wetness: THREE.MathUtils.lerp(before.wetness, after.wetness, fraction),
      cloudCover: THREE.MathUtils.lerp(before.cloudCover, after.cloudCover, fraction),
      airTemperature: THREE.MathUtils.lerp(before.airTemperature, after.airTemperature, fraction),
      trackTemperature: THREE.MathUtils.lerp(before.trackTemperature, after.trackTemperature, fraction),
    }
  }
}

export function describeWeather(weather: WeatherState) {
  if (weather.rain >= 0.5) return { symbol: '☂', label: 'Rain' }
  if (weather.rain >= 0.15) return { symbol: '☂', label: 'Light rain' }
  if (weather.wetness >= 0.5) return { symbol: '≈', label: 'Wet track' }
  if (weather.wetness >= 0.15) return { symbol: '≈', label: 'Damp' }
  if (weather.cloudCover >= 0.6) return { symbol: '☁', label: 'Overcast' }
  return { symbol: '☀', label: 'Dry' }
}
