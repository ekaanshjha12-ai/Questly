/**
 * The band behind Sounds: music theory helpers, the shared buses a style plays
 * into, and every instrument, each built from Web Audio nodes.
 *
 * Styles live in chill.ts, calm.ts and world.ts; the player is in ../music.ts.
 */

/* --- small helpers --------------------------------------------------------- */

export const mtof = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)
export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
export const chance = (p: number) => Math.random() < p
export const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]
/** A few milliseconds either way, so nothing lands exactly on the grid. */
export const humanize = (ms: number) => rand(-ms, ms) / 1000

export const MAJOR = [0, 2, 4, 5, 7, 9, 11]

/** Chord shapes as intervals from the root, extensions included. */
export const Q = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  six9: [0, 4, 9, 14],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  dom7: [0, 4, 7, 10],
  dom9: [0, 4, 10, 14],
  dom13: [0, 4, 10, 14, 21],
  dom7b9: [0, 4, 10, 13],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  sus: [0, 5, 7, 10, 14],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  six: [0, 4, 7, 9],
} as const
export type Quality = keyof typeof Q

/** One chord in a bar: its root as a pitch class, its shape, and where it sits. */
export interface Slot {
  root: number
  tones: readonly number[]
  beat: number
  beats: number
}

/** A progression is a list of bars; each bar holds one chord, or two of two beats. */
export type Progression = [number, Quality][][]

export function expand(progression: Progression, key: number): Slot[][] {
  return progression.map((bar) =>
    bar.map(([degree, quality], i) => ({
      root: (key + degree) % 12,
      tones: Q[quality],
      beat: bar.length === 1 ? 0 : i * 2,
      beats: bar.length === 1 ? 4 : 2,
    })),
  )
}

/** The note of pitch class `pc` nearest to `target`. */
export function nearest(pc: number, target: number): number {
  const base = target - (((target - pc) % 12) + 12) % 12
  return target - base > 6 ? base + 12 : base
}

/**
 * Stacks a chord's tones upward from around `low`, trying each tone at the
 * bottom and keeping the voicing that moves least from the last one — which is
 * what makes chords flow into each other rather than jump about.
 */
export function voice(slot: Slot, low: number, prev: number[] | null, { rootless = false, max = 5 } = {}): number[] {
  let tones = slot.tones.map((i) => (slot.root + i) % 12)
  if (rootless && tones.length > 3) tones = tones.slice(1)
  tones = [...new Set(tones)].slice(0, max)
  const centre = prev?.length ? prev.reduce((a, b) => a + b, 0) / prev.length : low + 7
  let best: number[] = []
  let bestScore = Infinity
  for (let r = 0; r < tones.length; r++) {
    const order = [...tones.slice(r), ...tones.slice(0, r)]
    const notes: number[] = []
    let last = low - 1
    for (const pc of order) {
      let n = nearest(pc, last + 1)
      while (n <= last) n += 12
      notes.push(n)
      last = n
    }
    const mean = notes.reduce((a, b) => a + b, 0) / notes.length
    const score = Math.abs(mean - centre) + (notes[notes.length - 1] - notes[0]) * 0.15
    if (score < bestScore) {
      bestScore = score
      best = notes
    }
  }
  return best
}

/** The note one scale step up or down from `midi`, within a key. */
export function step(midi: number, dir: 1 | -1, key: number, scale: number[]): number {
  let n = midi + dir
  while (!scale.includes((((n - key) % 12) + 12) % 12)) n += dir
  return n
}

/* --- the band -------------------------------------------------------------- */

/** Everything a style plays into: shared buses, a reverb, a noise buffer. */
export interface Kit {
  ctx: BaseAudioContext
  out: GainNode
  drums: GainNode
  keys: GainNode
  bass: GainNode
  lead: GainNode
  reverb: GainNode
  echo: GainNode | null
  noise: AudioBuffer
  plucks: Map<number, { buffer: AudioBuffer; rate: number }>
  nodes: AudioNode[]
  sources: AudioScheduledSourceNode[]
}

export function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    let smooth = 0
    for (let i = 0; i < length; i++) {
      // Filtered noise, so the tail is warm rather than hissy.
      smooth = smooth * 0.55 + (Math.random() * 2 - 1) * 0.45
      data[i] = smooth * Math.pow(1 - i / length, decay)
    }
  }
  return buffer
}

export function makeKit(
  ctx: BaseAudioContext,
  destination: AudioNode,
  { level, reverbSeconds, sends, lowpass, echoBeats, spb }: {
    level: number
    reverbSeconds: number
    sends: { drums: number; keys: number; bass: number; lead: number }
    lowpass: number | null
    echoBeats: number | null
    spb: number
  },
): Kit {
  const nodes: AudioNode[] = []
  const keep = <T extends AudioNode>(node: T) => {
    nodes.push(node)
    return node
  }

  const out = keep(ctx.createGain())
  out.gain.value = 0
  const comp = keep(ctx.createDynamicsCompressor())
  comp.threshold.value = -16
  comp.knee.value = 12
  comp.ratio.value = 3
  comp.attack.value = 0.01
  comp.release.value = 0.25
  const trim = keep(ctx.createGain())
  trim.gain.value = level

  let tail: AudioNode = out
  if (lowpass) {
    const tone = keep(ctx.createBiquadFilter())
    tone.type = 'lowpass'
    tone.frequency.value = lowpass
    tone.Q.value = 0.3
    tail.connect(tone)
    tail = tone
  }
  tail.connect(comp)
  comp.connect(trim)
  trim.connect(destination)

  const convolver = keep(ctx.createConvolver())
  convolver.buffer = impulse(ctx, reverbSeconds, 2.6)
  const wet = keep(ctx.createGain())
  wet.gain.value = 1
  convolver.connect(wet)
  wet.connect(out)
  const reverb = keep(ctx.createGain())
  reverb.connect(convolver)

  const bus = (send: number) => {
    const g = keep(ctx.createGain())
    g.connect(out)
    if (send > 0) {
      const s = keep(ctx.createGain())
      s.gain.value = send
      g.connect(s)
      s.connect(reverb)
    }
    return g
  }

  let echo: GainNode | null = null
  if (echoBeats) {
    echo = keep(ctx.createGain())
    const delay = keep(ctx.createDelay(2))
    delay.delayTime.value = echoBeats * spb
    const feedback = keep(ctx.createGain())
    feedback.gain.value = 0.36
    const damp = keep(ctx.createBiquadFilter())
    damp.type = 'lowpass'
    damp.frequency.value = 2600
    const echoWet = keep(ctx.createGain())
    echoWet.gain.value = 0.45
    echo.connect(delay)
    delay.connect(damp)
    damp.connect(feedback)
    feedback.connect(delay)
    damp.connect(echoWet)
    echoWet.connect(out)
  }

  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

  return {
    ctx,
    out,
    drums: bus(sends.drums),
    keys: bus(sends.keys),
    bass: bus(sends.bass),
    lead: bus(sends.lead),
    reverb,
    echo,
    noise,
    plucks: new Map(),
    nodes,
    sources: [],
  }
}

/** Starts a source and forgets it once it has finished, so hours of notes do
 * not pile up in memory. */
export function run(kit: Kit, src: AudioScheduledSourceNode, start: number, stop: number) {
  src.start(start)
  src.stop(stop)
  kit.sources.push(src)
  src.onended = () => {
    const i = kit.sources.indexOf(src)
    if (i >= 0) kit.sources.splice(i, 1)
    src.disconnect()
  }
}

export function panned(kit: Kit, dest: AudioNode, pan: number): AudioNode {
  if (!pan || !('createStereoPanner' in kit.ctx)) return dest
  const p = kit.ctx.createStereoPanner()
  p.pan.value = Math.max(-1, Math.min(1, pan))
  p.connect(dest)
  return p
}

