import * as THREE from 'three'
import { createRibbonGeometry, roadSideRoom, startingGridLocations } from './circuitGeometry'
import { createAdvertisingTexture, createAsphaltTextures, createGravelTexture, createKerbTexture, createVergeTexture } from './proceduralTextures'
import { box, createLabel, createMergedMesh } from './sceneAssets'
import { createBridgeWallGeometry, type TrackCrossing } from './trackCrossings'

export const TRACK_WIDTH = 3.2
const EDGE_LINE_WIDTH = 0.11
const KERB_OFFSET = 1.83
const KERB_WIDTH = 0.4
// A kerb needs this much room on its side so it stays clear of a neighbouring section's asphalt,
// which reaches up to half a track width back from the far end of the shared gap.
const KERB_ROOM = (KERB_OFFSET + KERB_WIDTH / 2 + TRACK_WIDTH / 2) / 2
// One red and one white block per texture repeat.
const KERB_REPEAT_LENGTH = 1.3
const KERB_TAPER_SAMPLES = 3
const MIN_KERB_SAMPLES = 4
const VERGE_WIDTH = 4.5
// Gravel traps open up on the outside of corners and fade back to verge along the straights.
const GRAVEL_REACH = 5
const CORNER_BLEND_SAMPLES = 14
const STRAIGHT_COSINE = 0.985
const CORNER_WINDOW = 10
const BARRIER_OFFSET = 5.4
const BARRIER_HEIGHT = 0.46
const BARRIER_THICKNESS = 0.14
const MIN_BARRIER_SAMPLES = 16
const SAME_PASS_SAMPLES = 20
// How much closer than its offset a strip may come to its own track before it counts as folded.
const OFFSET_TOLERANCE = 0.15
// Extra distance a strip keeps from other passes, so strips from neighbouring sections never meet.
const OTHER_PASS_MARGIN = 0.3
const RUN_END_TRIM = 2
const FRAME_WINDOW = 5
// Cosine of the widest angle a strip segment may make with the track it follows (60°).
const MIN_STRIP_ALIGNMENT = 0.5
const AD_REPEAT_LENGTH = 26
const FLOODLIGHT_SPACING = 26
const FLOODLIGHT_OFFSET = BARRIER_OFFSET + 1
const FLOODLIGHT_HEIGHT = 5.2
const GRID_SLOT_WIDTH = 0.72
const GANTRY_HEIGHT = 2.5
const GANTRY_HALF_SPAN = 2.4
const START_LIGHTS = 5
const ASPHALT_TILE_REPEATS = 4

export const DRY_ASPHALT = new THREE.Color(0x70777a)
export const WET_ASPHALT = new THREE.Color(0x3c4347)
export const DRY_ASPHALT_ROUGHNESS = 0.92
export const WET_ASPHALT_ROUGHNESS = 0.22
const FLOODLIGHT_TINT = new THREE.Color(0xfff2dc)

type Frame = { point: THREE.Vector3; across: THREE.Vector3 }

// The recorded lap is slightly jittery; a sideways direction taken from the immediate neighbours
// swings enough that strips several units out zig-zag. A wider window keeps them smooth.
function trackFrames(track: THREE.Vector3[]): Frame[] {
  return track.map((point, index) => {
    const direction = track[(index + FRAME_WINDOW) % track.length].clone().sub(track[(index - FRAME_WINDOW + track.length) % track.length]).setY(0).normalize()
    return { point, across: new THREE.Vector3(-direction.z, 0, direction.x) }
  })
}

// +1 or -1 for the outside of the bend at each sample, 0 on straights.
function cornerOutsides(track: THREE.Vector3[], frames: Frame[]) {
  return track.map((point, index) => {
    const before = point.clone().sub(track[(index - CORNER_WINDOW + track.length) % track.length]).normalize()
    const after = track[(index + CORNER_WINDOW) % track.length].clone().sub(point).normalize()
    if (before.dot(after) > STRAIGHT_COSINE) return 0
    return after.sub(before).dot(frames[index].across) > 0 ? -1 : 1
  })
}

