import { expect, it } from 'vitest'
import { activeHoverDriver } from './driverVisuals'

it('keeps the circuit unisolated before and during the race start countdown', () => {
  expect(activeHoverDriver(10, true)).toBeNull()
  expect(activeHoverDriver(10, false)).toBe(10)
  expect(activeHoverDriver(null, false)).toBeNull()
})