/** Attack, then an exponential fall towards `sustain`, then a release. */
export function envelope(param: AudioParam, t: number, { attack, peak, sustain, decay, release, end }: {
  attack: number
  peak: number
  sustain: number
  decay: number
  release: number
  end: number
}) {
  const releaseAt = Math.max(t + attack + 0.01, end)
  param.setValueAtTime(0, t)
  param.linearRampToValueAtTime(peak, t + attack)
  param.setTargetAtTime(sustain, t + attack, decay)
  param.setTargetAtTime(0, releaseAt, release)
  return releaseAt + release * 6
}

export function noiseHit(kit: Kit, dest: AudioNode, t: number, { type, freq, q = 0.7, attack = 0.001, decay, gain }: {
  type: BiquadFilterType
  freq: number
  q?: number
  attack?: number
  decay: number
  gain: number
}) {
  const { ctx } = kit
  const src = ctx.createBufferSource()
  src.buffer = kit.noise
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.frequency.value = freq
  filter.Q.value = q
  const amp = ctx.createGain()
  const stop = envelope(amp.gain, t, { attack, peak: gain, sustain: 0, decay, release: 0.01, end: t + attack + decay * 4 })
  src.connect(filter)
  filter.connect(amp)
  amp.connect(dest)
  // A different stretch of the noise each time, so repeated hits are not
  // identical — but early enough that a long hit does not run off the end.
  src.start(t, Math.random() * 0.4)
  src.stop(stop)
  kit.sources.push(src)
  src.onended = () => {
    const i = kit.sources.indexOf(src)
    if (i >= 0) kit.sources.splice(i, 1)
    src.disconnect()
  }
}

/** A Rhodes-like electric piano: a sine carrier bent by a sine at the same
 * pitch, bright on the strike and mellowing as it rings, plus the metallic
 * "tine" at the very start. */
export function epiano(kit: Kit, t: number, midi: number, dur: number, vel: number, pan = 0, dest: AudioNode = kit.keys) {
  const { ctx } = kit
  const f = mtof(midi)
  const out = panned(kit, dest, pan)
  const amp = ctx.createGain()
  const stop = envelope(amp.gain, t, { attack: 0.004, peak: 0.13 * vel, sustain: 0.03 * vel, decay: 0.9, release: 0.14, end: t + dur })
  amp.connect(out)

  const carrier = ctx.createOscillator()
  carrier.frequency.value = f
  const mod = ctx.createOscillator()
  mod.frequency.value = f
  const depth = ctx.createGain()
  depth.gain.setValueAtTime(f * (0.9 + vel * 1.6), t)
  depth.gain.setTargetAtTime(f * 0.18, t, 0.3)
  mod.connect(depth)
  depth.connect(carrier.frequency)
  carrier.connect(amp)

  const tine = ctx.createOscillator()
  tine.frequency.value = f * 7.1
  const tineAmp = ctx.createGain()
  envelope(tineAmp.gain, t, { attack: 0.002, peak: 0.035 * vel, sustain: 0, decay: 0.035, release: 0.02, end: t + 0.3 })
  tine.connect(tineAmp)
  tineAmp.connect(amp)

  run(kit, carrier, t, stop)
  run(kit, mod, t, stop)
  run(kit, tine, t, Math.min(stop, t + 0.5))
}

/** A piano from its first four partials, each dying away faster than the one
 * below, through a filter that closes as the note rings. */
export function piano(kit: Kit, t: number, midi: number, dur: number, vel: number, pan = 0, light = false) {
  const { ctx } = kit
  const f = mtof(midi)
  const out = panned(kit, kit.keys, pan)
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.setValueAtTime(900 + 5200 * vel, t)
  tone.frequency.setTargetAtTime(700 + 1500 * vel, t, 0.5)
  tone.connect(out)

  const ring = Math.max(0.8, Math.min(4.2, 3.6 - (midi - 48) * 0.06))
  // Short comping chords come thick and fast; three partials and no hammer
  // are plenty for a chord gone in half a beat.
  const partials = light ? [1, 0.5, 0.24] : [1, 0.48, 0.27, 0.14]
  let last = t
  partials.forEach((level, i) => {
    const n = i + 1
    const osc = ctx.createOscillator()
    osc.frequency.value = f * n * Math.sqrt(1 + 0.00025 * n * n)
    const amp = ctx.createGain()
    const decay = ring / (2.2 * Math.pow(n, 0.75))
    // A partial that has rung itself out is silent whatever the key is doing,
    // so it stops there rather than at the end of the note.
    const stop = Math.min(
      t + 0.003 + decay * 7,
      envelope(amp.gain, t, { attack: 0.003, peak: 0.075 * vel * level, sustain: 0, decay, release: 0.14, end: t + dur }),
    )
    osc.connect(amp)
    amp.connect(tone)
    run(kit, osc, t, stop)
    last = Math.max(last, stop)
  })
  // The hammer: a short knock that sells it as struck rather than blown.
  if (!light) noiseHit(kit, tone, t, { type: 'bandpass', freq: Math.min(8000, f * 5), q: 1.2, decay: 0.012, gain: 0.02 * vel })
  return last
}

/** A vibraphone: a pure tone, its fourth partial for the bar's ring, and the
 * slow shimmer of the motor. */
export function vibes(kit: Kit, t: number, midi: number, dur: number, vel: number, pan = 0) {
  const { ctx } = kit
  const f = mtof(midi)
  const out = panned(kit, kit.lead, pan)
  const trem = ctx.createGain()
  trem.gain.value = 0.82
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 5.2
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 0.18
  lfo.connect(lfoDepth)
  lfoDepth.connect(trem.gain)
  trem.connect(out)

  const amp = ctx.createGain()
  const stop = envelope(amp.gain, t, { attack: 0.002, peak: 0.11 * vel, sustain: 0, decay: 0.75, release: 0.12, end: t + dur })
  amp.connect(trem)
  const body = ctx.createOscillator()
  body.frequency.value = f
  body.connect(amp)
  const bar = ctx.createOscillator()
  bar.frequency.value = f * 4
  const barAmp = ctx.createGain()
  envelope(barAmp.gain, t, { attack: 0.002, peak: 0.25, sustain: 0, decay: 0.08, release: 0.02, end: t + 0.4 })
  bar.connect(barAmp)
  barAmp.connect(amp)
  run(kit, body, t, stop)
  run(kit, bar, t, Math.min(stop, t + 0.6))
  run(kit, lfo, t, stop)
}

/** A soft flute-ish lead: sine and triangle, a breath at the start, and
 * vibrato that arrives once the note has settled. */
export function flute(kit: Kit, t: number, midi: number, dur: number, vel: number) {
  const { ctx } = kit
  const f = mtof(midi)
  const amp = ctx.createGain()
  const stop = envelope(amp.gain, t, { attack: 0.07, peak: 0.07 * vel, sustain: 0.055 * vel, decay: 0.4, release: 0.09, end: t + dur })
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 3200
  amp.connect(tone)
  tone.connect(kit.lead)
  const a = ctx.createOscillator()
  a.frequency.value = f
  const b = ctx.createOscillator()
  b.type = 'triangle'
  b.frequency.value = f
  const bAmp = ctx.createGain()
  bAmp.gain.value = 0.35
  const vib = ctx.createOscillator()
  vib.frequency.value = 5
  const vibDepth = ctx.createGain()
  vibDepth.gain.setValueAtTime(0, t)
  vibDepth.gain.linearRampToValueAtTime(7, t + Math.min(0.4, dur * 0.6))
  vib.connect(vibDepth)
  vibDepth.connect(a.detune)
  vibDepth.connect(b.detune)
  a.connect(amp)
  b.connect(bAmp)
  bAmp.connect(amp)
  noiseHit(kit, kit.lead, t, { type: 'bandpass', freq: Math.min(9000, f * 2), q: 2, attack: 0.02, decay: 0.05, gain: 0.012 * vel })
  run(kit, a, t, stop)
  run(kit, b, t, stop)
  run(kit, vib, t, stop)
}

