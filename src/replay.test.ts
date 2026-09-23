import { describe, expect, it } from 'vitest'
import { carLocation, raceStatus, type RaceEvent } from './replay'

describe('carLocation', () => {
  it('interpolates car movement at replay time', () => {
    expect(carLocation([[0, 0, 0], [2, 10, 20]], 1)).toEqual({ x: 5, y: 10, heading: Math.atan2(10, 20) })
  })

  it('does not draw a car across a telemetry gap', () => {
    expect(carLocation([[0, 0, 0], [20, 10, 20]], 10)).toBeNull()
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
