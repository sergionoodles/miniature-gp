import { describe, expect, it } from 'vitest'
import { createWeatherTimeline, describeWeather } from './raceWeather'
import type { Replay } from './replay'

type WeatherReplay = Parameters<typeof createWeatherTimeline>[0]
const AFTERNOON = { start: '2026-06-01T13:00:00Z', gmt_offset: '00:00:00' }
const race = (weather: Replay['weather'], overrides: Partial<WeatherReplay> = {}): WeatherReplay =>
  ({ ...AFTERNOON, duration: 3600, weather, laps: [], stints: [], ...overrides })
const everyMinute = (count: number, sample: (minute: number) => [rain: number, air: number, track: number]) =>
  Array.from({ length: count }, (_, minute) => [minute * 60, ...sample(minute)] as Replay['weather'][number])

describe('race weather timeline', () => {
  it('keeps a hot sunny race dry and clear', () => {
    const weatherAt = createWeatherTimeline(race(everyMinute(60, () => [0, 32, 52])))
    expect(weatherAt(1800)).toMatchObject({ rain: 0, wetness: 0, cloudCover: 0, airTemperature: 32, trackTemperature: 52 })
    expect(describeWeather(weatherAt(1800)).label).toBe('Dry')
  })

  it('infers cloud cover in daylight when the sun is not heating the track', () => {
    const weatherAt = createWeatherTimeline(race(everyMinute(60, () => [0, 16, 19])))
    expect(weatherAt(600).cloudCover).toBeGreaterThan(0.6)
    expect(describeWeather(weatherAt(600)).label).toBe('Overcast')
  })

  it('does not read a cool night track as cloud', () => {
    const weatherAt = createWeatherTimeline(race(everyMinute(60, () => [0, 27, 30]), { start: '2026-06-01T21:00:00Z' }))
    expect(weatherAt(600).cloudCover).toBe(0)
  })

  it('ramps rain in, soaks the track, and dries it gradually once the rain stops', () => {
    const weatherAt = createWeatherTimeline(race(everyMinute(60, (minute) => [minute >= 10 && minute < 20 ? 1 : 0, 16, 20])))
    expect(weatherAt(570).rain).toBeCloseTo(0.5)
    expect(describeWeather(weatherAt(480)).label).toBe('Light rain')
    expect(weatherAt(900)).toMatchObject({ rain: 1, cloudCover: 1 })
    const soaked = weatherAt(1200).wetness
    expect(soaked).toBeGreaterThan(0.5)
    expect(weatherAt(1500).rain).toBe(0)
    expect(weatherAt(1500).wetness).toBeGreaterThan(0)
    expect(weatherAt(1500).wetness).toBeLessThan(soaked)
    expect(weatherAt(3500).wetness).toBe(0)
  })

  it('treats a field on wet tyres as a wet track even without recorded rain', () => {
    const weatherAt = createWeatherTimeline(race(everyMinute(60, () => [0, 17, 22]), {
      laps: [[0, 1, 1], [0, 2, 1], [100, 1, 2], [100, 2, 2], [200, 1, 3], [200, 2, 3]],
      stints: [[1, 1, 2, 'INTERMEDIATE'], [1, 3, null, 'MEDIUM'], [2, null, 2, 'INTERMEDIATE'], [2, 3, 3, 'HARD']],
    }))
    expect(weatherAt(50).wetness).toBeCloseTo(0.75)
    expect(describeWeather(weatherAt(50)).label).toBe('Wet track')
    expect(weatherAt(250).wetness).toBe(0)
  })

  it('falls back to clear weather when a replay has no samples', () => {
    expect(createWeatherTimeline(race([]))(100)).toMatchObject({ rain: 0, wetness: 0, cloudCover: 0 })
  })
})
