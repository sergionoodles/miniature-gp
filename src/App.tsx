import { useEffect, useMemo, useRef, useState } from 'react'
import { AppFooter } from './AppFooter'
import { EmbedHeader } from './EmbedHeader'
import { circuitSlug, racePath, routeFromPath } from './raceRoutes'
import { detectStoppedCars, stoppedAt, type StoppedInterval } from './stoppedCars'
import { TrackScene, type SceneHandle } from './TrackScene'
import { TimingTower } from './TimingTower'
import { RaceShare } from './RaceShare'
import { RunningOrder } from './RunningOrder'
import { DriverFocus, type DriverTracking } from './DriverFocus'
import { ReplayDock } from './ReplayDock'
import { PhotoReview } from './PhotoReview'
import { RaceResults } from './RaceResults'
import { RaceStartLights, START_LIGHT_COUNT, START_LIGHT_INTERVAL } from './RaceStartLights'
import { raceStatusDisplay } from './raceHud'
import { raceResults } from './raceResults'
import { isCautionStatus, musicMoodFor } from './raceMusic'
import { useRaceAudio } from './useRaceAudio'
import { nextRaceAfter, nextSeason } from './nextRace'
import type { RacePhotoHud, SceneCapture } from './racePhoto'
import { createWeatherTimeline, describeWeather } from './raceWeather'
import { isTimeShortcutTarget, skipSecondsForKey } from './replayShortcuts'
import { carLocation, clockLabel, isReplay, lapsAt, notificationsBetween, OVERTAKE_NOTIFICATION_CUTOFF, racePositionsAt, raceStatus, type Replay, type ReplayNotification } from './replay'

