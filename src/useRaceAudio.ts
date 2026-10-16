import { useEffect, useState } from 'react'
import { createRaceAudio } from './raceAudio'
import { loadSoundPreference, saveSoundPreference } from './audioPreferences'

// Widgets can start with sound enabled; browser audio still waits for a gesture.
export function useRaceAudio({ initialSoundEnabled }: { initialSoundEnabled?: boolean } = {}) {
  const [audio] = useState(createRaceAudio)
  const [isSoundOn, setIsSoundOn] = useState(() => initialSoundEnabled ?? loadSoundPreference())

  useEffect(() => () => audio.dispose(), [audio])

  useEffect(() => {
    if (!isSoundOn) return

    const enableSound = () => {
      audio.setEnabled(true)
      window.removeEventListener('click', enableSound, true)
      window.removeEventListener('keydown', enableSound)
    }
    window.addEventListener('click', enableSound, true)
    window.addEventListener('keydown', enableSound)
    return () => {
      window.removeEventListener('click', enableSound, true)
      window.removeEventListener('keydown', enableSound)
    }
  }, [audio, isSoundOn])

  const toggleSound = () => {
    const nextIsSoundOn = !isSoundOn
    audio.setEnabled(nextIsSoundOn)
    setIsSoundOn(nextIsSoundOn)
    saveSoundPreference(nextIsSoundOn)
  }

  return { audio, isSoundOn, toggleSound }
}
