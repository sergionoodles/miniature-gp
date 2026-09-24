import { describe, expect, it } from 'vitest'
import { Scene, Color, DirectionalLight, Fog, Light } from 'three'
import { createRaceLighting, getRaceDaylight } from './raceLighting'
import type { WeatherState } from './raceWeather'

describe('race lighting from local time', () => {
  it('renders the bundled afternoon races in daylight', () => {
    expect(getRaceDaylight('2026-09-06T13:03:30.936000+00:00', '02:00:00', 0)).toBe(1)
    expect(getRaceDaylight('2026-08-23T13:03:28.567000+00:00', '02:00:00', 7485)).toBe(1)
  })
  it('uses local time rather than UTC or the viewer timezone', () => {
    expect(getRaceDaylight('2026-10-11T12:00:00Z', '08:00:00', 0)).toBe(0)
    expect(getRaceDaylight('2026-11-21T03:00:00Z', '-08:00:00', 0)).toBe(0)
    expect(getRaceDaylight('2026-11-21T20:00:00Z', '-08:00:00', 0)).toBe(1)
    expect(getRaceDaylight('2026-09-06T15:00:00+02:00', '+02:00:00', 0)).toBe(1)
  })
  it('supports fractional offsets and transitions as the replay is scrubbed', () => {
    const start = '2026-01-01T12:00:00Z'
    expect(getRaceDaylight(start, '+05:30:00', 0)).toBe(1)
    expect(getRaceDaylight(start, '+05:30:00', 3600)).toBeCloseTo(0.5)
    expect(getRaceDaylight(start, '+05:30:00', 7200)).toBe(0)
    expect(getRaceDaylight(start, '+05:30:00', 0)).toBe(1)
  })
  it('handles midnight rollover and dawn', () => {
    expect(getRaceDaylight('2026-01-01T15:00:00Z', '08:00:00', 7200)).toBe(0)
    expect(getRaceDaylight('2026-01-01T22:30:00Z', '08:00:00', 0)).toBeCloseTo(0.5)
  })
  it('defaults to daylight when local time cannot be established', () => {
    expect(getRaceDaylight('2026-01-01T23:00:00Z', undefined, 0)).toBe(1)
    expect(getRaceDaylight('invalid', '02:00:00', 0)).toBe(1)
    expect(getRaceDaylight('2026-01-01T23:00:00Z', '99:00:00', 0)).toBe(1)
    expect(getRaceDaylight('2026-01-01T23:00:00', '02:00:00', 0)).toBe(1)
  })
})

const CLEAR: WeatherState = { rain: 0, wetness: 0, cloudCover: 0, airTemperature: 22, trackTemperature: 38 }
const totalLight = (scene: Scene) => scene.children.reduce((sum, child) => sum + (child instanceof Light ? child.intensity : 0), 0)
const sunIntensity = (scene: Scene) => scene.children.find((child) => child instanceof DirectionalLight)?.intensity ?? 0

it('updates the rendered environment on seeking and restores the current sky after hover isolation', () => {
  const scene = new Scene()
  const updateLighting = createRaceLighting(scene)
  updateLighting(1, CLEAR, false)
  const daylightSky = (scene.background as Color).clone()
  const daylightIntensity = totalLight(scene)
  updateLighting(0, CLEAR, false)
  const nightSky = (scene.background as Color).clone()
  expect(nightSky.getHex()).not.toBe(daylightSky.getHex())
  expect(totalLight(scene)).toBeLessThan(daylightIntensity)
  updateLighting(1, CLEAR, true)
  const isolatedSky = scene.background as Color
  expect(isolatedSky.r).toBeCloseTo(isolatedSky.g)
  expect(isolatedSky.g).toBeCloseTo(isolatedSky.b)
  updateLighting(0, CLEAR, true)
  updateLighting(0, CLEAR, false)
  expect((scene.background as Color).equals(nightSky)).toBe(true)
  updateLighting(1, CLEAR, false)
  expect((scene.background as Color).equals(daylightSky)).toBe(true)
})

describe('race lighting from weather', () => {
  it('dims the sun and greys the sky under cloud and rain', () => {
    const scene = new Scene()
    const updateLighting = createRaceLighting(scene)
    updateLighting(1, CLEAR, false)
    const clearSun = sunIntensity(scene)
    const clearSky = (scene.background as Color).clone()
    updateLighting(1, { ...CLEAR, cloudCover: 1, rain: 1, wetness: 1 }, false)
    const stormSky = scene.background as Color
    expect(sunIntensity(scene)).toBeLessThan(clearSun * 0.5)
    expect(stormSky.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(clearSky.getHSL({ h: 0, s: 0, l: 0 }).l)
  })

  it('pulls the fog in as rain gets heavier', () => {
    const scene = new Scene()
    const updateLighting = createRaceLighting(scene)
    updateLighting(1, CLEAR, false)
    const clearFar = (scene.fog as Fog).far
    updateLighting(1, { ...CLEAR, rain: 0.5, cloudCover: 1 }, false)
    const drizzleFar = (scene.fog as Fog).far
    updateLighting(1, { ...CLEAR, rain: 1, cloudCover: 1 }, false)
    expect(drizzleFar).toBeLessThan(clearFar)
    expect((scene.fog as Fog).far).toBeLessThan(drizzleFar)
  })

  it('keeps floodlit night races unaffected by inferred cloud', () => {
    const scene = new Scene()
    const updateLighting = createRaceLighting(scene)
    updateLighting(0, CLEAR, false)
    const clearNight = totalLight(scene)
    updateLighting(0, { ...CLEAR, cloudCover: 0.8 }, false)
    expect(totalLight(scene)).toBeCloseTo(clearNight)
  })
})
