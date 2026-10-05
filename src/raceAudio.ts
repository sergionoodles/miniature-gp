import { createNoiseBuffer, createVoices, type Voice } from './audioVoices'
import { layerLevel, midiToFrequency, notesAtStep, STEP_SECONDS, STEPS_PER_BAR, type MusicLayer, type MusicMood } from './raceMusic'
import { createSoundEffects, type SoundCue } from './soundEffects'

// Notes are queued slightly ahead on the audio clock, so timer jitter never reaches the beat.
const LOOKAHEAD_SECONDS = 0.12
const SCHEDULER_INTERVAL_MS = 25
const START_OFFSET_SECONDS = 0.05
const EFFECT_OFFSET_SECONDS = 0.01
const MIN_TIME_CONSTANT = 0.005
const MASTER_LEVEL = 0.8
const MUSIC_LEVEL = 0.5
const EFFECTS_LEVEL = 0.9
const MASTER_FADE_SECONDS = 0.08
const MOOD_FADE_SECONDS = 0.5
const SUSPEND_DELAY_MS = 400
// After lights out the engines get half a bar to themselves before the beat drops.
const LAUNCH_MUSIC_DELAY_SECONDS = STEPS_PER_BAR / 2 * STEP_SECONDS
const ECHO_SECONDS = STEP_SECONDS * 3
const ECHO_FEEDBACK = 0.3
const ECHO_TONE = 2400
const REVERB_SECONDS = 2.4
const REVERB_DECAY = 3

const LAYER_MIX: Record<MusicLayer, { pan: number; echo: number; reverb: number }> = {
  pad: { pan: 0, echo: 0, reverb: 0.5 },
  bell: { pan: -0.25, echo: 0.35, reverb: 0.45 },
  arp: { pan: 0.2, echo: 0.3, reverb: 0.15 },
  bass: { pan: 0, echo: 0, reverb: 0 },
  kick: { pan: 0, echo: 0, reverb: 0 },
  snare: { pan: 0, echo: 0, reverb: 0.25 },
  hat: { pan: 0.3, echo: 0, reverb: 0 },
  lead: { pan: -0.05, echo: 0.25, reverb: 0.3 },
}
const LAYERS = Object.keys(LAYER_MIX) as MusicLayer[]

type AudioGraph = {
  context: AudioContext
  master: GainNode
  effects: GainNode
  layers: Record<MusicLayer, GainNode>
  voices: Record<MusicLayer, Voice>
  soundEffects: ReturnType<typeof createSoundEffects>
}

export type RaceAudio = {
  setEnabled: (isEnabled: boolean) => void
  setMood: (mood: MusicMood) => void
  play: (cue: SoundCue) => void
  dispose: () => void
}

function createReverbImpulse(context: BaseAudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * REVERB_SECONDS)
  const impulse = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const samples = impulse.getChannelData(channel)
    for (let index = 0; index < length; index++) samples[index] = (Math.random() * 2 - 1) * (1 - index / length) ** REVERB_DECAY
  }
  return impulse
}

function createGain(context: BaseAudioContext, level: number, output: AudioNode): GainNode {
  const gain = context.createGain()
  gain.gain.value = level
  gain.connect(output)
  return gain
}

function createAudioGraph(): AudioGraph {
  const context = new AudioContext()
  const compressor = context.createDynamicsCompressor()
  compressor.connect(context.destination)
  const master = createGain(context, 0, compressor)
  const music = createGain(context, MUSIC_LEVEL, master)
  const effects = createGain(context, EFFECTS_LEVEL, master)

  const reverb = context.createConvolver()
  reverb.buffer = createReverbImpulse(context)
  reverb.connect(music)

  const echo = context.createDelay(1)
  echo.delayTime.value = ECHO_SECONDS
  const echoTone = context.createBiquadFilter()
  echoTone.type = 'lowpass'
  echoTone.frequency.value = ECHO_TONE
  echo.connect(echoTone)
  echoTone.connect(music)
  echoTone.connect(createGain(context, ECHO_FEEDBACK, echo))

  const layers = Object.fromEntries(LAYERS.map((layer) => {
    const mix = LAYER_MIX[layer]
    const panner = context.createStereoPanner()
    panner.pan.value = mix.pan
    panner.connect(music)
    if (mix.echo) panner.connect(createGain(context, mix.echo, echo))
    if (mix.reverb) panner.connect(createGain(context, mix.reverb, reverb))
    return [layer, createGain(context, 0, panner)]
  })) as Record<MusicLayer, GainNode>

  const noise = createNoiseBuffer(context)
  return { context, master, effects, layers, voices: createVoices(context, noise), soundEffects: createSoundEffects(context, noise) }
}

