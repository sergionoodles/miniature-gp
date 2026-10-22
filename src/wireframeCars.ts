import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Driver } from './replay'
import { createEdgeLines, createFillMaterial } from './wireframeStyle'

// Car space matches the realistic car: +z is the nose, +y up, the ground at y = 0, about 3 units long.
const BODY_FILL = 0x04070d
// Just above 1: the outline blooms more than any scenery, but not so much it bleaches the team colour.
const OUTLINE_BRIGHTNESS = 1.05
const UNDERGLOW_BRIGHTNESS = 0.3
const LAPPED_BRIGHTNESS = 0.4
// Liveries darker or paler than these still read as neon: saturation and lightness are clamped.
const NEON_SATURATION = 0.9
const NEON_LIGHTNESS: [number, number] = [0.5, 0.62]
const PALE_SATURATION = 0.2
const PALE_LIGHTNESS = 0.68
const WHEEL_BASE: [number, number] = [1.02, -0.98]
const WHEEL_TRACK = 0.57
const WHEEL_SEGMENTS = 10
const RAIN_LIGHT_COLOR = new THREE.Color(0xff2a1f).multiplyScalar(4)
// The light trail: a low wall left behind the car, sampled by distance so it is the same length
// at every replay speed, and cleared when the car jumps (a seek or the race start).
const TRAIL_LENGTH = 13
const TRAIL_STEP = 0.4
const TRAIL_POINTS = Math.ceil(TRAIL_LENGTH / TRAIL_STEP) + 2
const TRAIL_RESET_DISTANCE = 6
const TRAIL_BOTTOM = 0.06
const TRAIL_TOP = 0.34
const TRAIL_START = -1.25
const TRAIL_BRIGHTNESS = 0.75
// The wall glows brightest along its top edge.
const TRAIL_BASE_SHARE = 0.35
const TRAIL_FADE_POWER = 1.6

export function neonLivery(color: string) {
  const livery = new THREE.Color(color)
  const { h, s, l } = livery.getHSL({ h: 0, s: 0, l: 0 })
  if (s < PALE_SATURATION) return livery.setHSL(h, s, PALE_LIGHTNESS)
  return livery.setHSL(h, Math.max(s, NEON_SATURATION), THREE.MathUtils.clamp(l, ...NEON_LIGHTNESS))
}

// Top-view outline (x, z) extruded upward between two heights.
function prism(outline: [number, number][], bottom: number, top: number) {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)))
  return new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, bottom, 0)
}

const mirrored = (half: [number, number][]): [number, number][] => [...half, ...half.map(([x, z]): [number, number] => [-x, z]).reverse()]

const box = (size: [number, number, number], position: [number, number, number]) => new THREE.BoxGeometry(...size).translate(...position)

// A handful of faceted solids: the outline, not the detail, says "Formula 1".
function createBodyGeometry() {
  const hull = prism(mirrored([[0.04, 1.62], [0.12, 1.2], [0.2, 0.55], [0.46, 0.34], [0.46, -0.5], [0.24, -1.0], [0.1, -1.28]]), 0.08, 0.28)
  const cover = prism(mirrored([[0.06, 0.55], [0.17, 0.2], [0.18, -0.3], [0.08, -1.05]]), 0.28, 0.46)
  const airbox = prism(mirrored([[0.05, -0.12], [0.07, -0.3], [0.03, -0.9]]), 0.46, 0.58)
  const parts = [
    hull, cover, airbox,
    box([1.38, 0.03, 0.26], [0, 0.07, 1.46]),
    box([0.03, 0.14, 0.32], [0.69, 0.12, 1.42]), box([0.03, 0.14, 0.32], [-0.69, 0.12, 1.42]),
    box([0.94, 0.04, 0.24], [0, 0.66, -1.34]),
    box([0.03, 0.4, 0.44], [0.47, 0.5, -1.34]), box([0.03, 0.4, 0.44], [-0.47, 0.5, -1.34]),
    box([0.04, 0.22, 0.07], [0, 0.5, -1.25]),
    ...WHEEL_BASE.flatMap((z, axle) => {
      const radius = axle ? 0.265 : 0.25
      const width = axle ? 0.31 : 0.24
      return [-1, 1].map((side) => new THREE.CylinderGeometry(radius, radius, width, WHEEL_SEGMENTS).rotateZ(Math.PI / 2).translate(side * WHEEL_TRACK, radius, z))
    }),
  ]
  // Extruded prisms come unindexed, so every part is unindexed and reduced to positions to merge.
  return mergeGeometries(parts.map((part) => {
    const plain = part.index ? part.toNonIndexed() : part
    if (plain !== part) part.dispose()
    plain.deleteAttribute('uv')
    plain.deleteAttribute('normal')
    return plain
  }))
}

