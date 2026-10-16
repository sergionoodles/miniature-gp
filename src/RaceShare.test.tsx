import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RaceShare } from './RaceShare'

const state = vi.hoisted(() => ({
  message: null as string | null,
  dialog: {
    open: false,
    showModal() { this.open = true },
    close() { this.open = false },
  },
}))

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: () => [state.message, (message: string | null) => { state.message = message }],
  useRef: () => ({ current: state.dialog }),
}))

type ElementProps = {
  children?: ReactNode
  id?: string
  role?: string
  value?: string
  readOnly?: boolean
  'aria-label'?: string
  onClick?: () => void | Promise<void>
}

function findElement(node: ReactNode, matches: (element: ReactElement<ElementProps>) => boolean): ReactElement<ElementProps> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<ElementProps>(child)) continue
    if (matches(child)) return child
    const found = findElement(child.props.children, matches)
    if (found) return found
  }
  return undefined
}

const renderShare = () => RaceShare({ year: 2025, race: { circuit: 'São Paulo', location: 'Interlagos' } })

beforeEach(() => {
  state.message = null
  state.dialog.open = false
  vi.stubGlobal('window', { location: { origin: 'https://minigp.cc' } })
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

afterEach(() => vi.unstubAllGlobals())

it('offers absolute replay and embed URLs for the selected season and circuit', () => {
  const tree = renderShare()
  expect(findElement(tree, (element) => element.props.id === 'race-share-url')?.props.value).toBe('https://minigp.cc/2025/sao-paulo')
  expect(findElement(tree, (element) => element.props.id === 'race-share-embed')?.props.value).toBe('https://minigp.cc/embed/2025/sao-paulo/')
})

it.each([
  ['Copy URL', 'https://minigp.cc/2025/sao-paulo', 'URL copied to clipboard.'],
  ['Copy embed link', 'https://minigp.cc/embed/2025/sao-paulo/', 'Embed link copied to clipboard.'],
])('copies the correct URL for %s and confirms success', async (label, url, confirmation) => {
  await findElement(renderShare(), (element) => element.props.children === label)?.props.onClick?.()
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(url)
  expect(findElement(renderShare(), (element) => element.props.role === 'status')?.props.children).toBe(confirmation)
})

it.each(['denied', 'unavailable'])('keeps links selectable when clipboard access is %s', async (failure) => {
  if (failure === 'denied') {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('Clipboard permission denied'))
  } else {
    vi.stubGlobal('navigator', {})
  }

  await findElement(renderShare(), (element) => element.props.children === 'Copy embed link')?.props.onClick?.()
  const tree = renderShare()
  expect(findElement(tree, (element) => element.props.role === 'status')?.props.children).toBe('Could not copy. Select the link and copy it manually.')
  expect(findElement(tree, (element) => element.props.id === 'race-share-embed')?.props).toMatchObject({
    value: 'https://minigp.cc/embed/2025/sao-paulo/', readOnly: true,
  })
})

it('opens and closes the dialog and clears feedback when reopened', () => {
  state.message = 'URL copied to clipboard.'
  findElement(renderShare(), (element) => element.props['aria-label'] === 'Share race')?.props.onClick?.()
  expect(state.dialog.open).toBe(true)
  expect(findElement(renderShare(), (element) => element.props.role === 'status')?.props.children).toBeNull()

  findElement(renderShare(), (element) => element.props['aria-label'] === 'Close share')?.props.onClick?.()
  expect(state.dialog.open).toBe(false)
})
