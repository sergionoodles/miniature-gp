import { useEffect, useMemo, useRef, useState } from 'react'
import { version } from '../package.json'
import { detectStoppedCars, stoppedAt, type StoppedInterval } from './stoppedCars'
import { TrackScene } from './TrackScene'
import { createWeatherTimeline, describeWeather } from './raceWeather'
import { carLocation, clockLabel, isReplay, lapsAt, notificationsBetween, OVERTAKE_NOTIFICATION_CUTOFF, positionsAt, raceStatus, type Replay, type ReplayNotification } from './replay'

type RaceOption = { id: string; url: string; label: string; circuit: string; grandPrix: string; location: string; countryCode: string; date: string; laps: number }
const FALLBACK_RACES: RaceOption[] = [
  { id: '11361', url: '/data/2026/monza-2026.json', label: 'Italian Grand Prix · Monza', circuit: 'Autodromo Nazionale Monza', grandPrix: 'Italian Grand Prix', location: 'Monza', countryCode: 'ITA', date: '2026-09-06', laps: 53 },
  { id: '11353', url: '/data/2026/netherlands-2026.json', label: 'Dutch Grand Prix · Zandvoort', circuit: 'Circuit Zandvoort', grandPrix: 'Dutch Grand Prix', location: 'Zandvoort', countryCode: 'NLD', date: '2026-08-23', laps: 72 },
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
const routeFromPath = (pathname: string) => {
  const match = pathname.match(/^\/(\d{4})\/([^/]+)\/?$/)
  return match ? { year: Number(match[1]), circuitSlug: match[2] } : null
}
const circuitSlug = (circuit: string) => circuit
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
const racePath = (year: number, race: RaceOption) => `/${year}/${circuitSlug(race.circuit)}`

export default function App() {
  const [years, setYears] = useState([2026])
  const [year, setYear] = useState(() => routeFromPath(window.location.pathname)?.year ?? 2026)
  const [requestedCircuitSlug, setRequestedCircuitSlug] = useState(() => routeFromPath(window.location.pathname)?.circuitSlug ?? null)
  const [races, setRaces] = useState(FALLBACK_RACES)
  const [hoveredDriver, setHoveredDriver] = useState<number | null>(null)
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null)
  const [raceId, setRaceId] = useState('11361')
  const race = races.find((option) => option.id === raceId) ?? races[0]
  const [replay, setReplay] = useState<Replay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [time, setTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [speed, setSpeed] = useState(DEFAULT_SPEED)
  const [notifications, setNotifications] = useState<(ReplayNotification & { expiresAt: number })[]>([])
  const timeRef = useRef(0)
  const previousNotificationTimeRef = useRef(0)
  const isPlayingRef = useRef(false)
  const speedRef = useRef(DEFAULT_SPEED)

  const selectRace = (nextRaceId: string, options = races, updateHistory = true) => {
    isPlayingRef.current = false
    timeRef.current = 0
    previousNotificationTimeRef.current = 0
    setIsPlaying(false)
    setHasStarted(false)
    setCountdown(null)
    setTime(0)
    setReplay(null)
    setError(null)
    setSelectedDriver(null)
    setHoveredDriver(null)
    setNotifications([])
    setRaceId(nextRaceId)
    const nextRace = options.find((option) => option.id === nextRaceId)
    if (nextRace && updateHistory) window.history.pushState(null, '', racePath(year, nextRace))
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
        setYear((current) => availableYears.includes(current) ? current : availableYears[0])
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
        if (value === null) return
        if (!Array.isArray(value) || !value.length || !value.every(isRaceOption)) throw new Error('Race catalog is invalid.')
        const options = [...value].sort((first, second) => second.date.localeCompare(first.date))
        setRaces(options)
        const requestedRace = requestedCircuitSlug ? options.find((option) => circuitSlug(option.circuit) === requestedCircuitSlug) : undefined
        const nextRace = requestedRace ?? options[0]
        selectRace(nextRace.id, options, false)
        window.history.replaceState(null, '', racePath(year, nextRace))
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        console.error('Using bundled race list:', cause)
      })
    return () => controller.abort()
  }, [year, requestedCircuitSlug])

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
    const controller = new AbortController()
    fetch(race.url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Replay file could not be loaded (${response.status}).`)
        return response.json() as Promise<unknown>
      })
      .then((value) => {
        if (!isReplay(value)) throw new Error('The replay file is incomplete.')
        setReplay(value)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : 'The replay file could not be loaded.')
      })
    return () => controller.abort()
  }, [race.url])

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
    const timeout = window.setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1)
        return
      }
      setCountdown(null)
      setHasStarted(true)
      isPlayingRef.current = true
      setIsPlaying(true)
    }, 1000)
    return () => window.clearTimeout(timeout)
  }, [countdown])

  useEffect(() => {
    const previousTime = previousNotificationTimeRef.current
    previousNotificationTimeRef.current = time
    if (!replay || !hasStarted || time <= previousTime) return
    const arrivals = notificationsBetween(replay, previousTime, time, speed)
    if (!arrivals.length) return
    const expiresAt = performance.now() + NOTIFICATION_DURATION
    setNotifications((current) => [...arrivals.reverse().map((notice) => ({ ...notice, expiresAt })), ...current].slice(0, 8))
  }, [replay, time, hasStarted, speed])

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
      setCountdown(3)
      return
    }
    isPlayingRef.current = playing
    setIsPlaying(playing)
    if (playing) setHasStarted(true)
  }

  const seek = (nextTime: number) => {
    setCountdown(null)
    if (nextTime > 0) setHasStarted(true)
    timeRef.current = nextTime
    previousNotificationTimeRef.current = nextTime
    setTime(nextTime)
    setNotifications([])
    if (replay && nextTime >= replay.duration) setPlayback(false)
  }

  const changeSpeed = (nextSpeed: number) => {
    speedRef.current = nextSpeed
    setSpeed(nextSpeed)
    if (nextSpeed >= OVERTAKE_NOTIFICATION_CUTOFF) setNotifications((current) => current.filter((notice) => !notice.id.startsWith('overtake-')))
  }

  const order = useMemo(() => {
    if (!replay) return []
    const positions = time === 0 && !isPlaying
      ? new Map(replay.startingGrid)
      : positionsAt(replay.positions, time)
    const laps = lapsAt(replay.laps, time)
    return replay.drivers
      .map((driver) => ({ ...driver, position: positions.get(driver.number) ?? 99, lap: laps.get(driver.number) ?? 1 }))
      .sort((first, second) => first.position - second.position)
  }, [replay, time, isPlaying])

  const stops = useMemo(() => replay ? detectStoppedCars(replay) : new Map<number, StoppedInterval[]>(), [replay])
  const weatherAt = useMemo(() => replay ? createWeatherTimeline(replay) : null, [replay])
  const weather = weatherAt?.(time) ?? null
  const conditions = weather ? describeWeather(weather) : null
  const status = replay ? raceStatus(replay.raceControl, time) : 'Loading'
  const leaderLap = order[0]?.lap ?? 1
  const isRaining = conditions?.label === 'Rain'
  const selected = order.find((driver) => driver.number === selectedDriver)
  const isSelectedStopped = selected ? stoppedAt(stops.get(selected.number) ?? [], time) !== null : false
  const hasSelectedLocation = selected && replay ? time === 0 && !isPlaying
    ? replay.startingGrid.some(([driver]) => driver === selected.number)
    : carLocation(replay.locations[String(selected.number)] ?? [], time) !== null : false

  return (
    <div className={`app-shell${isRaining ? ' raining' : ''}`}>
      <header className="topbar">
        <div className="identity">
          <img className="identity-mark" src="/logo.svg" alt="" />
          <div>
            <div className="app-name">Miniature GP</div>
            <div className="app-subtitle">Every race. Rebuilt in miniature.</div>
          </div>
        </div>
        <div className="race-picker" role="group" aria-label="Selected race">
          <label>Season<select aria-label="Season" value={year} onChange={(event) => { setRequestedCircuitSlug(circuitSlug(race.circuit)); setYear(Number(event.target.value)) }}>{years.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label>Grand Prix<select aria-label="Grand Prix" value={race.id} onChange={(event) => selectRace(event.target.value)}>
            {races.map((option) => <option key={option.id} value={option.id}>{option.label}{option.date ? ` · ${formatRaceDate(option.date)}` : ''}</option>)}
          </select></label>
        </div>
      </header>

      <main className="workspace">
        <aside className="order-panel">
          <div className="panel-heading">
            <div>
              <span className="section-title">Running order</span>
              <span className="section-note">{race.circuit.replace('Circuit ', '')} · {formatRaceDate(race.date)}</span>
            </div>
            <span className="lap-counter">Lap {leaderLap}/{race.laps}</span>
          </div>
          <div className="order-hint">Hover to isolate · Select to locate <span>↗</span></div>
          <div className="order-list" role="region" tabIndex={0} aria-label="Running order">
            {order.map((driver) => (
              <button type="button" className={`driver-row${selectedDriver === driver.number ? ' selected' : ''}`} key={driver.number} aria-pressed={selectedDriver === driver.number} aria-label={`Highlight ${driver.name}, ${driver.position === 99 ? 'position unavailable' : `position ${driver.position}`}, ${driver.team}, number ${driver.number}${stoppedAt(stops.get(driver.number) ?? [], time) ? ', stopped car inferred from telemetry' : ''}`}  onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHoveredDriver(driver.number) }} onPointerLeave={() => setHoveredDriver(null)} onFocus={() => setHoveredDriver(driver.number)} onBlur={() => setHoveredDriver(null)} onClick={() => setSelectedDriver(selectedDriver === driver.number ? null : driver.number)}>
                <span className="driver-position">{driver.position === 99 ? '–' : driver.position}</span>
                <span className="team-marker" style={{ backgroundColor: driver.color }} />
                <span className="driver-code">{driver.code}</span>
                <span className="driver-name">{driver.name}<small>{driver.team}</small></span>
                <span className="driver-number">{stoppedAt(stops.get(driver.number) ?? [], time) ? <span className="stopped-icon" role="img" aria-label="Stopped car inferred from telemetry" title="Stopped car inferred from telemetry">♧</span> : driver.number}</span>
              </button>
            ))}
            {!replay && <div className="panel-message">{error ?? 'Loading race data…'}</div>}
          </div>
          <div className="data-credit">Recorded telemetry · <a href="https://openf1.org/" target="_blank" rel="noreferrer"><span className="openf1-open">Open</span><span className="openf1-f1">F1</span></a></div>
        </aside>

        <section className="race-stage" aria-label="Race simulation">
          {replay && weatherAt ? <TrackScene key={race.id} replay={replay} weatherAt={weatherAt} timeRef={timeRef} circuit={race.circuit} selectedDriver={selectedDriver} hoveredDriver={hoveredDriver} showStartingGrid={time === 0 && !isPlaying} stops={stops} onSelectDriver={setSelectedDriver} /> : <div className="stage-placeholder">{error ?? `Preparing ${race.circuit}…`}</div>}
          <div className="stage-topline">
            <div className="stage-title">
              <span className="stage-kicker">{race.countryCode} / {race.date.slice(0, 4)}</span>
              <h1 className={race.location.length > 12 ? 'long-circuit-name' : undefined}>{race.location}</h1>
              <span>{race.grandPrix} <b>·</b> {formatRaceDate(race.date)}</span>
            </div>
          </div>
          <div className="stage-conditions">
            <div className="status-chip"><span className="status-dot" />{status}</div>
            <div className="weather-chip">
              <span className="weather-symbol" aria-hidden="true">{conditions?.symbol ?? '☀'}</span>
              <span>{conditions?.label ?? 'Dry'}</span>
              {weather && <span className="weather-details">Air {weather.airTemperature.toFixed(1)}° · Track {weather.trackTemperature.toFixed(1)}°</span>}
            </div>
          </div>
          {status === 'Red flag' && <div className="race-notice">Race suspended <span>Cars held in the pit lane</span></div>}
          <div className="notification-stack" aria-label="Race notifications" aria-live="polite">
            {notifications.map((notice) => <div className="race-toast" key={notice.id}>
              {notice.drivers
                ? <strong className="overtake-heading"><span style={{ color: notice.drivers[0].color }}>{notice.drivers[0].name}</span><span>passed</span><span style={{ color: notice.drivers[1].color }}>{notice.drivers[1].name}</span></strong>
                : <strong>{notice.title}</strong>}
              {notice.detail && <span>{notice.detail}</span>}
            </div>)}
          </div>
          {replay && (!hasStarted || countdown !== null) && <div className="race-start-hud">
            {countdown === null ? <button className="race-start-button" type="button" onClick={() => setPlayback(true)}><span className="play-icon" aria-hidden="true" /> Start race</button> : <div className="race-start-countdown" role="status" aria-live="polite"><span>RACE START</span><strong>{countdown}</strong><div className={`start-lights step-${4 - countdown}`} aria-hidden="true"><i /><i /><i /></div></div>}
          </div>}
          {selected && <div className="selection-card">
            <div><span className="section-eyebrow">DRIVER IN FOCUS</span><button type="button" aria-label="Clear driver selection" onClick={() => setSelectedDriver(null)}>×</button></div>
            <strong>{selected.name} <span>#{selected.number}</span></strong>
            <p>{selected.team} · P{selected.position === 99 ? '–' : selected.position} · Lap {selected.lap}</p>
            <small>{isSelectedStopped ? 'Stopped car · inferred from telemetry' : hasSelectedLocation ? 'Highlighted on the circuit' : 'Location unavailable at this replay time'}</small>
          </div>}
          <div className="stage-bottomline"><span>Drag to orbit <b>·</b> Scroll to zoom</span><span>Ghost = inferred stop · Recorded locations</span></div>
        </section>
      </main>

      <footer className="transport">
        <div className="replay-label"><span className="section-eyebrow">SESSION REPLAY</span><strong>{countdown !== null ? 'Starting' : isPlaying ? 'Playing' : 'Paused'} <span className={isPlaying ? 'playback-dot active' : 'playback-dot'} /></strong></div>
        <button className="play-button" type="button" disabled={!replay} onClick={() => setPlayback(countdown === null && !isPlaying)} aria-label={countdown !== null ? 'Cancel race start' : isPlaying ? 'Pause replay' : 'Play replay'}>
          {isPlaying || countdown !== null ? <span className="pause-icon" /> : <span className="play-icon" />}
        </button>
        <div className="timeline-wrap">
          <div className="time-labels"><span>{clockLabel(time)}</span><span>{replay ? clockLabel(replay.duration) : '00:00:00'}</span></div>
          <input className="timeline" type="range" aria-label="Replay position" min="0" max={replay?.duration ?? 1} step="0.1" value={time} disabled={!replay} onChange={(event) => seek(Number(event.target.value))} style={{ '--progress': `${replay ? time / replay.duration * 100 : 0}%` } as React.CSSProperties} />
        </div>
        <label className="speed-picker">Speed<select aria-label="Replay speed" value={speed} onChange={(event) => changeSpeed(Number(event.target.value))}>{SPEEDS.map((value) => <option value={value} key={value}>{value}×</option>)}</select></label>
      </footer>
      <footer className="app-footer">Race telemetry by <a href="https://openf1.org/" target="_blank" rel="noreferrer">OpenF1</a><span aria-hidden="true">·</span> Miniature GP <span className="app-version">v{version}</span></footer>
    </div>
  )
}
