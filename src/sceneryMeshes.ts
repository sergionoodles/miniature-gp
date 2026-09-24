import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { BuildingStyle, CircuitEnvironment, TreeKind } from './circuitEnvironments'
import { createFacadeTextures, createWaterNormalTexture, FACADE_BAYS, type FacadeKind } from './proceduralTextures'
import type { BuildingPlacement, GrovePlacement, TreePlacement, YachtPlacement } from './sceneryPlan'
import { box, createMergedMesh } from './sceneAssets'
import { addShaderPatch } from './shaderPatches'
import { createRandom, SIDE_DIRECTIONS, WATER_LEVEL, type TerrainField } from './terrainField'

const FAR_WATER_SIZE = 2000
// One facade bay (a window and its share of wall) in scene units.
const FACADE_BAY_SIZE = 1.5
const WATER_RIPPLE_SIZE = 18
const WATER_DRIFT = new THREE.Vector2(0.003, 0.0012)
const WATER_SEGMENTS = 128
const WINDOW_GLOW = 0xd8d8d8
const DEEP_WATER_SHADE = 0.75
const SHALLOW_DEPTH = 0.62
const SHALLOW_SEA = 0x4fb3ae
const SHALLOW_FRESH = 0x6f9a86
// Crowns darken toward their underside, a baked stand-in for self-shadowing inside the canopy.
const CROWN_SHADE: [number, number] = [0.55, 1.08]

const TREE_COLORS: Record<TreeKind, number[]> = {
  broadleaf: [0x5c7a4a, 0x6f8552, 0x3f6849, 0x8a9660],
  conifer: [0x2f5a45, 0x3a6246, 0x2a4d3d, 0x46694a],
  palm: [0x6c9448, 0x7ca052, 0x5a8445, 0x8aa85b],
  scrub: [0x839060, 0x8f9868, 0x6f8157, 0x9ca472],
}
const GROVE_COLORS: Record<TreeKind, number[]> = {
  broadleaf: [0x4a6e4c, 0x5f7c55, 0x3b5f45],
  conifer: [0x2c513f, 0x365e45, 0x25473a],
  palm: [0x5f864a, 0x6d9352, 0x587b44],
  scrub: [0x78855b, 0x858f63, 0x6c7954],
}
const BUILDING_COLORS: Record<BuildingStyle, number[]> = {
  towers: [0xa9bac4, 0x8b9eab, 0xc8d2d6, 0x7a8d99],
  lowrise: [0xe0d6c2, 0xd2c1a6, 0xebe5d8, 0xc4b196],
  industrial: [0xb8bcb8, 0xa2a8a8, 0xcdc8bb, 0xb1b3aa],
  stone: [0xe6d9b8, 0xdccba4, 0xd2c09a, 0xece2c8],
  riviera: [0xf3e1c6, 0xeccdaf, 0xf6eee0, 0xe6c2a4],
  resort: [0xf5f2ea, 0xe9e4d6, 0xd6e0e3, 0xede8de],
  casino: [0xedd9b4, 0xd1b06f, 0x98abb8, 0xc0685a],
}
const FACADES: Record<BuildingStyle, FacadeKind> = {
  towers: 'glass', casino: 'glass', lowrise: 'punched', stone: 'punched', resort: 'punched', industrial: 'bands', riviera: 'shutters',
}
const PITCHED_ROOFS = new Set<BuildingStyle>(['riviera', 'stone', 'lowrise'])
const ROOF_COLORS: Record<'flat' | 'pitched', number[]> = { flat: [0x6f7472, 0x7d817d, 0x5f6563], pitched: [0xb4604a, 0xa65a45, 0xc0714f] }

function createInstances(geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], colors?: THREE.Color[]) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length)
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
  colors?.forEach((color, index) => mesh.setColorAt(index, color))
  return mesh
}

function composeMatrix(position: [number, number, number], scale: [number, number, number], rotation = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation), new THREE.Vector3(...scale))
}

