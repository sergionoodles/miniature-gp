import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Driver } from './replay'
import { addShaderPatch } from './shaderPatches'

// Car space: +z is the nose, +y up, the ground at y = 0. A car is about 3 units long.
type Section = { z: number; x?: number; halfWidth: number; top: number; bottom: number }

const CARBON = new THREE.Color(0x15181b)
const HALO = new THREE.Color(0x23272b)
const TYRE = new THREE.Color(0x141517)
const RIM = new THREE.Color(0x3b4046)
const SIDEWALL = new THREE.Color(0xb9bcbf)
const LOFT_SEGMENTS = 18
// Above 2 the cross-sections flatten from ellipses toward rounded rectangles.
const LOFT_SQUARENESS = 4.2
// Below these heights the bodywork is bare carbon, like the two-tone split of modern liveries.
const CARBON_LINE = 0.19
const CHASSIS_CARBON_LINE = 0.13
// Second livery colour by team, so each car reads as its team and not just a tinted template.
const TEAM_ACCENTS: [RegExp, number][] = [
  [/mclaren/, 0x1b1d20], [/ferrari/, 0xf2f0ea], [/mercedes/, 0x16181a], [/red bull racing/, 0xd7263d],
  [/aston martin/, 0xcedc00], [/alpine/, 0xf272b6], [/williams/, 0xf2f4f7], [/racing bulls|visa|rb\b/, 0xf2f4f7],
  [/haas/, 0xd7263d], [/audi|sauber|kick/, 0x9ea4a9], [/cadillac/, 0x16181a],
]
const WHEEL_BASE: [number, number] = [1.02, -0.98]
const WHEEL_TRACK = 0.57
const FRONT_TYRE = { radius: 0.25, width: 0.24 }
const REAR_TYRE = { radius: 0.265, width: 0.31 }
const RAIN_LIGHT_COLOR = 0xff2a1f
const RAIN_LIGHT_BOOST = 8

function accentFor(driver: Driver, team: THREE.Color) {
  const name = driver.team.toLowerCase()
  const known = TEAM_ACCENTS.find(([pattern]) => pattern.test(name))
  if (known) return new THREE.Color(known[1])
  return team.getHSL({ h: 0, s: 0, l: 0 }).l > 0.5 ? CARBON.clone() : new THREE.Color(0xf2f4f7)
}

// Prepares a part for merging: shared attribute layout (position, normal, color) and flat colour.
// Surface finishes packed into one tiny lookup texture (R clearcoat, G roughness, B metalness),
// so paint, carbon, rubber and rims share a single material and draw call per car.
const SURFACES = { paint: [1, 0.34, 0.2], carbon: [1, 0.42, 0.1], rubber: [0, 0.82, 0.05], rim: [0.3, 0.38, 0.75] } as const
type Surface = keyof typeof SURFACES
const SURFACE_ORDER = Object.keys(SURFACES) as Surface[]

function createSurfaceTexture() {
  const data = new Uint8Array(SURFACE_ORDER.flatMap((surface) => [...SURFACES[surface].map((value) => Math.round(value * 255)), 255]))
  const texture = new THREE.DataTexture(data, SURFACE_ORDER.length, 1)
  texture.magFilter = texture.minFilter = THREE.NearestFilter
  texture.needsUpdate = true
  return texture
}

// Prepares a part for merging: shared attribute layout (position, normal, uv, color), a flat
// colour and a uv pointing at its surface finish.
function finish(geometry: THREE.BufferGeometry, color: THREE.Color | ((y: number) => THREE.Color), surface: Surface = 'paint') {
  const part = geometry.index ? geometry.toNonIndexed() : geometry
  if (part !== geometry) geometry.dispose()
  const positions = part.getAttribute('position')
  const colors = new Float32Array(positions.count * 3)
  const uvs = new Float32Array(positions.count * 2)
  const surfaceU = (SURFACE_ORDER.indexOf(surface) + 0.5) / SURFACE_ORDER.length
  for (let index = 0; index < positions.count; index++) {
    const value = typeof color === 'function' ? color(positions.getY(index)) : color
    colors.set([value.r, value.g, value.b], index * 3)
    uvs.set([surfaceU, 0.5], index * 2)
  }
  part.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  part.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  return part
}

