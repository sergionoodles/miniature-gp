import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { offsetClearance, runsWhere } from './trackside'

it('groups consecutive samples into runs and drops runs that are too short', () => {
  const flags = [false, true, true, true, false, true, false, false]
  expect(runsWhere(flags.length, (index) => flags[index], 2)).toEqual([[1, 2, 3]])
})

it('joins a run that crosses the start of the lap into one piece', () => {
  const flags = [true, true, false, false, false, true, true]
  expect(runsWhere(flags.length, (index) => flags[index], 1)).toEqual([[5, 6, 0, 1]])
})

it('returns a single run for a fully qualifying lap', () => {
  expect(runsWhere(4, () => true, 1)).toEqual([[0, 1, 2, 3]])
})

// A lap with a hairpin of radius 3 at each end: tighter than the barrier's 5.4 offset.
function hairpinLap() {
  const points: Vector3[] = []
  for (let x = -20; x < 20; x += 0.5) points.push(new Vector3(x, 0, -3))
  for (let step = 0; step < 20; step++) {
    const angle = -Math.PI / 2 + step / 20 * Math.PI
    points.push(new Vector3(20 + Math.cos(angle) * 3, 0, Math.sin(angle) * 3))
  }
  for (let x = 20; x > -20; x -= 0.5) points.push(new Vector3(x, 0, 3))
  for (let step = 0; step < 20; step++) {
    const angle = Math.PI / 2 + step / 20 * Math.PI
    points.push(new Vector3(-20 + Math.cos(angle) * 3, 0, Math.sin(angle) * 3))
  }
  return points
}

it('drops offset strip samples that would fold back inside a bend tighter than the offset', () => {
  const track = hairpinLap()
  const apex = 80 + 10
  const [left, right] = [-1, 1].map((side) => offsetClearance(track, side, 5.4))
  // Only the outside of the hairpin keeps its barrier.
  expect([left[apex], right[apex]].filter(Boolean)).toHaveLength(1)
})

it('keeps offset strips on gentle curves and straights', () => {
  const circle = Array.from({ length: 200 }, (_, index) => new Vector3(Math.cos(index / 200 * Math.PI * 2) * 40, 0, Math.sin(index / 200 * Math.PI * 2) * 40))
  for (const side of [-1, 1]) expect(offsetClearance(circle, side, 5.4).every(Boolean)).toBe(true)
})

// Two long straights 10 apart joined by tight ends: barriers 5.4 out on the infield side of
// each straight would cross over each other.
function paperclipLap() {
  const points: Vector3[] = []
  for (let x = -30; x < 30; x += 0.5) points.push(new Vector3(x, 0, -5))
  for (let step = 0; step < 16; step++) points.push(new Vector3(30 + Math.sin(step / 16 * Math.PI) * 5, 0, -Math.cos(step / 16 * Math.PI) * 5))
  for (let x = 30; x > -30; x -= 0.5) points.push(new Vector3(x, 0, 5))
  for (let step = 0; step < 16; step++) points.push(new Vector3(-30 - Math.sin(step / 16 * Math.PI) * 5, 0, Math.cos(step / 16 * Math.PI) * 5))
  return points
}

it('keeps barriers off the infield between two passes too close for both to fit', () => {
  const track = paperclipLap()
  const middleOfFirstStraight = 60
  const [left, right] = [-1, 1].map((side) => offsetClearance(track, side, 5.4))
  expect([left[middleOfFirstStraight], right[middleOfFirstStraight]].filter(Boolean)).toHaveLength(1)
})
