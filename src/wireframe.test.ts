import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isRainLightOn } from './circuitWorld'
import { distanceToTrack } from './pitLane'
import { addPitLane } from './pitLaneMeshes'
import type { WeatherState } from './raceWeather'
import { createWireframeCarKit, neonLivery } from './wireframeCars'
import { TRACK_WIDTH } from './trackside'
import { restyleAsWireframe, sceneryLineColor } from './wireframeStyle'

const weather = (overrides: Partial<WeatherState>): WeatherState => ({ rain: 0, wetness: 0, cloudCover: 0, airTemperature: 20, trackTemperature: 30, ...overrides })

describe('wireframe colours', () => {
  it('draws scenery in greys, paler objects with brighter lines', () => {
    const foliage = sceneryLineColor(new THREE.Color(0x3f7d3a))
    const concrete = sceneryLineColor(new THREE.Color(0xc9c8c1))
    for (const line of [foliage, concrete]) {
      expect(line.r).toBe(line.g)
      expect(line.g).toBe(line.b)
    }
    expect(concrete.r).toBeGreaterThan(foliage.r)
  })

  it('brightens dark liveries into neon and keeps pale ones near white', () => {
    const navy = neonLivery('#00205b').getHSL({ h: 0, s: 0, l: 0 })
    expect(navy.l).toBeGreaterThanOrEqual(0.5)
    expect(navy.s).toBeGreaterThanOrEqual(0.9)
    const white = neonLivery('#ffffff').getHSL({ h: 0, s: 0, l: 0 })
    expect(white.s).toBeLessThan(0.2)
    expect(white.l).toBeGreaterThan(0.6)
  })
})

describe('rain lights', () => {
  it('stay off on a dry track and on in light rain', () => {
    expect(isRainLightOn(weather({}), 0, false)).toBe(false)
    expect(isRainLightOn(weather({ wetness: 0.6, rain: 0.4 }), 0.3, false)).toBe(true)
  })

  it('flash in heavy rain unless motion is reduced', () => {
    const storm = weather({ wetness: 1, rain: 0.9 })
    const states = [0.01, 0.05, 0.09, 0.13, 0.17, 0.21].map((seconds) => isRainLightOn(storm, seconds, false))
    expect(states).toContain(true)
    expect(states).toContain(false)
    expect([0.01, 0.17].map((seconds) => isRainLightOn(storm, seconds, true))).toEqual([true, true])
  })
})

describe('wireframe restyle', () => {
  it('outlines solids, hides runoff and decals and lights small crowds as pixels', () => {
    const scene = new THREE.Scene()
    const building = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: 0xc9c8c1 }))
    const verge = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial())
    verge.material.userData.wireframeRole = 'runoff'
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())
    shadow.userData.skipsAmbientOcclusion = true
    const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.34, 0.24), new THREE.MeshStandardMaterial(), 2)
    crowd.setColorAt(0, new THREE.Color(0xff0000))
    crowd.setColorAt(1, new THREE.Color(0x0000ff))
    scene.add(building, verge, shadow, crowd)

    restyleAsWireframe(scene, 100)

    const outline = building.children.find((child) => child instanceof THREE.LineSegments)
    expect(outline).toBeInstanceOf(THREE.LineSegments)
    expect((outline as THREE.LineSegments).geometry.getAttribute('position').count).toBe(24)
    expect(building.material).toBeInstanceOf(THREE.MeshBasicMaterial)
    expect(verge.visible).toBe(false)
    expect(shadow.visible).toBe(false)
    expect(crowd.children).toHaveLength(0)
    expect(crowd.material).toBeInstanceOf(THREE.MeshBasicMaterial)
    const spectator = new THREE.Color()
    crowd.getColorAt(0, spectator)
    expect(spectator.r).toBe(spectator.b)
  })
})

describe('wireframe pit lane', () => {
  // A long loop whose bottom straight carries a pit lane that fans out from it and rejoins it.
  const straight = (fromX: number, toX: number, z: number) => Array.from({ length: Math.abs(toX - fromX) + 1 }, (_, step) => new THREE.Vector3(fromX + Math.sign(toX - fromX) * step, 0, z))
  const track = [...straight(-60, 60, 0), ...straight(60, -60, -40)]
  const fanOut = (x: number) => 3.5 * THREE.MathUtils.smoothstep(Math.min(x + 24, 24 - x), 0, 12)
  const path = Array.from({ length: 97 }, (_, step) => new THREE.Vector3(-24 + step / 2, 0, fanOut(-24 + step / 2)))

  it('keeps the lane outline off the track where the entry and exit join it', () => {
    const scene = new THREE.Scene()
    const asphalt = new THREE.MeshStandardMaterial()
    asphalt.userData.wireframeRole = 'road'
    addPitLane(scene, { centerline: path, path, side: 1 }, track, { asphalt, lines: new THREE.MeshStandardMaterial(), verge: new THREE.MeshStandardMaterial() })

    const lane = scene.children.find((child) => child instanceof THREE.Mesh && child.material === asphalt)
    if (!lane) throw new Error('The pit lane has no asphalt.')

    restyleAsWireframe(scene, 100)

    const corners = lane.children.filter((child) => child instanceof THREE.LineSegments).flatMap((lines) => {
      const positions = lines.geometry.getAttribute('position')
      return Array.from({ length: positions.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(positions, index))
    })
    const reaches = corners.map((corner) => distanceToTrack(track, corner))
    expect(corners.length).toBeGreaterThan(0)
    expect(Math.min(...reaches)).toBeGreaterThan(TRACK_WIDTH / 2 - 0.05)
  })
})

describe('light trails', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) })
  })

  afterEach(() => vi.unstubAllGlobals())

  const driver = { number: 1, name: 'Test Driver', code: 'TST', team: 'Test Team', color: '#3671c6' }

  // How far behind the car the lit part of its trail reaches, in scene units.
  const litTrailLength = (car: THREE.Group) => {
    const trail = car.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial && child.material.vertexColors)
    if (!trail) throw new Error('The car has no trail.')
    const positions = trail.geometry.getAttribute('position')
    const colors = trail.geometry.getAttribute('color')
    let reach = 0
    for (let index = 0; index < positions.count; index++) {
      if (colors.getX(index) + colors.getY(index) + colors.getZ(index) > 0) reach = Math.max(reach, -positions.getZ(index))
    }
    return reach
  }

  const drive = (car: THREE.Group, updateTrail: () => void, distance: number) => {
    for (let travelled = 0; travelled < distance; travelled += 0.2) {
      car.position.z += 0.2
      updateTrail()
    }
  }

  it('grows behind a moving car up to a fixed length', () => {
    const { group, updateTrail } = createWireframeCarKit().createCar(driver)
    group.visible = true
    updateTrail()
    drive(group, updateTrail, 4)
    const short = litTrailLength(group)
    drive(group, updateTrail, 40)
    const long = litTrailLength(group)

    expect(short).toBeGreaterThan(4)
    expect(short).toBeLessThan(6)
    expect(long).toBeGreaterThan(12)
    expect(long).toBeLessThan(16)
  })

  it('starts again when the car jumps, as after a seek', () => {
    const { group, updateTrail } = createWireframeCarKit().createCar(driver)
    group.visible = true
    drive(group, updateTrail, 10)
    group.position.set(80, 0, -40)
    updateTrail()

    expect(litTrailLength(group)).toBeLessThan(2)
  })
})
