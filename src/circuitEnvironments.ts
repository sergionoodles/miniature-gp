// Structured version of docs/circuit_environment_terrain_reference.md.
// Sides are in scene space (the GPS frame is not north-aligned): "back" is the far side of the
// default camera view, "front" the near side, "left"/"right" the screen sides.
export type Side = 'back' | 'front' | 'left' | 'right'
export type TreeKind = 'broadleaf' | 'conifer' | 'palm' | 'scrub'
export type BuildingStyle = 'towers' | 'lowrise' | 'industrial' | 'stone' | 'riviera' | 'resort' | 'casino'
export type LandmarkKind = 'stadium' | 'controlTower' | 'sphere' | 'yachts' | 'ferrisWheel' | 'skyPark' | 'flameTowers' | 'palace' | 'exhibitionHalls' | 'hangars' | 'parking' | 'themePark' | 'cityWalls'

export type GroundPalette = { low: number; high: number; floor: number; verge: number }
export type WaterFeature =
  // Open water beyond the track on one side: sea, bay or reservoir.
  | { kind: 'coast'; side: Side; offset: number }
  | { kind: 'river'; side: Side; offset: number; width: number }
  // A water ring around the circuit, with land (and the city) again beyond it.
  | { kind: 'channel'; offset: number; width: number }
  | { kind: 'lake' }
  | { kind: 'ponds'; count: number }
export type Skyline = { style: BuildingStyle; side: Side | 'around'; count: number; height: [number, number]; distance: [number, number] }
export type Landmark = { kind: LandmarkKind; side?: Side }

export type CircuitEnvironment = {
  id: string
  names: string[]
  ground: GroundPalette
  relief: number
  rise?: { side: Side; height: number }
  trees: { kinds: TreeKind[]; density: number }
  outskirts: { density: number; height: number }
  water: { color: number; features: WaterFeature[] }
  skylines: Skyline[]
  mountains?: { side: Side; height: number; color: number; hasSnow: boolean }
  landmarks: Landmark[]
  // Night races run under trackside floodlights.
  isFloodlit?: boolean
}

const PARK: GroundPalette = { low: 0x7e9671, high: 0x54795d, floor: 0x87977c, verge: 0x9caa84 }
const LUSH: GroundPalette = { low: 0x6f9163, high: 0x3f6b48, floor: 0x5f7f58, verge: 0x8fa878 }
const COUNTRYSIDE: GroundPalette = { low: 0x8fa56f, high: 0x5f8a55, floor: 0x86996c, verge: 0xa0ad86 }
const DRY: GroundPalette = { low: 0xaca074, high: 0x7b8a5a, floor: 0x9d9670, verge: 0xa8a784 }
const ALPINE: GroundPalette = { low: 0x86ac66, high: 0x4f8150, floor: 0x6f9660, verge: 0x9cb382 }
const DESERT: GroundPalette = { low: 0xe0c898, high: 0xc8a878, floor: 0xcdb487, verge: 0x8f918b }
const DUNES: GroundPalette = { low: 0xcfc3a0, high: 0x87966b, floor: 0xb9b08c, verge: 0x9caa84 }
const ARID_COAST: GroundPalette = { low: 0xd6c29a, high: 0xa9a47a, floor: 0xc9b690, verge: 0x929487 }
const URBAN: GroundPalette = { low: 0xa19d92, high: 0x7f8a74, floor: 0x98968d, verge: 0x8f928b }
const TROPICAL: GroundPalette = { low: 0x8fae6a, high: 0x5d8f55, floor: 0x86a066, verge: 0x9cb07f }

const SEA = 0x2f6f8f
const LAKE = 0x3f7a86
const RIVER = 0x4d7c7a

export const DEFAULT_ENVIRONMENT: CircuitEnvironment = {
  id: 'default',
  names: [],
  ground: PARK,
  relief: 2,
  trees: { kinds: ['broadleaf'], density: 1 },
  outskirts: { density: 1, height: 3.5 },
  water: { color: LAKE, features: [] },
  skylines: [],
  landmarks: [],
}

