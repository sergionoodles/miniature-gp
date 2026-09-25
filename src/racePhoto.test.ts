import { describe, expect, it } from 'vitest'
import { availablePhotoLayers, defaultPhotoLayers, photoFileName, type RacePhotoHud } from './racePhoto'

const hud: RacePhotoHud = {
  slug: 'sao-paulo',
  location: 'São Paulo',
  grandPrix: 'São Paulo Grand Prix',
  countryCode: 'BRA',
  year: '2026',
  dateLabel: '8 Nov 2026',
  lap: 23,
  totalLaps: 71,
  clock: '00:42:13',
  status: 'Green flag',
  weather: { symbol: '☀', label: 'Dry', details: null },
  order: [{ position: 1, code: 'NOR', color: '#ff8000' }],
  focus: null,
  notifications: [],
}

describe('photo layers', () => {
  it('offers only the HUD elements that had something to show', () => {
    expect(availablePhotoLayers(hud).map((layer) => layer.id)).toEqual(['title', 'timing', 'conditions', 'order', 'branding'])
  })

  it('offers the driver card and notifications when they were on screen', () => {
    const busyHud = { ...hud, focus: { name: 'Lando Norris', number: 4, team: 'McLaren', position: 1, lap: 23 }, notifications: [{ title: 'Rain started', detail: 'Air 18.0° · Track 22.0°' }] }
    expect(availablePhotoLayers(busyHud).map((layer) => layer.id)).toContain('focus')
    expect(availablePhotoLayers(busyHud).map((layer) => layer.id)).toContain('notifications')
  })

  it('starts with a clean frame: no running order or notifications', () => {
    const busyHud = { ...hud, notifications: [{ title: 'Rain started', detail: '' }] }
    expect([...defaultPhotoLayers(busyHud)]).toEqual(['title', 'timing', 'conditions', 'branding'])
  })
})

it('names the photo after the circuit, season and lap', () => {
  expect(photoFileName(hud)).toBe('miniature-gp-sao-paulo-2026-lap-23.png')
})
