import { describe, expect, it } from 'vitest'
import { carLocation, isReplay, raceStatus, type RaceEvent } from './replay'

describe('carLocation', () => {
  it('interpolates car movement at replay time', () => {
    expect(carLocation([[0, 0, 0], [2, 10, 20]], 1)).toEqual({ x: 5, y: 10, heading: Math.atan2(10, 20) })
  })

  it('does not draw a car across a telemetry gap', () => {
    expect(carLocation([[0, 0, 0], [20, 10, 20]], 10)).toBeNull()
  })

  it('can hold the first fix during the short race start transition', () => {
    const samples: [number, number, number][] = [[0.8, 4, 6], [1.8, 5, 7]]
    expect(carLocation(samples, 0)).toBeNull()
    expect(carLocation(samples, 0, true)).toEqual({ x: 4, y: 6, heading: Math.atan2(1, 1) })
  })
})

it('shows the red flag until the session resumes', () => {
  const events: RaceEvent[] = [
    [0, 'SessionStatus', null, 'SESSION STARTED'],
    [10, 'SessionStatus', null, 'SESSION ABORTED'],
    [30, 'SessionStatus', null, 'SESSION STARTED'],
  ]
  expect(raceStatus(events, 15)).toBe('Red flag')
  expect(raceStatus(events, 31)).toBe('Racing')
})

it('requires grid and overtake data in a replay', () => {
  const replay = { duration: 10, start: '2026-09-06', drivers: [], track: [], locations: {}, positions: [], laps: [], pits: [], weather: [], raceControl: [], startingGrid: [], startingGridSource: 'position', overtakes: [] }
  expect(isReplay(replay)).toBe(true)
  expect(isReplay({ ...replay, overtakes: undefined })).toBe(false)
  expect(isReplay({ ...replay, startingGrid: undefined })).toBe(false)
})
