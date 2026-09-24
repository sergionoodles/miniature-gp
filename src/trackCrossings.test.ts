import { describe, expect, it } from 'vitest'
import { CatmullRomCurve3, Vector3 } from 'three'
import { createProjection } from './circuitGeometry'
// Track outline from the 2025 Japanese Grand Prix replay.
import suzuka from './trackCrossings.suzuka.json'
import { BRIDGE_HEIGHT, createBridgeWallGeometry, createTrackHeightLookup, findTrackCrossings, trackElevations } from './trackCrossings'

const SAMPLES = 400
const ASPHALT_HALF_WIDTH = 1.6
const OWN_PASS_SAMPLES = 20
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

  it('builds no bridges for a noisy outline that crosses itself more than once', () => {
    const tangled = Array.from({ length: SAMPLES }, (_, index) => {
      const angle = index / SAMPLES * Math.PI * 2
      return new Vector3(60 * Math.sin(3 * angle), 0, 60 * Math.sin(2 * angle))
    })
    expect(findTrackCrossings(tangled)).toEqual([])
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
    const positions = createBridgeWallGeometry(figureEight, elevations, crossings).getAttribute('position')
    const bottomsNearCrossing = Array.from({ length: positions.count / 2 }, (_, pair) => pair * 2)
      .filter((vertex) => Math.hypot(positions.getX(vertex), positions.getZ(vertex)) < 2)
      .map((vertex) => positions.getY(vertex))
    expect(bottomsNearCrossing.length).toBeGreaterThan(0)
    expect(Math.min(...bottomsNearCrossing)).toBeGreaterThan(BRIDGE_HEIGHT / 2)
  })

  it('keeps the Suzuka bridge walls off the asphalt of the section running alongside its ramp', () => {
    const outline = suzuka as [number, number][]
    const project = createProjection(outline)
    const track = new CatmullRomCurve3(outline.map(([x, y]) => project(x, y)), true, 'centripetal').getSpacedPoints(900).slice(0, -1)
    const crossings = findTrackCrossings(track)
    const elevations = trackElevations(track, crossings)
    const positions = createBridgeWallGeometry(track, elevations, crossings).getAttribute('position')
    const isNearRaisedPass = (index: number) => elevations.some((height, raised) => height > 0 && Math.abs(raised - index) <= OWN_PASS_SAMPLES)
    const otherPasses = track.filter((_, index) => !isNearRaisedPass(index))
    // Even vertices are wall bottoms; only walls standing on the ground can cover another road.
    for (let vertex = 0; vertex < positions.count; vertex += 2) {
      if (positions.getY(vertex) > 0) continue
      const nearest = Math.min(...otherPasses.map((sample) => Math.hypot(sample.x - positions.getX(vertex), sample.z - positions.getZ(vertex))))
      expect(nearest).toBeGreaterThan(ASPHALT_HALF_WIDTH)
    }
  })
})
