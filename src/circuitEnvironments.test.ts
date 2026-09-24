import { describe, expect, it } from 'vitest'
import { DEFAULT_ENVIRONMENT, resolveCircuitEnvironment } from './circuitEnvironments'

describe('circuit environment lookup', () => {
  it.each([
    ['Melbourne', 'albert-park'], ['Albert Park Grand Prix Circuit', 'albert-park'], ['Sakhir', 'bahrain'], ['Bahrain International Circuit', 'bahrain'],
    ['Jeddah Corniche Circuit', 'jeddah'], ['Circuit de Monaco', 'monaco'], ['Monte Carlo', 'monaco'], ['Catalunya', 'catalunya'],
    ['Circuit de Barcelona-Catalunya', 'catalunya'], ['Circuit Gilles Villeneuve', 'gilles-villeneuve'], ['Montreal', 'gilles-villeneuve'],
    ['Spielberg', 'red-bull-ring'], ['Circuit de Spa-Francorchamps', 'spa'], ['Spa-Francorchamps', 'spa'], ['Circuit Park Zandvoort', 'zandvoort'],
    ['Autodromo Enzo e Dino Ferrari', 'imola'], ['Autódromo Hermanos Rodríguez', 'hermanos-rodriguez'], ['Autódromo José Carlos Pace', 'interlagos'],
    ['Madring', 'madring'], ['Yas Marina Circuit', 'yas-marina'], ['Losail International Circuit', 'lusail'],
  ])('resolves %s', (name, id) => {
    expect(resolveCircuitEnvironment(name).id).toBe(id)
  })

  it('falls back to the default scenery for circuits without reference data', () => {
    expect(resolveCircuitEnvironment('Kyalami')).toBe(DEFAULT_ENVIRONMENT)
    expect(resolveCircuitEnvironment('')).toBe(DEFAULT_ENVIRONMENT)
  })

  it('does not match aliases inside other words', () => {
    expect(resolveCircuitEnvironment('Spain Street Circuit')).toBe(DEFAULT_ENVIRONMENT)
  })
})
