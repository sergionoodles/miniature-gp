import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendAnalyticsScript } from './analytics'

const WEBSITE_ID = '94db1cb1-74f4-4a40-ad6c-962362670409'

describe('analytics', () => {
  const attributes = new Map<string, string>()
  const script = {
    id: '',
    src: '',
    async: false,
    referrerPolicy: '',
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  }
  const appendChild = vi.fn()
  const getElementById = vi.fn()

  beforeEach(() => {
    attributes.clear()
    vi.clearAllMocks()
    getElementById.mockReturnValue(null)
    vi.stubGlobal('navigator', { doNotTrack: null, globalPrivacyControl: false })
    vi.stubGlobal('document', {
      createElement: () => script,
      getElementById,
      head: { appendChild },
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('loads the self-hosted tracker with privacy settings in production', () => {
    appendAnalyticsScript({ isProduction: true, websiteId: WEBSITE_ID })

    expect(appendChild).toHaveBeenCalledWith(script)
    expect(script.src).toBe('https://analytics.codingnoodles.com/script.js')
    expect(script.async).toBe(true)
    expect(script.referrerPolicy).toBe('no-referrer')
    expect(Object.fromEntries(attributes)).toEqual({
      'data-website-id': WEBSITE_ID,
      'data-do-not-track': 'true',
      'data-exclude-search': 'true',
      'data-exclude-hash': 'true',
      'data-fetch-credentials': 'omit',
    })
  })

  it('does not load analytics in development', () => {
    appendAnalyticsScript({ isProduction: false, websiteId: WEBSITE_ID })
    expect(appendChild).not.toHaveBeenCalled()
  })

  it.each([undefined, '', '   '])('does not load analytics without a website ID (%s)', (websiteId) => {
    appendAnalyticsScript({ isProduction: true, websiteId })
    expect(appendChild).not.toHaveBeenCalled()
  })

  it.each(['1', 'yes'])('does not contact analytics when Do Not Track is %s', (doNotTrack) => {
    vi.stubGlobal('navigator', { doNotTrack })
    appendAnalyticsScript({ isProduction: true, websiteId: WEBSITE_ID })
    expect(appendChild).not.toHaveBeenCalled()
  })

  it('does not contact analytics when Global Privacy Control is enabled', () => {
    vi.stubGlobal('navigator', { globalPrivacyControl: true })
    appendAnalyticsScript({ isProduction: true, websiteId: WEBSITE_ID })
    expect(appendChild).not.toHaveBeenCalled()
  })

  it('does not append a second tracker', () => {
    getElementById.mockReturnValue(script)
    appendAnalyticsScript({ isProduction: true, websiteId: WEBSITE_ID })
    expect(appendChild).not.toHaveBeenCalled()
  })
})