function logAudioError(cause: unknown) {
  console.error('Race audio is unavailable:', cause)
}

// The AudioContext is created on the first enable, which has to come from a user gesture.
export function createRaceAudio(): RaceAudio {
  let graph: AudioGraph | null = null
  let isEnabled = false
  let mood: MusicMood = 'grid'
  let step = 0
  let nextStepTime = 0
  let scheduler: number | undefined
  let suspendTimer: number | undefined

  const scheduleSteps = () => {
    if (!graph) return
    const { context, voices, layers } = graph
    // A throttled timer skips the missed steps instead of playing them all at once.
    if (nextStepTime < context.currentTime) nextStepTime = context.currentTime + START_OFFSET_SECONDS
    while (nextStepTime < context.currentTime + LOOKAHEAD_SECONDS) {
      for (const note of notesAtStep(step)) {
        if (layerLevel(mood, note.layer) === 0) continue
        voices[note.layer](layers[note.layer], nextStepTime, midiToFrequency(note.midi), note.steps * STEP_SECONDS, note.velocity)
      }
      step += 1
      nextStepTime += STEP_SECONDS
    }
  }

  const applyMood = (fadeSeconds: number) => {
    if (!graph) return
    const now = graph.context.currentTime
    for (const layer of LAYERS) {
      const gain = graph.layers[layer].gain
      gain.cancelScheduledValues(now)
      gain.setTargetAtTime(layerLevel(mood, layer), now, Math.max(MIN_TIME_CONSTANT, fadeSeconds / 3))
    }
  }

  const restartScore = (delaySeconds: number) => {
    if (!graph) return
    step = 0
    nextStepTime = graph.context.currentTime + delaySeconds
  }

  const handleVisibilityChange = () => {
    if (!graph || !isEnabled) return
    const update = document.hidden ? graph.context.suspend() : graph.context.resume()
    update.catch(logAudioError)
  }

  const disable = () => {
    isEnabled = false
    window.clearInterval(scheduler)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    if (!graph) return
    const { context, master } = graph
    master.gain.cancelScheduledValues(context.currentTime)
    master.gain.setTargetAtTime(0, context.currentTime, MASTER_FADE_SECONDS)
    suspendTimer = window.setTimeout(() => context.suspend().catch(logAudioError), SUSPEND_DELAY_MS)
  }

  const enable = () => {
    window.clearTimeout(suspendTimer)
    graph ??= createAudioGraph()
    const { context, master } = graph
    context.resume().catch(logAudioError)
    isEnabled = true
    master.gain.cancelScheduledValues(context.currentTime)
    master.gain.setTargetAtTime(MASTER_LEVEL, context.currentTime, MASTER_FADE_SECONDS)
    applyMood(0)
    restartScore(START_OFFSET_SECONDS)
    scheduler = window.setInterval(scheduleSteps, SCHEDULER_INTERVAL_MS)
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  return {
    setEnabled: (nextIsEnabled) => {
      if (nextIsEnabled === isEnabled) return
      if (nextIsEnabled) enable()
      else disable()
    },
    setMood: (nextMood) => {
      if (nextMood === mood) return
      const isLaunch = mood === 'countdown' && nextMood !== 'grid'
      mood = nextMood
      if (!isEnabled) return
      if (isLaunch) restartScore(LAUNCH_MUSIC_DELAY_SECONDS)
      applyMood(isLaunch ? 0 : MOOD_FADE_SECONDS)
    },
    play: (cue) => {
      if (!graph || !isEnabled) return
      graph.soundEffects[cue](graph.effects, graph.context.currentTime + EFFECT_OFFSET_SECONDS)
    },
    dispose: () => {
      disable()
      window.clearTimeout(suspendTimer)
      graph?.context.close().catch(logAudioError)
      graph = null
    },
  }
}