// Box-blurs a closed-loop signal so gravel and kerb edges ramp instead of stepping.
function smoothLoop(values: number[], radius: number) {
  return values.map((_, index) => {
    let sum = 0
    for (let offset = -radius; offset <= radius; offset++) sum += values[(index + offset + values.length) % values.length]
    return sum / (radius * 2 + 1)
  })
}

// Consecutive runs of sample indices that pass a test, joined across the lap's start.
export function runsWhere(length: number, test: (index: number) => boolean, minimum: number) {
  const runs: number[][] = []
  let current: number[] = []
  for (let index = 0; index < length; index++) {
    if (test(index)) current.push(index)
    else if (current.length) {
      runs.push(current)
      current = []
    }
  }
  if (current.length) {
    if (runs.length && runs[0][0] === 0 && test(length - 1)) runs[0] = [...current, ...runs[0]]
    else runs.push(current)
  }
  return runs.filter((run) => run.length >= minimum)
}

// A strip following the track through `indices`, with a cross-section given as [offset, height]
// pairs on one side. u runs across the profile, v along the track in texture repeats.
function createStripGeometry(frames: Frame[], indices: number[], side: number, profile: (step: number) => [number, number][], repeatLength: number) {
  const positions: number[] = []
  const uvs: number[] = []
  const indexBuffer: number[] = []
  let distance = 0
  indices.forEach((sample, step) => {
    const { point, across } = frames[sample]
    if (step) distance += point.distanceTo(frames[indices[step - 1]].point)
    const section = profile(step)
    section.forEach(([offset, height], column) => {
      positions.push(point.x + across.x * offset * side, point.y + height, point.z + across.z * offset * side)
      uvs.push(column / (section.length - 1), distance / repeatLength)
    })
    if (!step) return
    const width = section.length
    const start = (step - 1) * width
    for (let column = 0; column < width - 1; column++) {
      const a = start + column
      const b = a + width
      if (side > 0) indexBuffer.push(a, a + 1, b, a + 1, b + 1, b)
      else indexBuffer.push(a, b, a + 1, a + 1, b, b + 1)
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indexBuffer)
  geometry.computeVertexNormals()
  return geometry
}

function mergedOrNull(parts: THREE.BufferGeometry[], material: THREE.Material) {
  return parts.length ? createMergedMesh(parts, material) : null
}

function addSurfaces(scene: THREE.Scene, track: THREE.Vector3[], elevations: number[], outsides: number[], vergeColor: number) {
  const raisedTrack = track.map((point, index) => point.clone().setY(elevations[index]))
  // Where two sections run closer than a track width, each asphalt narrows on the facing side so
  // an edge line always separates them.
  const room = roadSideRoom(track, elevations)
  const asphaltLimits = room.map(([left, right]): [number, number] => [left - EDGE_LINE_WIDTH, right - EDGE_LINE_WIDTH])
  const [leftOutside, rightOutside] = [-1, 1].map((side) => smoothLoop(outsides.map((outside, index) => outside === side && !elevations[index] ? 1 : 0), CORNER_BLEND_SAMPLES))
  const gravelLimits = track.map((_, index): [number, number] => [leftOutside[index] * GRAVEL_REACH * 1.6, rightOutside[index] * GRAVEL_REACH * 1.6])
  const asphaltTextures = createAsphaltTextures()
  // Ribbons advance v by one per four scene units; one asphalt tile covers four times that.
  ;[asphaltTextures.color, asphaltTextures.roughness].forEach((texture) => texture.repeat.set(1, 1 / ASPHALT_TILE_REPEATS))
  const asphalt = new THREE.MeshStandardMaterial({ color: DRY_ASPHALT, roughness: DRY_ASPHALT_ROUGHNESS, map: asphaltTextures.color, roughnessMap: asphaltTextures.roughness })
  const lines = new THREE.MeshStandardMaterial({ color: 0xf1f1ec, roughness: 0.7 })
  const gravel = new THREE.MeshStandardMaterial({ color: 0xd2c29c, roughness: 1, map: createGravelTexture() })
  const verge = new THREE.MeshStandardMaterial({ color: vergeColor, roughness: 1, map: createVergeTexture() })
  // Only the asphalt and edge lines are raised onto a bridge; wider layers stay on the ground,
  // where a neighbouring section's asphalt can cover them.
  const layers: { width: number; height: number; material: THREE.MeshStandardMaterial; isRaised: boolean; limits?: [number, number][] }[] = [
    { width: GRAVEL_REACH * 2, height: -0.02, material: gravel, isRaised: false, limits: gravelLimits },
    { width: VERGE_WIDTH, height: 0.01, material: verge, isRaised: false },
    { width: TRACK_WIDTH + EDGE_LINE_WIDTH * 2, height: 0.04, material: lines, isRaised: true, limits: room },
    { width: TRACK_WIDTH, height: 0.055, material: asphalt, isRaised: true, limits: asphaltLimits },
  ]
  for (const { width, height, material, isRaised, limits } of layers) {
    const mesh = new THREE.Mesh(createRibbonGeometry(isRaised ? raisedTrack : track, width, height, 0, true, limits), material)
    mesh.receiveShadow = true
    scene.add(mesh)
  }
  return { asphalt, room, surfaces: [asphalt, lines, gravel, verge] }
}

function addKerbs(scene: THREE.Scene, track: THREE.Vector3[], frames: Frame[], elevations: number[], outsides: number[], room: [number, number][]) {
  const isBend = outsides.map((outside) => outside !== 0)
  const parts: THREE.BufferGeometry[] = []
  for (const side of [-1, 1]) {
    const isClear = offsetClearance(track, side, KERB_OFFSET + KERB_WIDTH / 2)
    const runs = runsWhere(frames.length, (index) => isBend[index] && isClear[index] && !elevations[index] && room[index][side === -1 ? 0 : 1] >= KERB_ROOM, MIN_KERB_SAMPLES)
    for (const run of runs) {
      const inner = KERB_OFFSET - KERB_WIDTH / 2
      const outer = KERB_OFFSET + KERB_WIDTH / 2
      parts.push(createStripGeometry(frames, run, side, (step) => {
        const taper = Math.min(1, step / KERB_TAPER_SAMPLES, (run.length - 1 - step) / KERB_TAPER_SAMPLES)
        const crest = 0.058 + 0.034 * taper
        return [[inner, 0.058], [inner + 0.07, crest], [outer - 0.05, crest], [outer, 0.05]]
      }, KERB_REPEAT_LENGTH))
    }
  }
  const material = new THREE.MeshStandardMaterial({ map: createKerbTexture(), roughness: 0.55 })
  const kerbs = mergedOrNull(parts, material)
  if (kerbs) {
    kerbs.castShadow = false
    scene.add(kerbs)
  }
  return material
}

// Whether a point offset sideways from each sample stays a clean parallel of its own stretch of
// track. On the inside of a bend tighter than the offset the line folds back on itself, and
// between two passes closer than twice the offset their strips would cross; either way the
// point ends up nearer another part of the lap than its own, and is dropped.
export function offsetClearance(track: THREE.Vector3[], side: number, offset: number) {
  const offsets = trackFrames(track).map(({ point, across }) => point.clone().addScaledVector(across, side * offset))
  // A strip that swings well away from the direction of travel is folding into a loop or hook.
  const isForward = offsets.map((current, index) => {
    const next = (index + 1) % track.length
    const along = track[next].clone().sub(track[index]).normalize()
    const step = offsets[next].clone().sub(current)
    return step.dot(along) > step.length() * MIN_STRIP_ALIGNMENT
  })
  return offsets.map(({ x, z }, index) => {
    if (!isForward[index] || !isForward[(index - 1 + track.length) % track.length]) return false
    return track.every((other, otherIndex) => {
      const gap = Math.abs(otherIndex - index)
      const minimum = Math.min(gap, track.length - gap) <= SAME_PASS_SAMPLES ? offset - OFFSET_TOLERANCE : offset + OTHER_PASS_MARGIN
      return Math.hypot(other.x - x, other.z - z) >= minimum
    })
  })
}

// Trims a few samples off each end so a run never finishes on the sample where it starts to bend away.
function erodeRun(run: number[]) {
  return run.slice(RUN_END_TRIM, run.length - RUN_END_TRIM)
}

function barrierRuns(track: THREE.Vector3[], elevations: number[]) {
  return [-1, 1].map((side) => {
    const isClear = offsetClearance(track, side, BARRIER_OFFSET)
    return { side, runs: runsWhere(track.length, (index) => isClear[index] && !elevations[index], MIN_BARRIER_SAMPLES).map(erodeRun) }
  })
}

function addBarriers(scene: THREE.Scene, frames: Frame[], sides: ReturnType<typeof barrierRuns>, seed: string) {
  const boards: THREE.BufferGeometry[] = []
  const caps: THREE.BufferGeometry[] = []
  for (const { side, runs } of sides) {
    for (const run of runs) {
      boards.push(createStripGeometry(frames, run, side, () => [[BARRIER_OFFSET, 0], [BARRIER_OFFSET, BARRIER_HEIGHT]], AD_REPEAT_LENGTH))
      caps.push(createStripGeometry(frames, run, side, () => [[BARRIER_OFFSET, BARRIER_HEIGHT], [BARRIER_OFFSET + BARRIER_THICKNESS, BARRIER_HEIGHT], [BARRIER_OFFSET + BARRIER_THICKNESS, 0]], AD_REPEAT_LENGTH))
    }
  }
  const adMaterial = new THREE.MeshStandardMaterial({ map: createAdvertisingTexture(seed), roughness: 0.55, side: THREE.DoubleSide })
  const concrete = new THREE.MeshStandardMaterial({ color: 0xc9c8c1, roughness: 0.9, side: THREE.DoubleSide })
  const meshes = [mergedOrNull(boards, adMaterial), mergedOrNull(caps, concrete)]
  meshes.forEach((mesh) => { if (mesh) scene.add(mesh) })
  return adMaterial
}

// Tall lighting masts behind the barriers, for the circuits that race under floodlights.
function addFloodlights(scene: THREE.Scene, frames: Frame[], sides: ReturnType<typeof barrierRuns>) {
  const masts: THREE.Matrix4[] = []
  for (const { side, runs } of sides) {
    for (const run of runs) {
      for (let step = Math.floor(FLOODLIGHT_SPACING / 2); step < run.length - 2; step += FLOODLIGHT_SPACING) {
        const { point, across } = frames[run[step]]
        const position = point.clone().addScaledVector(across, side * FLOODLIGHT_OFFSET)
        masts.push(new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-across.x * side, -across.z * side)), new THREE.Vector3(1, 1, 1)))
      }
    }
  }
  const glow = new THREE.MeshStandardMaterial({ color: 0x3d4448, emissive: 0xfff4e0, emissiveIntensity: 0, roughness: 0.4 })
  if (!masts.length) return glow
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.11, FLOODLIGHT_HEIGHT, 6).translate(0, FLOODLIGHT_HEIGHT / 2, 0), new THREE.MeshStandardMaterial({ color: 0x8d9599, metalness: 0.6, roughness: 0.45 }), masts.length)
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.34, 0.16).rotateX(-0.5).translate(0, FLOODLIGHT_HEIGHT, 0.12), glow, masts.length)
  masts.forEach((matrix, index) => {
    pole.setMatrixAt(index, matrix)
    head.setMatrixAt(index, matrix)
  })
  pole.castShadow = true
  scene.add(pole, head)
  return glow
}