export const CIRCUIT_ENVIRONMENTS: CircuitEnvironment[] = [
  {
    id: 'albert-park', names: ['albert park', 'melbourne'], ground: PARK, relief: 0.3,
    trees: { kinds: ['broadleaf'], density: 1 }, outskirts: { density: 0.8, height: 3.5 },
    water: { color: LAKE, features: [{ kind: 'lake' }, { kind: 'coast', side: 'front', offset: 70 }] },
    skylines: [{ style: 'towers', side: 'back', count: 110, height: [12, 40], distance: [60, 170] }],
    landmarks: [],
  },
  {
    id: 'bahrain', isFloodlit: true, names: ['bahrain', 'sakhir'], ground: DESERT, relief: 0.6,
    trees: { kinds: ['palm'], density: 0.06 }, outskirts: { density: 0.03, height: 1 },
    water: { color: SEA, features: [] }, skylines: [],
    landmarks: [{ kind: 'controlTower' }],
  },
  {
    id: 'jeddah', isFloodlit: true, names: ['jeddah'], ground: ARID_COAST, relief: 0.3,
    trees: { kinds: ['palm'], density: 0.25 }, outskirts: { density: 0.08, height: 1 },
    water: { color: SEA, features: [{ kind: 'coast', side: 'left', offset: 8 }] },
    skylines: [{ style: 'towers', side: 'right', count: 120, height: [6, 26], distance: [20, 110] }],
    landmarks: [],
  },
  {
    id: 'shanghai', names: ['shanghai'], ground: TROPICAL, relief: 0.4,
    trees: { kinds: ['broadleaf'], density: 0.8 }, outskirts: { density: 0.7, height: 2.5 },
    water: { color: LAKE, features: [{ kind: 'ponds', count: 7 }] },
    skylines: [{ style: 'lowrise', side: 'back', count: 50, height: [3, 8], distance: [60, 140] }],
    landmarks: [],
  },
  {
    id: 'suzuka', names: ['suzuka'], ground: LUSH, relief: 5,
    trees: { kinds: ['broadleaf', 'conifer'], density: 1.3 }, outskirts: { density: 1.3, height: 4 },
    water: { color: LAKE, features: [] }, skylines: [],
    landmarks: [{ kind: 'ferrisWheel' }],
  },
  {
    id: 'miami', names: ['miami'], ground: TROPICAL, relief: 0.2,
    trees: { kinds: ['palm'], density: 0.45 }, outskirts: { density: 0.25, height: 2 },
    water: { color: LAKE, features: [{ kind: 'ponds', count: 3 }] },
    skylines: [{ style: 'lowrise', side: 'back', count: 70, height: [2, 7], distance: [40, 130] }],
    landmarks: [{ kind: 'stadium' }, { kind: 'parking' }, { kind: 'parking' }, { kind: 'parking' }],
  },
  {
    id: 'imola', names: ['imola', 'enzo e dino ferrari'], ground: LUSH, relief: 6, rise: { side: 'right', height: 8 },
    trees: { kinds: ['broadleaf'], density: 1.2 }, outskirts: { density: 1.1, height: 3.8 },
    water: { color: RIVER, features: [{ kind: 'river', side: 'left', offset: 8, width: 10 }] },
    skylines: [{ style: 'lowrise', side: 'back', count: 90, height: [2, 7], distance: [35, 120] }],
    landmarks: [],
  },
  {
    id: 'monaco', names: ['monaco', 'monte carlo'], ground: URBAN, relief: 3, rise: { side: 'back', height: 26 },
    trees: { kinds: ['palm'], density: 0.25 }, outskirts: { density: 0.15, height: 2 },
    water: { color: SEA, features: [{ kind: 'coast', side: 'front', offset: 6 }] },
    skylines: [{ style: 'riviera', side: 'around', count: 420, height: [3, 14], distance: [8, 90] }],
    landmarks: [{ kind: 'yachts' }],
  },
  {
    id: 'catalunya', names: ['catalunya', 'barcelona'], ground: DRY, relief: 4,
    trees: { kinds: ['broadleaf'], density: 0.5 }, outskirts: { density: 0.6, height: 2.8 },
    water: { color: LAKE, features: [] },
    skylines: [
      { style: 'industrial', side: 'right', count: 50, height: [2, 5], distance: [45, 140] },
      { style: 'lowrise', side: 'back', count: 40, height: [2, 5], distance: [70, 150] },
    ],
    landmarks: [],
  },
  {
    id: 'gilles-villeneuve', names: ['gilles villeneuve', 'montreal'], ground: PARK, relief: 0.3,
    trees: { kinds: ['broadleaf'], density: 1.1 }, outskirts: { density: 0.9, height: 3.5 },
    water: { color: RIVER, features: [{ kind: 'channel', offset: 10, width: 45 }] },
    skylines: [{ style: 'towers', side: 'back', count: 90, height: [10, 34], distance: [70, 170] }],
    landmarks: [],
  },
  {
    id: 'red-bull-ring', names: ['red bull ring', 'spielberg'], ground: ALPINE, relief: 9,
    trees: { kinds: ['conifer', 'broadleaf'], density: 0.7 }, outskirts: { density: 1, height: 4 },
    water: { color: LAKE, features: [] },
    skylines: [{ style: 'lowrise', side: 'around', count: 25, height: [1.5, 3], distance: [30, 150] }],
    mountains: { side: 'back', height: 70, color: 0x7d8a8f, hasSnow: true },
    landmarks: [],
  },
  {
    id: 'silverstone', names: ['silverstone'], ground: COUNTRYSIDE, relief: 1,
    trees: { kinds: ['broadleaf'], density: 0.35 }, outskirts: { density: 0.6, height: 3.2 },
    water: { color: LAKE, features: [] },
    skylines: [{ style: 'lowrise', side: 'back', count: 25, height: [1.5, 4], distance: [60, 160] }],
    landmarks: [{ kind: 'hangars' }],
  },
  {
    id: 'hungaroring', names: ['hungaroring', 'budapest'], ground: DRY, relief: 7,
    trees: { kinds: ['broadleaf'], density: 1 }, outskirts: { density: 1.4, height: 3.6 },
    water: { color: LAKE, features: [] }, skylines: [], landmarks: [],
  },
  {
    id: 'spa', names: ['spa francorchamps'], ground: LUSH, relief: 11,
    trees: { kinds: ['conifer', 'broadleaf'], density: 1.8 }, outskirts: { density: 2.2, height: 4.5 },
    water: { color: RIVER, features: [] }, skylines: [], landmarks: [],
  },
  {
    id: 'zandvoort', names: ['zandvoort'], ground: DUNES, relief: 5,
    trees: { kinds: ['scrub'], density: 0.45 }, outskirts: { density: 1, height: 1.1 },
    water: { color: SEA, features: [{ kind: 'coast', side: 'left', offset: 14 }] },
    skylines: [{ style: 'lowrise', side: 'back', count: 60, height: [2, 6], distance: [25, 80] }],
    landmarks: [],
  },
  {
    id: 'monza', names: ['monza'], ground: PARK, relief: 0.3,
    trees: { kinds: ['broadleaf'], density: 1.6 }, outskirts: { density: 1.6, height: 4 },
    water: { color: RIVER, features: [{ kind: 'river', side: 'right', offset: 20, width: 5 }] },
    skylines: [], landmarks: [{ kind: 'palace' }],
  },
  {
    id: 'baku', names: ['baku'], ground: URBAN, relief: 1.5, rise: { side: 'back', height: 10 },
    trees: { kinds: ['palm'], density: 0.12 }, outskirts: { density: 0.1, height: 2 },
    water: { color: SEA, features: [{ kind: 'coast', side: 'front', offset: 6 }] },
    skylines: [
      { style: 'stone', side: 'back', count: 200, height: [3, 8], distance: [8, 60] },
      { style: 'towers', side: 'right', count: 120, height: [8, 30], distance: [15, 110] },
    ],
    landmarks: [{ kind: 'cityWalls', side: 'back' }, { kind: 'flameTowers' }],
  },
  {
    id: 'marina-bay', isFloodlit: true, names: ['marina bay', 'singapore'], ground: URBAN, relief: 0.1,
    trees: { kinds: ['palm', 'broadleaf'], density: 0.3 }, outskirts: { density: 0.2, height: 2.5 },
    water: { color: SEA, features: [{ kind: 'coast', side: 'front', offset: 10 }] },
    skylines: [{ style: 'towers', side: 'around', count: 380, height: [10, 40], distance: [9, 120] }],
    landmarks: [{ kind: 'skyPark' }],
  },
  {
    id: 'americas', names: ['americas', 'austin'], ground: DRY, relief: 6,
    trees: { kinds: ['broadleaf'], density: 0.35 }, outskirts: { density: 0.4, height: 2.6 },
    water: { color: LAKE, features: [] },
    skylines: [{ style: 'towers', side: 'back', count: 40, height: [8, 26], distance: [120, 190] }],
    landmarks: [],
  },
  {
    id: 'hermanos-rodriguez', names: ['hermanos rodriguez', 'mexico'], ground: PARK, relief: 0.3,
    trees: { kinds: ['broadleaf'], density: 0.9 }, outskirts: { density: 0.5, height: 3.2 },
    water: { color: LAKE, features: [] },
    skylines: [{ style: 'lowrise', side: 'around', count: 320, height: [2, 9], distance: [30, 160] }],
    landmarks: [{ kind: 'stadium' }],
  },
  {
    id: 'interlagos', names: ['interlagos', 'jose carlos pace', 'sao paulo'], ground: LUSH, relief: 6,
    trees: { kinds: ['broadleaf'], density: 1.3 }, outskirts: { density: 1, height: 4 },
    water: { color: LAKE, features: [{ kind: 'coast', side: 'left', offset: 14 }] },
    skylines: [{ style: 'lowrise', side: 'around', count: 300, height: [3, 12], distance: [45, 170] }],
    landmarks: [],
  },
  {
    id: 'las-vegas', isFloodlit: true, names: ['las vegas'], ground: ARID_COAST, relief: 0,
    trees: { kinds: ['palm'], density: 0.08 }, outskirts: { density: 0.02, height: 1 },
    water: { color: LAKE, features: [] },
    skylines: [{ style: 'casino', side: 'around', count: 260, height: [6, 34], distance: [9, 110] }],
    mountains: { side: 'back', height: 35, color: 0x9a7f66, hasSnow: false },
    landmarks: [{ kind: 'sphere' }],
  },
  {
    id: 'lusail', isFloodlit: true, names: ['lusail', 'losail', 'qatar'], ground: DESERT, relief: 0.3,
    trees: { kinds: ['palm'], density: 0.05 }, outskirts: { density: 0.02, height: 1 },
    water: { color: SEA, features: [] },
    skylines: [{ style: 'towers', side: 'back', count: 45, height: [6, 24], distance: [110, 190] }],
    landmarks: [{ kind: 'parking' }, { kind: 'parking' }],
  },
  {
    id: 'yas-marina', isFloodlit: true, names: ['yas marina', 'abu dhabi'], ground: ARID_COAST, relief: 0.1,
    trees: { kinds: ['palm'], density: 0.4 }, outskirts: { density: 0.1, height: 1.5 },
    water: { color: SEA, features: [{ kind: 'coast', side: 'left', offset: 10 }, { kind: 'ponds', count: 4 }] },
    skylines: [{ style: 'resort', side: 'right', count: 60, height: [4, 14], distance: [15, 90] }],
    landmarks: [{ kind: 'yachts' }, { kind: 'themePark' }],
  },
  {
    id: 'madring', names: ['madring', 'madrid', 'ifema'], ground: DRY, relief: 3,
    trees: { kinds: ['broadleaf'], density: 0.4 }, outskirts: { density: 0.4, height: 2.5 },
    water: { color: LAKE, features: [] },
    skylines: [{ style: 'towers', side: 'back', count: 100, height: [4, 14], distance: [25, 130] }],
    landmarks: [{ kind: 'exhibitionHalls' }, { kind: 'parking' }],
  },
]

export function normalizeCircuitName(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Catalog circuit names vary between sources ("Monte Carlo", "Circuit de Monaco"), so match on alias words.
export function resolveCircuitEnvironment(circuit: string) {
  const name = ` ${normalizeCircuitName(circuit)} `
  return CIRCUIT_ENVIRONMENTS.find((environment) => environment.names.some((alias) => name.includes(` ${alias} `))) ?? DEFAULT_ENVIRONMENT
}
