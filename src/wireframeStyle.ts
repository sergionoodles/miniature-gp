import * as THREE from 'three'
import { addShaderPatch } from './shaderPatches'
import { createWireframeWater } from './wireframeWater'

// The wireframe look redraws the realistic world in greys: every solid becomes a dark fill with
// a pale outline, the ground a faint grid and the track a bright white outline, leaving the cars
// as the only colour in the scene. Builders mark the surfaces that need their own treatment with
// `userData.wireframeRole` on the mesh or material.
type WireframeRole = 'ground' | 'water' | 'road' | 'road-paint' | 'runoff' | 'kerb'

export const WIREFRAME_BACKGROUND = 0x030405
export const WIREFRAME_MARKER_COLOR = 0xf2f6f7
const FILL = 0x050608
const ROAD_FILL = 0x0c0e11
// Creases sharper than this are outlined; gentler ones (curved hulls, sloping ribbons) are not.
const EDGE_ANGLE = 28
// Scenery outlines are greys whose brightness follows the object's own lightness, so dark foliage
// recedes behind pale concrete; all stay dim enough for the track and cars to carry the glow.
const SCENERY_LINE_GREY: [number, number] = [0.14, 0.4]
const ROAD_EDGE_GREY = 0.95
// Kerbs keep their red and white blocks, dimmed so they accent the corners without glowing.
const KERB_GREY = 0.6
// Instanced parts smaller than this (seats, spectators) light up as grey pixels instead of being outlined.
const PIXEL_EXTENT = 0.5
const PIXEL_GREY: [number, number] = [0.12, 0.42]
const grey = (value: number) => new THREE.Color(value, value, value)

const GRID_FUNCTIONS = /* glsl */ `
uniform vec3 gridMinor;
uniform vec3 gridMajor;
uniform vec3 gridContour;
uniform vec2 gridFade;
uniform float gridCell;
uniform float gridMajorEvery;
uniform float contourStep;
varying vec3 vGridPosition;
// One screen pixel wide at any zoom: the distance to the nearest line is measured in pixels.
float gridLine( vec2 coord ) {
  vec2 distance = abs( fract( coord - 0.5 ) - 0.5 ) / max( fwidth( coord ), vec2( 1e-4 ) );
  vec2 line = 1.0 - min( distance, 1.0 );
  return max( line.x, line.y );
}
float contourLine( float value ) {
  float distance = abs( fract( value ) - 0.5 ) / max( fwidth( value ), 1e-4 );
  return 1.0 - min( distance, 1.0 );
}
`

type GridLook = { fill: number; minor: THREE.Color; major: THREE.Color; contour: THREE.Color; cell: number; majorEvery: number; fadeRadius: number }

const CONTOUR_STEP = 1.6
// Contours start above the circuit's flat ground, so they trace hills and mountains only.
const CONTOUR_FLOOR = 0.4
const FADE_REACH = 2.4

// A dark surface carrying a world-space grid and height contours that fade out with distance, so
// the world dissolves into the void instead of ending at the terrain's edge.
function createGridMaterial({ fill, minor, major, contour, cell, majorEvery, fadeRadius }: GridLook) {
  const material = new THREE.MeshBasicMaterial({ color: fill })
  const uniforms = {
    gridMinor: { value: minor }, gridMajor: { value: major }, gridContour: { value: contour },
    gridFade: { value: new THREE.Vector2(fadeRadius, fadeRadius * FADE_REACH) },
    gridCell: { value: cell }, gridMajorEvery: { value: majorEvery }, contourStep: { value: CONTOUR_STEP },
  }
  addShaderPatch(material, 'wireframe-grid-v1', (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = `varying vec3 vGridPosition;\n${shader.vertexShader}`.replace('#include <project_vertex>', `#include <project_vertex>
      vGridPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`)
    shader.fragmentShader = `${GRID_FUNCTIONS}\n${shader.fragmentShader}`.replace('#include <opaque_fragment>', `
      vec2 gridCoord = vGridPosition.xz / gridCell;
      float minorLine = gridLine( gridCoord );
      float majorLine = gridLine( gridCoord / gridMajorEvery );
      float contour = contourLine( vGridPosition.y / contourStep ) * step( ${CONTOUR_FLOOR.toFixed(2)}, vGridPosition.y );
      float gridVisibility = 1.0 - smoothstep( gridFade.x, gridFade.y, length( vGridPosition.xz ) );
      outgoingLight += ( gridMinor * minorLine + max( gridMajor * majorLine, gridContour * contour ) ) * gridVisibility;
      #include <opaque_fragment>`)
  })
  return material
}

export function sceneryLineColor(color: THREE.Color) {
  const { l } = color.getHSL({ h: 0, s: 0, l: 0 })
  return grey(THREE.MathUtils.lerp(...SCENERY_LINE_GREY, l))
}

