import * as THREE from 'three'
import { createLabel } from './sceneAssets'
import type { Driver } from './replay'

export function createDriverDot(driver: Driver) {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), new THREE.MeshBasicMaterial({ color: driver.color, toneMapped: false }))
  dot.visible = false
  return dot
}

export function createGhost(driver: Driver) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 160
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#d4e5eb'
    context.beginPath()
    context.moveTo(26, 90)
    context.lineTo(26, 47)
    context.arc(64, 47, 38, Math.PI, 0)
    context.lineTo(102, 90)
    context.lineTo(89, 80)
    context.lineTo(77, 90)
    context.lineTo(64, 80)
    context.lineTo(51, 90)
    context.lineTo(39, 80)
    context.closePath()
    context.fill()
    context.fillStyle = '#14232b'
    context.beginPath()
    context.ellipse(50, 47, 5, 8, 0, 0, Math.PI * 2)
    context.ellipse(78, 47, 5, 8, 0, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#d4e5eb'
    context.font = 'bold 25px monospace'
    context.textAlign = 'center'
    context.fillText(driver.code, 64, 129)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const ghost = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.8, depthTest: false, toneMapped: false }))
  ghost.scale.set(3.2, 4, 1)
  ghost.visible = false
  ghost.renderOrder = 5
  return ghost
}

export function positionGhostInPlace(ghost: THREE.Sprite, location: THREE.Vector3, track: THREE.Vector3[]) {
  const nearest = track.reduce((best, point, index) => point.distanceToSquared(location) < track[best].distanceToSquared(location) ? index : best, 0)
  const center = track[nearest]
  const tangent = track[(nearest + 1) % track.length].clone().sub(track[(nearest - 1 + track.length) % track.length]).normalize()
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x)
  if (normal.dot(center) < 0) normal.negate()
  ghost.position.copy(center).addScaledVector(normal, 5.5).setY(3)
}

export function createDriverLabels(drivers: Driver[], scene: THREE.Scene) {
  return new Map(drivers.map((driver) => {
    const label = createLabel(`${driver.code}  ${driver.number}`)
    label.visible = false
    scene.add(label)
    return [driver.number, label] as const
  }))
}

export function createHoverIsolation(scene: THREE.Scene, cars: Map<number, THREE.Group>, dots: Map<number, THREE.Mesh>) {
  const owners = new Map<THREE.Material, number>()
  cars.forEach((car, number) => car.traverse((part) => {
    if (part instanceof THREE.Mesh && !Array.isArray(part.material)) owners.set(part.material, number)
  }))
  dots.forEach((dot, number) => { if (!Array.isArray(dot.material)) owners.set(dot.material, number) })
  const uniforms = new Map<THREE.Material, { value: number }>()
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material: THREE.Material) => {
      if (uniforms.has(material)) return
      const saturation = { value: 1 }
      uniforms.set(material, saturation)
      material.onBeforeCompile = (shader) => {
        shader.uniforms.driverSaturation = saturation
        shader.fragmentShader = `uniform float driverSaturation;\n${shader.fragmentShader}`.replace('#include <fog_fragment>', `#include <fog_fragment>
          float luminance = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          gl_FragColor.rgb = mix(vec3(luminance), gl_FragColor.rgb, driverSaturation);`)
      }
      material.customProgramCacheKey = () => 'driver-isolation-v1'
    })
  })
  return (driver: number | null) => {
    uniforms.forEach((uniform, material) => { uniform.value = driver === null || owners.get(material) === driver ? 1 : 0 })

  }
}
