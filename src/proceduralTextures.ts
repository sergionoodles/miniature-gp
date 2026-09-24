import * as THREE from 'three'
import { createRandom } from './terrainField'

// Seeded, tileable canvas textures: every circuit renders identically on every load and no
// image files are shipped. Values are 0..1 greyscale fields composed into colour channels.

type Field = Float32Array

// Value noise that wraps at the texture edges, so repeated tiles have no seams.
function tileableNoise(width: number, height: number, cells: [number, number], seed: string): Field {
  const random = createRandom(seed)
  const [cellsX, cellsY] = cells
  const lattice = Float32Array.from({ length: cellsX * cellsY }, () => random())
  const field = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const gridY = y / height * cellsY
    const row = Math.floor(gridY)
    const blendY = THREE.MathUtils.smootherstep(gridY - row, 0, 1)
    for (let x = 0; x < width; x++) {
      const gridX = x / width * cellsX
      const column = Math.floor(gridX)
      const blendX = THREE.MathUtils.smootherstep(gridX - column, 0, 1)
      const at = (offsetX: number, offsetY: number) => lattice[((row + offsetY) % cellsY) * cellsX + (column + offsetX) % cellsX]
      const top = THREE.MathUtils.lerp(at(0, 0), at(1, 0), blendX)
      const bottom = THREE.MathUtils.lerp(at(0, 1), at(1, 1), blendX)
      field[y * width + x] = THREE.MathUtils.lerp(top, bottom, blendY)
    }
  }
  return field
}

// Sum of octaves, each twice as fine and half as strong, normalised back to 0..1.
function fractalNoise(width: number, height: number, cells: [number, number], octaves: number, seed: string): Field {
  const field = new Float32Array(width * height)
  let amplitude = 1
  let total = 0
  for (let octave = 0; octave < octaves; octave++) {
    const layer = tileableNoise(width, height, [cells[0] << octave, cells[1] << octave], `${seed}:${octave}`)
    layer.forEach((value, index) => { field[index] += value * amplitude })
    total += amplitude
    amplitude /= 2
  }
  return field.map((value) => value / total)
}

function whiteNoise(size: number, seed: string): Field {
  const random = createRandom(seed)
  return Float32Array.from({ length: size }, () => random())
}

type TextureOptions = { colorSpace?: THREE.ColorSpace; repeat?: [number, number] }

function toTexture(width: number, height: number, paint: (x: number, y: number, index: number) => [number, number, number], options: TextureOptions = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context) {
    const image = context.createImageData(width, height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x
        const [red, green, blue] = paint(x, y, index)
        image.data.set([red * 255, green * 255, blue * 255, 255], index * 4)
      }
    }
    context.putImageData(image, 0, 0)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = options.colorSpace ?? THREE.NoColorSpace
  texture.anisotropy = 8
  if (options.repeat) texture.repeat.set(...options.repeat)
  return texture
}

const grey = (value: number): [number, number, number] => [value, value, value]

// Track ribbons map u across the asphalt (0..1) and v along it (one unit per 4 scene units).
// The colour carries aggregate, repair patches and the two rubbered tyre lines; the roughness
// channel makes rubber and dips smoother, which is where water pools first when it rains.
export function createAsphaltTextures() {
  const width = 128
  const height = 512
  const patches = fractalNoise(width, height, [2, 8], 3, 'asphalt:patches')
  const grit = whiteNoise(width * height, 'asphalt:grit')
  const stones = whiteNoise(width * height, 'asphalt:stones')
  const puddles = fractalNoise(width, height, [2, 6], 3, 'asphalt:puddles')
  const rubber = (x: number) => {
    const across = x / width
    const line = (center: number) => Math.exp(-(((across - center) / 0.09) ** 2))
    return Math.max(line(0.33), line(0.67)) * 0.8 + Math.exp(-(((across - 0.5) / 0.3) ** 2)) * 0.2
  }
  const color = toTexture(width, height, (x, _, index) => {
    const stone = stones[index] > 0.985 ? 0.12 : 0
    const value = 0.6 + (patches[index] - 0.5) * 0.05 + (grit[index] - 0.5) * 0.12 + stone - rubber(x) * 0.13
    return grey(value)
  }, { colorSpace: THREE.SRGBColorSpace })
  const roughness = toTexture(width, height, (x, _, index) => {
    const pooling = THREE.MathUtils.smoothstep(puddles[index], 0.58, 0.75)
    return grey(1 - rubber(x) * 0.12 - pooling * 0.3 + (grit[index] - 0.5) * 0.08)
  })
  return { color, roughness }
}

