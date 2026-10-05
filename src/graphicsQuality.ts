// 'high' is the full showcase render; 'standard' is a lighter scene meant to run on any computer.
export type GraphicsQuality = 'high' | 'standard'

const QUALITY_STORAGE_KEY = 'miniature-gp:graphics-quality'

export function loadGraphicsQuality(): GraphicsQuality {
  try {
    const saved = window.localStorage.getItem(QUALITY_STORAGE_KEY)
    if (saved === 'high' || saved === 'standard') return saved
  } catch (cause) {
    console.warn('Could not load the graphics preference:', cause)
  }
  return window.matchMedia('(pointer: coarse)').matches ? 'standard' : 'high'
}

export function saveGraphicsQuality(quality: GraphicsQuality) {
  try {
    window.localStorage.setItem(QUALITY_STORAGE_KEY, quality)
  } catch (cause) {
    console.warn('Could not save the graphics preference:', cause)
  }
}
