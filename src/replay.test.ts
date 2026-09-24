import { describe, expect, it } from 'vitest'
import { carLocation, isReplay, notificationsBetween, raceStatus, type RaceEvent, type Replay } from './replay'

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

it('collects race events and weather changes crossed during playback in time order', () => {
  const replay = {
    drivers: [
      { number: 10, code: 'GAS', name: 'Pierre Gasly', color: '#00A1E8' },
      { number: 16, code: 'LEC', name: 'Charles Leclerc', color: '#ED1131' },
    ],
    overtakes: [[10, 10, 16, 2]],
    pits: [[12, 16, 3, null]],
    raceControl: [[11, 'Flag', 'YELLOW', 'YELLOW FLAG'], [13, 'SessionStatus', null, 'SESSION ABORTED']],
    weather: [[0, 0, 25, 30], [14, 1, 24, 29], [16, 1, 24, 31]],
  } as Replay
  expect(notificationsBetween(replay, 9, 15).map((notice) => notice.title)).toEqual([
    'Position gained', 'Yellow flag', 'Pit stop', 'Race suspended', 'Rain started',
  ])
  expect(notificationsBetween(replay, 10, 11)).toHaveLength(1)
  expect(notificationsBetween(replay, 14, 15)).toHaveLength(0)
  expect(notificationsBetween(replay, 15, 16).map((notice) => notice.title)).toEqual(['Temperature changed'])
  expect(notificationsBetween(replay, 9, 10)[0]).toMatchObject({
    detail: 'Overtake · P2',
    drivers: [{ name: 'Pierre Gasly', color: '#00A1E8' }, { name: 'Charles Leclerc', color: '#ED1131' }],
  })
  expect(notificationsBetween(replay, 9, 15, 50).map((notice) => notice.title)).toEqual([
    'Yellow flag', 'Pit stop', 'Race suspended', 'Rain started',
  ])
  expect(notificationsBetween(replay, 9, 15, 100).some((notice) => notice.id.startsWith('overtake-'))).toBe(false)
})
