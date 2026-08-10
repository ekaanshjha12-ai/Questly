/**
 * Ambient sound, built on the Web Audio API.
 *
 * Most of these are generated rather than downloaded: a few seconds of noise are
 * synthesised once, then looped forever through a filter graph. Nothing streams,
 * so playback can run indefinitely, starts instantly, works offline and costs no
 * bandwidth.
 *
 * One sound is a real recording, kept because a warm recorded hiss is nicer to
 * sit with than raw synthesis. It was trimmed to a short loop and crossfaded at
 * the seam so it repeats inaudibly — the full five-minute original would have
 * been a 9MB download for material that is identical every second.
 */

export type SoundId = 'deep' | 'white' | 'pink' | 'brown' | 'rain' | 'waves'

export interface SoundDef {
  id: SoundId
  name: string
  blurb: string
  icon: string
  /** Set for recorded sounds. Everything else is generated at runtime. */
  src?: string
  /**
   * Per-sound level trim. Measured from real output: raw white noise came out
   * roughly three times louder than pink, so without this the volume slider
   * would mean something different for every sound and switching would jolt
   * the listener.
   */
  trim: number
}

export const SOUNDS: SoundDef[] = [
  {
    id: 'deep',
    name: 'Deep white noise',
    blurb: 'A soft, warm recording. Easiest to sit with.',
    icon: '🎧',
    src: '/audio/deep-white-noise.mp3',
    trim: 0.82,
  },
  { id: 'white', name: 'White noise', blurb: 'Flat, bright hiss. Masks voices well.', icon: '⚪', trim: 0.31 },
  { id: 'pink', name: 'Pink noise', blurb: 'Softer than white. Easiest on the ears.', icon: '🌸', trim: 0.99 },
  { id: 'brown', name: 'Brown noise', blurb: 'Deep and rumbling, like distant traffic.', icon: '🟤', trim: 0.87 },
  { id: 'rain', name: 'Rain', blurb: 'Steady rainfall on a window.', icon: '🌧️', trim: 0.45 },
  { id: 'waves', name: 'Ocean', blurb: 'Slow swells rolling in and out.', icon: '🌊', trim: 1.06 },
]

const BUFFER_SECONDS = 6
/** Crossfade length at the loop seam, in samples. Long enough to hide the join,
 * short enough not to dull the texture. */
const SEAM = 4096

function fillWhite(data: Float32Array) {
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
}

/** Paul Kellet's pink-noise approximation: a bank of one-pole filters summed to
 * give roughly -3dB per octave. */
function fillPink(data: Float32Array) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
}

/** Leaky integration of white noise — roughly -6dB per octave. */
function fillBrown(data: Float32Array) {
  let last = 0
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1
    last = (last + 0.02 * w) / 1.02
    data[i] = last * 3.5
  }
}

/**
 * Builds a buffer whose end blends into its beginning, so looping it produces
 * no click. Extra samples are generated past the requested length, then folded
 * back over the opening samples and discarded.
 */
function makeLoopable(ctx: BaseAudioContext, kind: SoundId, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate
  const length = Math.floor(seconds * rate)
  const scratch = new Float32Array(length + SEAM)

  if (kind === 'brown' || kind === 'waves') fillBrown(scratch)
  else if (kind === 'pink') fillPink(scratch)
  else fillWhite(scratch)

  for (let i = 0; i < SEAM; i++) {
    const t = i / SEAM
    scratch[i] = scratch[i] * t + scratch[length + i] * (1 - t)
  }

  const buffer = ctx.createBuffer(1, length, rate)
  buffer.copyToChannel(scratch.subarray(0, length), 0)
  return buffer
}

/**
 * Slider position to actual gain. Loudness is perceived roughly logarithmically,
 * so a linear slider feels far too loud across most of its travel and crams all
 * the usable quiet settings into the bottom sliver. Squaring spreads the gentle
 * end out where people actually listen.
 */
function gainFor(volume: number): number {
  return volume * volume
}

export interface NoiseEngine {
  play(sound: SoundId): Promise<void>
  stop(): void
  setVolume(value: number): void
  /** Current output level, 0–1. Drives the meter and proves audio is flowing. */
  level(): number
  dispose(): void
}