function addStartLine(scene: THREE.Scene, overlay: THREE.Scene, track: THREE.Vector3[], driverCount: number) {
  const tangent = track[1].clone().sub(track[0]).normalize()
  const rotation = Math.atan2(tangent.x, tangent.z)
  const start = new THREE.Group()
  const tiles: THREE.BufferGeometry[][] = [[], []]
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 10; column++) tiles[(row + column) % 2].push(box([0.32, 0.02, 0.25], [(column - 4.5) * 0.32, 0.07, row * 0.25]))
  }
  tiles.forEach((parts, index) => start.add(createMergedMesh(parts, new THREE.MeshStandardMaterial({ color: index ? 0xf6f3e4 : 0x1d2226, roughness: 0.6 }))))
  const lights = new THREE.MeshStandardMaterial({ color: 0x3a0c0a, roughness: 0.25 })
  start.add(createMergedMesh([
    box([0.22, GANTRY_HEIGHT + 0.3, 0.22], [-GANTRY_HALF_SPAN, (GANTRY_HEIGHT + 0.3) / 2, -0.4]),
    box([0.22, GANTRY_HEIGHT + 0.3, 0.22], [GANTRY_HALF_SPAN, (GANTRY_HEIGHT + 0.3) / 2, -0.4]),
    box([GANTRY_HALF_SPAN * 2 + 0.3, 0.36, 0.2], [0, GANTRY_HEIGHT + 0.15, -0.4]),
  ], new THREE.MeshStandardMaterial({ color: 0x1f2428, roughness: 0.5, metalness: 0.4 })))
  start.add(createMergedMesh(Array.from({ length: START_LIGHTS }, (_, index) => box([0.2, 0.2, 0.08], [(index - (START_LIGHTS - 1) / 2) * 0.34, GANTRY_HEIGHT + 0.15, -0.28])), lights))
  start.position.copy(track[0])
  start.rotation.y = rotation
  scene.add(start)
  // Painted slot brackets for every grid position, even ones this replay leaves empty.
  const slots = startingGridLocations(track, Array.from({ length: driverCount }, (_, index) => [index + 1, index + 1]))
  const marks = [...slots.values()].flatMap(({ position, rotation: slotRotation }) => {
    const matrix = new THREE.Matrix4().compose(position.clone().setY(0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), slotRotation), new THREE.Vector3(1, 1, 1))
    return [
      box([GRID_SLOT_WIDTH, 0.01, 0.07], [0, 0.064, 1.75]).applyMatrix4(matrix),
      box([0.06, 0.01, 0.4], [-GRID_SLOT_WIDTH / 2 + 0.03, 0.064, 1.55]).applyMatrix4(matrix),
      box([0.06, 0.01, 0.4], [GRID_SLOT_WIDTH / 2 - 0.03, 0.064, 1.55]).applyMatrix4(matrix),
    ]
  })
  const gridMarks = mergedOrNull(marks, new THREE.MeshStandardMaterial({ color: 0xf1f1ec, roughness: 0.7 }))
  if (gridMarks) {
    gridMarks.castShadow = false
    scene.add(gridMarks)
  }
  const label = createLabel('START / FINISH')
  label.position.copy(track[0]).add(new THREE.Vector3(0, GANTRY_HEIGHT + 0.6, 0))
  label.scale.multiplyScalar(1.3)
  overlay.add(label)
}