// Crushed stone in the run-off: warm, coarse and matte.
export function createGravelTexture() {
  const size = 128
  const pebbles = whiteNoise(size * size, 'gravel:pebbles')
  const tone = fractalNoise(size, size, [4, 4], 3, 'gravel:tone')
  return toTexture(size, size, (_, __, index) => {
    const value = 0.78 + (pebbles[index] - 0.5) * 0.34 + (tone[index] - 0.5) * 0.16
    return [value * 1.02, value, value * 0.94]
  }, { colorSpace: THREE.SRGBColorSpace })
}

// Mown verge grass: stripes along the track plus fine blade noise.
export function createVergeTexture() {
  const width = 64
  const height = 256
  const blades = whiteNoise(width * height, 'verge:blades')
  const clumps = fractalNoise(width, height, [2, 8], 3, 'verge:clumps')
  return toTexture(width, height, (_, y, index) => {
    const stripe = Math.floor(y / (height / 8)) % 2 ? 0.06 : -0.03
    return grey(0.86 + stripe + (blades[index] - 0.5) * 0.14 + (clumps[index] - 0.5) * 0.14)
  }, { colorSpace: THREE.SRGBColorSpace })
}

// Detail laid over the terrain's vertex colours: tufts, soil flecks and soft blotches.
export function createGroundTexture() {
  const size = 256
  const blades = whiteNoise(size * size, 'ground:blades')
  const blotches = fractalNoise(size, size, [4, 4], 4, 'ground:blotches')
  return toTexture(size, size, (_, __, index) => {
    const soil = blades[index] > 0.97 ? -0.1 : 0
    const value = 0.84 + (blotches[index] - 0.5) * 0.3 + (blades[index] - 0.5) * 0.12 + soil
    return [value, value * 1.01, value * 0.97]
  }, { colorSpace: THREE.SRGBColorSpace })
}

// Red and white kerb blocks, one pair per texture repeat along the track.
export function createKerbTexture() {
  const width = 8
  const height = 64
  const grain = whiteNoise(width * height, 'kerb:grain')
  const red: [number, number, number] = [0.8, 0.16, 0.13]
  const white: [number, number, number] = [0.95, 0.94, 0.9]
  return toTexture(width, height, (_, y, index) => {
    const base = y < height / 2 ? red : white
    const wear = 1 - grain[index] * 0.08
    return [base[0] * wear, base[1] * wear, base[2] * wear]
  }, { colorSpace: THREE.SRGBColorSpace })
}

// Trackside advertising boards: bold blocks of colour with a pale wordmark bar, loosely
// suggesting sponsor panels without reproducing real brands.
export function createAdvertisingTexture(seed: string) {
  const panelWidth = 64
  const panels = 8
  const height = 32
  const random = createRandom(`${seed}:ads`)
  const palette: [number, number, number][] = [
    [0.86, 0.1, 0.1], [0.08, 0.1, 0.12], [0.95, 0.95, 0.93], [0.06, 0.26, 0.62], [0.98, 0.72, 0.05], [0.0, 0.5, 0.35], [0.45, 0.1, 0.55],
  ]
  const designs = Array.from({ length: panels }, () => {
    const background = palette[Math.floor(random() * palette.length)]
    const luminance = background[0] * 0.3 + background[1] * 0.6 + background[2] * 0.1
    return { background, mark: luminance > 0.5 ? [0.1, 0.1, 0.12] as [number, number, number] : [0.96, 0.96, 0.94] as [number, number, number], markStart: 0.18 + random() * 0.2, markEnd: 0.62 + random() * 0.2 }
  })
  // Strips map u across the board (bottom to top) and v along the track, so panels run down the texture.
  return toTexture(height, panelWidth * panels, (x, y) => {
    const design = designs[Math.floor(y / panelWidth)]
    const along = (y % panelWidth) / panelWidth
    const up = x / height
    if (along < 0.02) return grey(0.2)
    const isMark = along > design.markStart && along < design.markEnd && up > 0.36 && up < 0.64
    return isMark ? design.mark : design.background
  }, { colorSpace: THREE.SRGBColorSpace })
}

