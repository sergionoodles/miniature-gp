import { Children, isValidElement, type ReactNode, type SelectHTMLAttributes } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'

const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  effects: [] as { dependencies: readonly unknown[]; cleanup?: () => void }[],
  effectCursor: 0,
  pending: [] as (() => void)[],
}))

// Shallow rendering keeps this interaction test independent of WebGL and browser audio.
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  const useState = <Value,>(initial: Value | (() => Value)) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? (initial as () => Value)() : initial
    return [hooks.values[index] as Value, (next: Value | ((current: Value) => Value)) => {
      hooks.values[index] = typeof next === 'function' ? (next as (current: Value) => Value)(hooks.values[index] as Value) : next
    }] as const
  }
  return {
    ...react,
    useState,
    useRef: <Value,>(initial: Value) => useState({ current: initial })[0],
    useMemo: <Value,>(factory: () => Value) => factory(),
    useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => {
      const index = hooks.effectCursor++
      const previous = hooks.effects[index]
      if (previous && dependencies.every((value, dependencyIndex) => Object.is(value, previous.dependencies[dependencyIndex]))) return
      hooks.pending.push(() => {
        previous?.cleanup?.()
        hooks.effects[index] = { dependencies, cleanup: effect() || undefined }
      })
    },
  }
})

function findSelect(node: ReactNode, label: string): SelectHTMLAttributes<HTMLSelectElement> | undefined {
  if (Array.isArray(node)) return node.map((child) => findSelect(child, label)).find(Boolean)
  if (!isValidElement<{ children?: ReactNode; 'aria-label'?: string }>(node)) return undefined
  if (node.type === 'select' && node.props['aria-label'] === label) return node.props
  return findSelect(node.props.children, label)
}

function textContent(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(textContent).join(' ')
  if (isValidElement<{ children?: ReactNode }>(node)) return textContent(node.props.children)
  return typeof node === 'string' ? node : ''
}

function stubBrowser() {
  vi.stubGlobal('window', {
    location: { pathname: '/' },
    history: { pushState: vi.fn(), replaceState: vi.fn() },
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    setTimeout, clearTimeout, clearInterval,
  })
  vi.stubGlobal('document', { title: '', removeEventListener: vi.fn() })
  vi.stubGlobal('requestAnimationFrame', vi.fn())
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
}

function createDeferredPromise<Value>() {
  const controls: { resolve: (value: Value) => void; reject: (cause: unknown) => void } = {
    resolve: () => { throw new Error('Promise is not initialized') },
    reject: () => { throw new Error('Promise is not initialized') },
  }
  const promise = new Promise<Value>((resolve, reject) => {
    controls.resolve = resolve
    controls.reject = reject
  })
  return { promise, ...controls }
}

const replay = {
  duration: 60, start: '2026-09-06T13:00:00Z', drivers: [], track: [], locations: {},
  positions: [], startingGrid: [], startingGridSource: 'position', overtakes: [],
  laps: [], pits: [], weather: [], raceControl: [], stints: [],
}

