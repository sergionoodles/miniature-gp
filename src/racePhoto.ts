import type { ReplayNotification } from './replay'

export type PhotoLayer = 'title' | 'timing' | 'conditions' | 'order' | 'focus' | 'notifications' | 'branding'

export const PHOTO_LAYERS: { id: PhotoLayer; label: string }[] = [
  { id: 'title', label: 'Race title' },
  { id: 'timing', label: 'Lap and race time' },
  { id: 'conditions', label: 'Track status and weather' },
  { id: 'order', label: 'Running order' },
  { id: 'focus', label: 'Driver in focus' },
  { id: 'notifications', label: 'Race notifications' },
  { id: 'branding', label: 'Miniature GP mark' },
]

// The running order and notifications crowd the frame, so they are opt-in.
const HIDDEN_BY_DEFAULT = new Set<PhotoLayer>(['order', 'notifications'])

// The HUD as it read when the shutter fired; the photo never reads live replay state.
export type RacePhotoHud = {
  slug: string
  location: string
  grandPrix: string
  countryCode: string
  year: string
  dateLabel: string
  lap: number
  totalLaps: number
  clock: string
  status: string
  weather: { symbol: string; label: string; details: string | null }
  order: { position: number; code: string; color: string }[]
  focus: { name: string; number: number; team: string; position: number; lap: number } | null
  notifications: Omit<ReplayNotification, 'id' | 'time'>[]
}

export type SceneCapture = {
  image: HTMLCanvasElement
  pixelRatio: number
  bounds: DOMRect
}

export function availablePhotoLayers(hud: RacePhotoHud) {
  const isEmpty: Partial<Record<PhotoLayer, boolean>> = {
    order: hud.order.length === 0,
    focus: hud.focus === null,
    notifications: hud.notifications.length === 0,
  }
  return PHOTO_LAYERS.filter((layer) => !isEmpty[layer.id])
}

export function defaultPhotoLayers(hud: RacePhotoHud) {
  return new Set(availablePhotoLayers(hud).map((layer) => layer.id).filter((id) => !HIDDEN_BY_DEFAULT.has(id)))
}

export function photoFileName(hud: RacePhotoHud) {
  return `miniature-gp-${hud.slug}-${hud.year}-lap-${hud.lap}.png`
}
