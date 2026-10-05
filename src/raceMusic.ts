// The race theme: an A minor racing groove written as a 16th-note step sequence. Every layer
// always plays its part; the current mood decides which layers are heard, so mood changes
// stay in time and in key.
export type MusicLayer = 'pad' | 'bell' | 'arp' | 'bass' | 'kick' | 'snare' | 'hat' | 'lead'
export type MusicMood = 'grid' | 'countdown' | 'racing' | 'neutralized'
export type ScoreNote = { layer: MusicLayer; midi: number; steps: number; velocity: number }

const TEMPO = 132
const STEPS_PER_BEAT = 4
export const STEPS_PER_BAR = 16
export const STEP_SECONDS = 60 / TEMPO / STEPS_PER_BEAT
const BARS_PER_SECTION = 8
const DRUM_PITCH = 0
const CAUTION_STATUSES = ['Safety car', 'Virtual safety car', 'Red flag']
// Lights out happens while the replay still reads 'Waiting for start', so that phase races.
const HELD_START_STATUSES = ['Formation lap', 'Delayed start', 'Start suspended']

type Chord = { bass: number; tones: [number, number, number] }
const CHORDS = {
  Am: { bass: 45, tones: [57, 60, 64] },
  F: { bass: 41, tones: [57, 60, 65] },
  C: { bass: 36, tones: [55, 60, 64] },
  G: { bass: 43, tones: [55, 59, 62] },
  E: { bass: 40, tones: [56, 59, 64] },
} satisfies Record<string, Chord>
type ChordName = keyof typeof CHORDS

const VERSE: ChordName[] = ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E']
const CHORUS: ChordName[] = ['F', 'G', 'Am', 'C', 'F', 'G', 'E', 'E']
const SECTIONS = [VERSE, CHORUS, VERSE, CHORUS]
export const LOOP_STEPS = SECTIONS.length * BARS_PER_SECTION * STEPS_PER_BAR

// Chorus melody, one bar per row: [step, midi note, length in steps].
const CHORUS_MELODY: [number, number, number][][] = [
  [[0, 69, 2], [2, 72, 2], [4, 77, 4], [8, 76, 4], [12, 72, 4]],
  [[0, 74, 4], [4, 71, 2], [6, 74, 2], [8, 79, 8]],
  [[0, 76, 6], [6, 81, 4], [10, 79, 2], [12, 76, 4]],
  [[0, 79, 4], [4, 76, 2], [6, 72, 2], [8, 74, 2], [10, 76, 6]],
  [[0, 69, 2], [2, 72, 2], [4, 77, 4], [8, 81, 4], [12, 79, 2], [14, 77, 2]],
  [[0, 79, 4], [4, 74, 4], [8, 71, 2], [10, 74, 2], [12, 79, 4]],
  [[0, 80, 8], [8, 83, 8]],
  [[0, 76, 4], [4, 71, 4], [8, 68, 2], [10, 71, 2], [12, 76, 4]],
]
// Indexes into the chord tones, where 3 is the root an octave up.
const ARP_PATTERN = [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 3, 2, 1]
const BELL_STEPS: [step: number, tone: number, octaves: number][] = [[0, 0, 2], [6, 2, 1], [10, 1, 2]]
const FILL_START_STEP = 8

const MOOD_LAYERS: Record<MusicMood, Partial<Record<MusicLayer, number>>> = {
  grid: { pad: 1, bell: 1 },
  countdown: { pad: 0.35 },
  racing: { pad: 0.45, arp: 0.6, bass: 0.9, kick: 1, snare: 0.8, hat: 0.55, lead: 0.7 },
  neutralized: { pad: 1, bell: 0.7, bass: 0.7, hat: 0.45 },
}

export function layerLevel(mood: MusicMood, layer: MusicLayer): number {
  return MOOD_LAYERS[mood][layer] ?? 0
}

export function musicMoodFor({ isCountingDown, isPlaying, status }: { isCountingDown: boolean; isPlaying: boolean; status: string }): MusicMood {
  if (isCountingDown) return 'countdown'
  if (!isPlaying) return 'grid'
  if (isCautionStatus(status) || HELD_START_STATUSES.includes(status)) return 'neutralized'
  return 'racing'
}

export function isCautionStatus(status: string): boolean {
  return CAUTION_STATUSES.includes(status)
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

function drumNotes(step: number, isFillBar: boolean): ScoreNote[] {
  const notes: ScoreNote[] = []
  const isFill = isFillBar && step >= FILL_START_STEP
  if (step % STEPS_PER_BEAT === 0) notes.push({ layer: 'kick', midi: DRUM_PITCH, steps: 1, velocity: 1 })
  if (isFill) notes.push({ layer: 'snare', midi: DRUM_PITCH, steps: 1, velocity: 0.35 + (step - FILL_START_STEP) * 0.08 })
  if (!isFill && step % 8 === 4) notes.push({ layer: 'snare', midi: DRUM_PITCH, steps: 1, velocity: 0.9 })
  notes.push({ layer: 'hat', midi: DRUM_PITCH, steps: 1, velocity: step % 4 === 2 ? 0.6 : 0.25 })
  return notes
}

function harmonyNotes(step: number, chord: Chord, barInSection: number): ScoreNote[] {
  const notes: ScoreNote[] = []
  const arpTones = [...chord.tones, chord.tones[0] + 12]
  if (step === 0) notes.push(...chord.tones.map((midi) => ({ layer: 'pad' as const, midi, steps: STEPS_PER_BAR, velocity: 0.7 })))
  if (step % 2 === 0) notes.push({ layer: 'bass', midi: chord.bass + (step % 4 === 2 ? 12 : 0), steps: 2, velocity: step % 4 === 0 ? 1 : 0.7 })
  notes.push({ layer: 'arp', midi: arpTones[ARP_PATTERN[step]] + 12, steps: 1, velocity: step % 4 === 0 ? 0.9 : 0.6 })
  for (const [bellStep, tone, octaves] of BELL_STEPS) {
    if (bellStep === step) notes.push({ layer: 'bell', midi: chord.tones[tone] + 12 * octaves, steps: 8, velocity: 0.7 })
  }
  if (step === 14 && barInSection % 2 === 1) notes.push({ layer: 'bell', midi: chord.tones[2] + 24, steps: 4, velocity: 0.5 })
  return notes
}

export function notesAtStep(globalStep: number): ScoreNote[] {
  const loopStep = ((globalStep % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS
  const bar = Math.floor(loopStep / STEPS_PER_BAR)
  const step = loopStep % STEPS_PER_BAR
  const sectionIndex = Math.floor(bar / BARS_PER_SECTION)
  const barInSection = bar % BARS_PER_SECTION
  const section = SECTIONS[sectionIndex]
  const chord = CHORDS[section[barInSection]]
  const isChorus = section === CHORUS
  const melody = isChorus
    ? CHORUS_MELODY[barInSection]
      .filter(([melodyStep]) => melodyStep === step)
      .map(([, midi, steps]): ScoreNote => ({ layer: 'lead', midi, steps, velocity: 0.8 }))
    : []

  return [
    ...drumNotes(step, barInSection === BARS_PER_SECTION - 1),
    ...harmonyNotes(step, chord, barInSection),
    ...melody,
  ]
}