type RaceOption = { id: string; url: string; label: string; circuit: string; grandPrix: string; location: string; countryCode: string; date: string; laps: number }
const FALLBACK_RACES: RaceOption[] = [
  { id: '11361', url: '/data/2026/2026-09-06-ITA-MONZA-11361.json', label: 'Italian Grand Prix · Monza', circuit: 'Monza', grandPrix: 'Italian Grand Prix', location: 'Monza', countryCode: 'ITA', date: '2026-09-06', laps: 53 },
  { id: '11353', url: '/data/2026/2026-08-23-NLD-ZANDVOORT-11353.json', label: 'Dutch Grand Prix · Zandvoort', circuit: 'Zandvoort', grandPrix: 'Dutch Grand Prix', location: 'Zandvoort', countryCode: 'NLD', date: '2026-08-23', laps: 72 },
]
const isRaceOption = (value: unknown): value is RaceOption => {
  if (typeof value !== 'object' || value === null) return false
  const race = value as Record<string, unknown>
  return ['id', 'url', 'label', 'circuit', 'grandPrix', 'location', 'countryCode', 'date'].every((key) => typeof race[key] === 'string')
    && typeof race.laps === 'number'
}
const formatRaceDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(year, month - 1, day))
}
const SPEEDS = [1, 2, 5, 10, 25, 50, 100]
const DEFAULT_SPEED = 10
const NOTIFICATION_DURATION = 6000
const LOADER_STEP_DURATION = 500
const LOADER_STEPS = ['Loading race data…', 'Building 3D models…', 'Preparing the 3D scene…']
// Matches the CSS breakpoint where the running order becomes a drawer over the circuit.
const COMPACT_LAYOUT_QUERY = '(max-width: 760px)'
export default function App() {
  const isEmbed = routeFromPath(window.location.pathname)?.isEmbed ?? false
  const [years, setYears] = useState([2026])
  const [year, setYear] = useState(() => routeFromPath(window.location.pathname)?.year ?? 2026)
  const [requestedCircuitSlug, setRequestedCircuitSlug] = useState(() => routeFromPath(window.location.pathname)?.circuitSlug ?? null)
  const [races, setRaces] = useState(FALLBACK_RACES)
  const catalogKey = `${year}/${requestedCircuitSlug ?? ''}`
  const [loadedCatalogKey, setLoadedCatalogKey] = useState<string | null>(null)
  const [pickerYear, setPickerYear] = useState(year)
  const [pickerRaces, setPickerRaces] = useState(FALLBACK_RACES)
  const [hoveredDriver, setHoveredDriver] = useState<number | null>(null)
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null)
  const [isOrderOpen, setIsOrderOpen] = useState(false)
  const [raceId, setRaceId] = useState('11361')
  const race = races.find((option) => option.id === raceId) ?? races[0]
  const [replay, setReplay] = useState<Replay | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [pastRace, setPastRace] = useState<{ year: number; race: RaceOption } | null>(null)
  const [sceneReady, setSceneReady] = useState(false)
  const [activeLoaderStep, setActiveLoaderStep] = useState(0)
  const [hasShownLoaderSteps, setHasShownLoaderSteps] = useState(false)
  const [loaderRun, setLoaderRun] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [time, setTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [speed, setSpeed] = useState(DEFAULT_SPEED)
  const [notifications, setNotifications] = useState<(ReplayNotification & { expiresAt: number })[]>([])
  const [isResultsOpen, setIsResultsOpen] = useState(false)
  const [followingSeasonRace, setFollowingSeasonRace] = useState<{ year: number; race: RaceOption } | null>(null)
  const [photo, setPhoto] = useState<{ capture: SceneCapture; hud: RacePhotoHud; resumesPlayback: boolean } | null>(null)
  const timeRef = useRef(0)
  const previousNotificationTimeRef = useRef(0)
  const isPlayingRef = useRef(false)
  const hasHandledEmbedStartRef = useRef(false)
  const speedRef = useRef(DEFAULT_SPEED)
  const sceneRef = useRef<SceneHandle>(null)
  const { audio, isSoundOn, toggleSound } = useRaceAudio({ initialSoundEnabled: isEmbed ? true : undefined })

  useEffect(() => {
    document.title = `${race.grandPrix} ${year} | Miniature GP`
  }, [race.grandPrix, year])

  const selectRace = (nextRaceId: string, options = races, updateHistory = true, nextYear = year) => {
    isPlayingRef.current = false
    hasHandledEmbedStartRef.current = false
    timeRef.current = 0
    previousNotificationTimeRef.current = 0
    setIsPlaying(false)
    setHasStarted(false)
    setCountdown(null)
    setTime(0)
    setReplay(null)
    setUnavailable(false)
    setPastRace(null)
    setSceneReady(false)
    setActiveLoaderStep(0)
    setHasShownLoaderSteps(false)
    setLoaderRun((current) => current + 1)
    setError(null)
    setSelectedDriver(null)
    setHoveredDriver(null)
    setNotifications([])
    setIsResultsOpen(false)
    setRaceId(nextRaceId)
    const nextRace = options.find((option) => option.id === nextRaceId)
    if (nextRace && updateHistory) window.history.pushState(null, '', racePath(nextYear, nextRace, isEmbed))
  }

  useEffect(() => {
    const controller = new AbortController()
    fetch('/data/years.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Season index could not be loaded (${response.status}).`)
        return response.json() as Promise<unknown>
      })
      .then((value) => {
        if (!Array.isArray(value) || !value.length || !value.every((item) => Number.isInteger(item))) throw new Error('Season index is invalid.')
        const availableYears = [...value].sort((first: number, second: number) => second - first)
        setYears(availableYears)
        if (!isEmbed) setYear((current) => availableYears.includes(current) ? current : availableYears[0])
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        console.error('Using bundled season:', cause)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/data/${year}/races-${year}.json`, { signal: controller.signal })
      .then((response) => {
        if (response.status === 404) return null
        if (!response.ok) throw new Error(`Race catalog could not be loaded (${response.status}).`)
        return response.json() as Promise<unknown>
      })
      .then((value) => {
        if (controller.signal.aborted) return
        if (value === null) throw new Error(`Race catalog is unavailable for ${year}.`)
        if (!Array.isArray(value) || !value.length || !value.every(isRaceOption)) throw new Error('Race catalog is invalid.')
        const options = [...value].sort((first, second) => second.date.localeCompare(first.date))
        setRaces(options)
        const requestedRace = requestedCircuitSlug ? options.find((option) => circuitSlug(option.circuit) === requestedCircuitSlug) : undefined
        if (isEmbed && !requestedRace) throw new Error('The requested race is not available.')
        const nextRace = requestedRace ?? options[0]
        selectRace(nextRace.id, options, false)
        setLoadedCatalogKey(catalogKey)
        window.history.replaceState(null, '', racePath(year, nextRace, isEmbed))
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (isEmbed) {
          setError('The requested race could not be loaded. Open the full replay or refresh to try again.')
          return
        }
        console.error('Using bundled race list:', cause)
        if (year === 2026) {
          setRaces(FALLBACK_RACES)
          selectRace(FALLBACK_RACES[0].id, FALLBACK_RACES, false)
          setLoadedCatalogKey(catalogKey)
          return
        }
        setError(`Race data could not be loaded for ${year}. Please refresh to try again.`)
      })
    return () => controller.abort()
  }, [year, requestedCircuitSlug, catalogKey, isEmbed])

  useEffect(() => {
    setPickerYear(year)
  }, [year])

  useEffect(() => {
    if (pickerYear === year) {
      setPickerRaces(races)
      return
    }
    const controller = new AbortController()
    setPickerRaces([])
    fetch(`/data/${pickerYear}/races-${pickerYear}.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Race catalog could not be loaded (${response.status}).`)
        return response.json() as Promise<unknown>
      })
      .then((value) => {
        if (!Array.isArray(value) || !value.length || !value.every(isRaceOption)) throw new Error('Race catalog is invalid.')
        setPickerRaces([...value].sort((first, second) => second.date.localeCompare(first.date)))
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        console.error('The selected season could not be loaded:', cause)
      })
    return () => controller.abort()
  }, [pickerYear, year, races])

  const selectPickerRace = (nextRaceId: string) => {
    const nextRace = pickerRaces.find((option) => option.id === nextRaceId)
    if (!nextRace) return
    if (pickerYear !== year) setRequestedCircuitSlug(circuitSlug(nextRace.circuit))
    setYear(pickerYear)
    setRaces(pickerRaces)
    selectRace(nextRaceId, pickerRaces, true, pickerYear)
  }

  useEffect(() => {
    const handlePopState = () => {
      const route = routeFromPath(window.location.pathname)
      if (!route) return
      setRequestedCircuitSlug(route.circuitSlug)
      setYear(route.year)
      if (route.year === year) {
        const matchingRace = races.find((option) => circuitSlug(option.circuit) === route.circuitSlug)
        if (matchingRace) selectRace(matchingRace.id, races, false)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [year, races])

  useEffect(() => {
    if (loadedCatalogKey !== catalogKey) return
    const controller = new AbortController()
    setUnavailable(false)
    setPastRace(null)
    setError(null)
    fetch(race.url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Replay file could not be loaded (${response.status}).`)
        return response.json() as Promise<unknown>
      })
      .then(async (value) => {
        if (controller.signal.aborted) return
        if (typeof value === 'object' && value !== null && (value as Record<string, unknown>).invalid === true) {
          setUnavailable(true)
          for (const previousYear of years.filter((candidate) => candidate < year)) {
            const catalogResponse = await fetch(`/data/${previousYear}/races-${previousYear}.json`, { signal: controller.signal })
            if (!catalogResponse.ok) continue
            const catalog: unknown = await catalogResponse.json()
            if (controller.signal.aborted) return
            if (!Array.isArray(catalog)) continue
            const previousRace = catalog.find((entry): entry is RaceOption => isRaceOption(entry) && entry.circuit.toLowerCase() === race.circuit.toLowerCase())
            if (!previousRace) continue
            const replayResponse = await fetch(previousRace.url, { signal: controller.signal })
            if (!replayResponse.ok) continue
            const previousReplay: unknown = await replayResponse.json()
            if (controller.signal.aborted) return
            if (!isReplay(previousReplay)) continue
            setReplay(previousReplay)
            setPastRace({ year: previousYear, race: previousRace })
            return
          }
          return
        }
        if (!isReplay(value)) throw new Error('The replay file is incomplete.')
        setReplay(value)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        console.error('The replay file could not be loaded:', cause)
        setError(cause instanceof Error && !(cause instanceof SyntaxError) ? cause.message : 'Race data could not be loaded. Please refresh to try again.')
      })
    return () => controller.abort()
  }, [race.url, race.circuit, year, years, loadedCatalogKey, catalogKey])

  useEffect(() => {
    if (!replay) return
    let frame = 0
    let previous = 0
    let lastUpdate = 0
    const tick = (now: number) => {
      if (previous && isPlayingRef.current) {
        timeRef.current = Math.min(replay.duration, timeRef.current + (now - previous) / 1000 * speedRef.current)
        if (timeRef.current === replay.duration) {
          isPlayingRef.current = false
          setIsPlaying(false)
          setIsResultsOpen(true)
          audio.play('chequeredFlag')
        }
      }
      previous = now
      if (now - lastUpdate > 120) {
        setTime(timeRef.current)
        lastUpdate = now
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [replay])

  useEffect(() => {
    if (countdown === null) return
    audio.play('startLight')
    const timeout = window.setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1)
        return
      }
      setCountdown(null)
      setHasStarted(true)
      isPlayingRef.current = true
      setIsPlaying(true)
      audio.play('lightsOut')
    }, START_LIGHT_INTERVAL)
    return () => window.clearTimeout(timeout)
  }, [audio, countdown])

  useEffect(() => {
    const previousTime = previousNotificationTimeRef.current
    previousNotificationTimeRef.current = time
    if (!replay || !hasStarted || time <= previousTime) return
    const nextStatus = raceStatus(replay.raceControl, time)
    if (isCautionStatus(nextStatus) && nextStatus !== raceStatus(replay.raceControl, previousTime)) audio.play('caution')
    const arrivals = notificationsBetween(replay, previousTime, time, speed)
    if (!arrivals.length) return
    const expiresAt = performance.now() + NOTIFICATION_DURATION
    setNotifications((current) => [...arrivals.reverse().map((notice) => ({ ...notice, expiresAt })), ...current].slice(0, 8))
  }, [audio, replay, time, hasStarted, speed])

  useEffect(() => {
    if (!notifications.length) return
    const delay = Math.max(0, Math.min(...notifications.map((notice) => notice.expiresAt)) - performance.now())
    const timeout = window.setTimeout(() => setNotifications((current) => current.filter((notice) => notice.expiresAt > performance.now())), delay)
    return () => window.clearTimeout(timeout)
  }, [notifications])

  const setPlayback = (playing: boolean) => {
    if (!playing) setCountdown(null)
    if (playing && replay && timeRef.current >= replay.duration) {
      timeRef.current = 0
      setTime(0)
    }
    if (playing && timeRef.current === 0) {
      setCountdown(START_LIGHT_COUNT)
      return
    }
    isPlayingRef.current = playing
    setIsPlaying(playing)
    if (playing) setHasStarted(true)
  }

  const seek = (nextTime: number) => {
    const isFinishing = replay !== null && nextTime >= replay.duration && timeRef.current < replay.duration
    setCountdown(null)
    if (nextTime > 0) setHasStarted(true)
    timeRef.current = nextTime
    previousNotificationTimeRef.current = nextTime
    setTime(nextTime)
    setNotifications([])
    if (replay && nextTime >= replay.duration) {
      setPlayback(false)
      setIsResultsOpen(true)
    }
    if (isFinishing) audio.play('chequeredFlag')
  }

  const skip = (seconds: number) => {
    if (!replay) return
    seek(Math.min(replay.duration, Math.max(0, timeRef.current + seconds)))
  }

  useEffect(() => {
    if (!replay) return
    const handleKeyDown = (event: KeyboardEvent) => {
      const seconds = skipSecondsForKey(event)
      if (seconds === null || event.defaultPrevented || !isTimeShortcutTarget(event.target)) return
      event.preventDefault()
      skip(seconds)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // skip only depends on the replay; the rest of its state is read through refs and setters.
  }, [replay])

  const changeSpeed = (nextSpeed: number) => {
    speedRef.current = nextSpeed
    setSpeed(nextSpeed)
    if (nextSpeed >= OVERTAKE_NOTIFICATION_CUTOFF) setNotifications((current) => current.filter((notice) => !notice.id.startsWith('overtake-')))
  }

  const order = useMemo(() => {
    if (!replay) return []
    const positions = time === 0 && !isPlaying
      ? new Map(replay.startingGrid)
      : racePositionsAt(replay, time)
    const laps = lapsAt(replay.laps, time)
    return replay.drivers
      .map((driver) => ({ ...driver, position: positions.get(driver.number) ?? 99, lap: laps.get(driver.number) ?? 1 }))
      .sort((first, second) => first.position - second.position)
  }, [replay, time, isPlaying])

  const results = useMemo(() => replay ? raceResults(replay) : [], [replay])
  const stops = useMemo(() => replay ? detectStoppedCars(replay) : new Map<number, StoppedInterval[]>(), [replay])
  const weatherAt = useMemo(() => replay ? createWeatherTimeline(replay) : null, [replay])
  const weather = weatherAt?.(time) ?? null
  const conditions = weather ? describeWeather(weather) : null
  const status = replay ? raceStatus(replay.raceControl, time) : 'Loading'
  const isCountingDown = countdown !== null

  useEffect(() => {
    audio.setMood(musicMoodFor({ isCountingDown, isPlaying, status }))
  }, [audio, isCountingDown, isPlaying, status])

  const firstLaunch = replay?.raceLaunches?.[0]
  const isBeforeLaunch = firstLaunch !== undefined && time < firstLaunch.time
  const leaderLap = order[0]?.lap ?? 1
  const isRaining = conditions?.label === 'Rain'
  const selected = order.find((driver) => driver.number === selectedDriver)
  const stoppedDrivers = new Set(order.filter((driver) => stoppedAt(stops.get(driver.number) ?? [], time) !== null).map((driver) => driver.number))
  const hasSelectedLocation = selected && replay ? time === 0 && !isPlaying
    ? replay.startingGrid.some(([driver]) => driver === selected.number)
    : carLocation(replay.locations[String(selected.number)] ?? [], time) !== null : false
  const selectedTracking: DriverTracking = selected && stoppedDrivers.has(selected.number) ? 'stopped' : hasSelectedLocation ? 'tracked' : 'missing'
  const statusDisplay = raceStatusDisplay(status, hasStarted)
  const raceWeather = { symbol: conditions?.symbol ?? '☀', label: conditions?.label ?? 'Dry', airTemperature: weather?.airTemperature ?? null, trackTemperature: weather?.trackTemperature ?? null }
  const orderTitle = isBeforeLaunch ? 'Starting order' : 'Running order'

  const selectFromOrder = (driver: number | null) => {
    setSelectedDriver(driver)
    if (driver === null || !window.matchMedia(COMPACT_LAYOUT_QUERY).matches) return
    // The drawer closes to reveal the car, so the focused row must not keep the rest of the field dimmed.
    setIsOrderOpen(false)
    setHoveredDriver(null)
  }

  // The replay stays paused while the photo is reviewed, so the scene behind it is the moment taken.
  const takePhoto = (capture: SceneCapture) => {
    const resumesPlayback = isPlayingRef.current
    setPlayback(false)
    audio.play('shutter')
    setPhoto({
      capture,
      resumesPlayback,
      hud: {
        slug: circuitSlug(race.location),
        location: race.location,
        grandPrix: race.grandPrix,
        countryCode: race.countryCode,
        year: race.date.slice(0, 4),
        dateLabel: formatRaceDate(race.date),
        lap: leaderLap,
        totalLaps: race.laps,
        clock: clockLabel(time),
        status,
        weather: {
          symbol: conditions?.symbol ?? '☀',
          label: conditions?.label ?? 'Dry',
          details: weather ? `Air ${weather.airTemperature.toFixed(1)}° · Track ${weather.trackTemperature.toFixed(1)}°` : null,
        },
        order: unavailable ? [] : order.map(({ position, code, color }) => ({ position, code, color })),
        focus: selected ? { name: selected.name, number: selected.number, team: selected.team, position: selected.position, lap: selected.lap } : null,
        notifications: notifications.map(({ title, detail, drivers }) => ({ title, detail, drivers })),
      },
    })
  }

  const seasonNextRace = nextRaceAfter(races, race)
  const followingSeason = nextSeason(years, year)
  const nextRace = seasonNextRace ? { year, race: seasonNextRace } : followingSeasonRace?.year === followingSeason ? followingSeasonRace : null

  // The last race of a season continues into the next one, whose catalog isn't loaded yet.
  useEffect(() => {
    if (isEmbed || !isResultsOpen || seasonNextRace || followingSeason === null) return
    const controller = new AbortController()
    fetch(`/data/${followingSeason}/races-${followingSeason}.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Race catalog could not be loaded (${response.status}).`)
        return response.json() as Promise<unknown>
      })
      .then((value) => {
        if (!Array.isArray(value)) throw new Error('Race catalog is invalid.')
        const firstRace = nextRaceAfter(value.filter(isRaceOption), race)
        setFollowingSeasonRace(firstRace && { year: followingSeason, race: firstRace })
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        console.error('The next season could not be loaded:', cause)
      })
    return () => controller.abort()
  }, [isEmbed, isResultsOpen, seasonNextRace, followingSeason, race])

  const goToNextRace = () => {
    if (!nextRace) return
    if (nextRace.year === year) {
      selectRace(nextRace.race.id)
      return
    }
    setIsResultsOpen(false)
    setRequestedCircuitSlug(circuitSlug(nextRace.race.circuit))
    setYear(nextRace.year)
  }

  const closePhoto = () => {
    if (photo?.resumesPlayback) setPlayback(true)
    setPhoto(null)
  }

  useEffect(() => {
    let step = 0
    let timeout: number
    const advanceLoader = () => {
      timeout = window.setTimeout(() => {
        if (step === LOADER_STEPS.length - 1) {
          setHasShownLoaderSteps(true)
          return
        }
        step += 1
        setActiveLoaderStep(step)
        advanceLoader()
      }, LOADER_STEP_DURATION)
    }
    advanceLoader()
    return () => window.clearTimeout(timeout)
  }, [race.id, loaderRun])

  useEffect(() => {
    if (!isEmbed || !replay || unavailable || !sceneReady || !hasShownLoaderSteps || hasHandledEmbedStartRef.current) return
    hasHandledEmbedStartRef.current = true
    if (!hasStarted && countdown === null) setCountdown(START_LIGHT_COUNT)
  }, [isEmbed, replay, unavailable, sceneReady, hasShownLoaderSteps, hasStarted, countdown])

  const runningOrder = <RunningOrder title={isEmbed ? 'Order' : orderTitle} drivers={order} selectedDriver={selectedDriver} stoppedDrivers={stoppedDrivers} isOpen={!isEmbed && isOrderOpen} onHover={setHoveredDriver} onSelect={selectFromOrder} onClose={() => setIsOrderOpen(false)}>
    {!replay && <p className="order-message">{isEmbed ? '—' : error ?? 'Loading race data…'}</p>}
  </RunningOrder>

  return (
    <div className={`app-shell${isEmbed ? ' embed-shell' : ''}${isRaining ? ' raining' : ''}${unavailable ? ' race-unavailable' : ''}`}>
      {isEmbed ? <EmbedHeader location={race.location} grandPrix={race.grandPrix} year={year} lap={leaderLap} totalLaps={race.laps} status={replay && !unavailable ? statusDisplay : null} replayPath={racePath(year, race)} /> : <header className="topbar">
        <div className="identity">
          <img className="identity-mark" src="/logo.svg" alt="" />
          <div>
            <div className="app-name">Miniature GP</div>
            <div className="app-subtitle">Every race. Rebuilt in miniature.</div>
          </div>
        </div>
        <div className="race-picker" role="group" aria-label="Selected race">
          <label>Season<select aria-label="Season" value={pickerYear} onChange={(event) => setPickerYear(Number(event.target.value))}>{years.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label>Grand Prix<select aria-label="Grand Prix" value={pickerYear === year ? race.id : ""} disabled={!pickerRaces.length} onChange={(event) => selectPickerRace(event.target.value)}>
            {pickerYear !== year && <option value="" disabled hidden>{pickerRaces.length ? 'Select a Grand Prix' : 'Loading races…'}</option>}
            {pickerRaces.map((option) => <option key={option.id} value={option.id}>{option.label}{option.date ? ` · ${formatRaceDate(option.date)}` : ''}</option>)}
          </select></label>
        </div>
      </header>}

      <main className="race-view">
        {isEmbed ? <aside className="embed-order" aria-label="Race positions">{runningOrder}</aside> : <TimingTower
          location={race.location}
          grandPrix={race.grandPrix}
          dateLabel={formatRaceDate(race.date)}
          lap={leaderLap}
          totalLaps={race.laps}
          orderTitle={orderTitle}
          conditions={replay && !unavailable ? { status: statusDisplay, weather: raceWeather } : null}
          isOrderOpen={isOrderOpen}
          onOpenOrder={() => setIsOrderOpen(true)}
          shareControl={<RaceShare key={`${year}/${race.circuit}`} year={year} race={race} />}
        >
          {runningOrder}
        </TimingTower>}

        <section className="race-stage" aria-label="Race simulation">
          {replay && weatherAt && <TrackScene key={race.id} ref={sceneRef} replay={replay} weatherAt={weatherAt} timeRef={timeRef} circuit={race.circuit} selectedDriver={selectedDriver} hoveredDriver={hoveredDriver} showStartingGrid={time === 0 && !isPlaying} stops={stops} onSelectDriver={setSelectedDriver} onSceneReady={setSceneReady} onPhoto={takePhoto} showCars={!unavailable} isOrbiting={isResultsOpen} isSoundOn={isSoundOn} onToggleSound={toggleSound} isEmbed={isEmbed} />}
          {(!sceneReady || !hasShownLoaderSteps) && <div className="race-loader" role="status" aria-live="polite">
            <div className="loader-wheel" aria-hidden="true"><span /></div>
            <span className="loader-eyebrow">{error ? 'RACE DATA UNAVAILABLE' : 'PREPARING YOUR RACE'}</span>
            <h2>{error ?? `${race.location} ${year}`}</h2>
            {!error && <ol className="loader-steps">
              {LOADER_STEPS.map((step, index) => <li className={index === activeLoaderStep ? 'active' : undefined} aria-current={index === activeLoaderStep ? 'step' : undefined} key={step}>{step}</li>)}
            </ol>}
          </div>}
          {unavailable && <div className="unavailable-panel" role="status"><span className="section-eyebrow">RACE DATA UNAVAILABLE</span><h2>We don’t have data for {year}.</h2><p>The circuit is shown using an earlier race.</p>{pastRace && <button type="button" onClick={() => { setRequestedCircuitSlug(circuitSlug(pastRace.race.circuit)); setYear(pastRace.year) }}>Show the {pastRace.year} race at this circuit</button>}</div>}
          <div className="notification-stack" aria-label="Race notifications" aria-live="polite">
            {(isEmbed ? notifications.slice(0, 1) : notifications).map((notice) => <div className="race-toast" key={notice.id}>
              {notice.drivers
                ? <strong className="overtake-heading"><span style={{ color: notice.drivers[0].color }}>{notice.drivers[0].name}</span><span>passed</span><span style={{ color: notice.drivers[1].color }}>{notice.drivers[1].name}</span></strong>
                : <strong>{notice.title}</strong>}
              {notice.detail && <span>{notice.detail}</span>}
            </div>)}
          </div>
          {replay && !unavailable && (!hasStarted || countdown !== null) && <div className="stage-cta">
            {countdown === null ? <button className="cta-button" type="button" onClick={() => setPlayback(true)}><span className="play-icon" aria-hidden="true" /> Start replay</button> : <RaceStartLights countdown={countdown} />}
          </div>}
          {replay && !unavailable && !isResultsOpen && time >= replay.duration && <div className="stage-cta">
            <button className="cta-button" type="button" onClick={() => setIsResultsOpen(true)}><span className="results-button-flag" aria-hidden="true" /> Race results</button>
          </div>}
          {selected && !unavailable && <DriverFocus driver={selected} tracking={selectedTracking} onLocate={() => sceneRef.current?.locateSelectedDriver()} onClose={() => setSelectedDriver(null)} />}
          {isEmbed && isResultsOpen && !unavailable && <div className="stage-cta embed-finish">
            <span>Replay finished</span>
            <button className="cta-button" type="button" onClick={() => { setIsResultsOpen(false); seek(0); setPlayback(true) }}>Replay again</button>
            <a href={racePath(year, race)} target="_blank" rel="noopener noreferrer">Full replay ↗</a>
            <button type="button" className="embed-finish-close" onClick={() => setIsResultsOpen(false)} aria-label="Close replay summary">×</button>
          </div>}
        </section>
      </main>

      <ReplayDock time={time} duration={replay?.duration ?? null} isPlaying={isPlaying} isCountingDown={countdown !== null} speed={speed} speeds={SPEEDS} onTogglePlayback={() => setPlayback(countdown === null && !isPlaying)} onSkip={skip} onSeek={seek} onSpeedChange={changeSpeed} />
      {!isEmbed && isResultsOpen && !unavailable && results.length > 0 && <RaceResults results={results} grandPrix={race.grandPrix} location={race.location} year={race.date.slice(0, 4)} nextRaceLocation={nextRace?.race.location ?? null} onNextRace={goToNextRace} onClose={() => setIsResultsOpen(false)} />}
      {photo && <PhotoReview capture={photo.capture} hud={photo.hud} onClose={closePhoto} />}
      {!isEmbed && <AppFooter showTelemetry />}
    </div>
  )
}
