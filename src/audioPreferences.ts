const SOUND_STORAGE_KEY = 'miniature-gp:sound'

export function loadSoundPreference(): boolean {
  try {
    return window.localStorage?.getItem(SOUND_STORAGE_KEY) === 'true'
  } catch (cause) {
    console.warn('Could not load the sound preference:', cause)
    return false
  }
}

export function saveSoundPreference(isSoundOn: boolean) {
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, String(isSoundOn))
  } catch (cause) {
    console.warn('Could not save the sound preference:', cause)
  }
}
