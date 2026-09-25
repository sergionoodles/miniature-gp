import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createProjection, createUnprojection } from './circuitGeometry'
import { distanceToTrack, findPitLane, moveCarsOntoPitLane, PIT_LANE_OFFSET, pitPasses } from './pitLane'
import type { LocationSample, PitEvent, Replay } from './replay'

// A round circuit, radius 6000 in telemetry units (90 in the scene), driven anticlockwise. Its pit
// lane runs 100 units (1.5 in the scene) inside the track for a quarter of the lap.
const RADIUS = 6000
const LANE_INSET = 100
const LANE_START = 0.2
const LANE_END = LANE_START + Math.PI / 2
const RAMP = 0.15
const outline: [number, number][] = Array.from({ length: 180 }, (_, index) => {
  const angle = index / 180 * Math.PI * 2
  return [Math.cos(angle) * RADIUS, Math.sin(angle) * RADIUS]
})
const project = createProjection(outline)
const track = new THREE.CatmullRomCurve3(outline.map(([x, y]) => project(x, y)), true, 'centripetal').getSpacedPoints(900).slice(0, -1)

function laneInset(angle: number) {
  return LANE_INSET * Math.min(1, THREE.MathUtils.smoothstep(angle, LANE_START, LANE_START + RAMP), 1 - THREE.MathUtils.smoothstep(angle, LANE_END - RAMP, LANE_END))
}

// One car's lap around a pit stop, one sample a second; phase staggers where samples fall.
function pitStopLap(phase: number, start: number): { samples: LocationSample[]; exit: number } {
  const samples: LocationSample[] = []
  let angle = LANE_START - 0.6 + phase * 0.02
  let time = start
  let exit = start
  while (angle < LANE_END + 0.6) {
    const radius = RADIUS - laneInset(angle)
    samples.push([time, Math.cos(angle) * radius, Math.sin(angle) * radius])
    if (angle < LANE_END) exit = time
    angle += angle > LANE_START && angle < LANE_END ? 0.04 : 0.12
    time += 1
  }
  return { samples, exit }
}

function racingLap(start: number): LocationSample[] {
  return Array.from({ length: 60 }, (_, index) => {
    const angle = index * 0.12
    return [start + index, Math.cos(angle) * (RADIUS - 5), Math.sin(angle) * (RADIUS - 5)]
  })
}

function fixture(stops: number): Replay {
  const locations: Record<string, LocationSample[]> = { '99': racingLap(0) }
  const pits: PitEvent[] = []
  for (let driver = 1; driver <= stops; driver++) {
    const { samples, exit } = pitStopLap(driver, driver * 200)
    locations[String(driver)] = samples
    const entry = samples.find(([, x, y]) => Math.hypot(x, y) < RADIUS - 1)?.[0] ?? exit
    pits.push([exit, driver, 10, exit - entry])
  }
  return { duration: 2000, sessionKey: 1, start: '', drivers: [], track: outline, locations, positions: [], startingGrid: [], startingGridSource: 'position', overtakes: [], laps: [], pits, weather: [], raceControl: [], stints: [] }
}

describe('pit lane', () => {
  it('traces the lane pitting cars drive and moves it clear of the drawn track', () => {
    const lane = findPitLane(track, pitPasses(fixture(6), project))
    expect(lane).not.toBeNull()
    if (!lane) return
    const middle = Math.floor(lane.path.length / 2)
    expect(distanceToTrack(track, lane.centerline[middle])).toBeCloseTo(LANE_INSET * 0.015, 1)
    expect(distanceToTrack(track, lane.path[middle])).toBeCloseTo(PIT_LANE_OFFSET, 1)
    // Telemetry only leaves the racing line inside the lane; both ends still reach the track's
    // centreline, so the entry and exit branch off it with nothing left beside the track.
    for (const end of [lane.path[0], lane.path[lane.path.length - 1]]) expect(distanceToTrack(track, end)).toBeLessThan(0.01)
  })

  it('moves pitting cars onto the drawn lane and leaves racing cars alone', () => {
    const replay = fixture(6)
    const lane = findPitLane(track, pitPasses(replay, project))
    if (!lane) throw new Error('Expected a pit lane')
    const locations = moveCarsOntoPitLane(replay, lane, track, project, createUnprojection(outline))
    const inLane = locations['3'].filter(([, x, y]) => distanceToTrack(track, project(x, y)) > 1)
    expect(inLane.length).toBeGreaterThan(20)
    for (const [, x, y] of inLane) expect(distanceToTrack(lane.path, project(x, y))).toBeLessThan(0.3)
    // Before the lane and after it the car keeps its recorded line.
    expect(locations['3'][0]).toEqual(replay.locations['3'][0])
    expect(locations['3'].at(-1)).toEqual(replay.locations['3'].at(-1))
    expect(locations['99']).toEqual(replay.locations['99'])
  })

  it('needs several stops to agree before drawing a lane', () => {
    expect(findPitLane(track, pitPasses(fixture(2), project))).toBeNull()
  })

  it('ignores telemetry that jumps around away from the track', () => {
    const replay = fixture(6)
    // Some feeds lose the car in the pit lane and report positions scattered across the map.
    for (const [, driver] of replay.pits) {
      replay.locations[String(driver)] = replay.locations[String(driver)].map(([time, x, y], index) => Math.hypot(x, y) < RADIUS - 1 ? [time, 9000, index % 2 ? 9000 : -9000] : [time, x, y])
    }
    expect(findPitLane(track, pitPasses(replay, project))).toBeNull()
  })
})
