import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { DEFAULT_ENVIRONMENT, type CircuitEnvironment } from './circuitEnvironments'
import { createRandom, createTerrainField, GROUND_LEVEL, TRACK_CLEARANCE } from './terrainField'

const TERRAIN_SIZE = 500
const ringTrack = (radius: number) => Array.from({ length: 360 }, (_, index) => {
  const angle = index / 360 * Math.PI * 2
  return new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
})
const withWater = (features: CircuitEnvironment['water']['features']): CircuitEnvironment => ({ ...DEFAULT_ENVIRONMENT, id: 'test', water: { ...DEFAULT_ENVIRONMENT.water, features } })

describe('seeded random', () => {
  it('repeats the same sequence for the same seed and differs between seeds', () => {
    const first = createRandom('monza')
    const second = createRandom('monza')
    const other = createRandom('spa')
    const sequence = Array.from({ length: 5 }, () => first())
    expect(Array.from({ length: 5 }, () => second())).toEqual(sequence)
    expect(Array.from({ length: 5 }, () => other())).not.toEqual(sequence)
    sequence.forEach((value) => expect(value).toBeGreaterThanOrEqual(0))
    sequence.forEach((value) => expect(value).toBeLessThan(1))
  })
})

describe('terrain field', () => {
  it('keeps the track and its verges dry and at ground level', () => {
    const track = ringTrack(60)
    const field = createTerrainField(track, withWater([{ kind: 'lake' }, { kind: 'coast', side: 'left', offset: 4 }, { kind: 'ponds', count: 6 }]), TERRAIN_SIZE, TERRAIN_SIZE)
    for (const point of track) {
      for (const offset of [0, TRACK_CLEARANCE - 1]) {
        const sample = field.sample(point.x * (1 + offset / 60), point.z * (1 + offset / 60))
        expect(sample.water).toBe(0)
        expect(sample.height).toBeCloseTo(GROUND_LEVEL)
      }
    }
  })

  it('places a lake in the open space inside the circuit', () => {
    const field = createTerrainField(ringTrack(60), withWater([{ kind: 'lake' }]), TERRAIN_SIZE, TERRAIN_SIZE)
    expect(field.pools).toHaveLength(1)
    expect(field.sample(0, 0).water).toBe(1)
    expect(field.sample(0, 0).height).toBeLessThan(GROUND_LEVEL)
  })

  it('floods only the configured side for a coastline', () => {
    const field = createTerrainField(ringTrack(60), withWater([{ kind: 'coast', side: 'left', offset: 10 }]), TERRAIN_SIZE, TERRAIN_SIZE)
    expect(field.sample(-120, 0).water).toBe(1)
    expect(field.sample(120, 0).water).toBe(0)
    expect(field.shorelines).toEqual([{ side: 'left', position: expect.any(Number) }])
  })

  it('surrounds the circuit with a channel and has land again beyond it', () => {
    const field = createTerrainField(ringTrack(60), withWater([{ kind: 'channel', offset: 10, width: 40 }]), TERRAIN_SIZE, TERRAIN_SIZE)
    expect(field.sample(95, 0).water).toBe(1)
    expect(field.sample(0, -95).water).toBe(1)
    expect(field.sample(170, 0).water).toBe(0)
  })

  it('keeps flat circuits flat and raises the configured side', () => {
    const flat = createTerrainField(ringTrack(60), { ...DEFAULT_ENVIRONMENT, relief: 0 }, TERRAIN_SIZE, TERRAIN_SIZE)
    expect(flat.sample(0, -150).height).toBeCloseTo(GROUND_LEVEL)
    const hillside = createTerrainField(ringTrack(60), { ...DEFAULT_ENVIRONMENT, relief: 0, rise: { side: 'back', height: 20 } }, TERRAIN_SIZE, TERRAIN_SIZE)
    expect(hillside.sample(0, -150).height).toBeGreaterThan(15)
    expect(hillside.sample(0, 150).height).toBeCloseTo(GROUND_LEVEL)
  })

  it('flattens and dries pads under structures, even over water', () => {
    const pad = { x: -120, z: 0, outwardX: 0, outwardZ: 1, halfLength: 10, halfDepth: 5, height: 0.5 }
    const field = createTerrainField(ringTrack(60), withWater([{ kind: 'coast', side: 'left', offset: 10 }]), TERRAIN_SIZE, TERRAIN_SIZE, [pad])
    for (const [x, z] of [[-120, 0], [-129, 4], [-111, -4]]) {
      expect(field.sample(x, z).water).toBe(0)
      expect(field.sample(x, z).height).toBeCloseTo(0.5)
    }
    expect(field.sample(-160, 0).water).toBe(1)
  })

  it('keeps the track at ground level when a raised pad reaches it', () => {
    const track = ringTrack(60)
    const pad = { x: 70, z: 0, outwardX: 1, outwardZ: 0, halfLength: 12, halfDepth: 12, height: 3 }
    const field = createTerrainField(track, { ...DEFAULT_ENVIRONMENT, relief: 4 }, TERRAIN_SIZE, TERRAIN_SIZE, [pad])
    for (const offset of [0, 3, -3, TRACK_CLEARANCE - 1]) expect(field.sample(60 + offset, 0).height).toBeCloseTo(GROUND_LEVEL)
    expect(field.sample(75, 0).height).toBeCloseTo(3)
  })

  it('raises mountains into the terrain on their side only', () => {
    const field = createTerrainField(ringTrack(60), { ...DEFAULT_ENVIRONMENT, relief: 0, mountains: { side: 'back', height: 60, color: 0, hasSnow: true } }, TERRAIN_SIZE, TERRAIN_SIZE)
    const ridge = Math.max(...Array.from({ length: 41 }, (_, index) => field.sample(index * 5 - 100, -170).height))
    expect(ridge).toBeGreaterThan(30)
    expect(field.sample(0, -170).mountain).toBeGreaterThan(0.3)
    expect(field.sample(0, 170)).toMatchObject({ mountain: 0 })
    expect(field.sample(0, -60).height).toBeCloseTo(GROUND_LEVEL)
  })
})
