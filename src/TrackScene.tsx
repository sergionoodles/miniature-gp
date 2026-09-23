import { useEffect, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { carLocation, type Replay } from './replay'
import { buildCircuit } from './circuitWorld'
import { createLabel } from './sceneAssets'

type CameraAction = 'overview' | 'top' | 'in' | 'out' | 'left' | 'right' | 'locate'
type Props = {
  replay: Replay
  timeRef: RefObject<number>
  circuit: string
  selectedDriver: number | null
  onSelectDriver: (driver: number | null) => void
}

export function TrackScene({ replay, timeRef, circuit, selectedDriver, onSelectDriver }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const selectionRef = useRef(selectedDriver)
  const actionRef = useRef<(action: CameraAction) => void>(() => {})
  const [view, setView] = useState<'overview' | 'top'>('overview')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { selectionRef.current = selectedDriver }, [selectedDriver])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      setError('The 3D view needs WebGL. Try a browser with hardware acceleration enabled. Race timing and playback are still available.')
      return
    }
    const { scene, cars, project, width, depth } = buildCircuit(replay, circuit)
    const camera = new THREE.OrthographicCamera(-130, 130, 100, -100, 0.1, 1000)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.18
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    const canvas = renderer.domElement
    canvas.tabIndex = 0
    canvas.setAttribute('aria-label', 'Circuit view. Drag to orbit, scroll to zoom. Arrow keys pan. Select a driver in the running order to highlight their car.')
    container.appendChild(canvas)
    const controls = new OrbitControls(camera, canvas)
    controls.minZoom = 0.7
    controls.maxZoom = 8
    controls.maxPolarAngle = Math.PI * 0.44
    controls.enableDamping = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    controls.dampingFactor = 0.12
    controls.listenToKeyEvents(canvas)
    const resetCamera = (top: boolean) => {
      controls.target.set(0, 0, 0)
      camera.position.set(top ? 0 : 15, top ? 240 : 185, top ? 0.01 : 145)
      camera.zoom = 1
      camera.lookAt(controls.target)
      camera.updateProjectionMatrix()
      controls.update()
    }
    resetCamera(false)
    actionRef.current = (action) => {
      if (action === 'overview' || action === 'top') resetCamera(action === 'top')
      if (action === 'locate' && selectionRef.current !== null) {
        const car = cars.get(selectionRef.current)
        if (car?.visible) {
          camera.position.sub(controls.target).add(car.position)
          controls.target.copy(car.position)
          camera.zoom = 4
          camera.updateProjectionMatrix()
        }
      }
      if (action === 'in' || action === 'out') {
        camera.zoom = THREE.MathUtils.clamp(camera.zoom * (action === 'in' ? 1.3 : 1 / 1.3), controls.minZoom, controls.maxZoom)
        camera.updateProjectionMatrix()
      }
      if (action === 'left' || action === 'right') {
        camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), action === 'left' ? -Math.PI / 8 : Math.PI / 8).add(controls.target)
      }
      controls.update()
    }
    const resize = () => {
      const { width: viewportWidth, height: viewportHeight } = container.getBoundingClientRect()
      if (!viewportWidth || !viewportHeight) return
      const aspect = viewportWidth / viewportHeight
      const vertical = Math.max(depth * 0.49 + 22, (width * 0.56 + 12) / aspect)
      camera.left = -vertical * aspect
      camera.right = vertical * aspect
      camera.top = vertical
      camera.bottom = -vertical
      camera.updateProjectionMatrix()
      renderer.setSize(viewportWidth, viewportHeight)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()
    const marker = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.1, 40), new THREE.MeshBasicMaterial({ color: 0xe56c3d, side: THREE.DoubleSide, depthTest: false }))
    marker.rotation.x = -Math.PI / 2
    marker.renderOrder = 4
    scene.add(marker)
    const labels = new Map(replay.drivers.map((driver) => {
      const label = createLabel(`${driver.code}  ${driver.number}`)
      label.visible = false
      scene.add(label)
      return [driver.number, label] as const
    }))
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
    let lastDiagnostic = 0
    const animate = (now: number) => {
      marker.visible = false
      for (const [number, car] of cars) {
        const location = carLocation(replay.locations[String(number)] ?? [], timeRef.current)
        car.visible = location !== null
        const label = labels.get(number)
        if (label) label.visible = false
        if (!location) continue
        car.position.copy(project(location.x, location.y, 0.08))
        car.rotation.y = Math.atan2(-Math.cos(location.heading), -Math.sin(location.heading))
        if (selectionRef.current === number) {
          marker.visible = true
          marker.position.copy(car.position).setY(0.16)
          if (label) {
            label.visible = true
            label.position.copy(car.position).add(new THREE.Vector3(0, 4, 0))
          }
        }
      }
      controls.update()
      renderer.render(scene, camera)
      if (import.meta.env.DEV && now - lastDiagnostic > 1000) {
        container.dataset.renderStats = JSON.stringify({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, zoom: camera.zoom })
        lastDiagnostic = now
      }
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointerup', pointerUp)
      canvas.remove()
      const materials = new Set<THREE.Material>()
      const textures = new Set<THREE.Texture>()
      scene.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose()
        if (object instanceof THREE.Mesh) object.geometry.dispose()
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
          const values = Array.isArray(object.material) ? object.material : [object.material]
          values.forEach((material: THREE.Material) => materials.add(material))
        }
        if (object instanceof THREE.DirectionalLight) object.shadow.dispose()
      })
      materials.forEach((material) => {
        Object.values(material).forEach((value: unknown) => { if (value instanceof THREE.Texture) textures.add(value) })
        material.dispose()
      })
      textures.forEach((texture) => texture.dispose())
      renderer.dispose()
      actionRef.current = () => {}
    }
  }, [replay, timeRef, circuit, onSelectDriver])

  const changeView = (next: 'overview' | 'top') => {
    setView(next)
    actionRef.current(next)
  }

  return <>
    <div className="track-canvas" ref={containerRef} />
    {error && <div className="scene-error" role="alert">{error}</div>}
    {selectedDriver !== null && <button className="locate-driver" type="button" disabled={!carLocation(replay.locations[String(selectedDriver)] ?? [], timeRef.current)} onClick={() => actionRef.current('locate')}>⌖ Locate driver</button>}
    <div className="camera-toolbar" aria-label="Camera controls" role="group">
      <div className="view-switch">
        <button type="button" aria-pressed={view === 'overview'} onClick={() => changeView('overview')}>◈ <span>Diorama</span></button>
        <button type="button" aria-pressed={view === 'top'} onClick={() => changeView('top')}>⊞ <span>Top view</span></button>
      </div>
      <div className="zoom-controls">
        <button type="button" aria-label="Rotate left" onClick={() => actionRef.current('left')}>↶</button>
        <button type="button" aria-label="Rotate right" onClick={() => actionRef.current('right')}>↷</button>
        <button type="button" aria-label="Zoom out" onClick={() => actionRef.current('out')}>−</button>
        <button type="button" aria-label="Zoom in" onClick={() => actionRef.current('in')}>+</button>
        <button type="button" aria-label="Reset camera" onClick={() => changeView('overview')}>⌖</button>
      </div>
    </div>
  </>
}
