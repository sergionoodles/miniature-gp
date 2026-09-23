import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { carLocation, type Driver, type Replay } from './replay'

function ribbon(points: THREE.Vector3[], width: number, height: number, color: number, closed = true): THREE.Mesh {
  const positions: number[] = []
  const indices: number[] = []
  for (let index = 0; index < points.length; index++) {
    const previous = points[closed ? (index - 1 + points.length) % points.length : Math.max(0, index - 1)]
    const next = points[closed ? (index + 1) % points.length : Math.min(points.length - 1, index + 1)]
    const direction = next.clone().sub(previous).normalize()
    const across = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(width / 2)
    const center = points[index]
    positions.push(center.x - across.x, height, center.z - across.z)
    positions.push(center.x + across.x, height, center.z + across.z)
    const following = (index + 1) % points.length
    if (closed || index < points.length - 1) {
      indices.push(index * 2, following * 2, index * 2 + 1)
      indices.push(index * 2 + 1, following * 2, following * 2 + 1)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 1 }))
}

function addBox(group: THREE.Group, size: [number, number, number], position: [number, number, number], color: number): void {
  const box = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 0.88 }))
  box.position.set(...position)
  box.castShadow = true
  group.add(box)
}

function createCar(driver: Driver): THREE.Group {
  const car = new THREE.Group()
  const teamColor = Number.parseInt(driver.color.slice(1), 16)
  addBox(car, [0.92, 0.26, 1.7], [0, 0.38, 0], teamColor)
  addBox(car, [0.44, 0.16, 0.85], [0, 0.38, 0.96], teamColor)
  addBox(car, [1.38, 0.1, 0.26], [0, 0.32, 1.2], 0x1e2524)
  addBox(car, [1.24, 0.12, 0.28], [0, 0.5, -0.82], teamColor)
  addBox(car, [0.47, 0.2, 0.52], [0, 0.59, -0.15], 0x171e1e)
  for (const x of [-0.58, 0.58]) {
    for (const z of [-0.56, 0.62]) addBox(car, [0.38, 0.32, 0.37], [x, 0.28, z], 0x131918)
  }
  car.visible = false
  car.scale.setScalar(1.45)
  return car
}

function addGrandstand(scene: THREE.Scene, x: number, z: number, length: number, angle = 0): void {
  const stand = new THREE.Group()
  addBox(stand, [length, 1.2, 6], [0, 0.6, 0], 0xc8c9be)
  addBox(stand, [length, 0.22, 7.2], [0, 2.6, -0.6], 0x656e69)
  addBox(stand, [length, 0.3, 3.5], [0, 1.35, 0.6], 0x919d94)
  for (let offset = -length / 2 + 2; offset < length / 2; offset += 4) {
    addBox(stand, [0.18, 1.6, 0.18], [offset, 1.8, -3], 0x717974)
  }
  stand.position.set(x, 0, z)
  stand.rotation.y = angle
  scene.add(stand)
}

function addFinishLine(scene: THREE.Scene, track: THREE.Vector3[]): void {
  const line = new THREE.Group()
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 10; column++) {
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.04, 0.24),
        new THREE.MeshBasicMaterial({ color: (row + column) % 2 ? 0xffffff : 0x202826 }),
      )
      tile.position.set((column - 4.5) * 0.48, 0.095, (row - 0.5) * 0.24)
      line.add(tile)
    }
  }
  line.position.copy(track[0])
  const direction = track[1].clone().sub(track[0])
  line.rotation.y = Math.atan2(direction.x, direction.z)
  scene.add(line)
}

function addKerbs(scene: THREE.Scene, track: THREE.Vector3[]): void {
  const white = new THREE.MeshBasicMaterial({ color: 0xf4f2e8 })
  const red = new THREE.MeshBasicMaterial({ color: 0xc94636 })
  const geometry = new THREE.BoxGeometry(0.75, 0.07, 0.8)
  let stripe = 0
  for (let index = 0; index < track.length; index += 4) {
    const point = track[index]
    const isCorner = (point.x < -22 && point.z > 25)
      || (point.x < -75 && point.z < -23)
      || (point.x > 76 && point.z > 19)
      || (point.x > -15 && point.x < 16 && point.z > 10 && point.z < 24)
    if (!isCorner) continue
    const direction = track[(index + 2) % track.length].clone().sub(track[(index - 2 + track.length) % track.length]).normalize()
    const across = new THREE.Vector3(-direction.z, 0, direction.x)
    for (const side of [-1, 1]) {
      const tile = new THREE.Mesh(geometry, stripe % 2 ? red : white)
      tile.position.copy(point).addScaledVector(across, side * 2.75)
      tile.position.y = 0.09
      tile.rotation.y = Math.atan2(direction.x, direction.z)
      scene.add(tile)
    }
    stripe++
  }
}

