import * as THREE from 'three'
import type { Replay } from './replay'

const SECONDS_PER_HOUR = 3600
const HOURS_PER_DAY = 24
const DAWN_START = 6
const DAWN_END = 7
const DUSK_START = 18
const DUSK_END = 19

export function getRaceDaylight(start: string, offset: string | undefined, elapsed: number) {
  const match = offset?.match(/^([+-]?)(\d{2}):([0-5]\d)(?::([0-5]\d))?$/)
  const timestamp = Date.parse(start)
  if (!match || Number(match[2]) > 23 || !Number.isFinite(timestamp) || !Number.isFinite(elapsed) || !/(Z|[+-]\d{2}:\d{2})$/i.test(start)) return 1
  const offsetSeconds = (Number(match[2]) * SECONDS_PER_HOUR + Number(match[3]) * 60 + Number(match[4] ?? 0)) * (match[1] === '-' ? -1 : 1)
  const localHours = (timestamp / 1000 + offsetSeconds + elapsed) / SECONDS_PER_HOUR
  const hour = ((localHours % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY
  // Clock-based twilight: exact solar elevation would also require circuit coordinates.
  return THREE.MathUtils.smoothstep(hour, DAWN_START, DAWN_END) * (1 - THREE.MathUtils.smoothstep(hour, DUSK_START, DUSK_END))
}

export function createRaceLighting(scene: THREE.Scene, replay: Pick<Replay, 'start' | 'gmt_offset'>) {
  const daySky = new THREE.Color(0xd9e5e6)
  const nightSky = new THREE.Color(0x09151f)
  const dayFill = new THREE.Color(0xe8f4ff)
  const nightFill = new THREE.Color(0x8caecb)
  const dayGround = new THREE.Color(0xa89775)
  const nightGround = new THREE.Color(0x17282c)
  const daySun = new THREE.Color(0xffefd3)
  const nightSun = new THREE.Color(0xb0cbe7)
  const background = new THREE.Color()
  const fog = new THREE.Fog(0, 210, 540)
  const fill = new THREE.HemisphereLight()
  const sun = new THREE.DirectionalLight()
  sun.position.set(-70, 110, 50)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 1, far: 300 })
  sun.shadow.normalBias = 0.2
  sun.shadow.bias = -0.0002
  scene.background = background
  scene.fog = fog
  scene.add(fill, sun)
  let previousDaylight = -1
  let previousIsolation = false
  return (elapsed: number, isIsolated: boolean) => {
    const daylight = getRaceDaylight(replay.start, replay.gmt_offset, elapsed)
    if (daylight === previousDaylight && isIsolated === previousIsolation) return
    previousDaylight = daylight
    previousIsolation = isIsolated
    background.copy(nightSky).lerp(daySky, daylight)
    fog.color.copy(background)
    fill.color.copy(nightFill).lerp(dayFill, daylight)
    fill.groundColor.copy(nightGround).lerp(dayGround, daylight)
    fill.intensity = THREE.MathUtils.lerp(0.65, 2.2, daylight)
    sun.color.copy(nightSun).lerp(daySun, daylight)
    sun.intensity = THREE.MathUtils.lerp(0.85, 3.2, daylight)
    if (isIsolated) {
      const luminance = background.r * 0.2126 + background.g * 0.7152 + background.b * 0.0722
      background.setRGB(luminance, luminance, luminance)
    }
  }
}
