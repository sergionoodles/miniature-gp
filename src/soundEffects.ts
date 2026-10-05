import { createEnvelope, playNoise, playOscillator } from './audioVoices'
import { midiToFrequency } from './raceMusic'

export type SoundCue = 'startLight' | 'lightsOut' | 'chequeredFlag' | 'caution' | 'shutter'
type SoundEffect = (output: AudioNode, time: number) => void

const START_LIGHT_FREQUENCY = 440
const LIGHTS_OUT_FREQUENCY = 880
// Each car's engine climbs through the gears: [seconds after launch, frequency multiplier].
const GEAR_CHANGES: [number, number][] = [[0.95, 3.8], [1.05, 2.7], [1.95, 4.6], [2.05, 3.4], [3, 5.2]]
const FIELD = [{ delay: 0, pitch: 52, pan: -0.2 }, { delay: 0.06, pitch: 55, pan: 0.15 }, { delay: 0.14, pitch: 49, pan: -0.45 }, { delay: 0.22, pitch: 58, pan: 0.4 }]
const ENGINE_SECONDS = 3.4
const ENGINE_DRIVE = 0.25
const ENGINE_LEVEL = 0.13
const BRASS_RELEASE_SECONDS = 0.35
const FANFARE: [delay: number, midi: number, seconds: number][] = [[0, 69, 0.13], [0.14, 73, 0.13], [0.28, 76, 0.13], [0.42, 81, 1.7]]
const FANFARE_CHORD = [57, 61, 64]
const FANFARE_CHORD_DELAY = 0.42
const APPLAUSE_CLAPS = 260
const APPLAUSE_SECONDS = 3.6
const APPLAUSE_RISE_SECONDS = 0.5
// Matches the shutter animation: the blades close at 120 ms and part again from 156 ms.
const SHUTTER_CLICKS: [delay: number, level: number][] = [[0.11, 0.5], [0.16, 0.3]]
const CAUTION_TONES: [delay: number, frequency: number, seconds: number][] = [[0, 659.3, 0.2], [0.24, 523.3, 0.42]]

function createDistortion(context: BaseAudioContext, output: AudioNode): WaveShaperNode {
  const shaper = context.createWaveShaper()
  const curve = new Float32Array(256)
  for (let index = 0; index < curve.length; index++) curve[index] = Math.tanh((index / 128 - 1) * 3)
  shaper.curve = curve
  shaper.connect(output)
  return shaper
}

