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

export type SoundId =
  | 'deep'
  | 'white'
  | 'pink'
  | 'brown'
  | 'rain'
  | 'downpour'
  | 'waves'
  | 'stream'
  | 'wind'
  | 'forest'
  | 'fan'
  | 'aircon'
  | 'cabin'
  | 'train'
  | 'underwater'
  | 'cave'
  | 'night'

/** One filter stage in a sound's chain. */
export interface FilterSpec {
  type: BiquadFilterType
  freq: number
  q?: number
  gain?: number
}

/**
 * How a sound is built. Declaring the chain rather than branching per sound
 * keeps sixteen sounds from becoming sixteen special cases in the engine.
 */
export interface Recipe {
  /** Which noise colour feeds the chain. */
  source: 'white' | 'pink' | 'brown'
  filters?: FilterSpec[]
  /** Slowly sweeps one filter's cutoff — wind moving, surf rolling in. */
  sweep?: { filter: number; rate: number; depth: number }
  /** Slowly swells the volume. Rate in Hz, depth 0-1. */
  pulse?: { rate: number; depth: number }
}

export interface SoundDef {
  id: SoundId
  name: string
  blurb: string
  icon: string
  /** Set for recorded sounds. Everything else is generated at runtime. */
  src?: string
  /** Absent for recordings, which need no synthesis. */
  recipe?: Recipe
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
    trim: 1.32,
  },
  {
    id: 'white', name: 'White noise', blurb: 'Flat, bright hiss. Masks voices well.', icon: '⚪',
    recipe: { source: 'white' }, trim: 0.31,
  },
  {
    id: 'pink', name: 'Pink noise', blurb: 'Softer than white. Easiest on the ears.', icon: '🌸',
    recipe: { source: 'pink' }, trim: 0.93,
  },
  {
    id: 'brown', name: 'Brown noise', blurb: 'Deep and rumbling, like distant traffic.', icon: '🟤',
    recipe: { source: 'brown' }, trim: 0.98,
  },
  {
    id: 'rain', name: 'Rain', blurb: 'Steady rainfall on a window.', icon: '🌧️',
    recipe: {
      source: 'white',
      filters: [
        { type: 'highpass', freq: 500 },
        { type: 'lowpass', freq: 7000 },
      ],
    },
    trim: 0.45,
  },
  {
    id: 'downpour', name: 'Heavy rain', blurb: 'A real downpour, close and loud.', icon: '⛈️',
    recipe: {
      source: 'white',
      filters: [
        { type: 'highpass', freq: 260 },
        { type: 'lowpass', freq: 11000 },
        { type: 'peaking', freq: 1800, q: 0.7, gain: 4 },
      ],
      pulse: { rate: 0.11, depth: 0.14 },
    },
    trim: 0.34,
  },
  {
    id: 'waves', name: 'Ocean', blurb: 'Slow swells rolling in and out.', icon: '🌊',
    recipe: {
      source: 'brown',
      filters: [{ type: 'lowpass', freq: 500 }],
      sweep: { filter: 0, rate: 0.07, depth: 320 },
      pulse: { rate: 0.07, depth: 0.32 },
    },
    trim: 1.19,
  },
  {
    id: 'stream', name: 'Stream', blurb: 'Water running over stones.', icon: '💧',
    recipe: {
      source: 'white',
      filters: [
        { type: 'bandpass', freq: 1400, q: 0.55 },
        { type: 'peaking', freq: 3200, q: 1.2, gain: 6 },
      ],
      sweep: { filter: 0, rate: 0.5, depth: 420 },
    },
    trim: 0.65,
  },
  {
    id: 'wind', name: 'Wind', blurb: 'Gusts moving through an open space.', icon: '🌬️',
    recipe: {
      source: 'pink',
      filters: [{ type: 'bandpass', freq: 420, q: 0.7 }],
      sweep: { filter: 0, rate: 0.05, depth: 300 },
      pulse: { rate: 0.05, depth: 0.4 },
    },
    trim: 2.92,
  },
  {
    id: 'forest', name: 'Forest', blurb: 'Leaves stirring high in the canopy.', icon: '🌲',
    recipe: {
      source: 'white',
      filters: [
        { type: 'highpass', freq: 1800 },
        { type: 'lowpass', freq: 9000 },
      ],
      sweep: { filter: 1, rate: 0.09, depth: 2200 },
      pulse: { rate: 0.09, depth: 0.3 },
    },
    trim: 0.42,
  },
  {
    id: 'fan', name: 'Desk fan', blurb: 'A steady blade hum a metre away.', icon: '🌀',
    recipe: {
      source: 'brown',
      filters: [
        { type: 'lowpass', freq: 1400 },
        { type: 'peaking', freq: 190, q: 3.5, gain: 9 },
      ],
      pulse: { rate: 2.6, depth: 0.06 },
    },
    trim: 0.84,
  },
  {
    id: 'aircon', name: 'Air conditioning', blurb: 'The hum of an office that never sleeps.', icon: '❄️',
    recipe: {
      source: 'pink',
      filters: [
        { type: 'lowpass', freq: 2200 },
        { type: 'peaking', freq: 120, q: 2.5, gain: 7 },
        { type: 'notch', freq: 900, q: 1.4 },
      ],
    },
    trim: 1.02,
  },
  {
    id: 'cabin', name: 'Aeroplane cabin', blurb: 'Cruising at altitude, engines behind you.', icon: '✈️',
    recipe: {
      source: 'brown',
      filters: [
        { type: 'lowpass', freq: 900 },
        { type: 'peaking', freq: 95, q: 2, gain: 8 },
        { type: 'peaking', freq: 320, q: 1.5, gain: 3 },
      ],
    },
    trim: 0.72,
  },
  {
    id: 'train', name: 'Train carriage', blurb: 'Rolling stock and rhythm on the rails.', icon: '🚆',
    recipe: {
      source: 'brown',
      filters: [
        { type: 'lowpass', freq: 1100 },
        { type: 'peaking', freq: 150, q: 2.2, gain: 6 },
      ],
      pulse: { rate: 1.7, depth: 0.22 },
    },
    trim: 1.13,
  },
  {
    id: 'underwater', name: 'Underwater', blurb: 'Submerged, everything muffled above.', icon: '🫧',
    recipe: {
      source: 'brown',
      filters: [
        { type: 'lowpass', freq: 320 },
        { type: 'peaking', freq: 160, q: 1.8, gain: 5 },
      ],
      sweep: { filter: 0, rate: 0.13, depth: 120 },
      pulse: { rate: 0.13, depth: 0.25 },
    },
    trim: 0.9,
  },
  {
    id: 'cave', name: 'Deep cave', blurb: 'Vast, low and still. Almost nothing up top.', icon: '🕳️',
    recipe: {
      source: 'brown',
      filters: [
        { type: 'lowpass', freq: 180 },
        { type: 'peaking', freq: 70, q: 1.6, gain: 7 },
      ],
      pulse: { rate: 0.04, depth: 0.3 },
    },
    trim: 1.08,
  },
  {
    id: 'night', name: 'Night air', blurb: 'Thin, high and quiet. Late and far from traffic.', icon: '🌙',
    recipe: {
      source: 'white',
      filters: [
        { type: 'highpass', freq: 3200 },
        { type: 'lowpass', freq: 12000 },
        { type: 'peaking', freq: 6000, q: 0.8, gain: 3 },
      ],
      pulse: { rate: 0.06, depth: 0.25 },
    },
    trim: 0.33,
  },
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
function makeLoopable(ctx: BaseAudioContext, colour: Recipe['source'], seconds: number): AudioBuffer {
  const rate = ctx.sampleRate
  const length = Math.floor(seconds * rate)
  const scratch = new Float32Array(length + SEAM)

  if (colour === 'brown') fillBrown(scratch)
  else if (colour === 'pink') fillPink(scratch)
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
  const buffers = new Map<string, AudioBuffer>()

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
    if (sound.src) {
      const cached = buffers.get(sound.id)
      if (cached) return cached
      const res = await fetch(sound.src)
      if (!res.ok) throw new Error(`Could not load ${sound.src}`)
      const decoded = await context.decodeAudioData(await res.arrayBuffer())
      buffers.set(sound.id, decoded)
      return decoded
    }

    // Keyed by noise colour, not by sound: the filtering is what makes rain
    // differ from wind, so a dozen sounds share three generated buffers.
    const colour = sound.recipe?.source ?? 'white'
    const cached = buffers.get(colour)
    if (cached) return cached
    const generated = makeLoopable(context, colour, BUFFER_SECONDS)
    buffers.set(colour, generated)
    return generated
  }

  /** Builds the node chain described by a sound's recipe. */
  function buildVoice(context: AudioContext, sound: SoundDef, buffer: AudioBuffer, destination: AudioNode) {
    const src = context.createBufferSource()
    src.buffer = buffer
    src.loop = true

    let tail: AudioNode = src
    const recipe = sound.recipe
    const built: BiquadFilterNode[] = []

    for (const spec of recipe?.filters ?? []) {
      const filter = context.createBiquadFilter()
      filter.type = spec.type
      filter.frequency.value = spec.freq
      if (spec.q !== undefined) filter.Q.value = spec.q
      if (spec.gain !== undefined) filter.gain.value = spec.gain
      tail.connect(filter)
      tail = filter
      built.push(filter)
      chain.push(filter)
    }

    // A slow oscillator pushed into a filter's frequency makes the sound move —
    // surf rolling in, wind rising and falling — instead of sitting still.
    if (recipe?.sweep && built[recipe.sweep.filter]) {
      const lfo = context.createOscillator()
      lfo.frequency.value = recipe.sweep.rate
      const depth = context.createGain()
      depth.gain.value = recipe.sweep.depth
      lfo.connect(depth)
      depth.connect(built[recipe.sweep.filter].frequency)
      lfo.start()
      lfos.push(lfo)
      chain.push(depth)
    }

    if (recipe?.pulse) {
      const swell = context.createGain()
      // Centre the gain so the modulation swings around it rather than clipping.
      swell.gain.value = 1 - recipe.pulse.depth
      const lfo = context.createOscillator()
      lfo.frequency.value = recipe.pulse.rate
      const depth = context.createGain()
      depth.gain.value = recipe.pulse.depth
      lfo.connect(depth)
      depth.connect(swell.gain)
      tail.connect(swell)
      tail = swell
      lfo.start()
      lfos.push(lfo)
      chain.push(swell, depth)
    }

    // Level trim sits last, so it applies to whatever filtering came before.
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
      const buffer = await loadBuffer(context, def)
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
