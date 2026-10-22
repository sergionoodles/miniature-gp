import { useEffect, useImperativeHandle, useRef, useState, type Ref, type RefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { carLocation, type Replay } from './replay'
import { circuitViewExtent, frameCircuitCameraInPlace, interpolateStartPose, startStraightViewYaw, START_TRANSITION_SECONDS, startingGridLocations } from './circuitGeometry'
import { buildCircuit } from './circuitWorld'
import { createSceneRenderer, type FrameLook } from './sceneRenderer'
import { orbitCameraInPlace } from './finishOrbit'
import { nextGraphicsQuality, type GraphicsQuality } from './graphicsQuality'
import type { WeatherTimeline } from './raceWeather'
import { activeHoverDriver, createDriverLabels, createGhost, createHoverIsolation, createSelectionMarker, positionGhostInPlace } from './driverVisuals'
import { stoppedAt, type StoppedInterval } from './stoppedCars'
import type { SceneCapture } from './racePhoto'
import { SceneHandoff } from './SceneHandoff'
import { buildWireframeCircuit } from './wireframeWorld'
import { WIREFRAME_MARKER_COLOR } from './wireframeStyle'

const MARKER_PULSE_SPEED = 0.005
const MARKER_PULSE_SCALE = 0.08
const LABEL_LIFT = 1.4
// Slightly under 1000 / 30, so a 60 Hz display reliably draws every second refresh.
const STANDARD_FRAME_MS = 30
// Matches the CSS breakpoint where the results sheet covers the whole screen.
const COMPACT_LAYOUT_WIDTH = 760
// Orbit mode turns once a minute, easing in so the camera doesn't jolt into motion.
const ORBIT_MODE_TURN_SECONDS = 60
const ORBIT_MODE_SPIN_UP_SECONDS = 2
// OrbitControls measures autoRotateSpeed in turns per 60 seconds.
const ORBIT_MODE_SPEED = 60 / ORBIT_MODE_TURN_SECONDS
// A frame after a hidden tab would otherwise swing the camera a long way at once.
const MAX_ORBIT_STEP_SECONDS = 0.1

// Each title names the current setting and what selecting the button switches to.
const QUALITY_TITLES: Record<GraphicsQuality, string> = {
  standard: 'Standard graphics: a lighter scene for any computer. Select for high graphics.',
  high: 'High graphics: effects, shadows and ambient occlusion. Select for wireframe graphics.',
  wireframe: 'Wireframe graphics: the race as a neon simulation. Select for standard graphics.',
}
const QUALITY_LABELS: Record<GraphicsQuality, string> = { standard: 'SD', high: 'HD', wireframe: 'WF' }
// The reset button starts orbit mode once the camera is already reset.
const CAMERA_MODE_BUTTON_TITLES: Record<CameraMode, { label: string, title: string }> = {
  rest: { label: 'Orbit camera', title: 'Orbit: slowly circle the circuit' },
  moved: { label: 'Reset camera', title: 'Reset camera' },
  orbit: { label: 'Reset camera', title: 'Stop orbiting and reset camera' },
}

type CameraAction = 'overview' | 'top' | 'in' | 'out' | 'left' | 'right' | 'locate'
type CameraView = 'overview' | 'top'
// 'rest' is the reset pose, where the reset button offers orbit mode instead.
type CameraMode = 'rest' | 'moved' | 'orbit'
export type SceneHandle = { locateSelectedDriver: () => void }
type CameraPose = { position: THREE.Vector3, target: THREE.Vector3, zoom: number }
type Handoff = { image: HTMLCanvasElement, isFading: boolean }
type Props = {
  replay: Replay
  weatherAt: WeatherTimeline
  timeRef: RefObject<number>
  circuit: string
  hoveredDriver: number | null
  stops: Map<number, StoppedInterval[]>
  selectedDriver: number | null
  showStartingGrid: boolean
  onSelectDriver: (driver: number | null) => void
  onSceneReady: (ready: boolean) => void
  onPhoto: (capture: SceneCapture) => void
  showCars?: boolean
  isOrbiting?: boolean
  isPlaying: boolean
  isEmbed?: boolean
  isSoundOn: boolean
  onToggleSound: () => void
  quality: GraphicsQuality
  onQualityChange: (quality: GraphicsQuality) => void
  ref?: Ref<SceneHandle>
}

export function TrackScene({ replay, weatherAt, timeRef, circuit, selectedDriver, hoveredDriver, showStartingGrid, stops, onSelectDriver, onSceneReady, onPhoto, showCars = true, isOrbiting = false, isPlaying, isEmbed = false, isSoundOn, onToggleSound, quality, onQualityChange, ref }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const optionsRef = useRef({ selectedDriver, hoveredDriver, showStartingGrid, isOrbiting, isPlaying })
  const actionRef = useRef<(action: CameraAction) => void>(() => {})
  const captureRef = useRef<() => SceneCapture | null>(() => null)
  const cameraPoseRef = useRef<() => CameraPose | null>(() => null)
  const snapshotRef = useRef<() => HTMLCanvasElement | null>(() => null)
  // Changing quality rebuilds the scene; this carries the camera over so only the graphics change.
  const poseToRestoreRef = useRef<CameraPose | null>(null)
  const [view, setView] = useState<CameraView>('overview')
  const [cameraMode, setCameraMode] = useState<CameraMode>('rest')
  // The render loop and camera listeners read the mode without waiting for a render.
  const cameraModeRef = useRef<CameraMode>('rest')
  const [error, setError] = useState<string | null>(null)
  const [handoff, setHandoff] = useState<Handoff | null>(null)

  useEffect(() => { optionsRef.current = { selectedDriver, hoveredDriver, showStartingGrid, isOrbiting, isPlaying } }, [selectedDriver, hoveredDriver, showStartingGrid, isOrbiting, isPlaying])

  useImperativeHandle(ref, () => ({ locateSelectedDriver: () => actionRef.current('locate') }), [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const isWireframe = quality === 'wireframe'
    const { scene, overlay, cars, locations, project, track, trackHeightAt, updateAtmosphere, updateCarEffects, updateCarLivery } = isWireframe
      ? buildWireframeCircuit(replay, circuit, weatherAt)
      : buildCircuit(replay, circuit, weatherAt, quality)
    const camera = new THREE.OrthographicCamera(-130, 130, 100, -100, 0.1, 1000)
    let pipeline: ReturnType<typeof createSceneRenderer>
    try {
      pipeline = createSceneRenderer(scene, overlay, camera, quality)
    } catch {
      setError('The 3D view needs WebGL. Try a browser with hardware acceleration enabled. Race timing and playback are still available.')
      setHandoff(null)
      onSceneReady(true)
      return
    }
    const { renderer } = pipeline
    const gridLocations = startingGridLocations(track, replay.startingGrid)
    const ghosts = new Map(replay.drivers.map((driver) => {
      const ghost = createGhost(driver)
      overlay.add(ghost)
      return [driver.number, ghost] as const
    }))
    const canvas = pipeline.canvas
    canvas.tabIndex = 0
    canvas.setAttribute('aria-label', 'Circuit view. Drag to orbit, scroll to zoom. Select a driver in the running order to highlight their car.')
    container.appendChild(canvas)
    const controls = new OrbitControls(camera, canvas)
    controls.minZoom = 0.7
    controls.maxZoom = 3
    controls.maxPolarAngle = Math.PI * 0.3
    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    controls.enableDamping = !isReducedMotion
    controls.dampingFactor = 0.12
    const defaultYaw = startStraightViewYaw(track)
    const { width, depth } = circuitViewExtent(track, defaultYaw)
    const resetCamera = (top: boolean) => {
      controls.target.set(0, 0, 0)
      camera.position.set(top ? 0 : 15, top ? 240 : 185, top ? 0.01 : 145).applyAxisAngle(camera.up, defaultYaw)
      camera.zoom = 1.15
      camera.lookAt(controls.target)
      camera.updateProjectionMatrix()
      controls.update()
    }
    resetCamera(false)
    const poseToRestore = poseToRestoreRef.current
    poseToRestoreRef.current = null
    if (poseToRestore) {
      controls.target.copy(poseToRestore.target)
      camera.position.copy(poseToRestore.position)
      camera.zoom = poseToRestore.zoom
      camera.updateProjectionMatrix()
      controls.update()
    }
    cameraPoseRef.current = () => ({ position: camera.position.clone(), target: controls.target.clone(), zoom: camera.zoom })
    const markCameraMoved = () => {
      if (cameraModeRef.current !== 'rest') return
      cameraModeRef.current = 'moved'
      setCameraMode('moved')
    }
    controls.addEventListener('change', markCameraMoved)
    actionRef.current = (action) => {
      if (action === 'overview' || action === 'top') resetCamera(action === 'top')
      if (action === 'locate' && optionsRef.current.selectedDriver !== null) {
        const car = cars.get(optionsRef.current.selectedDriver)
        if (car?.visible) {
          camera.position.sub(controls.target).add(car.position)
          controls.target.copy(car.position)
          camera.zoom = controls.maxZoom
          camera.updateProjectionMatrix()
          markCameraMoved()
        }
      }
      if (action === 'in' || action === 'out') {
        camera.zoom = THREE.MathUtils.clamp(camera.zoom * (action === 'in' ? 1.3 : 1 / 1.3), controls.minZoom, controls.maxZoom)
        camera.updateProjectionMatrix()
        // OrbitControls only reports its own zoom changes, so button zooms are marked here.
        markCameraMoved()
      }
      if (action === 'left' || action === 'right') {
        camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), action === 'left' ? -Math.PI / 8 : Math.PI / 8).add(controls.target)
      }
      controls.update()
    }
    const resize = () => {
      const { width: viewportWidth, height: viewportHeight } = container.getBoundingClientRect()
      if (!viewportWidth || !viewportHeight) return
      const fullPageSidebar = window.innerWidth > COMPACT_LAYOUT_WIDTH ? 286 : 0
      const style = getComputedStyle(container)
      const sidebar = isEmbed
        ? Number.parseFloat(style.getPropertyValue('--embed-order-width')) + 2 * Number.parseFloat(style.getPropertyValue('--hud-gap'))
        : fullPageSidebar
      frameCircuitCameraInPlace(camera, viewportWidth, viewportHeight, width, depth, sidebar)
      pipeline.setSize(viewportWidth, viewportHeight)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()
    const marker = isWireframe ? createSelectionMarker(WIREFRAME_MARKER_COLOR) : createSelectionMarker()
    overlay.add(marker)
    const labels = createDriverLabels(replay.drivers, overlay, isWireframe ? 'terminal' : 'rounded')
    const isolateDriver = createHoverIsolation(scene, cars)
    const pointerStart = new THREE.Vector2()
    const raycaster = new THREE.Raycaster()
    const pointerDown = (event: PointerEvent) => pointerStart.set(event.clientX, event.clientY)
    const pointerUp = (event: PointerEvent) => {
      if (event.button !== 0 || pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return
      const bounds = canvas.getBoundingClientRect()
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), camera)
      const hits = raycaster.intersectObjects([...cars.values()].filter((car) => car.visible), true)
      const hit = hits[0]
      if (!hit) return
      const selected = [...cars].find(([, car]) => car.children.includes(hit.object))
      if (selected) onSelectDriver(selected[0])
    }
    canvas.addEventListener('pointerdown', pointerDown)
    canvas.addEventListener('pointerup', pointerUp)
    let frame = 0
    let hasRendered = false
    let lastDiagnostic = 0
    let previousHover: number | null = null
    let previousFrame = performance.now()
    let lastLook: FrameLook | null = null
    let orbitSeconds = 0
    let orbitModeSeconds = 0
    captureRef.current = () => lastLook && { ...pipeline.capture(lastLook), bounds: container.getBoundingClientRect() }
    snapshotRef.current = () => lastLook && pipeline.snapshot(lastLook)
    // Standard quality draws at most 30 frames a second, halving GPU work on high refresh screens.
    const minimumFrameMs = quality === 'standard' ? STANDARD_FRAME_MS : 0
    const animate = (now: number) => {
      if (now - previousFrame < minimumFrameMs) {
        frame = requestAnimationFrame(animate)
        return
      }
      const options = optionsRef.current
      const activeHover = activeHoverDriver(options.hoveredDriver, options.showStartingGrid)
      const deltaSeconds = (now - previousFrame) / 1000
      const look = updateAtmosphere(timeRef.current, activeHover !== null, deltaSeconds)
      previousFrame = now
      if (previousHover !== activeHover) {
        isolateDriver(activeHover)
        previousHover = activeHover
      }
      marker.visible = false
      for (const [number, car] of cars) {
        const startingPose = gridLocations.get(number)
        const gridLocation = options.showStartingGrid ? startingPose : undefined
        const samples = locations[String(number)] ?? []
        const firstSample = samples[0]
        const isStarting = Boolean(!options.showStartingGrid && startingPose && firstSample && firstSample[0] <= START_TRANSITION_SECONDS && timeRef.current < START_TRANSITION_SECONDS)
        const location = options.showStartingGrid ? null : carLocation(samples, timeRef.current, isStarting)
        const stop = options.showStartingGrid ? null : stoppedAt(stops.get(number) ?? [], timeRef.current)
        const ghost = ghosts.get(number)
        const label = labels.get(number)
        car.visible = showCars && Boolean(gridLocation || location && !stop)
        if (ghost) {
          if (stop) positionGhostInPlace(ghost, project(stop[2], stop[3]), track)
          ghost.visible = showCars && stop !== null
        }
        if (label) label.visible = false
        if (!gridLocation && (!location || stop)) continue
        if (gridLocation) {
          car.position.copy(gridLocation.position)
          car.rotation.y = gridLocation.rotation
        } else if (location) {
          const telemetryPose = {
            position: project(location.x, location.y, 0.08),
            rotation: Math.atan2(-Math.cos(location.heading), -Math.sin(location.heading)),
          }
          const pose = isStarting && startingPose ? interpolateStartPose(startingPose, telemetryPose, timeRef.current) : telemetryPose
          car.position.copy(pose.position)
          car.position.y += trackHeightAt(pose.position, new THREE.Vector3(Math.sin(pose.rotation), 0, Math.cos(pose.rotation)))
          car.rotation.y = pose.rotation
        }
        if (showCars && (activeHover ?? options.selectedDriver) === number) {
          marker.visible = true
          marker.position.copy(car.position).setY(car.position.y + 0.08)
          if (!isReducedMotion) marker.scale.setScalar(1 + Math.sin(now * MARKER_PULSE_SPEED) * MARKER_PULSE_SCALE)
          if (label) {
            label.visible = true
            label.position.copy(car.position).add(new THREE.Vector3(0, LABEL_LIFT, 0))
          }
        }
      }
      updateCarEffects(deltaSeconds)
      updateCarLivery(timeRef.current)
      const isOrbitVisible = options.isOrbiting && !isReducedMotion && window.innerWidth > COMPACT_LAYOUT_WIDTH
      orbitSeconds = isOrbitVisible ? orbitSeconds + deltaSeconds : 0
      if (isOrbitVisible) orbitCameraInPlace(camera, controls.target, deltaSeconds, orbitSeconds)
      // Orbit mode holds still while the race is paused, and the finish orbit takes over while the results are open.
      const isOrbitMode = cameraModeRef.current === 'orbit' && options.isPlaying && !isOrbitVisible
      orbitModeSeconds = isOrbitMode ? orbitModeSeconds + deltaSeconds : 0
      controls.autoRotate = isOrbitMode
      controls.autoRotateSpeed = ORBIT_MODE_SPEED * THREE.MathUtils.smoothstep(orbitModeSeconds, 0, ORBIT_MODE_SPIN_UP_SECONDS)
      controls.update(Math.min(deltaSeconds, MAX_ORBIT_STEP_SECONDS))
      lastLook = { ...look, polarAngle: controls.getPolarAngle() }
      pipeline.render(lastLook)
      if (!hasRendered) {
        hasRendered = true
        onSceneReady(true)
        setHandoff((current) => current && !isReducedMotion ? { ...current, isFading: true } : null)
      }
      if (import.meta.env.DEV && now - lastDiagnostic > 1000) {
        container.dataset.renderStats = JSON.stringify({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, zoom: camera.zoom, polarAngle: controls.getPolarAngle(), isolated: activeHover, ghosts: [...ghosts].filter(([, ghost]) => ghost.visible).map(([number]) => number) })
        lastDiagnostic = now
      }
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.removeEventListener('change', markCameraMoved)
      controls.dispose()
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointerup', pointerUp)
      canvas.remove()
      const materials = new Set<THREE.Material>()
      const textures = new Set<THREE.Texture>()
      const disposeObject = (object: THREE.Object3D) => {
        if (object instanceof THREE.InstancedMesh) object.dispose()
        if (object instanceof THREE.Mesh) object.geometry.dispose()
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
          const values = Array.isArray(object.material) ? object.material : [object.material]
          values.forEach((material: THREE.Material) => materials.add(material))
        }
        if (object instanceof THREE.Points || object instanceof THREE.LineSegments) {
          object.geometry.dispose()
          materials.add(object.material)
        }
        if (object instanceof THREE.DirectionalLight) object.shadow.dispose()
      }
      scene.traverse(disposeObject)
      overlay.traverse(disposeObject)
      materials.forEach((material) => {
        Object.values(material).forEach((value: unknown) => { if (value instanceof THREE.Texture) textures.add(value) })
        material.dispose()
      })
      textures.forEach((texture) => texture.dispose())
      pipeline.dispose()
      actionRef.current = () => {}
      captureRef.current = () => null
      cameraPoseRef.current = () => null
      snapshotRef.current = () => null
    }
  }, [replay, weatherAt, timeRef, circuit, stops, onSelectDriver, onSceneReady, quality, isEmbed])

  // The last frame of the old scene covers the rebuild and fades out once the new one draws.
  const prepareRebuild = () => {
    poseToRestoreRef.current = cameraPoseRef.current()
    const image = snapshotRef.current()
    setHandoff(image && { image, isFading: false })
  }

  const toggleQuality = () => {
    prepareRebuild()
    onQualityChange(nextGraphicsQuality(quality))
  }

  const changeCameraMode = (mode: CameraMode) => {
    cameraModeRef.current = mode
    setCameraMode(mode)
  }

  // Switching between overview and top keeps an orbit going around the new view.
  const changeView = (next: CameraView) => {
    setView(next)
    actionRef.current(next)
    if (cameraModeRef.current !== 'orbit') changeCameraMode('rest')
  }

  const resetOrOrbitCamera = () => {
    if (cameraMode === 'rest') {
      changeCameraMode('orbit')
      return
    }

    actionRef.current(view)
    changeCameraMode('rest')
  }

  const takePhoto = () => {
    const capture = captureRef.current()
    if (capture) onPhoto(capture)
  }

  return <>
    <div className="track-canvas" ref={containerRef} />
    {handoff && <SceneHandoff image={handoff.image} isFading={handoff.isFading} onFaded={() => setHandoff(null)} />}
    {error && <div className="scene-error" role="alert">{error}</div>}
    <div className="scene-rail" role="toolbar" aria-label="Camera and view" aria-orientation={isEmbed ? 'horizontal' : 'vertical'}>
      <div className="rail-group camera-group">
        {!isEmbed && <button type="button" aria-label="Top view" aria-pressed={view === 'top'} title="Top view" onClick={() => changeView(view === 'top' ? 'overview' : 'top')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 12h16M12 4v16" /></svg>
        </button>}
        <button className={isEmbed ? undefined : 'rail-detail'} type="button" aria-label="Rotate left" title="Rotate left" onClick={() => actionRef.current('left')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
        </button>
        <button className={isEmbed ? undefined : 'rail-detail'} type="button" aria-label="Rotate right" title="Rotate right" onClick={() => actionRef.current('right')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
        </button>
        <button className={isEmbed ? undefined : 'rail-detail'} type="button" aria-label="Zoom in" title="Zoom in" onClick={() => actionRef.current('in')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button className={isEmbed ? undefined : 'rail-detail'} type="button" aria-label="Zoom out" title="Zoom out" onClick={() => actionRef.current('out')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        {!isEmbed && <button type="button" aria-label={CAMERA_MODE_BUTTON_TITLES[cameraMode].label} title={CAMERA_MODE_BUTTON_TITLES[cameraMode].title} onClick={resetOrOrbitCamera}>
          {cameraMode === 'rest'
            ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><circle cx="19" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><path d="M10.4 21.9a10 10 0 0 0 9.941-15.416" /><path d="M13.5 2.1a10 10 0 0 0-9.841 15.416" /></svg>
            : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4" /><circle cx="12" cy="12" r="2.5" /></svg>}
        </button>}
      </div>
      {!isEmbed && <div className="rail-group">
        <button type="button" aria-label="Take a photo" disabled={error !== null} title="Take a photo of the race as framed" onClick={takePhoto}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h3.2L9 5h6l1.8 2.5H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.6" /></svg>
        </button>
        <button className="quality-button" type="button" aria-label={`Graphics: ${quality}`} title={QUALITY_TITLES[quality]} onClick={toggleQuality}>
          <span aria-hidden="true">{QUALITY_LABELS[quality]}</span>
        </button>
        <button type="button" aria-label="Sound" aria-pressed={isSoundOn} title={isSoundOn ? 'Sound on: race music and effects. Select to mute.' : 'Sound off. Select to play race music and effects.'} onClick={onToggleSound}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
            {isSoundOn ? <><path d="M16 9a5 5 0 0 1 0 6" /><path d="M19.364 18.364a9 9 0 0 0 0-12.728" /></> : <path d="m22 9-6 6m0-6 6 6" />}
          </svg>
        </button>
      </div>}
    </div>
  </>
}