export function createNoiseEngine(): NoiseEngine {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let analyser: AnalyserNode | null = null
  let chain: AudioNode[] = []
  let source: AudioBufferSourceNode | null = null
  let lfos: OscillatorNode[] = []
  let generation = 0
  let meterData: Float32Array | null = null
  let volume = 0.5
  const buffers = new Map<SoundId, AudioBuffer>()

  function ensureContext(): AudioContext {
    if (!ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = 0
      analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      meterData = new Float32Array(analyser.fftSize)
      master.connect(analyser)
      analyser.connect(ctx.destination)
    }
    return ctx
  }

  function teardownVoice() {
    if (source) {
      try {
        source.stop()
      } catch {
        // Already stopped — nothing to do.
      }
      source.disconnect()
      source = null
    }
    for (const lfo of lfos) {
      try {
        lfo.stop()
      } catch {
        // Already stopped.
      }
      lfo.disconnect()
    }
    lfos = []
    for (const node of chain) node.disconnect()
    chain = []
  }

  /** Recorded sounds are fetched and decoded once, then cached like the
   * generated ones. The file is already crossfaded to loop cleanly. */
  async function loadBuffer(context: AudioContext, sound: SoundDef): Promise<AudioBuffer> {
    const cached = buffers.get(sound.id)
    if (cached) return cached

    if (sound.src) {
      const res = await fetch(sound.src)
      if (!res.ok) throw new Error(`Could not load ${sound.src}`)
      const decoded = await context.decodeAudioData(await res.arrayBuffer())
      buffers.set(sound.id, decoded)
      return decoded
    }

    const generated = makeLoopable(context, sound.id, BUFFER_SECONDS)
    buffers.set(sound.id, generated)
    return generated
  }

  /** Wires the buffer through whatever filtering the chosen sound needs. */
  function buildVoice(context: AudioContext, sound: SoundDef, buffer: AudioBuffer, destination: AudioNode) {
    const src = context.createBufferSource()
    src.buffer = buffer
    src.loop = true

    let tail: AudioNode = src

    if (sound.id === 'rain') {
      // Roll off the rumble and the very top so it reads as rainfall on glass
      // rather than undifferentiated hiss.
      const high = context.createBiquadFilter()
      high.type = 'highpass'
      high.frequency.value = 500
      const low = context.createBiquadFilter()
      low.type = 'lowpass'
      low.frequency.value = 7000
      tail.connect(high)
      high.connect(low)
      tail = low
      chain.push(high, low)
    }

    if (sound.id === 'waves') {
      // A slow filter sweep plus a matching volume swell gives the sense of
      // surf rolling in and receding.
      const low = context.createBiquadFilter()
      low.type = 'lowpass'
      low.frequency.value = 500
      const swell = context.createGain()
      swell.gain.value = 0.65

      const sweep = context.createOscillator()
      sweep.frequency.value = 0.07 // one swell roughly every 14 seconds
      const sweepDepth = context.createGain()
      sweepDepth.gain.value = 320
      sweep.connect(sweepDepth)
      sweepDepth.connect(low.frequency)

      const pulse = context.createOscillator()
      pulse.frequency.value = 0.07
      const pulseDepth = context.createGain()
      pulseDepth.gain.value = 0.3
      pulse.connect(pulseDepth)
      pulseDepth.connect(swell.gain)

      tail.connect(low)
      low.connect(swell)
      tail = swell

      sweep.start()
      pulse.start()
      lfos.push(sweep, pulse)
      chain.push(low, swell, sweepDepth, pulseDepth)
    }

    // Level trim sits last, so it applies whatever filtering came before.
    const trim = context.createGain()
    trim.gain.value = sound.trim
    tail.connect(trim)
    trim.connect(destination)
    chain.push(trim)

    src.start()
    source = src
  }

  return {
    async play(sound: SoundId) {
      const context = ensureContext()
      // Browsers start the context suspended until a user gesture unlocks it.
      if (context.state === 'suspended') await context.resume()

      const def = SOUNDS.find((s) => s.id === sound)
      if (!def) return

      // Decoding a file is async, so a fast switch between sounds could let an
      // earlier load finish last and win. This token makes stale loads no-ops.
      const token = ++generation
      // Rain reuses the plain white buffer and shapes it with filters.
      const buffer = await loadBuffer(context, def.id === 'rain' ? SOUNDS[1] : def)
      if (token !== generation) return

      teardownVoice()
      buildVoice(context, def, buffer, master!)

      const now = context.currentTime
      master!.gain.cancelScheduledValues(now)
      master!.gain.setValueAtTime(master!.gain.value, now)
      master!.gain.linearRampToValueAtTime(gainFor(volume), now + 0.4)
    },

    stop() {
      generation++
      if (!ctx || !master) return
      const now = ctx.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(master.gain.value, now)
      // Ramp down before cutting the source, otherwise the stop clicks.
      master.gain.linearRampToValueAtTime(0, now + 0.3)
      const dying = source
      window.setTimeout(() => {
        if (source === dying) teardownVoice()
      }, 350)
    },

    setVolume(value: number) {
      volume = Math.max(0, Math.min(1, value))
      if (!ctx || !master || !source) return
      const now = ctx.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(master.gain.value, now)
      master.gain.linearRampToValueAtTime(gainFor(volume), now + 0.08)
    },

    level() {
      if (!analyser || !meterData || !source) return 0
      analyser.getFloatTimeDomainData(meterData)
      let sum = 0
      for (let i = 0; i < meterData.length; i++) sum += meterData[i] * meterData[i]
      const rms = Math.sqrt(sum / meterData.length)
      return Math.min(1, rms * 4)
    },

    dispose() {
      teardownVoice()
      if (ctx) void ctx.close()
      ctx = null
      master = null
      analyser = null
      meterData = null
      buffers.clear()
    },
  }
}
