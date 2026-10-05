export const SKIP_SECONDS = 60

const SKIP_KEYS: Record<string, number> = {
  ArrowLeft: -SKIP_SECONDS,
  ArrowRight: SKIP_SECONDS,
}

type ShortcutKey = Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>

// Modified arrows stay with the browser and OS (history navigation, text selection, desktop switching).
export const skipSecondsForKey = ({ key, altKey, ctrlKey, metaKey, shiftKey }: ShortcutKey) => {
  if (altKey || ctrlKey || metaKey || shiftKey) return null
  return SKIP_KEYS[key] ?? null
}

// Arrows keep their own meaning in dialogs, menus and text fields. The timeline slider is the exception:
// its native step is a fraction of a second, so the replay skip replaces it.
export const isTimeShortcutTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return true
  if (target.closest('dialog') || target.isContentEditable) return false
  if (target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return false
  return !(target instanceof HTMLInputElement) || target.type === 'range'
}
