export type LocationSample = [time: number, x: number, y: number]
export type PositionEvent = [time: number, driver: number, position: number]
export type GridEntry = [driver: number, position: number]
export type OvertakeEvent = [time: number, overtakingDriver: number, overtakenDriver: number, position: number]
export type LapEvent = [time: number, driver: number, lap: number]
export type PitEvent = [time: number, driver: number, lap: number, duration: number | null]
export type WeatherEvent = [time: number, rainfall: number, air: number, track: number]
export type RaceEvent = [time: number, category: string, flag: string | null, message: string]
export type RaceLaunch = { time: number; drivers: number[]; source: 'car_data' }
export const START_PHASE_STATUSES = ['Delayed start', 'Formation lap', 'Start suspended', 'Waiting for start']
export type ReplayNotification = { id: string; time: number; title: string; detail: string; drivers?: [{ name: string; color: string }, { name: string; color: string }] }
export const OVERTAKE_NOTIFICATION_CUTOFF = 50
export type Stint = [driver: number, firstLap: number | null, lastLap: number | null, compound: string | null]

export type Driver = {
  number: number
  name: string
  code: string
  team: string
  color: string
}

export type Replay = {
  sessionKey: number
  start: string
  gmt_offset?: string
  duration: number
  drivers: Driver[]
  track: [number, number][]
  locations: Record<string, LocationSample[]>
  positions: PositionEvent[]
  startingGrid: GridEntry[]
  startingGridSource: 'starting_grid' | 'position'
  overtakes: OvertakeEvent[]
  laps: LapEvent[]
  pits: PitEvent[]
  weather: WeatherEvent[]
  raceControl: RaceEvent[]
  raceLaunches?: RaceLaunch[]
  stints: Stint[]
}

export function isReplay(value: unknown): value is Replay {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.duration === 'number'
    && typeof record.start === 'string'
    && (record.gmt_offset === undefined || typeof record.gmt_offset === 'string')
    && Array.isArray(record.drivers)
    && Array.isArray(record.track)
    && typeof record.locations === 'object'
    && record.locations !== null
    && Array.isArray(record.positions)
    && Array.isArray(record.startingGrid)
    && (record.startingGridSource === 'starting_grid' || record.startingGridSource === 'position')
    && Array.isArray(record.overtakes)
    && Array.isArray(record.laps)
    && Array.isArray(record.pits)
    && Array.isArray(record.weather)
    && Array.isArray(record.raceControl)
}

export function latestAt<T extends [number, ...unknown[]]>(events: T[], time: number): T | null {
  let low = 0
  let high = events.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (events[middle][0] <= time) low = middle + 1
    else high = middle
  }
  return low ? events[low - 1] : null
}

// Telemetry units are about a decimetre. A standing car repeats its fix, which has no direction,
// so its heading comes from the nearest movement before (or, on the grid, after) the stop.
const MIN_HEADING_DISTANCE = 5

function headingBetween(from: LocationSample, to: LocationSample) {
  return Math.atan2(to[1] - from[1], to[2] - from[2])
}

function isMovementBetween(from: LocationSample, to: LocationSample) {
  return Math.hypot(to[1] - from[1], to[2] - from[2]) >= MIN_HEADING_DISTANCE
}

function travelHeading(samples: LocationSample[], beforeIndex: number, afterIndex: number) {
  const before = samples[beforeIndex]
  const after = samples[afterIndex]
  if (isMovementBetween(before, after)) return headingBetween(before, after)
  for (let index = beforeIndex - 1; index >= 0; index--) {
    if (isMovementBetween(samples[index], before)) return headingBetween(samples[index], before)
  }
  for (let index = afterIndex + 1; index < samples.length; index++) {
    if (isMovementBetween(after, samples[index])) return headingBetween(after, samples[index])
  }
  return headingBetween(before, after)
}

export function carLocation(samples: LocationSample[], time: number, holdFirstSample = false): { x: number; y: number; heading: number } | null {
  if (!samples.length || (time < samples[0][0] && !holdFirstSample) || time > samples[samples.length - 1][0] + 3) return null
  const sampleTime = Math.max(time, samples[0][0])
  let low = 0
  let high = samples.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (samples[middle][0] <= sampleTime) low = middle + 1
    else high = middle
  }
  const beforeIndex = Math.max(0, low - 1)
  const afterIndex = Math.min(samples.length - 1, low)
  const before = samples[beforeIndex]
  const after = samples[afterIndex]
  if (after[0] - before[0] > 5) return null
  const fraction = before === after ? 0 : Math.max(0, Math.min(1, (sampleTime - before[0]) / (after[0] - before[0])))
  return {
    x: before[1] + (after[1] - before[1]) * fraction,
    y: before[2] + (after[2] - before[2]) * fraction,
    heading: travelHeading(samples, beforeIndex, afterIndex),
  }
}

export function positionsAt(events: PositionEvent[], time: number): Map<number, number> {
  const positions = new Map<number, number>()
  for (const [eventTime, driver, position] of events) {
    if (eventTime > time) break
    positions.set(driver, position)
  }
  return positions
}