/** Bass, three ways: an upright with a thump, a round sub, a filtered saw. */
export function bass(kit: Kit, t: number, midi: number, dur: number, vel: number, kind: 'upright' | 'sub' | 'synth') {
  const { ctx } = kit
  const f = mtof(midi)
  const amp = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.connect(amp)
  amp.connect(kit.bass)
  let stop: number
  const oscs: OscillatorNode[] = []

  if (kind === 'synth') {
    stop = envelope(amp.gain, t, { attack: 0.005, peak: 0.2 * vel, sustain: 0.13 * vel, decay: 0.12, release: 0.04, end: t + dur })
    filter.Q.value = 5
    filter.frequency.setValueAtTime(1800, t)
    filter.frequency.setTargetAtTime(260, t, 0.09)
    const saw = ctx.createOscillator()
    saw.type = 'sawtooth'
    saw.frequency.value = f
    const sub = ctx.createOscillator()
    sub.type = 'square'
    sub.frequency.value = f / 2
    const subAmp = ctx.createGain()
    subAmp.gain.value = 0.35
    saw.connect(filter)
    sub.connect(subAmp)
    subAmp.connect(filter)
    oscs.push(saw, sub)
  } else if (kind === 'sub') {
    stop = envelope(amp.gain, t, { attack: 0.012, peak: 0.42 * vel, sustain: 0.3 * vel, decay: 0.3, release: 0.08, end: t + dur })
    filter.frequency.value = 400
    const sine = ctx.createOscillator()
    sine.frequency.value = f
    const tri = ctx.createOscillator()
    tri.type = 'triangle'
    tri.frequency.value = f
    const triAmp = ctx.createGain()
    triAmp.gain.value = 0.25
    sine.connect(filter)
    tri.connect(triAmp)
    triAmp.connect(filter)
    oscs.push(sine, tri)
  } else {
    stop = envelope(amp.gain, t, { attack: 0.006, peak: 0.5 * vel, sustain: 0.16 * vel, decay: 0.2, release: 0.06, end: t + dur })
    filter.frequency.setValueAtTime(1100, t)
    filter.frequency.setTargetAtTime(520, t, 0.15)
    const tri = ctx.createOscillator()
    tri.type = 'triangle'
    tri.frequency.setValueAtTime(f * 1.012, t)
    tri.frequency.exponentialRampToValueAtTime(f, t + 0.05)
    const sine = ctx.createOscillator()
    sine.frequency.value = f
    tri.connect(filter)
    sine.connect(filter)
    oscs.push(tri, sine)
    noiseHit(kit, kit.bass, t, { type: 'lowpass', freq: 900, decay: 0.012, gain: 0.05 * vel })
  }
  for (const osc of oscs) run(kit, osc, t, stop)
}

/**
 * A plucked nylon string by Karplus–Strong: a burst of noise circulating in a
 * delay line one period long, softened on every pass, which is close to what a
 * real string does. Computed once per note and kept.
 */
export function pluckBuffer(kit: Kit, midi: number): { buffer: AudioBuffer; rate: number } {
  const { ctx } = kit
  let cached = kit.plucks.get(midi)
  if (!cached) {
    const sr = ctx.sampleRate
    const period = sr / mtof(midi)
    const n = Math.floor(period)
    const line = new Float32Array(n)
    let lp = 0
    for (let i = 0; i < n; i++) {
      lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4
      line[i] = lp
    }
    const length = Math.floor(sr * 1.6)
    const buffer = ctx.createBuffer(1, length, sr)
    const data = buffer.getChannelData(0)
    let idx = 0
    let peak = 0
    for (let i = 0; i < length; i++) {
      const cur = line[idx]
      const next = line[(idx + 1) % n]
      line[idx] = (cur + next) * 0.4985
      data[i] = cur
      peak = Math.max(peak, Math.abs(cur))
      idx = (idx + 1) % n
    }
    if (peak > 0) for (let i = 0; i < length; i++) data[i] /= peak
    // The buffer's own pitch is a touch sharp from rounding the period; the
    // playback rate pulls it back to true.
    cached = { buffer, rate: n / period }
    kit.plucks.set(midi, cached)
  }
  return cached
}

/** A plucked string from its Karplus–Strong buffer; `brightness` is where the
 * tone is rolled off — lower for a warm nylon guitar, higher for a harp. */
export function pluck(kit: Kit, t: number, midi: number, dur: number, vel: number, pan = 0, brightness = 2600) {
  const { ctx } = kit
  const cached = pluckBuffer(kit, midi)
  const src = ctx.createBufferSource()
  src.buffer = cached.buffer
  src.playbackRate.value = cached.rate
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = brightness
  const amp = ctx.createGain()
  const end = t + Math.min(dur, 1.5)
  amp.gain.setValueAtTime(0.16 * vel, t)
  amp.gain.setTargetAtTime(0, end, 0.06)
  src.connect(tone)
  tone.connect(amp)
  amp.connect(panned(kit, kit.keys, pan))
  run(kit, src, t, Math.min(t + 1.6, end + 0.4))
}

/** A synth pad: two detuned saws per note, a slow swell, a soft filter. */
export function pad(kit: Kit, t: number, notes: number[], dur: number, vel: number) {
  const { ctx } = kit
  const amp = ctx.createGain()
  const stop = envelope(amp.gain, t, { attack: 0.7, peak: 0.035 * vel, sustain: 0.03 * vel, decay: 1, release: 0.5, end: t + dur })
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(700, t)
  filter.frequency.linearRampToValueAtTime(1700, t + dur * 0.6)
  filter.connect(amp)
  amp.connect(kit.keys)
  for (const note of notes) {
    for (const cents of [-9, 9]) {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = mtof(note)
      osc.detune.value = cents
      osc.connect(filter)
      run(kit, osc, t, stop)
    }
  }
}

/** One step of an arpeggio: a short square blip, into the echo. */
export function blip(kit: Kit, t: number, midi: number, vel: number) {
  const { ctx } = kit
  const osc = ctx.createOscillator()
  osc.type = 'square'
  osc.frequency.value = mtof(midi)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(3200, t)
  filter.frequency.setTargetAtTime(600, t, 0.06)
  const amp = ctx.createGain()
  const stop = envelope(amp.gain, t, { attack: 0.003, peak: 0.045 * vel, sustain: 0, decay: 0.07, release: 0.02, end: t + 0.2 })
  osc.connect(filter)
  filter.connect(amp)
  amp.connect(kit.lead)
  if (kit.echo) amp.connect(kit.echo)
  run(kit, osc, t, stop)
}

export function kick(kit: Kit, t: number, vel: number, soft = false) {
  const { ctx } = kit
  const osc = ctx.createOscillator()
  osc.frequency.setValueAtTime(soft ? 110 : 150, t)
  osc.frequency.exponentialRampToValueAtTime(soft ? 45 : 48, t + 0.13)
  const amp = ctx.createGain()
  const stop = envelope(amp.gain, t, { attack: 0.003, peak: (soft ? 0.5 : 0.8) * vel, sustain: 0, decay: soft ? 0.09 : 0.12, release: 0.02, end: t + 0.5 })
  osc.connect(amp)
  amp.connect(kit.drums)
  run(kit, osc, t, stop)
  if (!soft) noiseHit(kit, kit.drums, t, { type: 'highpass', freq: 2500, decay: 0.004, gain: 0.1 * vel })
}

