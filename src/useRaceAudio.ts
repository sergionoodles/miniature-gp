import { useEffect, useState } from 'react'
import { createRaceAudio } from './raceAudio'
import { loadSoundPreference, saveSoundPreference } from './audioPreferences'

// Restore the preference immediately, but wait for a gesture before starting browser audio.
export function useRaceAudio() {
  const [audio] = useState(createRaceAudio)
  const [isSoundOn, setIsSoundOn] = useState(loadSoundPreference)

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
