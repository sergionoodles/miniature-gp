import { carLocation, latestAt, raceStatus, type LocationSample, type Replay } from './replay'

export type StoppedInterval = [start: number, end: number, x: number, y: number]
const STOP_SECONDS = 20
const LOCATION_TOLERANCE = 25
const MAX_SAMPLE_GAP = 5
const PIT_MARGIN = 12
const UNKNOWN_PIT_DURATION = 120

function isFieldMoving(replay: Replay, time: number) {
  const movement = Object.values(replay.locations).flatMap((samples) => {
    const current = carLocation(samples, time)
    const previous = carLocation(samples, time - MAX_SAMPLE_GAP)
    if (!current || !previous) return []
    return [Math.hypot(current.x - previous.x, current.y - previous.y) > LOCATION_TOLERANCE * 2]
  })
  const moving = movement.filter(Boolean).length
  return moving >= 2 && moving > movement.length / 2
}

function isStopCandidate(replay: Replay, driver: number, start: number, time: number) {
  const statuses = [raceStatus(replay.raceControl, start), raceStatus(replay.raceControl, time)]
  if (statuses.some((status) => status === 'Red flag' || status === 'Finished')) return false
  const isPitStop = replay.pits.some(([exit, number, , duration]) =>
    number === driver && start <= exit + PIT_MARGIN && time >= exit - (duration ?? UNKNOWN_PIT_DURATION) - PIT_MARGIN)
  return !isPitStop && isFieldMoving(replay, time)
}

function detectDriverStops(replay: Replay, driver: number, samples: LocationSample[]) {
  const stops: StoppedInterval[] = []
  let anchor = samples[0]
  let hasMoved = false
  let hasChecked = false
  let activeStop: StoppedInterval | null = null
  for (let index = 1; index < samples.length; index++) {
    const sample = samples[index]
    const hasGap = sample[0] - samples[index - 1][0] > MAX_SAMPLE_GAP
    const hasDisplaced = Math.hypot(sample[1] - anchor[1], sample[2] - anchor[2]) > LOCATION_TOLERANCE
    if (hasDisplaced || (hasGap && !activeStop)) {
      if (activeStop) activeStop[1] = sample[0]
      hasMoved ||= hasDisplaced && !hasGap
      anchor = sample
      activeStop = null
      hasChecked = false
      continue
    }
    if (hasChecked || !hasMoved || sample[0] - anchor[0] < STOP_SECONDS) continue
    hasChecked = true
    if (!isStopCandidate(replay, driver, anchor[0], sample[0])) continue
    activeStop = [sample[0], replay.duration + 1, anchor[1], anchor[2]]
    stops.push(activeStop)
  }
  return stops
}

// Inferred stops, not confirmed incidents. Precomputation keeps scrubbing deterministic.
export function detectStoppedCars(replay: Replay) {
  return new Map(Object.entries(replay.locations).map(([number, samples]) =>
    [Number(number), detectDriverStops(replay, Number(number), samples)] as const))
}

export function stoppedAt(stops: StoppedInterval[], time: number) {
  const stop = latestAt(stops, time)
  return stop && time < stop[1] ? stop : null
}
