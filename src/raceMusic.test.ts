import { describe, expect, it } from 'vitest'
import { isCautionStatus, layerLevel, LOOP_STEPS, musicMoodFor, notesAtStep, STEPS_PER_BAR, type MusicLayer } from './raceMusic'

// A harmonic minor: A B C D E F G#, plus the natural G of the G major chord.
const KEY_PITCH_CLASSES = new Set([9, 11, 0, 2, 4, 5, 7, 8])
const PITCHED_LAYERS: MusicLayer[] = ['pad', 'bell', 'arp', 'bass', 'lead']
const allSteps = Array.from({ length: LOOP_STEPS }, (_, step) => step)

describe('race theme score', () => {
  it('loops seamlessly', () => {
    for (const step of [0, 17, LOOP_STEPS - 1]) expect(notesAtStep(step + LOOP_STEPS)).toEqual(notesAtStep(step))
  })

  it('keeps every pitched note in key', () => {
    const outOfKey = allSteps.flatMap(notesAtStep)
      .filter((note) => PITCHED_LAYERS.includes(note.layer) && !KEY_PITCH_CLASSES.has(note.midi % 12))
    expect(outOfKey).toEqual([])
  })

  it('drives the beat with a kick on every beat of every bar', () => {
    const kickSteps = allSteps.filter((step) => notesAtStep(step).some((note) => note.layer === 'kick'))
    expect(kickSteps).toHaveLength(LOOP_STEPS / 4)
  })

  it('saves the lead melody for the choruses', () => {
    const leadBars = new Set(allSteps
      .filter((step) => notesAtStep(step).some((note) => note.layer === 'lead'))
      .map((step) => Math.floor(step / STEPS_PER_BAR)))
    expect([...leadBars].sort((first, second) => first - second)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 24, 25, 26, 27, 28, 29, 30, 31])
  })
})

describe('music mood', () => {
  it('quiets down for the start lights and builds up once racing', () => {
    expect(musicMoodFor({ isCountingDown: true, isPlaying: false, status: 'Waiting for start' })).toBe('countdown')
    expect(musicMoodFor({ isCountingDown: false, isPlaying: true, status: 'Racing' })).toBe('racing')
    expect(layerLevel('countdown', 'kick')).toBe(0)
    expect(layerLevel('racing', 'kick')).toBeGreaterThan(0)
  })

  it('launches straight into the racing theme while the replay still reads waiting for start', () => {
    expect(musicMoodFor({ isCountingDown: false, isPlaying: true, status: 'Waiting for start' })).toBe('racing')
  })

  it('drops the drums behind a safety car or red flag', () => {
    for (const status of ['Safety car', 'Virtual safety car', 'Red flag', 'Formation lap']) {
      const mood = musicMoodFor({ isCountingDown: false, isPlaying: true, status })
      expect(mood).toBe('neutralized')
      expect(layerLevel(mood, 'kick')).toBe(0)
    }
  })

  it('settles on the grid theme while paused, whatever the race status', () => {
    expect(musicMoodFor({ isCountingDown: false, isPlaying: false, status: 'Racing' })).toBe('grid')
    expect(musicMoodFor({ isCountingDown: false, isPlaying: false, status: 'Safety car' })).toBe('grid')
  })

  it('treats safety cars and red flags as cautions, but not racing or the finish', () => {
    expect(['Safety car', 'Virtual safety car', 'Red flag'].every(isCautionStatus)).toBe(true)
    expect(['Racing', 'Finished', 'Waiting for start'].some(isCautionStatus)).toBe(false)
  })
})
