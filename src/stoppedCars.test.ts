import { describe, expect, it } from 'vitest'
import { detectStoppedCars, stoppedAt } from './stoppedCars'
import type { LocationSample, Replay } from './replay'

function fixture(): Replay {
  const stopped: LocationSample[] = Array.from({ length: 65 }, (_, time) => [time, time < 5 ? time * 100 : time < 50 ? 500 : 500 + (time - 49) * 100, 0])
  const moving: LocationSample[] = Array.from({ length: 65 }, (_, time) => [time, time * 100, 1000])
  return { duration: 100, sessionKey: 1, start: '', drivers: [], track: [[0, 0], [1000, 1000]], locations: { '1': stopped, '2': moving, '3': moving, '4': moving }, positions: [], startingGrid: [], startingGridSource: 'position', overtakes: [], laps: [], pits: [], weather: [], raceControl: [], stints: [] }
}

describe('stopped car inference', () => {
  it('hides only after a sustained stop, restores on movement, and supports backward seeking', () => {
    const stops = detectStoppedCars(fixture()).get(1) ?? []
    expect(stoppedAt(stops, 24)).toBeNull()
    expect(stoppedAt(stops, 25)?.slice(2)).toEqual([500, 0])
    expect(stoppedAt(stops, 49)).not.toBeNull()
    expect(stoppedAt(stops, 50)).toBeNull()
    expect(stoppedAt(stops, 10)).toBeNull()
  })
  it('does not infer a crash from a telemetry gap', () => {
    const replay = fixture()
    replay.locations['1'] = [[0, 0, 0], [5, 500, 0], [40, 500, 0], [42, 700, 0]]
    expect(detectStoppedCars(replay).get(1)).toEqual([])
  })
  it('excludes pit stops using exit timestamp and lane duration', () => {
    const replay = fixture()
    replay.pits = [[52, 1, 2, 50]]
    expect(detectStoppedCars(replay).get(1)).toEqual([])
  })
  it('excludes red flags and collective grid holds', () => {
    const replay = fixture()
    replay.raceControl = [[10, 'SessionStatus', null, 'SESSION ABORTED']]
    expect(detectStoppedCars(replay).get(1)).toEqual([])
    const held = fixture()
    held.locations['2'] = held.locations['1']
    held.locations['3'] = held.locations['1']
    expect(detectStoppedCars(held).get(1)).toEqual([])
  })
  it('still detects a stopped car when its incident triggers a safety car', () => {
    const replay = fixture()
    replay.raceControl = [[20, 'SafetyCar', null, 'VSC DEPLOYED']]
    expect(stoppedAt(detectStoppedCars(replay).get(1) ?? [], 25)).not.toBeNull()
  })
  it('keeps a car waiting on the grid visible while others are still approaching', () => {
    const replay = { ...fixture(), raceControl: [[0, 'StartPhase', null, 'Waiting for start']] as Replay['raceControl'] }
    expect(detectStoppedCars(replay).get(1)).toEqual([])
  })
  it('keeps a confirmed stopped marker after telemetry ends, without inventing one for missing data', () => {
    const replay = fixture()
    replay.locations['1'] = replay.locations['1'].slice(0, 45)
    expect(stoppedAt(detectStoppedCars(replay).get(1) ?? [], 90)).not.toBeNull()
    replay.locations['1'] = []
    expect(detectStoppedCars(replay).get(1)).toEqual([])
  })
})
