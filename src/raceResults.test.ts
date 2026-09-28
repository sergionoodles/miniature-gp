import { describe, expect, it } from 'vitest'
import { formatGap, gapLabel, raceResults } from './raceResults'
import type { LapEvent, LocationSample, Replay } from './replay'

// The winner starts the final lap at 60 s and runs 10 units per second along y = 0 to the flag at 160 s.
const winnerPath: LocationSample[] = Array.from({ length: 101 }, (_, second) => [60 + second, second * 10, 0])

function fixture(laps: LapEvent[], locations: Record<string, LocationSample[]> = {}): Replay {
  const driver = (number: number) => ({ number, name: `Driver ${number}`, code: `D${number}`, team: 'Team', color: '#fff' })
  return {
    duration: 160, sessionKey: 1, start: '', track: [], startingGridSource: 'starting_grid', overtakes: [], pits: [], weather: [], raceControl: [],
    drivers: [1, 2, 3, 4, 5].map(driver),
    startingGrid: [[2, 1], [1, 2], [3, 3], [4, 4], [5, 5]],
    // Driver 1 takes the lead late, so the classification comes from the positions at the flag.
    positions: [[0, 2, 1], [0, 1, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5], [150, 1, 1], [150, 2, 2]],
    laps: [...laps].sort((first, second) => first[0] - second[0]),
    stints: [],
    locations: { '1': winnerPath, ...locations },
  }
}

const finalLaps: LapEvent[] = [[0, 1, 1], [60, 1, 2], [0, 2, 1], [63, 2, 2], [0, 3, 1], [68, 3, 2], [70, 4, 1], [0, 5, 1]]

describe('race results', () => {
  it('classifies the field with gaps measured where each car is at the flag', () => {
    const results = raceResults(fixture(finalLaps, { '2': [[159, 940, 0], [160, 950, 0]] }))
    expect(results.map(({ driver, position, grid, status, lapsDown, laps }) => [driver.number, position, grid, status, lapsDown, laps])).toEqual([
      [1, 1, 2, 'finished', 0, 2],
      [2, 2, 1, 'finished', 0, 2],
      [3, 3, 3, 'finished', 0, 2],
      [4, 4, 4, 'lapped', 1, 1],
      [5, 5, 5, 'retired', 1, 0],
    ])
    expect(results[0]).toMatchObject({ gap: 0, interval: null })
    expect(results[1].gap).toBeCloseTo(5)
    expect(results[1].interval).toBeCloseTo(5)
  })

  it('falls back to the final lap line gap when a car has no location at the flag', () => {
    const [, , third] = raceResults(fixture(finalLaps, { '2': [[159, 940, 0], [160, 950, 0]] }))
    expect(third.gap).toBeCloseTo(8)
    expect(third.interval).toBeCloseTo(3)
  })

  it('never shows a car closer to the winner than the car classified ahead of it', () => {
    const laps = finalLaps.map((event): LapEvent => event[1] === 3 && event[2] === 2 ? [61, 3, 2] : event)
    const [, second, third] = raceResults(fixture(laps, { '2': [[159, 940, 0], [160, 950, 0]] }))
    expect(third.gap).toBeCloseTo(second.gap ?? Number.NaN)
    expect(third.interval).toBeCloseTo(0)
  })

  it('leaves gaps empty for lapped and retired cars', () => {
    const results = raceResults(fixture(finalLaps))
    expect(results.slice(3).map(({ gap, interval }) => [gap, interval])).toEqual([[null, null], [null, null]])
  })
})

describe('gap labels', () => {
  it('formats gaps in seconds, then minutes, and names lapped and retired cars', () => {
    const [winner, second, , lapped, retired] = raceResults(fixture(finalLaps, { '2': [[159, 940, 0], [160, 950, 0]] }))
    expect(gapLabel(winner)).toBe('Winner')
    expect(gapLabel(second)).toBe('+5.0s')
    expect(gapLabel(lapped)).toBe('+1 lap')
    expect(gapLabel(retired)).toBe('Retired')
    expect(formatGap(59.97)).toBe('+1:00.0')
    expect(formatGap(83.44)).toBe('+1:23.4')
  })
})