export function snare(kit: Kit, t: number, vel: number) {
  const { ctx } = kit
  noiseHit(kit, kit.drums, t, { type: 'bandpass', freq: 1900, q: 0.6, decay: 0.055, gain: 0.34 * vel })
  const body = ctx.createOscillator()
  body.type = 'triangle'
  body.frequency.setValueAtTime(210, t)
  body.frequency.exponentialRampToValueAtTime(160, t + 0.05)
  const amp = ctx.createGain()
  const stop = envelope(amp.gain, t, { attack: 0.002, peak: 0.2 * vel, sustain: 0, decay: 0.03, release: 0.01, end: t + 0.2 })
  body.connect(amp)
  amp.connect(kit.drums)
  run(kit, body, t, stop)
}

export function clap(kit: Kit, t: number, vel: number) {
  for (let i = 0; i < 3; i++) {
    noiseHit(kit, kit.drums, t + i * 0.011, { type: 'bandpass', freq: 1250, q: 0.9, decay: 0.012, gain: 0.26 * vel })
  }
  noiseHit(kit, kit.drums, t + 0.034, { type: 'bandpass', freq: 1400, q: 0.7, decay: 0.07, gain: 0.22 * vel })
}

export function hat(kit: Kit, t: number, vel: number, open = false) {
  noiseHit(kit, kit.drums, t, { type: 'highpass', freq: 7200, q: 0.5, decay: open ? 0.09 : 0.016, gain: 0.13 * vel })
}

export function brush(kit: Kit, t: number, vel: number) {
  noiseHit(kit, kit.drums, t, { type: 'bandpass', freq: 3000, q: 0.45, attack: 0.012, decay: 0.07, gain: 0.12 * vel })
}

/** A ride cymbal: the stick's tick, and a narrow ringing band over a softer
 * wash — close enough to shimmer, at a fraction of the cost of real partials,
 * which matters for something struck six times a bar. */
export function ride(kit: Kit, t: number, vel: number) {
  noiseHit(kit, kit.drums, t, { type: 'highpass', freq: 8000, decay: 0.012, gain: 0.08 * vel })
  noiseHit(kit, kit.drums, t, { type: 'bandpass', freq: 5200, q: 6, decay: 0.3, gain: 0.07 * vel })
  noiseHit(kit, kit.drums, t, { type: 'bandpass', freq: 7200, q: 0.4, decay: 0.24, gain: 0.045 * vel })
}

export function rim(kit: Kit, t: number, vel: number) {
  const { ctx } = kit
  const osc = ctx.createOscillator()
  osc.frequency.value = 1750
  const amp = ctx.createGain()
  const stop = envelope(amp.gain, t, { attack: 0.001, peak: 0.09 * vel, sustain: 0, decay: 0.012, release: 0.005, end: t + 0.08 })
  osc.connect(amp)
  amp.connect(kit.drums)
  run(kit, osc, t, stop)
  noiseHit(kit, kit.drums, t, { type: 'bandpass', freq: 3500, q: 1, decay: 0.008, gain: 0.1 * vel })
}

export function shaker(kit: Kit, t: number, vel: number) {
  noiseHit(kit, kit.drums, t, { type: 'bandpass', freq: 6500, q: 0.9, attack: 0.008, decay: 0.03, gain: 0.07 * vel })
}

/** Vinyl crackle and hiss: a few seconds of sparse clicks, looped. */
export function crackle(kit: Kit, t: number) {
  const { ctx } = kit
  const seconds = 5
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.012
  const clicks = seconds * 22
  for (let c = 0; c < clicks; c++) {
    const at = Math.floor(Math.random() * (data.length - 40))
    const size = Math.random() < 0.08 ? rand(0.4, 0.8) : rand(0.05, 0.25)
    for (let j = 0; j < 30; j++) data[at + j] += (Math.random() * 2 - 1) * size * Math.exp(-j / 5)
  }
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 2400
  filter.Q.value = 0.4
  const amp = ctx.createGain()
  amp.gain.value = 0.16
  src.connect(filter)
  filter.connect(amp)
  amp.connect(kit.out)
  src.start(t)
  kit.sources.push(src)
}

/** 8th notes swung: the second of each pair pushed late. */
export const swung = (beat: number, ratio: number) => {
  const whole = Math.floor(beat)
  const frac = beat - whole
  return Math.abs(frac - 0.5) < 1e-6 ? whole + ratio : beat
}

/* --- instruments from further afield ------------------------------------------ */

/** The kit's noise, looping, for sounds longer than a hit. */
export function loopNoise(kit: Kit): AudioBufferSourceNode {
  const src = kit.ctx.createBufferSource()
  src.buffer = kit.noise
  src.loop = true
  return src
}

/** A buffer filled by `fill`, with its end blended into its start so it loops
 * without a click, played on repeat into the kit for as long as the style runs. */
export function loopBed(kit: Kit, t: number, seconds: number, level: number, fill: (data: Float32Array) => void, filter?: { type: BiquadFilterType; freq: number; q?: number }) {
  const { ctx } = kit
  const seam = 2048
  const length = Math.floor(ctx.sampleRate * seconds)
  const scratch = new Float32Array(length + seam)
  fill(scratch)
  for (let i = 0; i < seam; i++) {
    const k = i / seam
    scratch[i] = scratch[i] * k + scratch[length + i] * (1 - k)
  }
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  buffer.copyToChannel(scratch.subarray(0, length), 0)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const amp = ctx.createGain()
  amp.gain.value = level
  if (filter) {
    const f = ctx.createBiquadFilter()
    f.type = filter.type
    f.frequency.value = filter.freq
    if (filter.q !== undefined) f.Q.value = filter.q
    src.connect(f)
    f.connect(amp)
  } else {
    src.connect(amp)
  }
  amp.connect(kit.out)
  src.start(t)
  kit.sources.push(src)
}

/** Wind moving across open ground: noise through a slowly wandering band. */
export function windBed(kit: Kit, t: number, level = 0.05) {
  const { ctx } = kit
  const src = loopNoise(kit)
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 520
  band.Q.value = 0.8
  const drift = ctx.createOscillator()
  drift.frequency.value = 0.06
  const driftDepth = ctx.createGain()
  driftDepth.gain.value = 260
  drift.connect(driftDepth)
  driftDepth.connect(band.frequency)
  const swell = ctx.createGain()
  swell.gain.value = level
  const gust = ctx.createOscillator()
  gust.frequency.value = 0.043
  const gustDepth = ctx.createGain()
  gustDepth.gain.value = level * 0.6
  gust.connect(gustDepth)
  gustDepth.connect(swell.gain)
  src.connect(band)
  band.connect(swell)
  swell.connect(kit.out)
  for (const s of [src, drift, gust]) {
    s.start(t)
    kit.sources.push(s)
  }
}

/** A fire in the grate: a low roar, crackles, and now and then a pop. */
export function fireplace(kit: Kit, t: number) {
  const sr = kit.ctx.sampleRate
  loopBed(
    kit,
    t,
    7,
    0.2,
    (data) => {
      let brown = 0
      for (let i = 0; i < data.length; i++) {
        brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02
        data[i] = brown * 1.4
      }
      const crackles = 7 * 16
      for (let c = 0; c < crackles; c++) {
        const big = Math.random() < 0.1
        const len = Math.floor(big ? sr * 0.012 : rand(30, 160))
        const at = Math.floor(Math.random() * (data.length - len))
        const size = big ? rand(0.5, 0.85) : rand(0.06, 0.28)
        for (let j = 0; j < len; j++) data[at + j] += (Math.random() * 2 - 1) * size * Math.exp(-j / (len / 4))
      }
    },
    { type: 'lowpass', freq: 5000 },
  )
}

/**
 * Khöömei, Mongolian throat singing. One buzzing tone, shaped by the throat
 * into a drone, and one of its own harmonics picked out by a filter so narrow
 * it whistles clear above it — the overtone melody — gliding from harmonic to
 * harmonic the way a singer moves their tongue. `deep` adds kargyraa, the
 * growl an octave below.
 */
