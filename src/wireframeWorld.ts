import * as THREE from 'three'
import { addCars, addCircuitWorld, isRainLightOn, layoutCircuit, type CircuitScene } from './circuitWorld'
import type { WeatherTimeline } from './raceWeather'
import { createRain } from './rainEffect'
import type { Replay } from './replay'
import { createTrackHeightLookup } from './trackCrossings'
import { createWireframeCarKit } from './wireframeCars'
import { restyleAsWireframe, WIREFRAME_BACKGROUND } from './wireframeStyle'

// The simulation glows the same day and night; only the rain changes the scene.
const BLOOM = 0.7
const RAIN_COLOR = 0x9aa3a8

// The same circuit, scenery and cars as the realistic scene, redrawn as a neon wireframe
// simulation: the world is built at standard detail (fewer, cleaner outlines) and restyled.
export function buildWireframeCircuit(replay: Replay, circuit: string, weatherAt: WeatherTimeline): CircuitScene {
  const layout = layoutCircuit(replay, circuit)
  const { project, track, width, depth, plan, elevations, locations } = layout
  const scene = new THREE.Scene()
  const overlay = new THREE.Scene()
  scene.background = new THREE.Color(WIREFRAME_BACKGROUND)
  addCircuitWorld(scene, overlay, replay, layout, false, 'terminal')
  restyleAsWireframe(scene, Math.max(width, depth) / 2)
  const rain = createRain(plan.field.width, plan.field.depth)
  rain.streaks.material.color.set(RAIN_COLOR)
  scene.add(rain.streaks)
  const { builds, cars, updateCarLivery } = addCars(scene, replay, createWireframeCarKit().createCar)
  let currentWeather = weatherAt(0)
  const updateAtmosphere = (elapsed: number, _isIsolated: boolean, deltaSeconds: number) => {
    currentWeather = weatherAt(elapsed)
    rain.update(currentWeather.rain, deltaSeconds)
    return { bloom: BLOOM }
  }
  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let effectsClock = 0
  // Runs after the cars are placed for the frame, so each trail ends right behind its car.
  const updateCarEffects = (deltaSeconds: number) => {
    effectsClock += deltaSeconds
    const isLit = isRainLightOn(currentWeather, effectsClock, isReducedMotion)
    builds.forEach(({ rainLight, updateTrail }) => {
      rainLight.visible = isLit
      updateTrail()
    })
  }
  return { scene, overlay, cars, locations, updateCarEffects, updateCarLivery, project, track, trackHeightAt: createTrackHeightLookup(track, elevations), updateAtmosphere }
}
