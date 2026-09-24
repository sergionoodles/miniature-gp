// 'high' is the full showcase render; 'standard' is a lighter scene meant to run on any computer.
export type GraphicsQuality = 'high' | 'standard'

const QUALITY_STORAGE_KEY = 'miniature-gp:graphics-quality'

export function loadGraphicsQuality(): GraphicsQuality {
  const saved = window.localStorage.getItem(QUALITY_STORAGE_KEY)
  if (saved === 'high' || saved === 'standard') return saved
  return window.matchMedia('(pointer: coarse)').matches ? 'standard' : 'high'
}

export function saveGraphicsQuality(quality: GraphicsQuality) {
  window.localStorage.setItem(QUALITY_STORAGE_KEY, quality)
}
