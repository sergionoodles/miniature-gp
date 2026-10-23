import { expect, it } from 'vitest'
import { circuitSlug, racePath, routeFromPath } from './raceRoutes'

it('keeps full replay and static embed URLs tied to the same race', () => {
  const race = { circuit: 'São Paulo' }
  expect(circuitSlug(race.circuit)).toBe('sao-paulo')
  expect(racePath(2025, race)).toBe('/2025/sao-paulo')
  expect(racePath(2025, race, true)).toBe('/embed/2025/sao-paulo/')
  expect(racePath(2025, race, true, 'default')).toBe('/embed/2025/sao-paulo/')
  expect(routeFromPath('/2025/sao-paulo')).toEqual({ year: 2025, circuitSlug: 'sao-paulo', isEmbed: false })
  for (const path of ['/embed/2025/sao-paulo', '/embed/2025/sao-paulo/', '/embed/2025/sao-paulo/index.html']) {
    expect(routeFromPath(path)).toEqual({ year: 2025, circuitSlug: 'sao-paulo', isEmbed: true })
  }
})

it('rejects paths that do not identify a race', () => {
  for (const path of ['/', '/embed/', '/embed/no/monza/', '/embed/2025/monza/other', '/privacy', '/wireframe/', '/wireframe/no/monza/', '/wireframe/2025/monza/other']) {
    expect(routeFromPath(path)).toBeNull()
  }
})

it('recognizes wireframe paths as embeds with a forced graphics mode', () => {
  for (const path of ['/wireframe/2025/sao-paulo', '/wireframe/2025/sao-paulo/', '/wireframe/2025/sao-paulo/index.html']) {
    expect(routeFromPath(path)).toEqual({ year: 2025, circuitSlug: 'sao-paulo', isEmbed: true, mode: 'wireframe' })
  }
})

it('includes wireframe mode only in embed URLs', () => {
  const race = { circuit: 'São Paulo' }
  expect(racePath(2025, race, true, 'wireframe')).toBe('/wireframe/2025/sao-paulo/')
  expect(racePath(2025, race, false, 'wireframe')).toBe('/2025/sao-paulo')
})
