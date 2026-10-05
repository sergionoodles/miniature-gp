import { useEffect, useState } from 'react'
import { createRaceAudio } from './raceAudio'

// Sound starts off; the first toggle comes from a click, which browsers require to play audio.
export function useRaceAudio() {
  const [audio] = useState(createRaceAudio)
  const [isSoundOn, setIsSoundOn] = useState(false)

  useEffect(() => () => audio.dispose(), [audio])

  const toggleSound = () => {
    audio.setEnabled(!isSoundOn)
    setIsSoundOn(!isSoundOn)
  }

  return { audio, isSoundOn, toggleSound }
}