// Superellipse cross-sections lofted along z: a smooth tapered hull from a handful of numbers.
function loft(sections: Section[]) {
  const positions: number[] = []
  const indices: number[] = []
  const ring = LOFT_SEGMENTS
  for (const { z, x = 0, halfWidth, top, bottom } of sections) {
    const middle = (top + bottom) / 2
    const halfHeight = (top - bottom) / 2
    for (let step = 0; step < ring; step++) {
      const angle = step / ring * Math.PI * 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      positions.push(x + Math.sign(cos) * Math.abs(cos) ** (2 / LOFT_SQUARENESS) * halfWidth, middle + Math.sign(sin) * Math.abs(sin) ** (2 / LOFT_SQUARENESS) * halfHeight, z)
    }
  }
  for (let section = 0; section < sections.length - 1; section++) {
    for (let step = 0; step < ring; step++) {
      const current = section * ring + step
      const next = section * ring + (step + 1) % ring
      indices.push(current, current + ring, next, next, current + ring, next + ring)
    }
  }
  for (const [section, isFront] of [[0, true], [sections.length - 1, false]] as const) {
    const { z, x = 0, top, bottom } = sections[section]
    const center = positions.length / 3
    positions.push(x, (top + bottom) / 2, z)
    for (let step = 0; step < ring; step++) {
      const current = section * ring + step
      const next = section * ring + (step + 1) % ring
      indices.push(...(isFront ? [center, current, next] : [center, next, current]))
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

const box = (size: [number, number, number], position: [number, number, number], tilt = 0) =>
  new THREE.BoxGeometry(...size).rotateX(tilt).translate(...position)

// Side-profile plate (z, y outline) extruded to a thin fin across x.
function plate(outline: [number, number][], thickness: number, x = 0) {
  const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)))
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(x + thickness / 2, 0, 0)
}

// Top-view outline (x, z) extruded to a flat slab of the given thickness at height y.
function slab(outline: [number, number][], thickness: number, y: number) {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)))
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y, 0)
}

