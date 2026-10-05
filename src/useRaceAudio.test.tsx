import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { useRaceAudio } from './useRaceAudio'

function SoundPreference() {
  const { isSoundOn } = useRaceAudio()
  return <button aria-label="Sound" aria-pressed={isSoundOn} />
}

afterEach(() => vi.unstubAllGlobals())

it.each([true, false])('initializes the sound control from the saved preference (%s)', (isSoundOn) => {
  vi.stubGlobal('window', {
    localStorage: { getItem: () => String(isSoundOn) },
  })

  expect(renderToStaticMarkup(<SoundPreference />)).toContain(`aria-pressed="${isSoundOn}"`)
})