// Spectators keep their shirts' lightness but lose the colour.
function greyInstanceColorsInPlace(mesh: THREE.InstancedMesh) {
  const color = new THREE.Color()
  for (let index = 0; index < mesh.count; index++) {
    mesh.getColorAt(index, color)
    mesh.setColorAt(index, grey(THREE.MathUtils.lerp(...PIXEL_GREY, color.getHSL({ h: 0, s: 0, l: 0 }).l)))
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

function averageColor(colors: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  const sum = new THREE.Color(0, 0, 0)
  for (let index = 0; index < colors.count; index++) {
    sum.r += colors.getX(index)
    sum.g += colors.getY(index)
    sum.b += colors.getZ(index)
  }
  return sum.multiplyScalar(1 / Math.max(colors.count, 1))
}

// The colour a viewer would call the object's own: material colour, tinted by its vertex or
// instance colours.
function sourceColor(mesh: THREE.Mesh, material: THREE.Material) {
  const color = 'color' in material && material.color instanceof THREE.Color ? material.color.clone() : new THREE.Color(1, 1, 1)
  const vertexColors = mesh.geometry.getAttribute('color')
  if (material.vertexColors && vertexColors) color.multiply(averageColor(vertexColors))
  if (mesh instanceof THREE.InstancedMesh && mesh.instanceColor) color.multiply(new THREE.Color().fromBufferAttribute(mesh.instanceColor, 0))
  return color
}

function instanceExtent(mesh: THREE.InstancedMesh) {
  mesh.geometry.computeBoundingSphere()
  const matrix = new THREE.Matrix4()
  mesh.getMatrixAt(0, matrix)
  return (mesh.geometry.boundingSphere?.radius ?? 0) * matrix.getMaxScaleOnAxis()
}

// Three.js has no instanced lines, so each instance's outline is baked into one line mesh.
function bakeInstanceEdges(edges: THREE.BufferGeometry, mesh: THREE.InstancedMesh) {
  const source = edges.getAttribute('position')
  const positions = new Float32Array(source.count * 3 * mesh.count)
  const matrix = new THREE.Matrix4()
  const point = new THREE.Vector3()
  for (let instance = 0; instance < mesh.count; instance++) {
    mesh.getMatrixAt(instance, matrix)
    for (let index = 0; index < source.count; index++) {
      point.fromBufferAttribute(source, index).applyMatrix4(matrix)
      positions.set([point.x, point.y, point.z], (instance * source.count + index) * 3)
    }
  }
  edges.dispose()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geometry
}

export function createEdgeLines(geometry: THREE.BufferGeometry, material: THREE.LineBasicMaterial) {
  const lines = new THREE.LineSegments<THREE.BufferGeometry>(new THREE.EdgesGeometry(geometry, EDGE_ANGLE), material)
  // Lines would otherwise catch clicks a unit away and shadow the car under the pointer.
  lines.raycast = () => {}
  return lines
}

function outline(mesh: THREE.Mesh, material: THREE.LineBasicMaterial) {
  const lines = createEdgeLines(mesh.geometry, material)
  if (mesh instanceof THREE.InstancedMesh) lines.geometry = bakeInstanceEdges(lines.geometry, mesh)
  mesh.add(lines)
}

// The fill sits a little behind its outline, so coplanar edges always win the depth test.
export function createFillMaterial(color: THREE.ColorRepresentation) {
  return new THREE.MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
}

function disposeReplaced(replaced: Set<THREE.Material>, kept: Set<THREE.Texture>) {
  const textures = new Set<THREE.Texture>()
  replaced.forEach((material) => {
    Object.values(material).forEach((value: unknown) => { if (value instanceof THREE.Texture && !kept.has(value)) textures.add(value) })
    material.dispose()
  })
  textures.forEach((texture) => texture.dispose())
}

// `extent` is the circuit's radius; the ground grid and the water lines fade out beyond it.
// Returns an update that animates the water.
export function restyleAsWireframe(scene: THREE.Scene, extent: number) {
  const meshes: THREE.Mesh[] = []
  scene.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object) })
  const ground = createGridMaterial({ fill: WIREFRAME_BACKGROUND, minor: grey(0.035), major: grey(0.09), contour: grey(0.16), cell: 4, majorEvery: 5, fadeRadius: extent })
  const water = createWireframeWater(extent, extent * FADE_REACH)
  const fill = createFillMaterial(FILL)
  const roadFill = createFillMaterial(ROAD_FILL)
  const roadEdge = new THREE.LineBasicMaterial({ color: grey(ROAD_EDGE_GREY) })
  const pixel = new THREE.MeshBasicMaterial()
  const lineMaterials = new Map<number, THREE.LineBasicMaterial>()
  const lineFor = (color: THREE.Color) => {
    const line = sceneryLineColor(color)
    const key = line.getHex()
    const material = lineMaterials.get(key) ?? new THREE.LineBasicMaterial({ color: line })
    lineMaterials.set(key, material)
    return material
  }
  const replaced = new Set<THREE.Material>()
  const kept = new Set<THREE.Texture>()
  for (const mesh of meshes) {
    const original = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const materials: THREE.Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((material) => replaced.add(material))
    const role: WireframeRole | undefined = mesh.userData.wireframeRole ?? original.userData.wireframeRole
    mesh.castShadow = mesh.receiveShadow = false
    // Flat decals (soft contact shadows) have nothing to outline.
    if (mesh.userData.skipsAmbientOcclusion || role === 'road-paint' || role === 'runoff') {
      mesh.visible = false
      continue
    }
    if (role === 'ground' || role === 'water') {
      mesh.material = role === 'ground' ? ground : water.material
      continue
    }
    if (role === 'kerb') {
      const map = original instanceof THREE.MeshStandardMaterial ? original.map : null
      if (map) kept.add(map)
      mesh.material = new THREE.MeshBasicMaterial({ color: grey(KERB_GREY), map })
      continue
    }
    if (role === 'road') {
      mesh.material = roadFill
      outline(mesh, roadEdge)
      continue
    }
    if (mesh instanceof THREE.InstancedMesh && mesh.instanceColor && instanceExtent(mesh) < PIXEL_EXTENT) {
      greyInstanceColorsInPlace(mesh)
      mesh.material = pixel
      continue
    }
    const color = sourceColor(mesh, original)
    mesh.material = fill
    outline(mesh, lineFor(color))
  }
  disposeReplaced(replaced, kept)
  return { updateWater: water.update }
}
