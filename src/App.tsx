import { useEffect, useMemo, useRef, useState } from 'react'
import { TrackScene } from './TrackScene'
import { clockLabel, isReplay, lapsAt, latestAt, positionsAt, raceStatus, type Replay } from './replay'

const RACES = {
  netherlands: { url: '/data/netherlands-2026.json', label: 'Dutch Grand Prix · Zandvoort', circuit: 'Circuit Zandvoort', grandPrix: 'Dutch Grand Prix', date: '23 Aug 2026', laps: 72 },
  monza: { url: '/data/monza-2026.json', label: 'Italian Grand Prix · Monza', circuit: 'Autodromo Nazionale Monza', grandPrix: 'Italian Grand Prix', date: '6 Sep 2026', laps: 53 },
} as const
const SPEEDS = [1, 2, 5, 10, 30, 60, 120]

export default function App() {
  const [raceId, setRaceId] = useState<keyof typeof RACES>('netherlands')
  const race = RACES[raceId]
  const [replay, setReplay] = useState<Replay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [time, setTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(30)
  const timeRef = useRef(0)
  const isPlayingRef = useRef(false)
  const speedRef = useRef(30)

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
        const shouldPlay = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
        isPlayingRef.current = shouldPlay
        setIsPlaying(shouldPlay)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : 'The replay file could not be loaded.')
      })
    return () => controller.abort()
  }, [race.url])

  const selectRace = (nextRaceId: keyof typeof RACES) => {
    isPlayingRef.current = false
    timeRef.current = 0
    setIsPlaying(false)
    setTime(0)
    setReplay(null)
    setError(null)
    setRaceId(nextRaceId)
  }

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

  const setPlayback = (playing: boolean) => {
    if (playing && replay && timeRef.current >= replay.duration) {
      timeRef.current = 0
      setTime(0)
    }
    isPlayingRef.current = playing
    setIsPlaying(playing)
  }

  const seek = (nextTime: number) => {
    timeRef.current = nextTime
    setTime(nextTime)
    if (replay && nextTime >= replay.duration) setPlayback(false)
  }

  const changeSpeed = (nextSpeed: number) => {
    speedRef.current = nextSpeed
    setSpeed(nextSpeed)
  }

  const order = useMemo(() => {
    if (!replay) return []
    const positions = positionsAt(replay.positions, time)
    const laps = lapsAt(replay.laps, time)
    return replay.drivers
      .map((driver) => ({ ...driver, position: positions.get(driver.number) ?? 99, lap: laps.get(driver.number) ?? 1 }))
      .sort((first, second) => first.position - second.position)
  }, [replay, time])

  const weather = replay ? latestAt(replay.weather, time) : null
  const status = replay ? raceStatus(replay.raceControl, time) : 'Loading'
  const leaderLap = order[0]?.lap ?? 1
  const lastPit = replay ? latestAt(replay.pits, time) : null
  const isRaining = Boolean(weather?.[1])

  return (
    <div className={`app-shell${isRaining ? ' raining' : ''}`}>
      <header className="topbar">
        <div className="identity">
          <span className="identity-mark" aria-hidden="true"><span /><span /><span /></span>
          <div>
            <div className="app-name">Grand Prix Atlas</div>
            <div className="app-subtitle">Race replay</div>
          </div>
        </div>
        <div className="race-picker" role="group" aria-label="Selected race">
          <label>Season<select aria-label="Season" defaultValue="2026"><option value="2026">2026</option></select></label>
          <label>Grand Prix<select aria-label="Grand Prix" value={raceId} onChange={(event) => selectRace(event.target.value === 'monza' ? 'monza' : 'netherlands')}>
            {Object.entries(RACES).map(([id, option]) => <option key={id} value={id}>{option.label}</option>)}
          </select></label>
        </div>
      </header>

      <main className="workspace">
        <aside className="order-panel">
          <div className="panel-heading">
            <div>
              <span className="section-title">Running order</span>
              <span className="section-note">{race.circuit.replace('Circuit ', '')} · {race.date}</span>
            </div>
            <span className="lap-counter">Lap {leaderLap}/{race.laps}</span>
          </div>
          <div className="order-list" role="region" tabIndex={0} aria-label="Running order">
            {order.map((driver) => (
              <div className="driver-row" key={driver.number}>
                <span className="driver-position">{driver.position === 99 ? '–' : driver.position}</span>
                <span className="team-marker" style={{ backgroundColor: driver.color }} />
                <span className="driver-code">{driver.code}</span>
                <span className="driver-name">{driver.name}</span>
                <span className="driver-number">{driver.number}</span>
              </div>
            ))}
            {!replay && <div className="panel-message">{error ?? 'Loading race data…'}</div>}
          </div>
          <div className="data-credit">Timing and locations: OpenF1</div>
        </aside>

        <section className="race-stage" aria-label="Race simulation">
          {replay ? <TrackScene replay={replay} timeRef={timeRef} circuit={race.circuit} /> : <div className="stage-placeholder">{error ?? `Preparing ${race.circuit}…`}</div>}
          <div className="stage-topline">
            <div className="stage-title">
              <span>{race.circuit}</span>
              <strong>{race.grandPrix}</strong>
            </div>
            <div className={`status-chip ${status === 'Red flag' ? 'flag-red' : ''}`}>
              <span className="status-dot" />{status}
            </div>
          </div>
          <div className="weather-chip">
            <span className="weather-symbol" aria-hidden="true">{isRaining ? '☂' : '☀'}</span>
            <span>{isRaining ? 'Rain' : 'Dry'}</span>
            {weather && <span className="weather-details">Air {weather[2].toFixed(1)}° · Track {weather[3].toFixed(1)}°</span>}
          </div>
          {status === 'Red flag' && <div className="race-notice">Race suspended <span>Cars held in the pit lane</span></div>}
          {lastPit && time - lastPit[0] < 18 && <div className="pit-notice">Pit stop · #{lastPit[1]} · lap {lastPit[2]}</div>}
          <div className="stage-footnote">Schematic circuit terrain · Car movement from recorded locations</div>
        </section>
      </main>

      <footer className="transport">
        <button className="play-button" type="button" disabled={!replay} onClick={() => setPlayback(!isPlaying)} aria-label={isPlaying ? 'Pause replay' : 'Play replay'}>
          {isPlaying ? <span className="pause-icon" /> : <span className="play-icon" />}
        </button>
        <div className="timeline-wrap">
          <div className="time-labels"><span>{clockLabel(time)}</span><span>{replay ? clockLabel(replay.duration) : '00:00:00'}</span></div>
          <input className="timeline" type="range" aria-label="Replay position" min="0" max={replay?.duration ?? 1} step="0.1" value={time} disabled={!replay} onChange={(event) => seek(Number(event.target.value))} style={{ '--progress': `${replay ? time / replay.duration * 100 : 0}%` } as React.CSSProperties} />
        </div>
        <label className="speed-picker">Speed<select aria-label="Replay speed" value={speed} onChange={(event) => changeSpeed(Number(event.target.value))}>{SPEEDS.map((value) => <option value={value} key={value}>{value}×</option>)}</select></label>
      </footer>
    </div>
  )
}
