import { describe, expect, it } from 'vitest'
import { PRE_START_STATUS, raceStatusDisplay, temperatureLabel } from './raceHud'

describe('raceStatusDisplay', () => {
  it('shows the starting grid until the replay has started', () => {
    expect(raceStatusDisplay('Racing', false)).toEqual({ label: PRE_START_STATUS, tone: 'neutral', detail: null })
  })

  it('colours the running race by its flag', () => {
    expect(raceStatusDisplay('Racing', true)).toEqual({ label: 'Racing', tone: 'green', detail: null })
    expect(raceStatusDisplay('Virtual safety car', true).tone).toBe('yellow')
    expect(raceStatusDisplay('Finished', true).tone).toBe('chequered')
  })

  it('explains a suspended race and the start procedure under the status', () => {
    expect(raceStatusDisplay('Red flag', true)).toEqual({ label: 'Red flag', tone: 'red', detail: 'Cars held in the pit lane' })
    expect(raceStatusDisplay('Formation lap', true)).toEqual({ label: 'Formation lap', tone: 'neutral', detail: 'The field is preparing for the start' })
  })
})

it('rounds temperatures to whole degrees', () => {
  expect(temperatureLabel(31.8)).toBe('32°')
  expect(temperatureLabel(-0.4)).toBe('0°')
})