export function overtoneVoice(kit: Kit, t: number, dur: number, f0: number, melody: { at: number; harmonic: number }[], vel: number, deep = false) {
  const { ctx } = kit
  const a = ctx.createOscillator()
  a.type = 'sawtooth'
  a.frequency.value = f0
  const b = ctx.createOscillator()
  b.type = 'sawtooth'
  b.frequency.value = f0
  b.detune.value = 5
  const source = ctx.createGain()
  source.gain.value = 0.5
  a.connect(source)
  b.connect(source)

  const vib = ctx.createOscillator()
  vib.frequency.value = 4.8
  const vibDepth = ctx.createGain()
  vibDepth.gain.setValueAtTime(0, t)
  vibDepth.gain.linearRampToValueAtTime(6, t + Math.min(2, dur * 0.5))
  vib.connect(vibDepth)
  vibDepth.connect(a.detune)
  vibDepth.connect(b.detune)

  const amp = ctx.createGain()
  const stop = envelope(amp.gain, t, { attack: 0.4, peak: vel, sustain: vel * 0.92, decay: 1.5, release: 0.4, end: t + dur })
  amp.connect(kit.lead)

  // The drone: its fundamental, and the throat's two resonances.
  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 320
  const lowGain = ctx.createGain()
  lowGain.gain.value = 0.085
  source.connect(low)
  low.connect(lowGain)
  lowGain.connect(amp)
  const f1 = ctx.createBiquadFilter()
  f1.type = 'bandpass'
  f1.frequency.value = 520
  f1.Q.value = 2
  const f2 = ctx.createBiquadFilter()
  f2.type = 'bandpass'
  f2.frequency.value = 1100
  f2.Q.value = 5
  const formants = ctx.createGain()
  formants.gain.value = 0.12
  source.connect(f1)
  source.connect(f2)
  f1.connect(formants)
  f2.connect(formants)
  formants.connect(amp)

  // The whistle.
  const whistle = ctx.createBiquadFilter()
  whistle.type = 'bandpass'
  whistle.Q.value = 42
  whistle.frequency.setValueAtTime(f0 * (melody[0]?.harmonic ?? 8), t)
  for (const m of melody) whistle.frequency.setTargetAtTime(f0 * m.harmonic, Math.max(t, m.at), 0.05)
  const whistleGain = ctx.createGain()
  whistleGain.gain.value = 1.1
  source.connect(whistle)
  whistle.connect(whistleGain)
  whistleGain.connect(amp)

  const oscs = [a, b, vib]
  if (deep) {
    const sub = ctx.createOscillator()
    sub.type = 'square'
    sub.frequency.value = f0 / 2
    const subTone = ctx.createBiquadFilter()
    subTone.type = 'lowpass'
    subTone.frequency.value = 380
    const subGain = ctx.createGain()
    subGain.gain.value = 0.045
    sub.connect(subTone)
    subTone.connect(subGain)
    subGain.connect(amp)
    oscs.push(sub)
  }
  for (const o of oscs) run(kit, o, t, stop)
}

/** A bowed string — the morin khuur, the horsehead fiddle: a saw through a
 * wooden body, the bow's scrape, vibrato once the note has settled, and an
 * optional slide in from another note. */
export function bowed(kit: Kit, t: number, midi: number, dur: number, vel: number, pan = 0, slideFrom?: number) {
  const { ctx } = kit
  const f = mtof(midi)
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  if (slideFrom !== undefined) {
    osc.frequency.setValueAtTime(mtof(slideFrom), t)
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.16)
  } else {
    osc.frequency.value = f
  }
  const vib = ctx.createOscillator()
  vib.frequency.value = 5.4
  const vibDepth = ctx.createGain()
  vibDepth.gain.setValueAtTime(0, t)
  vibDepth.gain.linearRampToValueAtTime(13, t + Math.min(0.6, dur * 0.5))
  vib.connect(vibDepth)
  vibDepth.connect(osc.detune)
  const body = ctx.createBiquadFilter()
  body.type = 'lowpass'
  body.frequency.value = 2000
  body.Q.value = 0.8
  const wood = ctx.createBiquadFilter()
  wood.type = 'peaking'
  wood.frequency.value = 300
  wood.Q.value = 1.2
  wood.gain.value = 6
  const amp = ctx.createGain()
  const stop = envelope(amp.gain, t, { attack: 0.16, peak: 0.05 * vel, sustain: 0.042 * vel, decay: 0.5, release: 0.22, end: t + dur })
  osc.connect(body)
  body.connect(wood)
  wood.connect(amp)
  const scrape = loopNoise(kit)
  const scrapeTone = ctx.createBiquadFilter()
  scrapeTone.type = 'bandpass'
  scrapeTone.frequency.value = 2600
  scrapeTone.Q.value = 1.1
  const scrapeGain = ctx.createGain()
  scrapeGain.gain.value = 0.12
  scrape.connect(scrapeTone)
  scrapeTone.connect(scrapeGain)
  scrapeGain.connect(amp)
  amp.connect(panned(kit, kit.keys, pan))
  run(kit, osc, t, stop)
  run(kit, vib, t, stop)
  run(kit, scrape, t, stop)
}

/** A frame drum or bodhrán: a skin's thump, its pitch falling as it sounds. */
export function frameDrum(kit: Kit, t: number, vel: number, high = false) {
  const { ctx } = kit
  const base = high ? 170 : 72
  const osc = ctx.createOscillator()
  osc.frequency.setValueAtTime(base * 1.9, t)
  osc.frequency.exponentialRampToValueAtTime(base, t + 0.05)
  const amp = ctx.createGain()
  const stop = envelope(amp.gain, t, { attack: 0.002, peak: (high ? 0.2 : 0.42) * vel, sustain: 0, decay: high ? 0.06 : 0.13, release: 0.02, end: t + 0.5 })
  osc.connect(amp)
  amp.connect(kit.drums)
  run(kit, osc, t, stop)
  noiseHit(kit, kit.drums, t, { type: 'bandpass', freq: high ? 1200 : 500, q: 0.9, decay: high ? 0.012 : 0.02, gain: 0.1 * vel })
}

/** A tanpura string: a buzzing tone whose brightness blooms a moment after the
 * pluck — the jawari bridge — and rings for seconds. */
export function tanpura(kit: Kit, t: number, midi: number, vel: number, pan = 0) {
  const { ctx } = kit
  const f = mtof(midi)
  const a = ctx.createOscillator()
  a.type = 'sawtooth'
  a.frequency.value = f
  const b = ctx.createOscillator()
  b.type = 'sawtooth'
  b.frequency.value = f
  b.detune.value = 3
  const bloom = ctx.createBiquadFilter()
  bloom.type = 'lowpass'
  bloom.Q.value = 3
  bloom.frequency.setValueAtTime(500, t)
  bloom.frequency.linearRampToValueAtTime(3400, t + 0.7)
  bloom.frequency.setTargetAtTime(1100, t + 0.7, 1.4)
  const buzz = ctx.createBiquadFilter()
  buzz.type = 'peaking'
  buzz.frequency.value = 2400
  buzz.Q.value = 1.5
  buzz.gain.value = 5
  const amp = ctx.createGain()
  const stop = Math.min(t + 8, envelope(amp.gain, t, { attack: 0.015, peak: 0.03 * vel, sustain: 0, decay: 2.6, release: 0.3, end: t + 7.5 }))
  a.connect(bloom)
  b.connect(bloom)
  bloom.connect(buzz)
  buzz.connect(amp)
  amp.connect(panned(kit, kit.keys, pan))
  run(kit, a, t, stop)
  run(kit, b, t, stop)
}

