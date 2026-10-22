// 'high' is the full showcase render; 'standard' is a lighter scene meant to run on any computer;
// 'wireframe' redraws the same race as a neon simulation.
export type GraphicsQuality = 'standard' | 'high' | 'wireframe'

const QUALITIES: GraphicsQuality[] = ['standard', 'high', 'wireframe']
const QUALITY_STORAGE_KEY = 'miniature-gp:graphics-quality'

function isGraphicsQuality(value: string | null): value is GraphicsQuality {
  return QUALITIES.some((quality) => quality === value)
}

export function loadGraphicsQuality(): GraphicsQuality {
  try {
    const saved = window.localStorage.getItem(QUALITY_STORAGE_KEY)
    if (isGraphicsQuality(saved)) return saved
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

// The graphics button steps through the settings in order and wraps around.
export function nextGraphicsQuality(quality: GraphicsQuality): GraphicsQuality {
  return QUALITIES[(QUALITIES.indexOf(quality) + 1) % QUALITIES.length]
}
