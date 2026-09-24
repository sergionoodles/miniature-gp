import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { BRIDGE_HEIGHT, createBridgeWallGeometry, createTrackHeightLookup, findTrackCrossings, trackElevations } from './trackCrossings'

const SAMPLES = 400
// A figure-eight crossing itself at the origin, starting away from the crossing.
const figureEight = Array.from({ length: SAMPLES }, (_, index) => {
  const angle = Math.PI / 2 + index / SAMPLES * Math.PI * 2
  return new Vector3(60 * Math.sin(angle), 0, 60 * Math.sin(angle) * Math.cos(angle))
})
const oval = Array.from({ length: SAMPLES }, (_, index) => {
  const angle = index / SAMPLES * Math.PI * 2
  return new Vector3(80 * Math.cos(angle), 0, 40 * Math.sin(angle))
})

describe('track crossings', () => {
  it('bridges the pass driven later in the lap over the earlier one', () => {
    const crossings = findTrackCrossings(figureEight)
    expect(crossings).toHaveLength(1)
    const elevations = trackElevations(figureEight, crossings)
    expect(elevations[crossings[0].over]).toBeCloseTo(BRIDGE_HEIGHT)
    expect(elevations[crossings[0].under]).toBe(0)
    expect(crossings[0].over).toBeGreaterThan(crossings[0].under)
  })

  it('keeps a circuit without crossings flat', () => {
    const crossings = findTrackCrossings(oval)
    expect(crossings).toEqual([])
    expect(trackElevations(oval, crossings).every((height) => height === 0)).toBe(true)
  })

  it('lifts only cars heading along the raised pass at the crossing', () => {
    const crossings = findTrackCrossings(figureEight)
    const heightAt = createTrackHeightLookup(figureEight, trackElevations(figureEight, crossings))
    const direction = (index: number) => figureEight[index + 1].clone().sub(figureEight[index - 1]).normalize()
    const { over, under } = crossings[0]
    expect(heightAt(new Vector3(0.5, 0, 0.5), direction(over))).toBeCloseTo(BRIDGE_HEIGHT)
    expect(heightAt(new Vector3(0.5, 0, 0.5), direction(under))).toBe(0)
    expect(heightAt(new Vector3(0, 0, 30), direction(over))).toBe(0)
  })

  it('leaves the span open above the lower road', () => {
    const crossings = findTrackCrossings(figureEight)
    const elevations = trackElevations(figureEight, crossings)
    const positions = createBridgeWallGeometry(figureEight, elevations, crossings, 3.75).getAttribute('position')
    const bottomsNearCrossing = Array.from({ length: positions.count / 2 }, (_, pair) => pair * 2)
      .filter((vertex) => Math.hypot(positions.getX(vertex), positions.getZ(vertex)) < 4.5)
      .map((vertex) => positions.getY(vertex))
    expect(bottomsNearCrossing.length).toBeGreaterThan(0)
    expect(Math.min(...bottomsNearCrossing)).toBeGreaterThan(BRIDGE_HEIGHT / 2)
  })
})