export function addBridges(scene: THREE.Scene, track: THREE.Vector3[], elevations: number[], crossings: TrackCrossing[]) {
  if (!crossings.length) return
  const walls = new THREE.Mesh(createBridgeWallGeometry(track, elevations, crossings), new THREE.MeshStandardMaterial({ color: 0xb9b7ae, roughness: 0.9, side: THREE.DoubleSide }))
  walls.castShadow = walls.receiveShadow = true
  scene.add(walls)
}

type TracksideOptions = { vergeColor: number; isFloodlit: boolean; driverCount: number; seed: string }

// Everything painted on or built right beside the racing line. Returns the asphalt (for rain),
// the surfaces floodlights brighten at night and the emissive trackside fixtures.
export function addTrackside(scene: THREE.Scene, overlay: THREE.Scene, track: THREE.Vector3[], elevations: number[], { vergeColor, isFloodlit, driverCount, seed }: TracksideOptions) {
  const frames = trackFrames(track)
  const outsides = cornerOutsides(track, frames)
  const { asphalt, room, surfaces } = addSurfaces(scene, track, elevations, outsides, vergeColor)
  const kerbs = addKerbs(scene, track, frames, elevations, outsides, room)
  const barriers = barrierRuns(track, elevations)
  const boards = addBarriers(scene, frames, barriers, seed)
  addStartLine(scene, overlay, track, driverCount)
  const fixtures = isFloodlit ? [addFloodlights(scene, frames, barriers)] : []
  const litSurfaces = [...surfaces, kerbs, boards]
  litSurfaces.forEach((material) => {
    material.emissive.copy(FLOODLIGHT_TINT)
    material.emissiveMap = material.map
    material.emissiveIntensity = 0
  })
  return { asphalt, litSurfaces, fixtures }
}