// Grey vertex colours (multiplied with the instance tint) shading a crown from underside to top.
function shadeByHeight(geometry: THREE.BufferGeometry, variation: (index: number) => number = () => 1) {
  geometry.computeBoundingBox()
  const { min, max } = geometry.boundingBox ?? new THREE.Box3()
  const positions = geometry.getAttribute('position')
  const colors = new Float32Array(positions.count * 3)
  for (let index = 0; index < positions.count; index++) {
    const shade = THREE.MathUtils.lerp(CROWN_SHADE[0], CROWN_SHADE[1], THREE.MathUtils.smoothstep(positions.getY(index), min.y, max.y)) * variation(index)
    colors.set([shade, shade, shade], index * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

// Several overlapping spheres with rounded normals: a canopy silhouette instead of a single blob.
// Only the first, largest lobe gets the finer mesh; the side lobes stay low-poly to keep
// thousands of trees within the triangle budget.
function lobedCrown(lobes: [number, number, number, number][], mainDetail: number) {
  const parts = lobes.map(([x, y, z, radius], lobe) => {
    const sphere = new THREE.IcosahedronGeometry(1, lobe ? 0 : mainDetail)
    const positions = sphere.getAttribute('position')
    const normals = sphere.getAttribute('normal')
    for (let index = 0; index < positions.count; index++) {
      const normal = new THREE.Vector3(positions.getX(index), positions.getY(index), positions.getZ(index)).normalize()
      normals.setXYZ(index, normal.x, normal.y, normal.z)
    }
    return sphere.scale(radius, radius, radius).translate(x, y, z)
  })
  const counts = parts.map((part) => part.getAttribute('position').count)
  const merged = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  const lobeOf = (index: number) => {
    let remaining = index
    for (let lobe = 0; lobe < counts.length; lobe++) {
      if (remaining < counts[lobe]) return lobe
      remaining -= counts[lobe]
    }
    return 0
  }
  return shadeByHeight(merged, (index) => 1 - lobeOf(index) % 2 * 0.06)
}

function tieredCone(tiers: number, segments: number) {
  const parts = Array.from({ length: tiers }, (_, tier) => {
    const share = tier / tiers
    return new THREE.ConeGeometry(1 - share * 0.55, 1.2 / tiers * 1.5, segments).translate(0, share * 0.95 - 0.3, 0)
  })
  const merged = mergeGeometries(parts.map((part) => part.toNonIndexed()))
  parts.forEach((part) => part.dispose())
  merged.computeVertexNormals()
  return shadeByHeight(merged)
}

// Drooping fronds radiating from the crown of a palm.
function palmFronds(count: number) {
  const parts = Array.from({ length: count }, (_, frond) => {
    const leaf = new THREE.PlaneGeometry(1, 0.34, 4, 1).translate(0.5, 0, 0)
    const positions = leaf.getAttribute('position')
    for (let index = 0; index < positions.count; index++) {
      const along = positions.getX(index)
      const across = positions.getY(index) * (1 - along * 0.7)
      positions.setXYZ(index, along, 0.35 * along - 0.75 * along * along, across)
    }
    leaf.rotateY(frond / count * Math.PI * 2 + (frond % 2) * 0.2)
    return leaf.toNonIndexed()
  })
  const merged = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  merged.deleteAttribute('uv')
  merged.computeVertexNormals()
  return shadeByHeight(merged)
}

// Per-kind crown shape; the crown is scaled by the tree's size and lifted to crownHeight × size.
type TreeShape = { crown: (isDetailed: boolean) => THREE.BufferGeometry; scale: [number, number, number]; crownHeight: number; trunk?: { scale: [number, number, number]; height: number }; isDoubleSided?: boolean }
const TREE_SHAPES: Record<TreeKind, TreeShape> = {
  broadleaf: { crown: (isDetailed) => lobedCrown(isDetailed ? [[0, 0, 0, 1], [0.55, 0.25, 0.25, 0.72], [-0.5, 0.2, -0.3, 0.7], [0.1, 0.62, -0.2, 0.62]] : [[0, 0, 0, 1], [0.5, 0.3, 0.1, 0.72]], isDetailed ? 1 : 0), scale: [1.2, 1.35, 1.15], crownHeight: 2.6, trunk: { scale: [1, 1, 1], height: 0.6 } },
  conifer: { crown: (isDetailed) => tieredCone(isDetailed ? 3 : 2, isDetailed ? 8 : 6), scale: [1, 3.2, 1], crownHeight: 2.5, trunk: { scale: [0.8, 0.6, 0.8], height: 0.4 } },
  palm: { crown: (isDetailed) => palmFronds(isDetailed ? 9 : 6), scale: [1.9, 1.3, 1.9], crownHeight: 3.35, trunk: { scale: [0.45, 1.65, 0.45], height: 1.65 }, isDoubleSided: true },
  scrub: { crown: () => lobedCrown([[0, 0, 0, 1], [0.7, -0.1, 0.3, 0.7], [-0.6, -0.1, -0.2, 0.75]], 0), scale: [1.1, 0.5, 1.05], crownHeight: 0.55 },
}
// Standard quality renders the background woods as single lobes and cones.
const SIMPLE_GROVE = (kind: TreeKind) => kind === 'conifer' ? tieredCone(1, 5) : lobedCrown([[0, 0, 0, 1]], 0)
const GROVE_SHAPES: Record<TreeKind, () => THREE.BufferGeometry> = {
  broadleaf: () => lobedCrown([[0, 0, 0, 1], [0.5, 0.2, 0.3, 0.72]], 0),
  conifer: () => tieredCone(2, 5),
  palm: () => lobedCrown([[0, 0, 0, 1], [0.5, -0.1, 0.3, 0.7]], 0),
  scrub: () => lobedCrown([[0, 0, 0, 1], [0.6, -0.1, 0.3, 0.7]], 0),
}

function softDiscTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  return new THREE.CanvasTexture(canvas)
}

// Foliage covers much of the screen, so standard quality shades it with the cheaper Lambert model.
function foliageMaterial(isDetailed: boolean, parameters: THREE.MeshStandardMaterialParameters) {
  const { roughness, metalness, ...shared } = parameters
  return isDetailed ? new THREE.MeshStandardMaterial({ ...shared, roughness, metalness }) : new THREE.MeshLambertMaterial(shared as THREE.MeshLambertMaterialParameters)
}

export function addTrees(scene: THREE.Scene, trees: TreePlacement[], isDetailed: boolean) {
  const trunkMaterial = foliageMaterial(isDetailed, { color: 0x6a5c49, roughness: 1 })
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x1f3324, alphaMap: softDiscTexture(), transparent: true, opacity: 0.32, depthWrite: false })
  const kinds = [...new Set(trees.map(({ kind }) => kind))]
  for (const kind of kinds) {
    const group = trees.filter((tree) => tree.kind === kind)
    const shape = TREE_SHAPES[kind]
    const material = foliageMaterial(isDetailed, { vertexColors: true, roughness: 0.92, side: shape.isDoubleSided ? THREE.DoubleSide : THREE.FrontSide })
    const crowns = createInstances(shape.crown(isDetailed), material,
      group.map(({ x, y, z, size, rotation }) => composeMatrix([x, y + shape.crownHeight * size, z], [shape.scale[0] * size, shape.scale[1] * size, shape.scale[2] * size], rotation)),
      group.map(({ tint }) => new THREE.Color(TREE_COLORS[kind][tint])))
    crowns.castShadow = true
    crowns.receiveShadow = true
    scene.add(crowns)
    const discs = createInstances(new THREE.CircleGeometry(2, 10).rotateX(-Math.PI / 2), shadowMaterial,
      group.map(({ x, y, z, size }) => composeMatrix([x, y + 0.05, z], [size, size, size])))
    discs.userData.skipsAmbientOcclusion = true
    scene.add(discs)
    const { trunk } = shape
    if (!trunk) continue
    const trunks = createInstances(new THREE.CylinderGeometry(0.12, 0.22, 2, 6), trunkMaterial,
      group.map(({ x, y, z, size }) => composeMatrix([x, y + trunk.height * size, z], [trunk.scale[0] * size, trunk.scale[1] * size, trunk.scale[2] * size])))
    trunks.castShadow = true
    scene.add(trunks)
  }
}