export function racePositionsAt(replay: Pick<Replay, 'raceControl' | 'startingGrid' | 'positions'>, time: number): Map<number, number> {
  const launch = replay.raceControl.find(([, category, , message]) => category === 'StartPhase' && message === 'Racing')
  if (!launch) return positionsAt(replay.positions, time)

  const positions = new Map(replay.startingGrid)
  for (const [eventTime, driver, position] of replay.positions) {
    if (eventTime > time) break
    // Timing checkpoints can put pit-lane runners ahead of cars still held on the grid.
    if (eventTime < launch[0]) continue
    positions.set(driver, position)
  }
  return positions
}

export function lapsAt(events: LapEvent[], time: number): Map<number, number> {
  const laps = new Map<number, number>()
  for (const [eventTime, driver, lap] of events) {
    if (eventTime > time) break
    laps.set(driver, lap)
  }
  return laps
}

export function lappedDriversAt(events: LapEvent[], time: number): Set<number> {
  const laps = lapsAt(events, time)
  const leaderLap = Math.max(0, ...laps.values())
  return new Set([...laps].filter(([, lap]) => leaderLap - lap >= 1).map(([driver]) => driver))
}

export function raceStatus(events: RaceEvent[], time: number): string {
  let status = 'Racing'
  let hasStartPhases = false
  let hasPendingStart = false
  let hasRaced = false
  for (const [eventTime, category, , message] of events) {
    if (eventTime > time) break
    if (category === 'StartPhase') {
      hasStartPhases = true
      hasPendingStart = message !== 'Racing'
      status = message === 'Start suspended' && hasRaced ? 'Red flag' : message
      hasRaced ||= message === 'Racing'
    }
    if (category === 'SessionStatus') {
      if (message === 'SESSION ABORTED') status = 'Red flag'
      if (message === 'SESSION STARTED' && !hasStartPhases) status = 'Racing'
      if (message === 'SESSION FINISHED') status = 'Finished'
    }
    if (category === 'SafetyCar' && !hasPendingStart) {
      if (message === 'SAFETY CAR DEPLOYED') status = 'Safety car'
      if (message === 'VSC DEPLOYED') status = 'Virtual safety car'
      if (message === 'VSC ENDING' || message === 'SAFETY CAR IN THIS LAP') status = 'Racing'
    }
  }
  return status
}

export function notificationsBetween(replay: Replay, from: number, to: number, speed = 10): ReplayNotification[] {
  const notifications: ReplayNotification[] = []
  const startPhases = replay.raceControl.filter(([, category]) => category === 'StartPhase')
  const hasStartPhases = startPhases.length > 0
  const drivers = new Map(replay.drivers.map((driver) => [driver.number, driver]))
  if (speed < OVERTAKE_NOTIFICATION_CUTOFF) replay.overtakes.forEach(([time, overtaking, overtaken, position], index) => {
    if (time <= from || time > to) return
    const phase = startPhases.reduce<string | null>((current, [phaseTime, , , message]) => phaseTime <= time ? message : current, null)
    if (hasStartPhases && phase !== 'Racing') return
    const overtakingDriver = drivers.get(overtaking)
    const overtakenDriver = drivers.get(overtaken)
    notifications.push({
      id: `overtake-${index}`, time, title: 'Position gained', detail: `Overtake · P${position}`,
      drivers: [
        { name: overtakingDriver?.code ?? `#${overtaking}`, color: overtakingDriver?.color ?? '#fff' },
        { name: overtakenDriver?.code ?? `#${overtaken}`, color: overtakenDriver?.color ?? '#fff' },
      ],
    })
  })
  replay.pits.forEach(([time, driver, lap], index) => {
    if (time > from && time <= to) notifications.push({ id: `pit-${index}`, time, title: `${drivers.get(driver)?.code ?? `#${driver}`} · Pit stop`, detail: `Lap ${lap}` })
  })
  replay.raceControl.forEach(([time, category, flag, message], index) => {
    if (time <= from || time > to) return
    const phaseTitle = message === 'Racing' ? 'Racing begins' : message
    const title = category === 'StartPhase' ? phaseTitle
      : category === 'Flag' && flag ? `${flag[0]}${flag.slice(1).toLowerCase()} flag`
      : message === 'SESSION ABORTED' ? 'Race suspended'
      : message === 'SESSION STARTED' && time > 0 && !hasStartPhases ? 'Race resumed'
      : category === 'SafetyCar' ? message.toLowerCase().replace(/^./, (letter) => letter.toUpperCase()).replace(/\bVsc\b/i, 'Virtual Safety Car')
      : null
    if (title) notifications.push({ id: `control-${index}`, time, title, detail: category === 'Flag' ? message : '' })
  })
  replay.weather.forEach(([time, rainfall, air, track], index) => {
    const previous = replay.weather[index - 1]
    if (!previous || time <= from || time > to) return
    const hasRainChanged = Boolean(rainfall) !== Boolean(previous[1])
    if (!hasRainChanged && Math.abs(air - previous[2]) < 1.5 && Math.abs(track - previous[3]) < 1.5) return
    notifications.push({ id: `weather-${index}`, time, title: hasRainChanged ? rainfall ? 'Rain started' : 'Track drying' : 'Temperature changed', detail: `Air ${air.toFixed(1)}° · Track ${track.toFixed(1)}°` })
  })
  return notifications.sort((first, second) => first.time - second.time)
}

export function clockLabel(seconds: number): string {
  const whole = Math.floor(seconds)
  return `${String(Math.floor(whole / 3600)).padStart(2, '0')}:${String(Math.floor(whole % 3600 / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}