// A soft glow pooled under the car, so the field reads as light on the dark grid.
function createGlowTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.35)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  return new THREE.CanvasTexture(canvas)
}

function createTrail(color: THREE.Color) {
  const positions = new Float32Array(TRAIL_POINTS * 2 * 3)
  const colors = new Float32Array(TRAIL_POINTS * 2 * 3)
  const indices: number[] = []
  for (let point = 0; point < TRAIL_POINTS - 1; point++) {
    const vertex = point * 2
    indices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setIndex(indices)
  // Additive light fading to black needs no alpha: the faded tail simply adds nothing.
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.raycast = () => {}
  const history: THREE.Vector3[] = []
  const brightness = { value: 1 }
  const local = new THREE.Vector3()
  const rear = new THREE.Vector3()
  const toLocal = new THREE.Matrix4()

  // The trail lives in car space as the car's child, so it shares the car's visibility and
  // hover isolation; its world-space history of rear positions is converted each frame.
  const update = (car: THREE.Group) => {
    if (!car.visible) {
      history.length = 0
      return
    }
    car.updateMatrix()
    rear.set(0, 0, TRAIL_START).applyMatrix4(car.matrix)
    if (history[0] && history[0].distanceTo(rear) > TRAIL_RESET_DISTANCE) history.length = 0
    if (!history[0] || history[0].distanceTo(rear) >= TRAIL_STEP) history.unshift(rear.clone())
    history.length = Math.min(history.length, TRAIL_POINTS - 1)
    toLocal.copy(car.matrix).invert()
    let travelled = 0
    let previous = rear
    for (let point = 0; point < TRAIL_POINTS; point++) {
      const isUsed = point <= history.length
      const source = point === 0 ? rear : history[Math.min(point, history.length) - 1]
      travelled += source.distanceTo(previous)
      previous = source
      local.copy(source).applyMatrix4(toLocal)
      const fade = Math.max(0, 1 - travelled / TRAIL_LENGTH) ** TRAIL_FADE_POWER
      const top = isUsed ? fade * TRAIL_BRIGHTNESS * brightness.value : 0
      const bottom = top * TRAIL_BASE_SHARE
      positions.set([local.x, TRAIL_BOTTOM, local.z, local.x, TRAIL_TOP, local.z], point * 6)
      colors.set([color.r * bottom, color.g * bottom, color.b * bottom, color.r * top, color.g * top, color.b * top], point * 6)
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
  }
  return { mesh, update, brightness }
}

export function createWireframeCarKit() {
  const bodyGeometry = createBodyGeometry()
  const glowTexture = createGlowTexture()
  const glowGeometry = new THREE.PlaneGeometry(1.9, 3.8).rotateX(-Math.PI / 2).translate(0, 0.03, 0)
  const rainLightGeometry = new THREE.BoxGeometry(0.12, 0.06, 0.03).translate(0, 0.21, -1.34)

  const createCar = (driver: Driver) => {
    const livery = neonLivery(driver.color)
    const body = new THREE.Mesh(bodyGeometry, createFillMaterial(BODY_FILL))
    const outlineMaterial = new THREE.LineBasicMaterial({ color: livery.clone().multiplyScalar(OUTLINE_BRIGHTNESS) })
    const outline = createEdgeLines(bodyGeometry, outlineMaterial)
    const glowMaterial = new THREE.MeshBasicMaterial({ color: livery.clone().multiplyScalar(UNDERGLOW_BRIGHTNESS), map: glowTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    const glow = new THREE.Mesh(glowGeometry, glowMaterial)
    glow.raycast = () => {}
    const rainLight = new THREE.Mesh(rainLightGeometry, new THREE.MeshBasicMaterial({ color: RAIN_LIGHT_COLOR }))
    rainLight.visible = false
    const trail = createTrail(livery)
    const group = new THREE.Group()
    group.add(body, outline, glow, rainLight, trail.mesh)
    group.visible = false
    return {
      group,
      rainLight,
      updateTrail: () => trail.update(group),
      setLapped: (isLapped: boolean) => {
        const brightness = isLapped ? LAPPED_BRIGHTNESS : 1
        outlineMaterial.color.copy(livery).multiplyScalar(OUTLINE_BRIGHTNESS * brightness)
        glowMaterial.color.copy(livery).multiplyScalar(UNDERGLOW_BRIGHTNESS * brightness)
        trail.brightness.value = brightness
      },
    }
  }
  return { createCar }
}
