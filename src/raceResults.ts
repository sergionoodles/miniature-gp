import { carLocation, positionsAt, type Driver, type LapEvent, type LocationSample, type Replay } from './replay'

export type ResultStatus = 'finished' | 'lapped' | 'retired'
export type RaceResult = {
  driver: Driver
  position: number
  grid: number | null
  laps: number
  status: ResultStatus
  lapsDown: number
  gap: number | null
  interval: number | null
}

// Track coordinates are in decimetres; a car farther than this from the winner's path is a bad match.
const MAX_TRACK_MATCH_DISTANCE = 50
// A car whose last lap began more than this many winner laps before the flag is no longer running.
const RUNNING_LAP_FACTOR = 2

function lastLaps(events: LapEvent[]) {
  const history = new Map<number, LapEvent[]>()
  for (const event of events) history.set(event[1], [...(history.get(event[1]) ?? []).slice(-1), event])
  return history
}

// The replay ends as the winner crosses the line, so a car's gap is how long ago the winner
// passed the spot where that car is at the flag.
function gapAtFlag(winnerPath: LocationSample[], samples: LocationSample[], flagTime: number) {
  const spot = carLocation(samples, flagTime)
  if (!spot) return null
  const matches = winnerPath.slice(1).map((after, index) => {
    const before = winnerPath[index]
    const dx = after[1] - before[1]
    const dy = after[2] - before[2]
    const length = dx * dx + dy * dy
    const fraction = length ? Math.max(0, Math.min(1, ((spot.x - before[1]) * dx + (spot.y - before[2]) * dy) / length)) : 0
    return {
      distance: Math.hypot(spot.x - before[1] - dx * fraction, spot.y - before[2] - dy * fraction),
      time: before[0] + (after[0] - before[0]) * fraction,
    }
  })
  const nearest = matches.reduce<{ distance: number; time: number } | null>((best, match) => !best || match.distance < best.distance ? match : best, null)
  return nearest && nearest.distance <= MAX_TRACK_MATCH_DISTANCE ? flagTime - nearest.time : null
}

export function raceResults(replay: Replay): RaceResult[] {
  const flagTime = replay.duration
  const positions = positionsAt(replay.positions, flagTime)
  const grid = new Map(replay.startingGrid)
  const laps = lastLaps(replay.laps)
  const drivers = [...replay.drivers].sort((first, second) =>
    (positions.get(first.number) ?? Infinity) - (positions.get(second.number) ?? Infinity) || first.number - second.number)
  const winner = drivers[0]
  if (!winner) return []
  const winnerLaps = laps.get(winner.number) ?? []
  const [winnerLapStart, , winnerLap] = winnerLaps.at(-1) ?? [0, 0, 0]
  const winnerLapDuration = winnerLaps.length > 1 ? winnerLapStart - winnerLaps[0][0] : Infinity
  const winnerPath = (replay.locations[String(winner.number)] ?? []).filter(([time]) => time >= winnerLapStart)

  let previousGap: number | null = null
  return drivers.map((driver, index) => {
    const [lapStart, , lap] = laps.get(driver.number)?.at(-1) ?? [-Infinity, 0, 0]
    const isRunning = flagTime - lapStart <= RUNNING_LAP_FACTOR * winnerLapDuration
    const lapsDown = Math.max(0, winnerLap - lap)
    const status: ResultStatus = !isRunning ? 'retired' : lapsDown ? 'lapped' : 'finished'
    const measuredGap = index === 0 ? 0 : gapAtFlag(winnerPath, replay.locations[String(driver.number)] ?? [], flagTime) ?? lapStart - winnerLapStart
    // The classification is the finishing order, so a car can't be closer to the winner than the car ahead.
    const gap = status === 'finished' ? Math.max(measuredGap, previousGap ?? 0) : null
    const interval = gap !== null && previousGap !== null ? gap - previousGap : null
    if (gap !== null) previousGap = gap
    return {
      driver,
      position: index + 1,
      grid: grid.get(driver.number) ?? null,
      laps: status === 'retired' ? Math.max(0, lap - 1) : lap,
      status,
      lapsDown,
      gap,
      interval,
    }
  })
}

const SECONDS_PER_MINUTE = 60

export function formatGap(seconds: number) {
  const tenths = Math.round(seconds * 10)
  const minutes = Math.floor(tenths / (SECONDS_PER_MINUTE * 10))
  const rest = (tenths % (SECONDS_PER_MINUTE * 10) / 10).toFixed(1)
  return minutes ? `+${minutes}:${rest.padStart(4, '0')}` : `+${rest}s`
}

export function gapLabel(result: RaceResult) {
  if (result.status === 'retired') return 'Retired'
  if (result.status === 'lapped') return `+${result.lapsDown} ${result.lapsDown === 1 ? 'lap' : 'laps'}`
  return result.position === 1 ? 'Winner' : formatGap(result.gap ?? 0)
}
