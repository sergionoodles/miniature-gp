import { describe, expect, it } from 'vitest'
import { nextRaceAfter, nextSeason } from './nextRace'

// Catalogs are sorted newest first.
const season = [
  { id: 'monza', date: '2026-09-06' },
  { id: 'zandvoort', date: '2026-08-23' },
  { id: 'spa', date: '2026-07-26' },
]

describe('next race', () => {
  it('picks the race right after the current one, not the newest', () => {
    expect(nextRaceAfter(season, season[2])?.id).toBe('zandvoort')
  })

  it('has no next race after the most recent one', () => {
    expect(nextRaceAfter(season, season[0])).toBeNull()
  })

  it('opens the following season at its first race', () => {
    expect(nextSeason([2026, 2024, 2025], 2024)).toBe(2025)
    expect(nextSeason([2026, 2025], 2026)).toBeNull()
    expect(nextRaceAfter(season, { date: '2025-12-07' })?.id).toBe('spa')
  })
})
