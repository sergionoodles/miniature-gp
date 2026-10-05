import type { MusicLayer } from './raceMusic'

// Synthesized instruments for the race theme. Each voice schedules one note on the given
// output and cleans its nodes up once the note has finished.
export type Voice = (output: AudioNode, time: number, frequency: number, duration: number, velocity: number) => void

const NOISE_SECONDS = 1
const BELL_PARTIAL_RATIO = 2.76
const RELEASE_PADDING = 0.05

export function createNoiseBuffer(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * NOISE_SECONDS, context.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1
  return buffer
}

export function playNoise(context: BaseAudioContext, noise: AudioBuffer, output: AudioNode, time: number, duration: number) {
  const source = context.createBufferSource()
  source.buffer = noise
  source.loop = true
  source.connect(output)
  source.start(time, Math.random() * NOISE_SECONDS)
  source.stop(time + duration + RELEASE_PADDING)
}

export function createEnvelope(context: BaseAudioContext, output: AudioNode, time: number, peak: number, attack: number, decay: number): GainNode {
  const envelope = context.createGain()
  envelope.gain.setValueAtTime(0.0001, time)
  envelope.gain.exponentialRampToValueAtTime(peak, time + attack)
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay)
  envelope.connect(output)
  return envelope
}

export function playOscillator(context: BaseAudioContext, output: AudioNode, type: OscillatorType, frequency: number, time: number, duration: number, detune = 0): OscillatorNode {
  const oscillator = context.createOscillator()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, time)
  oscillator.detune.setValueAtTime(detune, time)
  oscillator.connect(output)
  oscillator.start(time)
  oscillator.stop(time + duration + RELEASE_PADDING)
  return oscillator
}

function createFilter(context: BaseAudioContext, output: AudioNode, type: BiquadFilterType, frequency: number, q = 1): BiquadFilterNode {
  const filter = context.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency
  filter.Q.value = q
  filter.connect(output)
  return filter
}

export function createVoices(context: BaseAudioContext, noise: AudioBuffer): Record<MusicLayer, Voice> {
  // Warm detuned saws behind a soft filter, swelling in and out across the bar.
  const pad: Voice = (output, time, frequency, duration, velocity) => {
    const filter = createFilter(context, output, 'lowpass', 1100)
    const envelope = context.createGain()
    envelope.gain.setValueAtTime(0, time)
    envelope.gain.linearRampToValueAtTime(0.06 * velocity, time + duration * 0.3)
    envelope.gain.linearRampToValueAtTime(0, time + duration + 0.3)
    envelope.connect(filter)
    for (const detune of [-9, 0, 9]) playOscillator(context, envelope, 'sawtooth', frequency, time, duration + 0.3, detune)
  }

  // A music-box tine: a sine with an inharmonic overtone that fades first.
  const bell: Voice = (output, time, frequency, duration, velocity) => {
    const decay = Math.min(1.6, duration)
    const body = createEnvelope(context, output, time, 0.16 * velocity, 0.004, decay)
    const shimmer = createEnvelope(context, output, time, 0.05 * velocity, 0.002, decay * 0.3)
    playOscillator(context, body, 'sine', frequency, time, decay)
    playOscillator(context, shimmer, 'sine', frequency * BELL_PARTIAL_RATIO, time, decay * 0.3)
  }

  // A plucky toy-synth square.
  const arp: Voice = (output, time, frequency, _duration, velocity) => {
    const filter = createFilter(context, output, 'lowpass', 2600)
    const envelope = createEnvelope(context, filter, time, 0.07 * velocity, 0.003, 0.14)
    playOscillator(context, envelope, 'square', frequency, time, 0.15)
  }

  // A saw bass with a closing filter sweep and a square sub underneath.
  const bass: Voice = (output, time, frequency, duration, velocity) => {
    const filter = createFilter(context, output, 'lowpass', 300, 6)
    filter.frequency.setValueAtTime(1600, time)
    filter.frequency.exponentialRampToValueAtTime(260, time + duration * 0.9)
    const envelope = createEnvelope(context, filter, time, 0.22 * velocity, 0.005, duration)
    playOscillator(context, envelope, 'sawtooth', frequency, time, duration)
    playOscillator(context, envelope, 'square', frequency / 2, time, duration)
  }

  const kick: Voice = (output, time, _frequency, _duration, velocity) => {
    const envelope = createEnvelope(context, output, time, 0.9 * velocity, 0.002, 0.32)
    const oscillator = playOscillator(context, envelope, 'sine', 150, time, 0.34)
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.12)
  }

  const snare: Voice = (output, time, _frequency, _duration, velocity) => {
    const snap = createEnvelope(context, createFilter(context, output, 'highpass', 1200), time, 0.35 * velocity, 0.002, 0.16)
    const body = createEnvelope(context, output, time, 0.25 * velocity, 0.002, 0.08)
    playNoise(context, noise, snap, time, 0.18)
    playOscillator(context, body, 'triangle', 190, time, 0.1)
  }

  const hat: Voice = (output, time, _frequency, _duration, velocity) => {
    const envelope = createEnvelope(context, createFilter(context, output, 'highpass', 7500), time, 0.16 * velocity, 0.001, 0.045)
    playNoise(context, noise, envelope, time, 0.06)
  }

  // Two detuned squares with a vibrato that arrives once the note settles.
  const lead: Voice = (output, time, frequency, duration, velocity) => {
    const filter = createFilter(context, output, 'lowpass', 3200)
    const envelope = context.createGain()
    envelope.gain.setValueAtTime(0, time)
    envelope.gain.linearRampToValueAtTime(0.07 * velocity, time + 0.015)
    envelope.gain.setTargetAtTime(0.05 * velocity, time + 0.05, 0.1)
    envelope.gain.setTargetAtTime(0, time + duration, 0.05)
    envelope.connect(filter)
    const vibrato = context.createOscillator()
    const vibratoDepth = context.createGain()
    vibrato.frequency.value = 5.5
    vibratoDepth.gain.setValueAtTime(0, time)
    vibratoDepth.gain.linearRampToValueAtTime(12, time + Math.min(0.4, duration))
    vibrato.connect(vibratoDepth)
    vibrato.start(time)
    vibrato.stop(time + duration + 0.4)
    for (const detune of [-6, 6]) {
      const oscillator = playOscillator(context, envelope, 'square', frequency, time, duration + 0.35, detune)
      vibratoDepth.connect(oscillator.detune)
    }
  }

  return { pad, bell, arp, bass, kick, snare, hat, lead }
}
