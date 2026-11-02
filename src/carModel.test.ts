import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCarKit } from './carModel'
import type { Driver } from './replay'

describe.each([false, true])('car models (detailed: %s)', (isDetailed) => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) })
  })

  afterEach(() => vi.unstubAllGlobals())

  it.each([null, undefined])('uses the fallback livery when the team is %s in replay JSON', (team) => {
    const driver = { number: 50, name: 'Ryo Hirakawa', code: 'HIR', team, color: '#909090' } as unknown as Driver
    const kit = createCarKit(isDetailed)
    const car = kit.createCar(driver)
    const fallback = kit.createCar({ ...driver, team: 'Unknown team' })
    const body = car.group.children.find((part): part is THREE.Mesh => part instanceof THREE.Mesh && part.material === car.paint)
    const fallbackBody = fallback.group.children.find((part): part is THREE.Mesh => part instanceof THREE.Mesh && part.material === fallback.paint)

    expect(body).toBeInstanceOf(THREE.Mesh)
    expect(body?.geometry.getAttribute('position').count).toBeGreaterThan(0)
    expect(body?.geometry.getAttribute('color').array).toEqual(fallbackBody?.geometry.getAttribute('color').array)
  })
})