function tyre(radius: number, width: number) {
  const shoulder = 0.035
  const profile = [
    [radius * 0.62, -width / 2], [radius - shoulder, -width / 2], [radius, -width / 2 + shoulder],
    [radius, width / 2 - shoulder], [radius - shoulder, width / 2], [radius * 0.62, width / 2],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  return new THREE.LatheGeometry(profile, 16).rotateZ(Math.PI / 2)
}

function createBodyGeometry(team: THREE.Color, accent: THREE.Color) {
  const livery = (y: number) => y < CARBON_LINE ? CARBON : team
  const chassisLivery = (y: number) => y < CHASSIS_CARBON_LINE ? CARBON : team
  const chassis = loft([
    { z: 1.62, halfWidth: 0.045, top: 0.15, bottom: 0.1 },
    { z: 1.36, halfWidth: 0.085, top: 0.19, bottom: 0.1 },
    { z: 1.0, halfWidth: 0.135, top: 0.25, bottom: 0.1 },
    { z: 0.6, halfWidth: 0.19, top: 0.33, bottom: 0.1 },
    { z: 0.25, halfWidth: 0.235, top: 0.39, bottom: 0.1 },
    { z: -0.05, halfWidth: 0.25, top: 0.42, bottom: 0.1 },
    { z: -0.32, halfWidth: 0.22, top: 0.54, bottom: 0.11 },
    { z: -0.62, halfWidth: 0.17, top: 0.45, bottom: 0.12 },
    { z: -1.0, halfWidth: 0.11, top: 0.33, bottom: 0.13 },
    { z: -1.3, halfWidth: 0.055, top: 0.25, bottom: 0.15 },
  ])
  const sidepods = [-1, 1].map((side) => loft([
    { z: 0.38, x: side * 0.37, halfWidth: 0.1, top: 0.31, bottom: 0.25 },
    { z: 0.26, x: side * 0.37, halfWidth: 0.17, top: 0.34, bottom: 0.12 },
    { z: -0.2, x: side * 0.35, halfWidth: 0.18, top: 0.32, bottom: 0.1 },
    { z: -0.6, x: side * 0.28, halfWidth: 0.13, top: 0.26, bottom: 0.1 },
    { z: -0.98, x: side * 0.17, halfWidth: 0.05, top: 0.19, bottom: 0.11 },
  ]))
  const cockpit = loft([
    { z: 0.2, halfWidth: 0.1, top: 0.425, bottom: 0.4 },
    { z: 0.05, halfWidth: 0.15, top: 0.43, bottom: 0.4 },
    { z: -0.2, halfWidth: 0.12, top: 0.43, bottom: 0.4 },
  ])
  const helmet = new THREE.SphereGeometry(0.085, 12, 8).translate(0, 0.47, -0.04)
  const airbox = loft([{ z: -0.2, halfWidth: 0.06, top: 0.56, bottom: 0.48 }, { z: -0.26, halfWidth: 0.07, top: 0.57, bottom: 0.47 }])
  const fin = plate([[-0.42, 0.5], [-1.2, 0.46], [-1.2, 0.34], [-0.42, 0.44]], 0.018)
  const floor = slab([[-0.16, 0.78], [0.16, 0.78], [0.5, 0.3], [0.6, -0.1], [0.58, -0.85], [0.4, -1.3], [-0.4, -1.3], [-0.58, -0.85], [-0.6, -0.1], [-0.5, 0.3]], 0.035, 0.06)
  const frontWing = [
    box([1.38, 0.025, 0.22], [0, 0.07, 1.47], 0.08),
    box([0.52, 0.022, 0.11], [0.43, 0.115, 1.4], -0.35), box([0.52, 0.022, 0.11], [-0.43, 0.115, 1.4], -0.35),
    box([0.46, 0.02, 0.09], [0.45, 0.16, 1.33], -0.6), box([0.46, 0.02, 0.09], [-0.45, 0.16, 1.33], -0.6),
  ]
  const frontEndplates = [-1, 1].map((side) => box([0.022, 0.13, 0.3], [side * 0.69, 0.11, 1.42]))
  const rearWing = [
    box([0.92, 0.03, 0.2], [0, 0.63, -1.3], -0.12),
    box([0.92, 0.024, 0.13], [0, 0.71, -1.43], -0.45),
    box([0.7, 0.02, 0.1], [0, 0.3, -1.4], -0.2),
  ]
  const rearEndplates = [-1, 1].map((side) => box([0.024, 0.38, 0.44], [side * 0.47, 0.56, -1.34]))
  const pylon = box([0.03, 0.24, 0.07], [0, 0.49, -1.25])
  const halo = [
    new THREE.TorusGeometry(0.19, 0.02, 6, 20, Math.PI * 1.55).rotateX(Math.PI / 2).rotateY(Math.PI * 0.275).translate(0, 0.54, -0.04),
    box([0.03, 0.12, 0.03], [0, 0.48, 0.17], 0.3),
  ]
  const mirrors = [-1, 1].map((side) => box([0.1, 0.035, 0.05], [side * 0.31, 0.44, 0.2]))
  const suspension = WHEEL_BASE.flatMap((z) => [-1, 1].flatMap((side) => [0.06, -0.06].map((offset) =>
    box([0.4, 0.018, 0.025], [side * 0.4, 0.22 + offset * 0.4, z + offset]))))
  return mergeGeometries([
    finish(chassis, chassisLivery), ...sidepods.map((pod) => finish(pod, livery)), finish(cockpit, CARBON, 'carbon'), finish(helmet, accent),
    finish(airbox, CARBON, 'carbon'), finish(fin, team), finish(floor, CARBON, 'carbon'),
    ...frontWing.map((part, index) => index ? finish(part, accent) : finish(part, CARBON, 'carbon')), ...frontEndplates.map((part) => finish(part, team)),
    ...rearWing.map((part, index) => index === 1 ? finish(part, accent) : finish(part, CARBON, 'carbon')), ...rearEndplates.map((part) => finish(part, team)),
    finish(pylon, CARBON, 'carbon'), ...halo.map((part) => finish(part, HALO, 'carbon')), ...mirrors.map((part) => finish(part, team)),
    ...suspension.map((part) => finish(part, CARBON, 'carbon')),
    ...createWheelParts(),
  ])
}

function createWheelParts() {
  return WHEEL_BASE.flatMap((z, axle) => {
    const { radius, width } = axle ? REAR_TYRE : FRONT_TYRE
    return [-1, 1].flatMap((side) => {
      const x = side * WHEEL_TRACK
      return [
        finish(tyre(radius, width).translate(x, radius, z), TYRE, 'rubber'),
        finish(new THREE.CylinderGeometry(radius * 0.63, radius * 0.63, width * 0.92, 16).rotateZ(Math.PI / 2).translate(x, radius, z), RIM, 'rim'),
        finish(new THREE.TorusGeometry(radius * 0.8, 0.012, 3, 14).rotateY(Math.PI / 2).translate(x + side * width / 2, radius, z), SIDEWALL, 'rubber'),
      ]
    })
  })
}

// Soft oval shadow that seats the car on the asphalt at any sun angle.
function createContactShadowTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(0,0,0,1)')
    gradient.addColorStop(0.55, 'rgba(0,0,0,0.6)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  return new THREE.CanvasTexture(canvas)
}

// Standard quality drops the clear coat, the most expensive part of the paint to shade.
export function createCarKit(isDetailed: boolean) {
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, map: createContactShadowTexture(), transparent: true, opacity: 0.55, depthWrite: false })
  const shadowGeometry = new THREE.PlaneGeometry(1.7, 3.5).rotateX(-Math.PI / 2).translate(0, 0.02, 0.02)

  const surfaces = createSurfaceTexture()
  const createCar = (driver: Driver) => {
    const team = new THREE.Color(driver.color)
    const accent = accentFor(driver, team)
    const finishes = { vertexColors: true, roughness: 1, metalness: 1, roughnessMap: surfaces, metalnessMap: surfaces, emissive: 0xffffff, emissiveIntensity: 0 }
    const paint = isDetailed
      ? new THREE.MeshPhysicalMaterial({ ...finishes, clearcoat: 1, clearcoatMap: surfaces, clearcoatRoughness: 0.08 })
      : new THREE.MeshStandardMaterial(finishes)
    const livery = { saturation: { value: 1 }, brightness: { value: 1 } }
    addShaderPatch(paint, 'lapped-livery-v1', (shader) => {
      Object.assign(shader.uniforms, { liverySaturation: livery.saturation, liveryBrightness: livery.brightness })
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float liveryLuminance = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
        diffuseColor.rgb = mix( vec3( liveryLuminance ), diffuseColor.rgb, liverySaturation ) * liveryBrightness;`)
      shader.fragmentShader = `uniform float liverySaturation;\nuniform float liveryBrightness;\n${shader.fragmentShader}`
    })
    // The night glow follows the livery colours rather than tinting carbon parts.
    addShaderPatch(paint, 'livery-glow-v1', (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= vColor.rgb;
        float liveryEmission = dot( totalEmissiveRadiance, vec3( 0.2126, 0.7152, 0.0722 ) );
        totalEmissiveRadiance = mix( vec3( liveryEmission ), totalEmissiveRadiance, liverySaturation ) * liveryBrightness;`)
    })
    const body = new THREE.Mesh(createBodyGeometry(team, accent), paint)
    body.castShadow = body.receiveShadow = true
    const rainLight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.02).translate(0, 0.21, -1.33), new THREE.MeshBasicMaterial({ color: RAIN_LIGHT_COLOR }))
    // Over-bright so the bloom pass picks the light out even under a grey sky.
    rainLight.material.color.multiplyScalar(RAIN_LIGHT_BOOST)
    rainLight.visible = false
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial)
    shadow.renderOrder = 1
    shadow.userData.skipsAmbientOcclusion = true
    const group = new THREE.Group()
    group.add(body, rainLight, shadow)
    group.visible = false
    return {
      group,
      paint,
      rainLight,
      setLapped: (isLapped: boolean) => {
        livery.saturation.value = isLapped ? 0.6 : 1
        livery.brightness.value = isLapped ? 0.82 : 1
      },
    }
  }
  return { createCar }
}
