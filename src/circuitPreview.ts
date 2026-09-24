import { ALBERT_PARK_TRACK } from './albertPark'
import type { Replay } from './replay'

// Empty session data keeps a reference-based model separate from recorded races.
export const ALBERT_PARK_PREVIEW: Replay = {
  sessionKey: 0, start: '', duration: 0,
  track: ALBERT_PARK_TRACK,
  drivers: [], locations: {}, positions: [], startingGrid: [],
  startingGridSource: 'position', overtakes: [], laps: [], pits: [],
  weather: [], raceControl: [], stints: [],
}