export function addGroves(scene: THREE.Scene, groves: GrovePlacement[], isDetailed: boolean) {
  const kinds = [...new Set(groves.map(({ kind }) => kind))]
  for (const kind of kinds) {
    const group = groves.filter((grove) => grove.kind === kind)
    const isConifer = kind === 'conifer'
    const mesh = createInstances(isDetailed ? GROVE_SHAPES[kind]() : SIMPLE_GROVE(kind), foliageMaterial(isDetailed, { vertexColors: true, roughness: 0.95 }),
      group.map(({ x, y, z, spread, height, rotation }) => composeMatrix([x, y + height * (isConifer ? 0.45 : 0.55), z], [spread, isConifer ? height * 1.4 : height * 0.85, spread], rotation)),
      group.map(({ tint }) => new THREE.Color(GROVE_COLORS[kind][tint])))
    mesh.receiveShadow = true
    scene.add(mesh)
  }
}

// Windows keep a constant real size on every building: the facade UVs are rescaled from each
// instance's own width, depth and height instead of stretching one tile over the whole face.
function scaleFacadeInPlace(material: THREE.MeshStandardMaterial) {
  addShaderPatch(material, 'facade-scale-v1', (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_INSTANCING
        vec3 facadeScale = vec3( length( instanceMatrix[0].xyz ), length( instanceMatrix[1].xyz ), length( instanceMatrix[2].xyz ) );
        vec2 facadeSize = abs( normal.x ) > 0.5 ? facadeScale.zy : abs( normal.z ) > 0.5 ? facadeScale.xy : vec2( 0.0 );
        // Whole-bay offsets from the building's position, so neighbours show different lit windows.
        vec2 facadeShift = floor( fract( instanceMatrix[3].xz * vec2( 0.1371, 0.2917 ) ) * ${FACADE_BAYS.toFixed(1)} ) / ${FACADE_BAYS.toFixed(1)};
        vec2 facadeUv = uv * facadeSize / ${(FACADE_BAYS * FACADE_BAY_SIZE).toFixed(2)} + facadeShift;
        #ifdef USE_MAP
          vMapUv = facadeUv;
        #endif
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = facadeUv;
        #endif
      #endif`)
  })
}

