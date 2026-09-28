import * as THREE from 'three'
import { createCarKit } from './carModel'
import type { Driver } from './replay'
import { createSkyEnvironment } from './sceneRenderer'

const RENDER_WIDTH = 480
const RENDER_HEIGHT = 240
const PIXEL_RATIO = 2
// Three-quarter view from slightly above, nose to the right; the car is about 3 units long.
// The frame leaves room all round and each image is then cropped to the car, so no framing
// constant can cut off a tyre.
const FIELD_OF_VIEW = 24
const CAMERA_TARGET = new THREE.Vector3(0, 0.34, 0.08)
const CAMERA_POSITION = new THREE.Vector3(-3.27, 1.61, 2.28).multiplyScalar(1.35).add(CAMERA_TARGET)
// Pixels fainter than this (the fading edge of the contact shadow) don't count as the car.
const CROP_ALPHA_THRESHOLD = 24
const CROP_MARGIN = 2
const SUN_INTENSITY = 2.2
const SKY_INTENSITY = 0.8

type Disposable = { dispose: () => void }

// Trims transparent space so the image's bottom edge is where the tyres meet the ground.
function croppedToContent(source: HTMLCanvasElement) {
  const { width, height } = source
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('The podium car canvas could not be created.')
  context.drawImage(source, 0, 0)
  const { data } = context.getImageData(0, 0, width, height)
  const bounds = { left: width, right: -1, top: height, bottom: -1 }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= CROP_ALPHA_THRESHOLD) continue
      bounds.left = Math.min(bounds.left, x)
      bounds.right = Math.max(bounds.right, x)
      bounds.top = Math.min(bounds.top, y)
      bounds.bottom = Math.max(bounds.bottom, y)
    }
  }
  if (bounds.right < 0) return canvas.toDataURL('image/png')
  const left = Math.max(0, bounds.left - CROP_MARGIN)
  const top = Math.max(0, bounds.top - CROP_MARGIN)
  const cropped = document.createElement('canvas')
  cropped.width = Math.min(width, bounds.right + CROP_MARGIN + 1) - left
  cropped.height = bounds.bottom + 1 - top
  const croppedContext = cropped.getContext('2d')
  if (!croppedContext) throw new Error('The podium car canvas could not be created.')
  croppedContext.drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height)
  return cropped.toDataURL('image/png')
}

function collectResources(object: THREE.Object3D, resources: Set<Disposable>) {
  object.traverse((part) => {
    if (!(part instanceof THREE.Mesh)) return
    resources.add(part.geometry)
    const materials: THREE.Material[] = Array.isArray(part.material) ? part.material : [part.material]
    materials.forEach((material) => {
      resources.add(material)
      Object.values(material).forEach((value: unknown) => { if (value instanceof THREE.Texture) resources.add(value) })
    })
  })
}

// Renders the race cars once into still images, so the podium doesn't keep a second WebGL
// context running on top of the circuit's.
export function renderPodiumCars(drivers: Driver[]): string[] {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  const resources = new Set<Disposable>()
  try {
    renderer.setPixelRatio(PIXEL_RATIO)
    renderer.setSize(RENDER_WIDTH, RENDER_HEIGHT, false)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.setClearColor(0x000000, 0)
    const scene = new THREE.Scene()
    const environment = createSkyEnvironment(renderer)
    resources.add(environment)
    scene.environment = environment
    const sun = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY)
    sun.position.set(-3, 6, 4)
    scene.add(sun, new THREE.HemisphereLight(0xdfe9f2, 0x2a2f33, SKY_INTENSITY))
    const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, RENDER_WIDTH / RENDER_HEIGHT, 0.1, 50)
    camera.position.copy(CAMERA_POSITION)
    camera.lookAt(CAMERA_TARGET)
    const kit = createCarKit(true)
    return drivers.map((driver) => {
      const { group } = kit.createCar(driver)
      group.visible = true
      scene.add(group)
      // The canvas is only readable until the frame is presented, so it is copied straight away.
      renderer.render(scene, camera)
      const image = croppedToContent(renderer.domElement)
      scene.remove(group)
      collectResources(group, resources)
      return image
    })
  } finally {
    resources.forEach((resource) => resource.dispose())
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
