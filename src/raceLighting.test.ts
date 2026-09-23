import { describe, expect, it } from 'vitest'
import { Scene, Color, Light } from 'three'
import { createRaceLighting, getRaceDaylight } from './raceLighting'

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

it('updates the rendered environment on seeking and restores the current sky after hover isolation', () => {
  const scene = new Scene()
  const updateLighting = createRaceLighting(scene, { start: '2026-01-01T17:00:00Z', gmt_offset: '00:00:00' })
  updateLighting(0, false)
  const daylightSky = (scene.background as Color).clone()
  const daylightIntensity = scene.children.reduce((sum, child) => sum + (child instanceof Light ? child.intensity : 0), 0)
  updateLighting(7200, false)
  const nightSky = (scene.background as Color).clone()
  expect(nightSky.getHex()).not.toBe(daylightSky.getHex())
  expect(scene.children.reduce((sum, child) => sum + (child instanceof Light ? child.intensity : 0), 0)).toBeLessThan(daylightIntensity)
  updateLighting(0, true)
  const isolatedSky = scene.background as Color
  expect(isolatedSky.r).toBeCloseTo(isolatedSky.g)
  expect(isolatedSky.g).toBeCloseTo(isolatedSky.b)
  updateLighting(7200, true)
  updateLighting(7200, false)
  expect((scene.background as Color).equals(nightSky)).toBe(true)
  updateLighting(0, false)
  expect((scene.background as Color).equals(daylightSky)).toBe(true)
})
