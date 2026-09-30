import { describe, expect, it } from 'vitest'
import { resolveLegalPage } from './legalRoutes'

describe('legal page routes', () => {
  it.each(['/terms', '/terms/'])('resolves the terms page at %s', (pathname) => {
    expect(resolveLegalPage(pathname)).toBe('terms')
  })

  it.each(['/privacy', '/privacy/'])('resolves the privacy page at %s', (pathname) => {
    expect(resolveLegalPage(pathname)).toBe('privacy')
  })

  it.each(['/', '/2026/monza', '/terms/other', '/privacy/other', '/unknown'])('leaves %s to the game', (pathname) => {
    expect(resolveLegalPage(pathname)).toBeNull()
  })
})