/** A bansuri, the bamboo flute: breathy, with slides between notes (meend) and
 * a slow vibrato that only comes in on long notes. */
export function bansuri(kit: Kit, t: number, midi: number, dur: number, vel: number, from?: number) {
  const { ctx } = kit
  const f = mtof(midi)
  const tone = ctx.createOscillator()
  const air = ctx.createOscillator()
  air.type = 'triangle'
  for (const o of [tone, air]) {
    if (from !== undefined) {
      o.frequency.setValueAtTime(mtof(from), t)
      o.frequency.exponentialRampToValueAtTime(f, t + 0.14)
    } else {
      o.frequency.value = f
    }
  }
  const airGain = ctx.createGain()
  airGain.gain.value = 0.22
  const vib = ctx.createOscillator()
  vib.frequency.value = 5.2
  const vibDepth = ctx.createGain()
  vibDepth.gain.setValueAtTime(0, t)
  vibDepth.gain.setValueAtTime(0, t + Math.min(0.45, dur * 0.5))
  vibDepth.gain.linearRampToValueAtTime(11, t + Math.min(0.9, dur * 0.85))
  vib.connect(vibDepth)
  vibDepth.connect(tone.detune)
  vibDepth.connect(air.detune)
  const amp = ctx.createGain()
  const stop = envelope(amp.gain, t, { attack: from !== undefined ? 0.03 : 0.08, peak: 0.075 * vel, sustain: 0.06 * vel, decay: 0.5, release: 0.12, end: t + dur })
  tone.connect(amp)
  air.connect(airGain)
  airGain.connect(amp)
  const breath = loopNoise(kit)
  const breathTone = ctx.createBiquadFilter()
  breathTone.type = 'bandpass'
  breathTone.frequency.value = Math.min(9000, f * 2)
  breathTone.Q.value = 1.4
  const breathGain = ctx.createGain()
  breathGain.gain.value = 0.35
  breath.connect(breathTone)
  breathTone.connect(breathGain)
  breathGain.connect(amp)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 3600
  amp.connect(lp)
  lp.connect(kit.lead)
  run(kit, tone, t, stop)
  run(kit, air, t, stop)
  run(kit, vib, t, stop)
  run(kit, breath, t, stop)
}

export type Bol = 'dha' | 'dhin' | 'tin' | 'na' | 'ta' | 'ge' | 'te'

/**
 * A tabla stroke, by its bol. The right drum (dayan) rings at the pitch of Sa,
 * open or damped; the left (bayan) is a deep boom that swoops up as the palm
 * presses the skin. Dha and Dhin are both at once.
 */
export function tabla(kit: Kit, t: number, bol: Bol, vel: number, sa: number) {
  const { ctx } = kit
  const dayan = (open: boolean, level: number) => {
    const f = mtof(sa + 12)
    const out = ctx.createBiquadFilter()
    out.type = 'lowpass'
    out.frequency.value = 5200
    out.connect(panned(kit, kit.drums, 0.15))
    ;([
      [1, 1],
      [2.01, 0.45],
      [2.99, 0.28],
      [4.1, 0.12],
    ] as const).forEach(([ratio, amt], i) => {
      const o = ctx.createOscillator()
      o.frequency.value = f * ratio
      const g = ctx.createGain()
      const stop = envelope(g.gain, t, { attack: 0.001, peak: level * amt * vel, sustain: 0, decay: (open ? 0.3 : 0.07) / (1 + i * 0.6), release: 0.02, end: t + (open ? 1.3 : 0.4) })
      o.connect(g)
      g.connect(out)
      run(kit, o, t, stop)
    })
    noiseHit(kit, out, t, { type: 'bandpass', freq: 3200, q: 1, decay: 0.006, gain: 0.35 * level * vel })
  }
  const bayan = (level: number) => {
    const f = mtof(sa - 12)
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(f * 0.92, t)
    o.frequency.linearRampToValueAtTime(f * 1.2, t + 0.28)
    const g = ctx.createGain()
    const stop = envelope(g.gain, t, { attack: 0.004, peak: level * vel, sustain: 0, decay: 0.24, release: 0.03, end: t + 1 })
    o.connect(g)
    g.connect(panned(kit, kit.drums, -0.15))
    run(kit, o, t, stop)
    noiseHit(kit, kit.drums, t, { type: 'lowpass', freq: 400, decay: 0.015, gain: 0.07 * vel })
  }
  switch (bol) {
    case 'na':
      dayan(true, 0.1)
      break
    case 'ta':
      dayan(false, 0.11)
      break
    case 'tin':
      dayan(true, 0.075)
      break
    case 'te':
      noiseHit(kit, kit.drums, t, { type: 'bandpass', freq: 2200, q: 1.3, decay: 0.012, gain: 0.07 * vel })
      break
    case 'ge':
      bayan(0.32)
      break
    case 'dha':
      dayan(true, 0.09)
      bayan(0.28)
      break
    case 'dhin':
      dayan(true, 0.07)
      bayan(0.28)
      break
  }
}

/** A handpan note: a warm fundamental with its octave and compound fifth, a
 * soft finger strike, a long even decay. */
export function handpan(kit: Kit, t: number, midi: number, vel: number, pan = 0) {
  const { ctx } = kit
  const f = mtof(midi)
  const out = ctx.createBiquadFilter()
  out.type = 'lowpass'
  out.frequency.value = 3200
  out.connect(panned(kit, kit.keys, pan))
  ;([
    [1, 1, 1.2, 0],
    [2, 0.32, 0.8, 3],
    [3, 0.1, 0.45, -2],
  ] as const).forEach(([ratio, amt, decay, cents]) => {
    const o = ctx.createOscillator()
    o.frequency.value = f * ratio
    o.detune.value = cents
    const g = ctx.createGain()
    const stop = envelope(g.gain, t, { attack: 0.004, peak: 0.13 * vel * amt, sustain: 0, decay, release: 0.05, end: t + decay * 6 })
    o.connect(g)
    g.connect(out)
    run(kit, o, t, stop)
  })
  noiseHit(kit, out, t, { type: 'bandpass', freq: 900, q: 0.8, decay: 0.008, gain: 0.05 * vel })
}

/** A singing bowl: three inharmonic partials, each a pair of tones a hair
 * apart so they beat — the bowl's slow wobble. Struck, it rings for many
 * seconds; rubbed, it swells up out of nothing. */
export function bowl(kit: Kit, t: number, f: number, vel: number, pan = 0, rubbed = false) {
  const { ctx } = kit
  const out = panned(kit, kit.keys, pan)
  ;([
    [1, 1],
    [2.71, 0.4],
    [5.12, 0.15],
  ] as const).forEach(([ratio, amt], i) => {
    for (const beat of [-(0.8 + i * 0.6), 0.8 + i * 0.6]) {
      const o = ctx.createOscillator()
      o.frequency.value = f * ratio + beat
      const g = ctx.createGain()
      const peak = 0.028 * vel * amt
      const stop = rubbed
        ? envelope(g.gain, t, { attack: 2.4, peak, sustain: peak * 0.8, decay: 2, release: 3, end: t + 5 })
        : envelope(g.gain, t, { attack: 0.006, peak, sustain: 0, decay: 5 / (1 + i * 0.8), release: 0.2, end: t + 15 })
      o.connect(g)
      g.connect(out)
      run(kit, o, t, Math.min(stop, t + 17))
    }
  })
  if (!rubbed) noiseHit(kit, out, t, { type: 'bandpass', freq: 1800, q: 1, decay: 0.01, gain: 0.03 * vel })
}

