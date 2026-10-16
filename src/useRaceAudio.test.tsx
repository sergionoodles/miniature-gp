import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { useRaceAudio } from './useRaceAudio'

function SoundPreference({ initialSoundEnabled }: { initialSoundEnabled?: boolean }) {
  const { isSoundOn } = useRaceAudio({ initialSoundEnabled })
  return <button aria-label="Sound" aria-pressed={isSoundOn} />
}

afterEach(() => vi.unstubAllGlobals())

it.each([true, false])('initializes the sound control from the saved preference (%s)', (isSoundOn) => {
  vi.stubGlobal('window', {
    localStorage: { getItem: () => String(isSoundOn) },
  })

  expect(renderToStaticMarkup(<SoundPreference />)).toContain(`aria-pressed="${isSoundOn}"`)
})

it('enables widget audio by default even when the full replay has a saved mute preference', () => {
  vi.stubGlobal('window', {
    localStorage: { getItem: () => 'false' },
  })

  expect(renderToStaticMarkup(<SoundPreference initialSoundEnabled />)).toContain('aria-pressed="true"')
  expect(renderToStaticMarkup(<SoundPreference />)).toContain('aria-pressed="false"')
})