function prismRoof() {
  const shape = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)])
  return new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5)
}

// Returns the window materials so the caller can light them at night.
export function addBuildings(scene: THREE.Scene, buildings: BuildingPlacement[], seed: string) {
  if (!buildings.length) return []
  const random = createRandom(`${seed}:rooftops`)
  const windowMaterials: THREE.MeshStandardMaterial[] = []
  const styles = [...new Set(buildings.map(({ style }) => style))]
  for (const style of styles) {
    const group = buildings.filter((building) => building.style === style)
    const kind = FACADES[style]
    const { color, lights } = createFacadeTextures(kind, `${seed}:${style}`)
    const isGlass = kind === 'glass'
    const material = new THREE.MeshStandardMaterial({ map: color, emissive: WINDOW_GLOW, emissiveMap: lights, emissiveIntensity: 0, roughness: isGlass ? 0.22 : 0.8, metalness: isGlass ? 0.2 : 0 })
    scaleFacadeInPlace(material)
    windowMaterials.push(material)
    const bodies = createInstances(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), material,
      group.map(({ x, y, z, width, depth, height, rotation }) => composeMatrix([x, y, z], [width, height, depth], rotation)),
      group.map(({ tint }) => new THREE.Color(BUILDING_COLORS[style][tint])))
    bodies.castShadow = bodies.receiveShadow = true
    scene.add(bodies)
  }
  const flat = buildings.filter(({ style }) => !PITCHED_ROOFS.has(style))
  const pitched = buildings.filter(({ style }) => PITCHED_ROOFS.has(style))
  const roofMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85 })
  if (flat.length) {
    const caps = createInstances(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), roofMaterial,
      flat.map(({ x, y, z, width, depth, height, rotation }) => composeMatrix([x, y + height, z], [width + 0.2, 0.22, depth + 0.2], rotation)),
      flat.map((_, index) => new THREE.Color(ROOF_COLORS.flat[index % 3])))
    caps.receiveShadow = caps.castShadow = true
    // Plant rooms, vents and water tanks break up the flat roofs seen from above.
    const units = flat.flatMap(({ x, y, z, width, depth, height, rotation }) => Array.from({ length: 1 + Math.floor(random() * 3) }, () => {
      const offset = new THREE.Vector3((random() - 0.5) * width * 0.6, 0, (random() - 0.5) * depth * 0.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation)
      const size = 0.5 + random() * Math.min(width, depth) * 0.25
      return composeMatrix([x + offset.x, y + height + 0.2, z + offset.z], [size, 0.3 + random() * 0.6, size * (0.6 + random() * 0.8)], rotation)
    }))
    const rooftop = createInstances(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xc3c6c4, roughness: 0.6, metalness: 0.3 }), units)
    rooftop.castShadow = rooftop.receiveShadow = true
    scene.add(caps, rooftop)
  }
  if (pitched.length) {
    const roofs = createInstances(prismRoof(), roofMaterial.clone(),
      pitched.map(({ x, y, z, width, depth, height, rotation }) => {
        const isAlongWidth = width >= depth
        return composeMatrix([x, y + height, z], [isAlongWidth ? depth + 0.2 : width + 0.2, Math.min(width, depth) * 0.32, isAlongWidth ? width + 0.2 : depth + 0.2], rotation + (isAlongWidth ? Math.PI / 2 : 0))
      }),
      pitched.map((_, index) => new THREE.Color(ROOF_COLORS.pitched[index % 3])))
    roofs.castShadow = roofs.receiveShadow = true
    scene.add(roofs)
  }
  return windowMaterials
}

