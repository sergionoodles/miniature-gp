import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { resolveCircuitEnvironment, type CircuitEnvironment } from './circuitEnvironments'
import { LANDMARK_RADIUS, planScenery } from './sceneryPlan'
import { GROUND_LEVEL } from './terrainField'

const TERRAIN_SIZE = 500
const INNER_SIZE = 160
const TREE_LINE = 0.3
const track = Array.from({ length: 360 }, (_, index) => {
  const angle = index / 360 * Math.PI * 2
  return new Vector3(Math.cos(angle) * 60, 0, Math.sin(angle) * 45)
})

const planCircuit = (environment: CircuitEnvironment) => planScenery(track, environment, INNER_SIZE, INNER_SIZE, TERRAIN_SIZE, TERRAIN_SIZE)

describe('scenery plan', () => {
  it.each(['Monaco', 'Miami', 'Red Bull Ring', 'Kyalami'])('is identical every time %s is built', (circuit) => {
    const first = planCircuit(resolveCircuitEnvironment(circuit))
    const second = planCircuit(resolveCircuitEnvironment(circuit))
    expect({ ...second, field: second.field.pools }).toEqual({ ...first, field: first.field.pools })
  })

  it('keeps landmarks, buildings and trees off the track and out of the water', () => {
    const { field, landmarks, buildings, trees } = planCircuit(resolveCircuitEnvironment('Miami'))
    expect(landmarks.map(({ kind }) => kind)).toEqual(['stadium', 'parking', 'parking', 'parking'])
    for (const landmark of landmarks) expect(field.distanceToTrack(landmark.x, landmark.z)).toBeGreaterThan(LANDMARK_RADIUS[landmark.kind])
    for (const item of [...buildings, ...trees]) {
      const sample = field.sample(item.x, item.z)
      expect(sample.distance).toBeGreaterThan(6)
      expect(sample.water).toBeLessThan(0.01)
    }
  })

  it('does not overlap landmarks with each other', () => {
    const { landmarks } = planCircuit(resolveCircuitEnvironment('Miami'))
    landmarks.forEach((first, index) => landmarks.slice(index + 1).forEach((second) => {
      expect(Math.hypot(first.x - second.x, first.z - second.z)).toBeGreaterThanOrEqual(LANDMARK_RADIUS[first.kind] + LANDMARK_RADIUS[second.kind])
    }))
  })

  it('puts a one-sided skyline on its side of the circuit', () => {
    const { buildings } = planCircuit(resolveCircuitEnvironment('Melbourne'))
    expect(buildings.length).toBeGreaterThan(0)
    buildings.forEach(({ z }) => expect(z).toBeLessThan(0))
  })

  it('moors yachts on water and adds only the configured features', () => {
    const monaco = planCircuit(resolveCircuitEnvironment('Monaco'))
    expect(monaco.yachts.length).toBeGreaterThan(0)
    monaco.yachts.forEach(({ x, z }) => expect(monaco.field.sample(x, z).water).toBeGreaterThan(0.99))
    const fallback = planCircuit(resolveCircuitEnvironment('Kyalami'))
    expect([fallback.landmarks, fallback.buildings, fallback.yachts]).toEqual([[], [], []])
    expect(fallback.trees.every(({ kind }) => kind === 'broadleaf')).toBe(true)
  })

  it('keeps grandstands on dry, flat ground beside water', () => {
    const { field, stands } = planCircuit(resolveCircuitEnvironment('Montreal'))
    expect(stands.length).toBeGreaterThan(0)
    for (const { center, outward, length } of stands) {
      for (const [along, across] of [[0, 0], [length / 2, 3], [-length / 2, -3], [length / 2, -3]]) {
        const sample = field.sample(center.x + outward.z * along + outward.x * across, center.z - outward.x * along + outward.z * across)
        expect(sample.water).toBe(0)
        expect(sample.height).toBeCloseTo(GROUND_LEVEL)
      }
    }
  })

  it('flattens the terrain under landmarks to their base height', () => {
    const { field, landmarks } = planCircuit(resolveCircuitEnvironment('Madring'))
    expect(landmarks.length).toBeGreaterThan(0)
    for (const { kind, x, y, z } of landmarks) {
      const radius = LANDMARK_RADIUS[kind]
      const diagonal = radius / Math.SQRT2
      for (const [offsetX, offsetZ] of [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius], [diagonal, diagonal], [-diagonal, -diagonal]]) {
        expect(field.sample(x + offsetX, z + offsetZ).height).toBeCloseTo(y)
      }
    }
  })

  it('keeps trees and groves below the tree line on mountain circuits', () => {
    const { field, trees, groves } = planCircuit(resolveCircuitEnvironment('Spielberg'))
    for (const { x, z } of [...trees, ...groves]) expect(field.sample(x, z).mountain).toBeLessThanOrEqual(TREE_LINE)
  })
})