async function renderApp() {
  let tree: ReactNode = null
  for (let pass = 0; pass < 5; pass += 1) {
    hooks.cursor = 0
    hooks.effectCursor = 0
    tree = App()
    hooks.pending.splice(0).forEach((effect) => effect())
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  return tree
}

const race = (year: number, id: string, circuit: string) => ({
  id, circuit, url: `/data/${year}/${id}.json`, label: circuit,
  grandPrix: circuit, location: circuit, countryCode: 'ITA', date: `${year}-09-06`, laps: 53,
})

afterEach(() => {
  hooks.effects.forEach((effect) => effect.cleanup?.())
  hooks.values = []
  hooks.effects = []
  hooks.pending = []
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('waits for the catalog before requesting a replay on first load', async () => {
  stubBrowser()
  const currentRace = race(2026, 'latest', 'Monza')
  const catalog = createDeferredPromise<Response>()
  const fetchData = vi.fn(async (url: string) => {
    if (url === '/data/years.json') return Response.json([2026])
    if (url === '/data/2026/races-2026.json') return catalog.promise
    if (url === currentRace.url) return Response.json(replay)
    return new Response('<!DOCTYPE html><html></html>', { headers: { 'Content-Type': 'text/html' } })
  })
  vi.stubGlobal('fetch', fetchData)

  const loadingTree = await renderApp()
  expect(fetchData.mock.calls.map(([url]) => url)).toEqual(['/data/years.json', '/data/2026/races-2026.json'])
  expect(textContent(loadingTree)).not.toContain('RACE DATA UNAVAILABLE')

  catalog.resolve(Response.json([currentRace]))
  const loadedTree = await renderApp()
  expect(fetchData.mock.calls.map(([url]) => url)).toContain(currentRace.url)
  expect(textContent(loadedTree)).not.toContain('RACE DATA UNAVAILABLE')
})

it('ignores a superseded replay failure after another race loads', async () => {
  stubBrowser()
  const firstRace = race(2026, 'first', 'Monza')
  const secondRace = { ...race(2026, 'second', 'Monaco'), date: '2026-08-01' }
  const firstReplay = createDeferredPromise<unknown>()
  vi.stubGlobal('fetch', async (url: string) => {
    if (url === '/data/years.json') return Response.json([2026])
    if (url === '/data/2026/races-2026.json') return Response.json([firstRace, secondRace])
    if (url === firstRace.url) return { ok: true, json: () => firstReplay.promise }
    return Response.json(replay)
  })

  const tree = await renderApp()
  findSelect(tree, 'Grand Prix')?.onChange?.({ target: { value: secondRace.id } } as React.ChangeEvent<HTMLSelectElement>)
  await renderApp()
  firstReplay.reject(new SyntaxError('Unexpected token <'))
  const loadedTree = await renderApp()

  expect(document.title).toContain('Monaco 2026')
  expect(textContent(loadedTree)).not.toContain('RACE DATA UNAVAILABLE')
})

it('uses an existing bundled replay when the catalog cannot be loaded', async () => {
  stubBrowser()
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const fallbackUrl = '/data/2026/2026-09-06-ITA-MONZA-11361.json'
  const fetchData = vi.fn(async (url: string) => {
    if (url === '/data/years.json') return Response.json([2026])
    if (url === fallbackUrl) return Response.json(replay)
    return new Response('<!DOCTYPE html><html></html>', { headers: { 'Content-Type': 'text/html' } })
  })
  vi.stubGlobal('fetch', fetchData)

  const tree = await renderApp()

  expect(fetchData.mock.calls.map(([url]) => url)).toContain(fallbackUrl)
  expect(textContent(tree)).not.toContain('RACE DATA UNAVAILABLE')
  consoleError.mockRestore()
})

it('shows a readable error when the selected replay returns HTML', async () => {
  stubBrowser()
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.stubGlobal('fetch', async (url: string) => {
    if (url === '/data/years.json') return Response.json([2026])
    if (url === '/data/2026/races-2026.json') return Response.json([race(2026, 'missing', 'Monza')])
    return new Response('<!DOCTYPE html><html></html>', { headers: { 'Content-Type': 'text/html' } })
  })

  const tree = await renderApp()

  expect(textContent(tree)).toContain('Race data could not be loaded. Please refresh to try again.')
  expect(textContent(tree)).not.toContain('Unexpected token')
  consoleError.mockRestore()
})

it('only changes the race and route after a Grand Prix is selected in the browsed season', async () => {
  const currentRace = race(2026, '11361', 'Monza')
  const previousRace = race(2025, '9979', 'Monaco')
  const location = { pathname: '/2026/monza' }
  const pushState = vi.fn((_state: unknown, _title: string, path: string) => { location.pathname = path })
  const replaceState = vi.fn((_state: unknown, _title: string, path: string) => { location.pathname = path })
  const listeners = new Map<string, () => void>()
  vi.stubGlobal('window', {
    location, history: { pushState, replaceState },
    addEventListener: (event: string, listener: () => void) => listeners.set(event, listener),
    removeEventListener: (event: string) => listeners.delete(event),
    setTimeout, clearTimeout, clearInterval,
  })
  vi.stubGlobal('document', { title: '', removeEventListener: vi.fn() })
  vi.stubGlobal('requestAnimationFrame', vi.fn())
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const fetchData = vi.fn(async (url: string) => {
    const value = url === '/data/years.json' ? [2026, 2025]
      : url === '/data/2026/races-2026.json' ? [currentRace]
        : url === '/data/2025/races-2025.json' ? [previousRace] : null
    return { ok: value !== null, status: value === null ? 404 : 200, json: async () => value }
  })
  vi.stubGlobal('fetch', fetchData)

  const initialTree = await renderApp()
  pushState.mockClear()
  replaceState.mockClear()
  fetchData.mockClear()
  findSelect(initialTree, 'Season')?.onChange?.({ target: { value: '2025' } } as React.ChangeEvent<HTMLSelectElement>)
  const browsingTree = await renderApp()

  expect(location.pathname).toBe('/2026/monza')
  expect(pushState).not.toHaveBeenCalled()
  expect(replaceState).not.toHaveBeenCalled()
  expect(document.title).toContain('Monza 2026')
  expect(fetchData.mock.calls.map(([url]) => url)).toEqual(['/data/2025/races-2025.json'])
  const optionValues = Children.toArray(findSelect(browsingTree, 'Grand Prix')?.children)
    .filter(isValidElement<{ value: string; hidden?: boolean }>)
    .filter((option) => !option.props.hidden)
    .map((option) => option.props.value)
  expect(optionValues).toEqual(['9979'])

  findSelect(browsingTree, 'Grand Prix')?.onChange?.({ target: { value: '9979' } } as React.ChangeEvent<HTMLSelectElement>)
  await renderApp()

  expect(location.pathname).toBe('/2025/monaco')
  expect(pushState).toHaveBeenCalledTimes(1)
  expect(document.title).toContain('Monaco 2025')

  location.pathname = '/2026/monza'
  listeners.get('popstate')?.()
  const restoredTree = await renderApp()

  expect(findSelect(restoredTree, 'Season')?.value).toBe(2026)
  expect(findSelect(restoredTree, 'Grand Prix')?.value).toBe('11361')
  expect(document.title).toContain('Monza 2026')
  expect(pushState).toHaveBeenCalledTimes(1)
})

it('loads the exact embedded race and preserves its embed URL', async () => {
  stubBrowser()
  window.location.pathname = '/embed/2025/monza/'
  const requestedRace = race(2025, 'requested', 'Monza')
  const latestRace = { ...race(2025, 'latest', 'Lusail'), date: '2025-11-30' }
  const fetchData = vi.fn(async (url: string) => {
    if (url === '/data/years.json') return Response.json([2026, 2025])
    if (url === '/data/2025/races-2025.json') return Response.json([latestRace, requestedRace])
    if (url === requestedRace.url) return Response.json(replay)
    return new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchData)

  const tree = await renderApp()

  expect(document.title).toContain('Monza 2025')
  expect(fetchData.mock.calls.map(([url]) => url)).toContain(requestedRace.url)
  expect(fetchData.mock.calls.map(([url]) => url)).not.toContain(latestRace.url)
  expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/embed/2025/monza/')
  expect(findSelect(tree, 'Season')).toBeUndefined()
  expect(findSelect(tree, 'Grand Prix')).toBeUndefined()
})

it('shows an error for an unknown embedded race without substituting another race', async () => {
  stubBrowser()
  window.location.pathname = '/embed/2025/unknown/'
  const availableRace = race(2025, 'available', 'Monza')
  const fetchData = vi.fn(async (url: string) => {
    if (url === '/data/years.json') return Response.json([2026, 2025])
    return Response.json([availableRace])
  })
  vi.stubGlobal('fetch', fetchData)

  const tree = await renderApp()

  expect(textContent(tree)).toContain('The requested race could not be loaded.')
  expect(fetchData.mock.calls.map(([url]) => url)).toEqual(['/data/years.json', '/data/2025/races-2025.json'])
  expect(window.history.replaceState).not.toHaveBeenCalled()
})

it('keeps an unavailable embedded season fixed rather than switching to the latest season', async () => {
  stubBrowser()
  window.location.pathname = '/embed/2023/monza/'
  const fetchData = vi.fn(async (url: string) => url === '/data/years.json'
    ? Response.json([2026, 2025])
    : new Response(null, { status: 404 }))
  vi.stubGlobal('fetch', fetchData)

  const tree = await renderApp()

  expect(textContent(tree)).toContain('The requested race could not be loaded.')
  expect(fetchData.mock.calls.map(([url]) => url)).toEqual(['/data/years.json', '/data/2023/races-2023.json'])
  expect(window.history.replaceState).not.toHaveBeenCalled()
})