/** A low sustained drone of pure tones, for sitting under bowls and pads. */
export function drone(kit: Kit, t: number, freqs: number[], dur: number, vel: number) {
  const { ctx } = kit
  const amp = ctx.createGain()
  const stop = envelope(amp.gain, t, { attack: 3, peak: 0.05 * vel, sustain: 0.045 * vel, decay: 3, release: 2.5, end: t + dur })
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 800
  amp.connect(lp)
  lp.connect(kit.bass)
  for (const f of freqs) {
    for (const type of ['sine', 'triangle'] as const) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      if (type === 'triangle') {
        const soft = ctx.createGain()
        soft.gain.value = 0.3
        o.connect(soft)
        soft.connect(amp)
      } else {
        o.connect(amp)
      }
      run(kit, o, t, Math.min(stop, t + dur + 12))
    }
  }
}

/** Tingsha: two small cymbals struck together, bright and shimmering. */
export function tingsha(kit: Kit, t: number, vel: number) {
  const { ctx } = kit
  for (const [f, amt] of [
    [2640, 1],
    [2702, 0.8],
    [6410, 0.25],
  ] as const) {
    const o = ctx.createOscillator()
    o.frequency.value = f
    const g = ctx.createGain()
    const stop = envelope(g.gain, t, { attack: 0.001, peak: 0.011 * vel * amt, sustain: 0, decay: 1.1, release: 0.1, end: t + 6 })
    o.connect(g)
    g.connect(kit.lead)
    run(kit, o, t, stop)
  }
  noiseHit(kit, kit.lead, t, { type: 'highpass', freq: 5000, decay: 0.01, gain: 0.03 * vel })
}

/** A shakuhachi: more breath than tone, notes that swell as they are held,
 * slides in from below, and a vibrato that shakes the end of a long note. */
export function shakuhachi(kit: Kit, t: number, midi: number, dur: number, vel: number, from?: number) {
  const { ctx } = kit
  const f = mtof(midi)
  const tone = ctx.createOscillator()
  if (from !== undefined) {
    tone.frequency.setValueAtTime(mtof(from), t)
    tone.frequency.setTargetAtTime(f, t + 0.05, 0.12)
  } else {
    tone.frequency.setValueAtTime(f * 0.97, t)
    tone.frequency.setTargetAtTime(f, t, 0.07)
  }
  const vib = ctx.createOscillator()
  vib.frequency.value = 4.4
  const vibDepth = ctx.createGain()
  vibDepth.gain.setValueAtTime(0, t)
  vibDepth.gain.setValueAtTime(0, t + dur * 0.55)
  vibDepth.gain.linearRampToValueAtTime(18, t + dur * 0.9)
  vib.connect(vibDepth)
  vibDepth.connect(tone.detune)
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0, t)
  amp.gain.linearRampToValueAtTime(0.04 * vel, t + 0.12)
  amp.gain.linearRampToValueAtTime(0.065 * vel, t + Math.max(0.2, dur * 0.65))
  amp.gain.setTargetAtTime(0, t + Math.max(0.25, dur), 0.12)
  const stop = t + Math.max(0.25, dur) + 0.8
  const breath = loopNoise(kit)
  const breathTone = ctx.createBiquadFilter()
  breathTone.type = 'bandpass'
  breathTone.frequency.value = Math.min(9000, f * 1.5)
  breathTone.Q.value = 0.9
  const breathGain = ctx.createGain()
  breathGain.gain.value = 0.6
  tone.connect(amp)
  breath.connect(breathTone)
  breathTone.connect(breathGain)
  breathGain.connect(amp)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 4200
  amp.connect(lp)
  lp.connect(kit.lead)
  run(kit, tone, t, stop)
  run(kit, vib, t, stop)
  run(kit, breath, t, stop)
}

/** A koto string: a bright pluck that can be pressed a semitone sharp as it
 * rings, the way a player pushes the string behind the bridge. */
export function koto(kit: Kit, t: number, midi: number, dur: number, vel: number, pan = 0, bend = false) {
  const { ctx } = kit
  const { buffer, rate } = pluckBuffer(kit, midi)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.playbackRate.setValueAtTime(rate, t)
  if (bend) {
    src.playbackRate.setValueAtTime(rate, t + 0.22)
    src.playbackRate.linearRampToValueAtTime(rate * 1.0595, t + 0.4)
  }
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 4200
  const amp = ctx.createGain()
  const end = t + Math.min(dur, 1.5)
  amp.gain.setValueAtTime(0.19 * vel, t)
  amp.gain.setTargetAtTime(0, end, 0.08)
  src.connect(tone)
  tone.connect(amp)
  amp.connect(panned(kit, kit.keys, pan))
  run(kit, src, t, Math.min(t + 1.6, end + 0.4))
}

/** A drop of water into a still pool. */
export function drip(kit: Kit, t: number, vel: number) {
  const { ctx } = kit
  const base = rand(900, 1500)
  const o = ctx.createOscillator()
  o.frequency.setValueAtTime(base, t)
  o.frequency.exponentialRampToValueAtTime(base * 0.45, t + 0.06)
  const g = ctx.createGain()
  const stop = envelope(g.gain, t, { attack: 0.001, peak: 0.045 * vel, sustain: 0, decay: 0.025, release: 0.01, end: t + 0.2 })
  o.connect(g)
  g.connect(kit.lead)
  run(kit, o, t, stop)
}

/** A celesta or music box: a pure bell tone with a quick metallic sparkle. */
export function celesta(kit: Kit, t: number, midi: number, dur: number, vel: number, pan = 0) {
  const { ctx } = kit
  const f = mtof(midi)
  const out = panned(kit, kit.lead, pan)
  ;([
    [1, 1, 0.9],
    [4, 0.26, 0.12],
    [7.1, 0.08, 0.05],
  ] as const).forEach(([ratio, amt, decay]) => {
    const o = ctx.createOscillator()
    o.frequency.value = f * ratio
    const g = ctx.createGain()
    const stop = envelope(g.gain, t, { attack: 0.002, peak: 0.065 * vel * amt, sustain: 0, decay, release: 0.1, end: t + Math.min(dur + 0.5, decay * 6) })
    o.connect(g)
    g.connect(out)
    run(kit, o, t, stop)
  })
}

/** A quiet warm pad of sine and triangle, for keeping the room full. */
export function softPad(kit: Kit, t: number, notes: number[], dur: number, vel: number) {
  const { ctx } = kit
  const amp = ctx.createGain()
  const stop = envelope(amp.gain, t, { attack: 0.9, peak: 0.018 * vel, sustain: 0.016 * vel, decay: 1, release: 0.9, end: t + dur })
  amp.connect(kit.keys)
  for (const note of notes) {
    for (const type of ['sine', 'triangle'] as const) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = mtof(note)
      o.connect(amp)
      run(kit, o, t, stop)
    }
  }
}

const pulseWaves = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>()

/** A pulse wave of the given duty cycle — the sound of an old game console. */
function pulseWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  let byDuty = pulseWaves.get(ctx)
  if (!byDuty) {
    byDuty = new Map()
    pulseWaves.set(ctx, byDuty)
  }
  let wave = byDuty.get(duty)
  if (!wave) {
    const n = 32
    const real = new Float32Array(n)
    const imag = new Float32Array(n)
    for (let k = 1; k < n; k++) {
      real[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI)
      imag[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI)
    }
    wave = ctx.createPeriodicWave(real, imag)
    byDuty.set(duty, wave)
  }
  return wave
}

/** A chiptune voice: a pulse wave with no softening at all. */
export function chip(kit: Kit, t: number, midi: number, dur: number, vel: number, { duty = 0.25, gain = 0.045 }: { duty?: number; gain?: number } = {}) {
  const { ctx } = kit
  const o = ctx.createOscillator()
  o.setPeriodicWave(pulseWave(ctx, duty))
  o.frequency.value = mtof(midi)
  const g = ctx.createGain()
  const stop = envelope(g.gain, t, { attack: 0.002, peak: gain * vel, sustain: gain * vel * 0.7, decay: 0.08, release: 0.03, end: t + dur })
  o.connect(g)
  g.connect(kit.lead)
  run(kit, o, t, stop)
}