function addPark(scene: THREE.Scene, track: THREE.Vector3[]): void {
  const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.32, 2, 5)
  const canopyGeometry = new THREE.ConeGeometry(1.6, 4.2, 6)
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x645c42, roughness: 1 })
  const canopyMaterials = [0x405b39, 0x526a3f, 0x667b47].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 1 }))
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, 320)
  const canopies = canopyMaterials.map((material) => new THREE.InstancedMesh(canopyGeometry, material, 320))
  const dummy = new THREE.Object3D()
  const counts = [0, 0, 0]
  let trunkCount = 0
  let seed = 32728
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let attempt = 0; attempt < 800 && trunkCount < 320; attempt++) {
    const x = random() * 214 - 107
    const z = random() * 106 - 53
    if (track.some((point) => Math.hypot(point.x - x, point.z - z) < 5.7)) continue
    if (z > 41 && x > -32 && x < 85) continue
    const scale = 0.7 + random() * 0.65
    dummy.position.set(x, scale, z)
    dummy.scale.setScalar(scale)
    dummy.updateMatrix()
    trunks.setMatrixAt(trunkCount++, dummy.matrix)
    const colorIndex = Math.floor(random() * canopies.length)
    dummy.position.y = 3.3 * scale
    dummy.updateMatrix()
    canopies[colorIndex].setMatrixAt(counts[colorIndex]++, dummy.matrix)
  }
  trunks.count = trunkCount
  scene.add(trunks)
  canopies.forEach((canopy, index) => {
    canopy.count = counts[index]
    scene.add(canopy)
  })
}

function buildScene(replay: Replay, circuit: string) {
  const rawXs = replay.track.map(([x]) => x)
  const rawYs = replay.track.map(([, y]) => y)
  const maxX = Math.max(...rawXs)
  const maxY = Math.max(...rawYs)
  const xScale = 180 / (maxY - Math.min(...rawYs))
  const zScale = 80 / (maxX - Math.min(...rawXs))
  const worldPoint = (rawX: number, rawY: number, height = 0) =>
    new THREE.Vector3((maxY - rawY) * xScale - 90, height, (maxX - rawX) * zScale - 40)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xdfe6db)
  scene.add(new THREE.HemisphereLight(0xf7fff2, 0x8b9879, 2.2))
  const sun = new THREE.DirectionalLight(0xfff5dc, 2.8)
  sun.position.set(-50, 90, 40)
  scene.add(sun)

  const ground = new THREE.Mesh(new THREE.BoxGeometry(270, 0.8, 210), new THREE.MeshStandardMaterial({ color: 0x637b4d, roughness: 1 }))
  ground.position.y = -0.5
  scene.add(ground)

  const curve = new THREE.CatmullRomCurve3(replay.track.map(([x, z]) => worldPoint(x, z)), true, 'centripetal')
  const track = curve.getSpacedPoints(450).slice(0, -1)
  scene.add(ribbon(track, 6.3, 0.025, 0xaab4a8))
  scene.add(ribbon(track, 5.2, 0.045, 0x343e3d))
  addFinishLine(scene, track)
  if (circuit === 'Autodromo Nazionale Monza') addKerbs(scene, track)

  addPark(scene, track)
  if (circuit === 'Autodromo Nazionale Monza') {
    // These landmarks are placed against the Monza reference track.
    const pitCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(79, 0, 37), new THREE.Vector3(67, 0, 36),
      new THREE.Vector3(40, 0, 35.6), new THREE.Vector3(8, 0, 35.5),
      new THREE.Vector3(-22, 0, 35), new THREE.Vector3(-42, 0, 33),
    ])
    scene.add(ribbon(pitCurve.getSpacedPoints(90), 1.7, 0.065, 0x8c9992, false))
    addGrandstand(scene, 13, 47, 45)
    addGrandstand(scene, 60, 47, 32)
    addGrandstand(scene, -26, 44, 24)
    const paddock = new THREE.Group()
    addBox(paddock, [34, 2.1, 8], [0, 1.05, 0], 0xd6d8cf)
    addBox(paddock, [34, 0.3, 9], [0, 2.25, 0], 0x7c8582)
    paddock.position.set(28, 0, 56)
    scene.add(paddock)
  }

  const cars = new Map<number, THREE.Group>()
  for (const driver of replay.drivers) {
    const car = createCar(driver)
    scene.add(car)
    cars.set(driver.number, car)
  }
  return { scene, cars, worldPoint, xScale, zScale }
}

export function TrackScene({ replay, timeRef, circuit }: { replay: Replay; timeRef: React.RefObject<number>; circuit: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const { scene, cars, worldPoint, xScale, zScale } = buildScene(replay, circuit)
    const camera = new THREE.OrthographicCamera(-118, 118, 80, -80, 0.1, 1000)
    camera.position.set(0, 160, 145)
    camera.lookAt(0, 0, 0)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(renderer.domElement)

    const resize = () => {
      const { width, height } = container.getBoundingClientRect()
      if (!width || !height) return
      const aspect = width / height
      camera.left = -118
      camera.right = 118
      camera.top = 118 / aspect
      camera.bottom = -118 / aspect
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    let frame = 0
    const animate = () => {
      for (const [number, car] of cars) {
        const location = carLocation(replay.locations[String(number)] ?? [], timeRef.current)
        car.visible = location !== null
        if (!location) continue
        car.position.copy(worldPoint(location.x, location.y, 0.06))
        car.rotation.y = Math.atan2(-Math.cos(location.heading) * xScale, -Math.sin(location.heading) * zScale)
      }
      renderer.render(scene, camera)
      frame = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      container.removeChild(renderer.domElement)
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      })
      renderer.dispose()
    }
  }, [replay, timeRef, circuit])

  return <div className="track-canvas" ref={containerRef} aria-label={`Isometric replay of ${circuit}`} role="img" />
}
