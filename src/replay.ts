export type LocationSample = [time: number, x: number, y: number]
export type PositionEvent = [time: number, driver: number, position: number]
export type GridEntry = [driver: number, position: number]
export type OvertakeEvent = [time: number, overtakingDriver: number, overtakenDriver: number, position: number]
export type LapEvent = [time: number, driver: number, lap: number]
export type PitEvent = [time: number, driver: number, lap: number, duration: number | null]
export type WeatherEvent = [time: number, rainfall: number, air: number, track: number]
export type RaceEvent = [time: number, category: string, flag: string | null, message: string]
export type ReplayNotification = { id: string; time: number; title: string; detail: string; drivers?: [{ name: string; color: string }, { name: string; color: string }] }
export const OVERTAKE_NOTIFICATION_CUTOFF = 50
export type Stint = [driver: number, firstLap: number, lastLap: number, compound: string]

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
  const before = samples[Math.max(0, low - 1)]
  const after = samples[Math.min(samples.length - 1, low)]
  if (after[0] - before[0] > 5) return null
  const fraction = before === after ? 0 : Math.max(0, Math.min(1, (sampleTime - before[0]) / (after[0] - before[0])))
  return {
    x: before[1] + (after[1] - before[1]) * fraction,
    y: before[2] + (after[2] - before[2]) * fraction,
    heading: Math.atan2(after[1] - before[1], after[2] - before[2]),
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

export function lapsAt(events: LapEvent[], time: number): Map<number, number> {
  const laps = new Map<number, number>()
  for (const [eventTime, driver, lap] of events) {
    if (eventTime > time) break
    laps.set(driver, lap)
  }
  return laps
}

export function raceStatus(events: RaceEvent[], time: number): string {
  let status = 'Racing'
  for (const [eventTime, category, , message] of events) {
    if (eventTime > time) break
    if (category === 'SessionStatus') {
      if (message === 'SESSION ABORTED') status = 'Red flag'
      if (message === 'SESSION STARTED') status = 'Racing'
      if (message === 'SESSION FINISHED') status = 'Finished'
    }
    if (category === 'SafetyCar') {
      if (message === 'SAFETY CAR DEPLOYED') status = 'Safety car'
      if (message === 'VSC DEPLOYED') status = 'Virtual safety car'
      if (message === 'VSC ENDING' || message === 'SAFETY CAR IN THIS LAP') status = 'Racing'
    }
  }
  return status
}

export function notificationsBetween(replay: Replay, from: number, to: number, speed = 10): ReplayNotification[] {
  const notifications: ReplayNotification[] = []
  const drivers = new Map(replay.drivers.map((driver) => [driver.number, driver]))
  if (speed < OVERTAKE_NOTIFICATION_CUTOFF) replay.overtakes.forEach(([time, overtaking, overtaken, position], index) => {
    if (time <= from || time > to) return
    const overtakingDriver = drivers.get(overtaking)
    const overtakenDriver = drivers.get(overtaken)
    notifications.push({
      id: `overtake-${index}`, time, title: 'Position gained', detail: `Overtake · P${position}`,
      drivers: [
        { name: overtakingDriver?.name ?? `#${overtaking}`, color: overtakingDriver?.color ?? '#fff' },
        { name: overtakenDriver?.name ?? `#${overtaken}`, color: overtakenDriver?.color ?? '#fff' },
      ],
    })
  })
  replay.pits.forEach(([time, driver, lap], index) => {
    if (time > from && time <= to) notifications.push({ id: `pit-${index}`, time, title: 'Pit stop', detail: `${drivers.get(driver)?.code ?? `#${driver}`} · Lap ${lap}` })
  })
  replay.raceControl.forEach(([time, category, flag, message], index) => {
    if (time <= from || time > to) return
    const title = category === 'Flag' && flag ? `${flag[0]}${flag.slice(1).toLowerCase()} flag`
      : message === 'SESSION ABORTED' ? 'Race suspended'
      : message === 'SESSION STARTED' && time > 0 ? 'Race resumed'
      : category === 'SafetyCar' ? message === 'VSC ENDING' ? 'Virtual safety car ending' : message.toLowerCase().replace(/^./, (letter) => letter.toUpperCase())
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
