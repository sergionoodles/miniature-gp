import * as THREE from 'three'
import { createRibbonGeometry } from './circuitGeometry'
import { distanceToTrack, PIT_LANE_OFFSET, PIT_LANE_WIDTH, type PitLane } from './pitLane'
import { createMergedMesh } from './sceneAssets'
import { createStripGeometry, runsWhere, TRACK_WIDTH, type Frame } from './trackside'

const EDGE_LINE_WIDTH = 0.11
const VERGE_MARGIN = 0.8
// Layer heights sit just under the track's own (verge 0.01, lines 0.04, asphalt 0.055), so the
// track draws over the lane where the entry and exit join it.
const VERGE_HEIGHT = 0
const LINE_HEIGHT = 0.03
const ASPHALT_HEIGHT = 0.047
const FRAME_WINDOW = 3
// The pit wall stands between lane and track wherever the lane has fanned out to its full offset.
const WALL_TOLERANCE = 0.25
const WALL_GAP = 0.12
const WALL_HEIGHT = 0.3
const WALL_THICKNESS = 0.14
const MIN_WALL_SAMPLES = 8
const WALL_REPEAT_LENGTH = 4

function laneFrames(path: THREE.Vector3[]): Frame[] {
  return path.map((point, index) => {
    const direction = path[Math.min(index + FRAME_WINDOW, path.length - 1)].clone().sub(path[Math.max(index - FRAME_WINDOW, 0)]).setY(0).normalize()
    return { point, across: new THREE.Vector3(-direction.z, 0, direction.x) }
  })
}

// The part of a lane edge from `start` to `end` that lies outside the track, judged from each
// end's distance to the track centreline, or null when the edge runs entirely under the track.
function clipToClearance(start: THREE.Vector3, end: THREE.Vector3, startReach: number, endReach: number, clearance: number) {
  if (startReach < clearance && endReach < clearance) return null
  if (startReach >= clearance && endReach >= clearance) return [start, end]
  const crossing = start.clone().lerp(end, (clearance - startReach) / (endReach - startReach))
  return startReach < clearance ? [crossing, end] : [start, crossing]
}

// The lane's two long edges where they are clear of the track. The wireframe look outlines the
// lane with these instead of its full boundary, which would show through the track where the entry
// and exit run underneath it.
function laneOutline(lane: THREE.BufferGeometry, track: THREE.Vector3[]) {
  const positions = lane.getAttribute('position')
  const corners = Array.from({ length: positions.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(positions, index))
  const reaches = corners.map((corner) => distanceToTrack(track, corner))
  // Ribbon corners alternate between the two sides, so each corner's neighbour along its edge is two ahead.
  const edges = corners.slice(0, -2).flatMap((corner, index) => clipToClearance(corner, corners[index + 2], reaches[index], reaches[index + 2], TRACK_WIDTH / 2) ?? [])
  return new THREE.BufferGeometry().setFromPoints(edges)
}

type PitLaneMaterials = { asphalt: THREE.Material; lines: THREE.Material; verge: THREE.Material }

// The lane shares the track's materials, so it darkens in the rain and is floodlit at night like the track.
export function addPitLane(scene: THREE.Scene, lane: PitLane, track: THREE.Vector3[], { asphalt, lines, verge }: PitLaneMaterials) {
  const layers = [
    { width: PIT_LANE_WIDTH + VERGE_MARGIN * 2, height: VERGE_HEIGHT, material: verge },
    { width: PIT_LANE_WIDTH + EDGE_LINE_WIDTH * 2, height: LINE_HEIGHT, material: lines },
    { width: PIT_LANE_WIDTH, height: ASPHALT_HEIGHT, material: asphalt },
  ]
  const meshes = layers.map(({ width, height, material }) => {
    const mesh = new THREE.Mesh(createRibbonGeometry(lane.path, width, height, 0, false), material)
    mesh.receiveShadow = true
    scene.add(mesh)
    return mesh
  })
  const surface = meshes[meshes.length - 1]
  surface.userData.wireframeOutline = laneOutline(surface.geometry, track)
  const frames = laneFrames(lane.path)
  const isSeparated = lane.path.map((point) => distanceToTrack(track, point) >= PIT_LANE_OFFSET - WALL_TOLERANCE)
  const inner = PIT_LANE_WIDTH / 2 + WALL_GAP
  const profile = (): [number, number][] => [[inner, 0], [inner, WALL_HEIGHT], [inner + WALL_THICKNESS, WALL_HEIGHT], [inner + WALL_THICKNESS, 0]]
  // The lane runs beside the track in the same direction, so the track lies on the lane's opposite side.
  const walls = runsWhere(frames.length, (index) => isSeparated[index], MIN_WALL_SAMPLES)
    .map((run) => createStripGeometry(frames, run, -lane.side, profile, WALL_REPEAT_LENGTH))
  const concrete = new THREE.MeshStandardMaterial({ color: 0xd9d8d0, roughness: 0.85, side: THREE.DoubleSide })
  if (walls.length) scene.add(createMergedMesh(walls, concrete))
}