export function createSoundEffects(context: BaseAudioContext, noise: AudioBuffer): Record<SoundCue, SoundEffect> {
  const beep = (output: AudioNode, time: number, frequency: number, seconds: number) => {
    const envelope = createEnvelope(context, output, time, 0.35, 0.004, seconds)
    playOscillator(context, envelope, 'triangle', frequency, time, seconds)
    playOscillator(context, envelope, 'square', frequency, time, seconds, 3)
  }

  const engine = (output: AudioNode, time: number, pitch: number, pan: number) => {
    const panner = context.createStereoPanner()
    panner.pan.setValueAtTime(pan, time)
    panner.pan.linearRampToValueAtTime(-pan, time + ENGINE_SECONDS)
    panner.connect(output)
    const envelope = context.createGain()
    envelope.gain.setValueAtTime(0.0001, time)
    envelope.gain.exponentialRampToValueAtTime(ENGINE_LEVEL, time + 0.25)
    envelope.gain.setValueAtTime(ENGINE_LEVEL, time + ENGINE_SECONDS * 0.55)
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + ENGINE_SECONDS)
    envelope.connect(panner)
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(500, time)
    filter.frequency.exponentialRampToValueAtTime(2200, time + ENGINE_SECONDS * 0.6)
    filter.connect(envelope)
    const drive = context.createGain()
    drive.gain.value = ENGINE_DRIVE
    drive.connect(createDistortion(context, filter))
    for (const detune of [0, 14]) {
      const oscillator = playOscillator(context, drive, 'sawtooth', pitch, time, ENGINE_SECONDS, detune)
      for (const [seconds, multiplier] of GEAR_CHANGES) oscillator.frequency.exponentialRampToValueAtTime(pitch * multiplier, time + seconds)
    }
  }

  const brass = (output: AudioNode, time: number, midi: number, seconds: number, level: number) => {
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(700, time)
    filter.frequency.exponentialRampToValueAtTime(3400, time + 0.06)
    filter.frequency.exponentialRampToValueAtTime(1400, time + seconds)
    filter.connect(output)
    // Brass holds its note, unlike the plucked and struck voices.
    const envelope = context.createGain()
    envelope.gain.setValueAtTime(0, time)
    envelope.gain.linearRampToValueAtTime(level, time + 0.03)
    envelope.gain.linearRampToValueAtTime(level * 0.75, time + seconds * 0.4)
    envelope.gain.setValueAtTime(level * 0.75, time + seconds - Math.min(BRASS_RELEASE_SECONDS, seconds / 3))
    envelope.gain.linearRampToValueAtTime(0, time + seconds)
    envelope.connect(filter)
    for (const detune of [-8, 8]) playOscillator(context, envelope, 'sawtooth', midiToFrequency(midi), time, seconds, detune)
  }

  // Applause is a crowd of tiny noise bursts that thickens and then thins out.
  const applause = (output: AudioNode, time: number) => {
    const filter = context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1800
    filter.Q.value = 0.6
    filter.connect(output)
    for (let clap = 0; clap < APPLAUSE_CLAPS; clap++) {
      const offset = Math.random() * APPLAUSE_SECONDS
      const swell = Math.min(1, offset / APPLAUSE_RISE_SECONDS) * (1 - offset / APPLAUSE_SECONDS)
      const envelope = createEnvelope(context, filter, time + offset, 0.12 * swell * (0.4 + Math.random() * 0.6), 0.001, 0.025)
      playNoise(context, noise, envelope, time + offset, 0.03)
    }
  }

  return {
    startLight: (output, time) => beep(output, time, START_LIGHT_FREQUENCY, 0.22),
    lightsOut: (output, time) => {
      beep(output, time, LIGHTS_OUT_FREQUENCY, 0.6)
      for (const car of FIELD) engine(output, time + 0.08 + car.delay, car.pitch, car.pan)
      const rumble = createEnvelope(context, output, time + 0.08, 0.14, 0.05, 0.9)
      const rumbleFilter = context.createBiquadFilter()
      rumbleFilter.type = 'bandpass'
      rumbleFilter.frequency.value = 500
      rumbleFilter.connect(rumble)
      playNoise(context, noise, rumbleFilter, time + 0.08, 1)
    },
    chequeredFlag: (output, time) => {
      for (const [delay, midi, seconds] of FANFARE) brass(output, time + delay, midi, seconds, 0.12)
      for (const midi of FANFARE_CHORD) brass(output, time + FANFARE_CHORD_DELAY, midi, 1.7, 0.06)
      const crash = context.createBiquadFilter()
      crash.type = 'highpass'
      crash.frequency.value = 5000
      crash.connect(createEnvelope(context, output, time + FANFARE_CHORD_DELAY, 0.12, 0.003, 1.8))
      playNoise(context, noise, crash, time + FANFARE_CHORD_DELAY, 1.8)
      applause(output, time + 0.3)
    },
    caution: (output, time) => {
      for (const [delay, frequency, seconds] of CAUTION_TONES) {
        const envelope = createEnvelope(context, output, time + delay, 0.22, 0.006, seconds)
        playOscillator(context, envelope, 'sine', frequency, time + delay, seconds)
        playOscillator(context, envelope, 'triangle', frequency * 2, time + delay, seconds * 0.5)
      }
    },
    shutter: (output, time) => {
      for (const [delay, level] of SHUTTER_CLICKS) {
        const click = context.createBiquadFilter()
        click.type = 'bandpass'
        click.frequency.value = 3200
        click.Q.value = 1.4
        click.connect(createEnvelope(context, output, time + delay, level, 0.001, 0.03))
        playNoise(context, noise, click, time + delay, 0.04)
        const thump = createEnvelope(context, output, time + delay, level * 0.4, 0.001, 0.05)
        playOscillator(context, thump, 'sine', 140, time + delay, 0.06)
      }
    },
  }
}