// Returns an update that drifts the ripple normals, so open water shimmers under the sky.
export function addWater(scene: THREE.Scene, field: TerrainField, environment: CircuitEnvironment, isDetailed: boolean) {
  const hasWater = field.pools.length > 0 || environment.water.features.some(({ kind }) => kind !== 'lake' && kind !== 'ponds')
  if (!hasWater) return () => {}
  const ripples = createWaterNormalTexture()
  // Standard quality keeps the shallows colouring but drops the rippling reflections.
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: isDetailed ? 0.2 : 0.5, metalness: 0.05, normalMap: isDetailed ? ripples : null, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: isDetailed ? 0.8 : 0.4 })
  const deep = new THREE.Color(environment.water.color).multiplyScalar(DEEP_WATER_SHADE)
  const shallow = new THREE.Color(environment.water.features.some(({ kind }) => kind === 'coast') ? SHALLOW_SEA : SHALLOW_FRESH)
  // The terrain dips below this plane wherever the field reports water; beyond the terrain the
  // sea extends on its shoreline sides.
  const planes = [{ width: field.width, depth: field.depth, x: 0, z: 0, segments: WATER_SEGMENTS }]
  for (const { side, position } of field.shorelines) {
    const [directionX, directionZ] = SIDE_DIRECTIONS[side]
    const center = position + FAR_WATER_SIZE / 4
    planes.push({ width: directionX ? FAR_WATER_SIZE / 2 : FAR_WATER_SIZE, depth: directionZ ? FAR_WATER_SIZE / 2 : FAR_WATER_SIZE, x: directionX * center, z: directionZ * center, segments: 1 })
  }
  for (const plane of planes) {
    const geometry = new THREE.PlaneGeometry(plane.width, plane.depth, plane.segments, plane.segments).rotateX(-Math.PI / 2)
    const positions = geometry.getAttribute('position')
    const uvs = geometry.getAttribute('uv')
    const colors = new Float32Array(positions.count * 3)
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index) + plane.x
      const z = positions.getZ(index) + plane.z
      // World-space UVs keep the ripples the same size on every plane.
      uvs.setXY(index, x / WATER_RIPPLE_SIZE, z / WATER_RIPPLE_SIZE)
      // Shallows over the shelving bed read lighter, so every shore gets a turquoise fringe.
      const depth = plane.segments > 1 ? WATER_LEVEL - field.sample(x, z).height : Infinity
      const color = deep.clone().lerp(shallow, 1 - THREE.MathUtils.smoothstep(depth, 0, SHALLOW_DEPTH))
      colors.set([color.r, color.g, color.b], index * 3)
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(plane.x, WATER_LEVEL, plane.z)
    mesh.receiveShadow = true
    scene.add(mesh)
  }
  if (!isDetailed) {
    ripples.dispose()
    return () => {}
  }
  return (deltaSeconds: number) => { ripples.offset.addScaledVector(WATER_DRIFT, Math.min(deltaSeconds, 0.1) * 60) }
}

export function addYachts(scene: THREE.Scene, yachts: YachtPlacement[]) {
  if (!yachts.length) return
  const hulls: THREE.BufferGeometry[] = []
  const decks: THREE.BufferGeometry[] = []
  const cabins: THREE.BufferGeometry[] = []
  const shape = new THREE.Shape([new THREE.Vector2(-0.5, -1.6), new THREE.Vector2(0.5, -1.6), new THREE.Vector2(0.5, 0.9), new THREE.Vector2(0, 1.7), new THREE.Vector2(-0.5, 0.9)])
  for (const { x, z, rotation, size } of yachts) {
    const matrix = composeMatrix([x, WATER_LEVEL, z], [size, size, size], rotation)
    hulls.push(new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.06, bevelSegments: 1 }).rotateX(-Math.PI / 2).translate(0, -0.05, 0).applyMatrix4(matrix))
    decks.push(box([0.78, 0.04, 2.3], [0, 0.44, -0.2]).applyMatrix4(matrix).toNonIndexed())
    cabins.push(box([0.6, 0.3, 1.1], [0, 0.6, -0.25]).applyMatrix4(matrix).toNonIndexed(), box([0.46, 0.22, 0.6], [0, 0.86, -0.35]).applyMatrix4(matrix).toNonIndexed())
  }
  const strip = (parts: THREE.BufferGeometry[]) => parts.map((part) => { part.deleteAttribute('uv'); return part })
  scene.add(createMergedMesh(strip(hulls), new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.3 })))
  scene.add(createMergedMesh(strip(decks), new THREE.MeshStandardMaterial({ color: 0xb58a5a, roughness: 0.6 })))
  scene.add(createMergedMesh(strip(cabins), new THREE.MeshStandardMaterial({ color: 0x30414d, roughness: 0.15, metalness: 0.5 })))
}
