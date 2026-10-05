import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSoundPreference, saveSoundPreference } from './audioPreferences'
import { loadGraphicsQuality, saveGraphicsQuality } from './graphicsQuality'

describe('browser preferences', () => {
  const values = new Map<string, string>()

  beforeEach(() => {
    values.clear()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
      matchMedia: () => ({ matches: false }),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('defaults to muted sound and high graphics without saved preferences', () => {
    expect(loadSoundPreference()).toBe(false)
    expect(loadGraphicsQuality()).toBe('high')
  })

  it.each([true, false])('restores sound %s and graphics independently after saving', (isSoundOn) => {
    saveSoundPreference(isSoundOn)
    saveGraphicsQuality('standard')

    expect(loadSoundPreference()).toBe(isSoundOn)
    expect(loadGraphicsQuality()).toBe('standard')

    saveGraphicsQuality('high')
    expect(loadSoundPreference()).toBe(isSoundOn)
    expect(loadGraphicsQuality()).toBe('high')
  })

  it('ignores invalid preferences and keeps the device graphics default', () => {
    values.set('miniature-gp:sound', 'invalid')
    values.set('miniature-gp:graphics-quality', 'invalid')
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })

    expect(loadSoundPreference()).toBe(false)
    expect(loadGraphicsQuality()).toBe('standard')
  })

  it('uses defaults and allows settings changes when storage is blocked', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal('window', {
      get localStorage() { throw new DOMException('Storage blocked', 'SecurityError') },
      matchMedia: () => ({ matches: false }),
    })

    expect(loadSoundPreference()).toBe(false)
    expect(loadGraphicsQuality()).toBe('high')
    expect(() => saveSoundPreference(true)).not.toThrow()
    expect(() => saveGraphicsQuality('standard')).not.toThrow()
    vi.restoreAllMocks()
  })
})
