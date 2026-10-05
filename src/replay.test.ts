import { describe, expect, it } from 'vitest'
import { carLocation, isReplay, lappedDriversAt, notificationsBetween, raceStatus, type RaceEvent, type Replay } from './replay'

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

  it('keeps a stopped car facing the way it was travelling', () => {
    const samples: [number, number, number][] = [[0, 0, 0], [1, 100, 100], [2, 100, 100], [3, 101, 100], [4, 100, 100]]
    expect(carLocation(samples, 2.5)?.heading).toBeCloseTo(Math.atan2(1, 1))
    expect(carLocation(samples, 3.5)?.heading).toBeCloseTo(Math.atan2(1, 1))
  })

  it('faces a car that has not moved yet the way it leaves', () => {
    const samples: [number, number, number][] = [[0, 50, 50], [1, 50, 50], [2, 150, 50]]
    expect(carLocation(samples, 0.5)?.heading).toBeCloseTo(Math.atan2(1, 0))
  })
})

it('marks only drivers at least one completed lap behind the leader', () => {
  const laps: [number, number, number][] = [[1, 1, 1], [2, 2, 1], [3, 1, 2], [4, 3, 1]]
  expect(lappedDriversAt(laps, 3.5)).toEqual(new Set([2]))
  expect(lappedDriversAt(laps, 4)).toEqual(new Set([2, 3]))
  expect(lappedDriversAt(laps, 0)).toEqual(new Set())
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
    'Position gained', 'Yellow flag', 'LEC · Pit stop', 'Race suspended', 'Rain started',
  ])
  expect(notificationsBetween(replay, 10, 11)).toHaveLength(1)
  expect(notificationsBetween(replay, 14, 15)).toHaveLength(0)
  expect(notificationsBetween(replay, 15, 16).map((notice) => notice.title)).toEqual(['Temperature changed'])
  expect(notificationsBetween(replay, 9, 10)[0]).toMatchObject({
    detail: 'Overtake · P2',
    drivers: [{ name: 'GAS', color: '#00A1E8' }, { name: 'LEC', color: '#ED1131' }],
  })
  expect(notificationsBetween(replay, 11, 13)).toContainEqual(expect.objectContaining({ title: 'LEC · Pit stop', detail: 'Lap 3' }))
  expect(notificationsBetween(replay, 9, 15, 50).map((notice) => notice.title)).toEqual([
    'Yellow flag', 'LEC · Pit stop', 'Race suspended', 'Rain started',
  ])
  expect(notificationsBetween(replay, 9, 15, 100).some((notice) => notice.id.startsWith('overtake-'))).toBe(false)
})
