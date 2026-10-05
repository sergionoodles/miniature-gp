import { describe, expect, it } from 'vitest'
import { SKIP_SECONDS, skipSecondsForKey } from './replayShortcuts'

const press = (key: string, modifiers: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey', boolean>> = {}) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...modifiers,
})

describe('replay shortcuts', () => {
  it('skips back and forward with the left and right arrows', () => {
    expect(skipSecondsForKey(press('ArrowLeft'))).toBe(-SKIP_SECONDS)
    expect(skipSecondsForKey(press('ArrowRight'))).toBe(SKIP_SECONDS)
  })

  it.each(['ArrowUp', 'ArrowDown', 'a', ' '])('ignores %s', (key) => {
    expect(skipSecondsForKey(press(key))).toBeNull()
  })

  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const)('leaves arrows with %s to the browser', (modifier) => {
    expect(skipSecondsForKey(press('ArrowRight', { [modifier]: true }))).toBeNull()
  })
})
