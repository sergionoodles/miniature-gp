import { ALBERT_PARK_TRACK } from './albertPark'
import { BAHRAIN_TRACK } from './bahrain'
import type { Replay } from './replay'

// Empty session data keeps a reference-based model separate from recorded races.
const createPreviewReplay = (track: [number, number][]): Replay => ({
  sessionKey: 0, start: '', duration: 0,
  track,
  drivers: [], locations: {}, positions: [], startingGrid: [],
  startingGridSource: 'position', overtakes: [], laps: [], pits: [],
  weather: [], raceControl: [], stints: [],
})

export const CIRCUIT_PREVIEWS: Partial<Record<string, { replay: Replay; description: string }>> = {
  'albert-park-preview': {
    replay: createPreviewReplay(ALBERT_PARK_TRACK),
    description: 'Albert Park, Australia.',
  },
  'bahrain-preview': {
    replay: createPreviewReplay(BAHRAIN_TRACK),
    description: 'Bahrain International Circuit, Sakhir.',
  },
}