export function chipBass(kit: Kit, t: number, midi: number, dur: number, vel: number) {
  const { ctx } = kit
  const o = ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.value = mtof(midi)
  const g = ctx.createGain()
  const stop = envelope(g.gain, t, { attack: 0.002, peak: 0.17 * vel, sustain: 0.15 * vel, decay: 0.1, release: 0.02, end: t + dur })
  o.connect(g)
  g.connect(kit.bass)
  run(kit, o, t, stop)
}

export function chipKick(kit: Kit, t: number, vel: number) {
  const { ctx } = kit
  const o = ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.setValueAtTime(190, t)
  o.frequency.exponentialRampToValueAtTime(48, t + 0.07)
  const g = ctx.createGain()
  const stop = envelope(g.gain, t, { attack: 0.001, peak: 0.4 * vel, sustain: 0, decay: 0.05, release: 0.01, end: t + 0.25 })
  o.connect(g)
  g.connect(kit.drums)
  run(kit, o, t, stop)
}

export function chipSnare(kit: Kit, t: number, vel: number) {
  noiseHit(kit, kit.drums, t, { type: 'highpass', freq: 1500, decay: 0.035, gain: 0.2 * vel })
}

export function chipHat(kit: Kit, t: number, vel: number) {
  noiseHit(kit, kit.drums, t, { type: 'highpass', freq: 8000, decay: 0.007, gain: 0.07 * vel })
}

/** A slow space pad: three detuned saws a note, the filter breathing. */
export function spacePad(kit: Kit, t: number, notes: number[], dur: number, vel: number) {
  const { ctx } = kit
  const amp = ctx.createGain()
  const stop = envelope(amp.gain, t, { attack: 2.5, peak: 0.022 * vel, sustain: 0.02 * vel, decay: 2, release: 3, end: t + dur })
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 900
  filter.Q.value = 2
  const breathe = ctx.createOscillator()
  breathe.frequency.value = 0.07
  const depth = ctx.createGain()
  depth.gain.value = 500
  breathe.connect(depth)
  depth.connect(filter.frequency)
  filter.connect(amp)
  amp.connect(kit.keys)
  run(kit, breathe, t, stop)
  for (const note of notes) {
    for (const cents of [-8, 0, 8]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = mtof(note)
      o.detune.value = cents
      o.connect(filter)
      run(kit, o, t, stop)
    }
  }
}

/** A low sine that swells in and out, felt more than heard. */
export function subSwell(kit: Kit, t: number, midi: number, dur: number, vel: number) {
  const { ctx } = kit
  const o = ctx.createOscillator()
  o.frequency.value = mtof(midi)
  const g = ctx.createGain()
  const stop = envelope(g.gain, t, { attack: 2.2, peak: 0.16 * vel, sustain: 0.13 * vel, decay: 2, release: 2, end: t + dur })
  o.connect(g)
  g.connect(kit.bass)
  run(kit, o, t, stop)
}

/** A distant star: a high, quick ping into the echo. */
export function ping(kit: Kit, t: number, vel: number, pan = 0) {
  const { ctx } = kit
  const o = ctx.createOscillator()
  o.frequency.value = rand(1800, 4200)
  const g = ctx.createGain()
  const stop = envelope(g.gain, t, { attack: 0.002, peak: 0.025 * vel, sustain: 0, decay: 0.18, release: 0.05, end: t + 1.2 })
  const out = panned(kit, kit.lead, pan)
  o.connect(g)
  g.connect(out)
  if (kit.echo) g.connect(kit.echo)
  run(kit, o, t, stop)
}

/** A gamelan bar (saron, or the softer gender): bronze partials that don't sit
 * on the harmonic series, and the fundamental in a pair tuned slightly apart
 * so it shimmers — the ombak, the "wave". */
export function saron(kit: Kit, t: number, midi: number, dur: number, vel: number, pan = 0, soft = false) {
  const { ctx } = kit
  const f = mtof(midi)
  const out = panned(kit, kit.keys, pan)
  const parts: readonly (readonly [number, number, number])[] = soft
    ? [
        [1, 1, 1.1],
        [2.76, 0.15, 0.3],
      ]
    : [
        [1, 1, 0.9],
        [2.76, 0.38, 0.25],
        [5.4, 0.14, 0.08],
      ]
  for (const [ratio, amt, decay] of parts) {
    const offsets = ratio === 1 ? [-2.5, 2.5] : [0]
    for (const hz of offsets) {
      const o = ctx.createOscillator()
      o.frequency.value = f * ratio + hz
      const g = ctx.createGain()
      const stop = envelope(g.gain, t, { attack: 0.002, peak: (0.07 * vel * amt) / offsets.length, sustain: 0, decay, release: 0.2, end: t + Math.min(dur + 1.5, decay * 6) })
      o.connect(g)
      g.connect(out)
      run(kit, o, t, stop)
    }
  }
  if (!soft) noiseHit(kit, out, t, { type: 'bandpass', freq: Math.min(8000, f * 3), q: 1, decay: 0.005, gain: 0.025 * vel })
}

/** A kenong: a mid-sized kettle gong, round and steady. */
export function kenong(kit: Kit, t: number, midi: number, vel: number) {
  const { ctx } = kit
  const f = mtof(midi)
  for (const [ratio, amt] of [
    [1, 1],
    [1.006, 0.8],
    [2, 0.25],
    [3.01, 0.08],
  ] as const) {
    const o = ctx.createOscillator()
    o.frequency.value = f * ratio
    const g = ctx.createGain()
    const stop = envelope(g.gain, t, { attack: 0.01, peak: 0.05 * vel * amt, sustain: 0, decay: 1.6, release: 0.3, end: t + 7 })
    o.connect(g)
    g.connect(kit.keys)
    run(kit, o, t, stop)
  }
}

/** The great gong that closes each cycle: low, beating slowly, long. */
export function gong(kit: Kit, t: number, f: number, vel: number) {
  const { ctx } = kit
  for (const [ratio, amt, decay] of [
    [1, 1, 3.5],
    [1.025, 0.7, 3.5],
    [2.32, 0.28, 1.8],
    [3.1, 0.1, 0.9],
  ] as const) {
    const o = ctx.createOscillator()
    o.frequency.value = f * ratio
    const g = ctx.createGain()
    const stop = envelope(g.gain, t, { attack: 0.03, peak: 0.085 * vel * amt, sustain: 0, decay, release: 0.5, end: t + 13 })
    o.connect(g)
    g.connect(kit.bass)
    run(kit, o, t, stop)
  }
}

/* --- styles ------------------------------------------------------------------ */

export interface Style<S> {
  bpm: number
  kit: Omit<Parameters<typeof makeKit>[2], 'spb'>
  init: (kit: Kit, t: number) => S
  bar: (kit: Kit, state: S, t: number, index: number, spb: number) => void
}

/** Keeps a queue of bars from the style's progressions, refilling as it runs
 * out — and every so often moving to a new key, so an hour does not sit on
 * one set of chords. */
export class Changes {
  private queue: Slot[][] = []
  private played = 0
  constructor(
    private progressions: Progression[],
    public key: number,
    private keys: number[],
  ) {}
  private refill() {
    if (this.played > 0 && this.played % 32 === 0 && chance(0.5)) this.key = pick(this.keys)
    this.queue.push(...expand(pick(this.progressions), this.key))
  }
  next(): Slot[] {
    if (!this.queue.length) this.refill()
    this.played++
    return this.queue.shift()!
  }
  peek(): Slot[] {
    if (!this.queue.length) this.refill()
    return this.queue[0]
  }
}
