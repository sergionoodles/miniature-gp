// Colour roles for the track status, so each flag reads the same in every part of the HUD.
export type RaceTone = 'green' | 'yellow' | 'red' | 'chequered' | 'neutral'

export type RaceStatusDisplay = { label: string; tone: RaceTone; detail: string | null }

const STATUS_TONES: Record<string, RaceTone> = {
  Racing: 'green',
  'Safety car': 'yellow',
  'Virtual safety car': 'yellow',
  'Delayed start': 'yellow',
  'Start suspended': 'yellow',
  'Red flag': 'red',
  Finished: 'chequered',
}

const STATUS_DETAILS: Record<string, string> = {
  'Delayed start': 'Waiting for race control',
  'Formation lap': 'The field is preparing for the start',
  'Start suspended': 'The start procedure has been suspended',
  'Waiting for start': 'Preparing for lights out',
  'Red flag': 'Cars held in the pit lane',
}

export const PRE_START_STATUS = 'Starting grid'

// Before lights out the replay sits on the grid, whatever race control last reported.
export function raceStatusDisplay(status: string, hasStarted: boolean): RaceStatusDisplay {
  if (!hasStarted) return { label: PRE_START_STATUS, tone: 'neutral', detail: null }

  return { label: status, tone: STATUS_TONES[status] ?? 'neutral', detail: STATUS_DETAILS[status] ?? null }
}

export function temperatureLabel(celsius: number) {
  // Adding zero turns a rounded -0 into 0, so a cold reading never shows "-0°".
  return `${Math.round(celsius) + 0}°`
}