// A tileable ripple normal map for open water, built from the gradient of a noise height field.
export function createWaterNormalTexture() {
  const size = 256
  const height = fractalNoise(size, size, [6, 6], 4, 'water:ripples')
  const at = (x: number, y: number) => height[((y + size) % size) * size + (x + size) % size]
  const strength = 3.2
  return toTexture(size, size, (x, y) => {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength
    const normal = new THREE.Vector3(-dx, -dy, 1).normalize()
    return [normal.x * 0.5 + 0.5, normal.y * 0.5 + 0.5, normal.z * 0.5 + 0.5]
  })
}

export type FacadeKind = 'glass' | 'punched' | 'bands' | 'shutters'

// One facade tile is FACADE_BAYS windows square. The colour map darkens the glazing by day,
// the emissive map lights a seeded share of windows at night.
export const FACADE_BAYS = 4
export function createFacadeTextures(kind: FacadeKind, seed: string) {
  const size = 128
  const bay = size / FACADE_BAYS
  const random = createRandom(`${seed}:${kind}`)
  // Offices and flats light up floor by floor: each row has its own occupancy and colour.
  const floors = Array.from({ length: FACADE_BAYS }, () => ({ occupancy: random() * 0.9, tone: random() > 0.3 ? 1 : 2 }))
  const lit = Array.from({ length: FACADE_BAYS * FACADE_BAYS }, (_, cell) => {
    const floor = floors[Math.floor(cell / FACADE_BAYS)]
    return random() < floor.occupancy ? floor.tone : 0
  })
  const window = (localX: number, localY: number) => {
    if (kind === 'glass') return localX > 0.06 && localY > 0.1
    if (kind === 'bands') return localY > 0.3 && localY < 0.75
    if (kind === 'shutters') return localX > 0.28 && localX < 0.72 && localY > 0.2 && localY < 0.85
    return localX > 0.2 && localX < 0.8 && localY > 0.22 && localY < 0.82
  }
  const glazing = kind === 'glass' ? [0.6, 0.7, 0.78] : [0.34, 0.39, 0.44]
  const shutterTint = [0.62, 0.72, 0.62]
  const color = toTexture(size, size, (x, y) => {
    const localX = (x % bay) / bay
    const localY = (y % bay) / bay
    if (!window(localX, localY)) return kind === 'glass' ? grey(0.82) : grey(1)
    if (kind === 'shutters' && (localX < 0.36 || localX > 0.64)) return shutterTint as [number, number, number]
    const sky = 0.08 * (1 - localY)
    return [glazing[0] + sky, glazing[1] + sky, glazing[2] + sky]
  }, { colorSpace: THREE.SRGBColorSpace })
  const lights = toTexture(size, size, (x, y) => {
    const localX = (x % bay) / bay
    const localY = (y % bay) / bay
    const state = lit[Math.floor(y / bay) * FACADE_BAYS + Math.floor(x / bay)]
    // Curtain walls glow through a smaller lit core so towers do not become solid light boxes.
    const isLitArea = kind === 'glass' ? localX > 0.2 && localX < 0.85 && localY > 0.3 && localY < 0.8 : window(localX, localY)
    if (!state || !isLitArea) return grey(0)
    return state === 1 ? [1, 0.8, 0.52] : [0.72, 0.84, 1]
  }, { colorSpace: THREE.SRGBColorSpace })
  return { color, lights }
}
