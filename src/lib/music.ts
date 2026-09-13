/**
 * Music, composed while it plays.
 *
 * Nothing here is a recording. Each style is a small band built from Web Audio
 * nodes — an electric piano, a real-sounding piano, upright and synth bass,
 * brushes and a ride cymbal, a nylon-string guitar, pads and arpeggios — and a
 * composer that writes the next bar just before it is needed: chord
 * progressions chosen and voiced as it goes, a walking bass that heads for the
 * next chord, drums with a human wobble in their timing, a vibraphone that
 * sometimes takes a solo. So it never loops, needs no downloads, works offline,
 * and has no licence attached.
 *
 * Timing uses the usual Web Audio pattern: a timer wakes every so often and
 * schedules any bar that starts within the next second and a half against the
 * audio clock, which is steady even when the timer is not.
 */

export type MusicId = 'lofi' | 'jazz' | 'piano' | 'bossa' | 'synthwave'

export interface MusicDef {
  id: MusicId
  name: string
  blurb: string
  icon: string
  bpm: number
}

export const MUSIC: MusicDef[] = [
  { id: 'lofi', name: 'Lo-fi beats', blurb: 'Dusty drums, warm keys, vinyl crackle.', icon: '🎧', bpm: 74 },
  { id: 'jazz', name: 'Jazz café', blurb: 'Walking bass, brushes, a vibraphone solo.', icon: '🎷', bpm: 118 },
  { id: 'piano', name: 'Soft piano', blurb: 'Slow, spacious chords to think to.', icon: '🎹', bpm: 58 },
  { id: 'bossa', name: 'Bossa nova', blurb: 'Nylon guitar and a gentle Brazilian sway.', icon: '🌴', bpm: 128 },
  { id: 'synthwave', name: 'Synthwave', blurb: 'Retro pads under a pulsing arpeggio.', icon: '🌆', bpm: 94 },
]

/* --- small helpers --------------------------------------------------------- */

const mtof = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
const chance = (p: number) => Math.random() < p
const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]
/** A few milliseconds either way, so nothing lands exactly on the grid. */
const humanize = (ms: number) => rand(-ms, ms) / 1000

const MAJOR = [0, 2, 4, 5, 7, 9, 11]

/** Chord shapes as intervals from the root, extensions included. */
const Q = {
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
} as const
type Quality = keyof typeof Q

/** One chord in a bar: its root as a pitch class, its shape, and where it sits. */
interface Slot {
  root: number
  tones: readonly number[]
  beat: number
  beats: number
}

/** A progression is a list of bars; each bar holds one chord, or two of two beats. */
type Progression = [number, Quality][][]

function expand(progression: Progression, key: number): Slot[][] {
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
function nearest(pc: number, target: number): number {
  const base = target - (((target - pc) % 12) + 12) % 12
  return target - base > 6 ? base + 12 : base
}

/**
 * Stacks a chord's tones upward from around `low`, trying each tone at the
 * bottom and keeping the voicing that moves least from the last one — which is
 * what makes chords flow into each other rather than jump about.
 */
function voice(slot: Slot, low: number, prev: number[] | null, { rootless = false, max = 5 } = {}): number[] {
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
function step(midi: number, dir: 1 | -1, key: number, scale: number[]): number {
  let n = midi + dir
  while (!scale.includes((((n - key) % 12) + 12) % 12)) n += dir
  return n
}

/* --- the band -------------------------------------------------------------- */

/** Everything a style plays into: shared buses, a reverb, a noise buffer. */
interface Kit {
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

function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
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

function makeKit(
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
function run(kit: Kit, src: AudioScheduledSourceNode, start: number, stop: number) {
  src.start(start)
  src.stop(stop)
  kit.sources.push(src)
  src.onended = () => {
    const i = kit.sources.indexOf(src)
    if (i >= 0) kit.sources.splice(i, 1)
    src.disconnect()
  }
}

function panned(kit: Kit, dest: AudioNode, pan: number): AudioNode {
  if (!pan || !('createStereoPanner' in kit.ctx)) return dest
  const p = kit.ctx.createStereoPanner()
  p.pan.value = Math.max(-1, Math.min(1, pan))
  p.connect(dest)
  return p
}

/** Attack, then an exponential fall towards `sustain`, then a release. */
function envelope(param: AudioParam, t: number, { attack, peak, sustain, decay, release, end }: {
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

function noiseHit(kit: Kit, dest: AudioNode, t: number, { type, freq, q = 0.7, attack = 0.001, decay, gain }: {
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
function epiano(kit: Kit, t: number, midi: number, dur: number, vel: number, pan = 0, dest: AudioNode = kit.keys) {
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
function piano(kit: Kit, t: number, midi: number, dur: number, vel: number, pan = 0, light = false) {
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
function vibes(kit: Kit, t: number, midi: number, dur: number, vel: number, pan = 0) {
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
function flute(kit: Kit, t: number, midi: number, dur: number, vel: number) {
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
function bass(kit: Kit, t: number, midi: number, dur: number, vel: number, kind: 'upright' | 'sub' | 'synth') {
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
function pluck(kit: Kit, t: number, midi: number, dur: number, vel: number, pan = 0) {
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
  const src = ctx.createBufferSource()
  src.buffer = cached.buffer
  src.playbackRate.value = cached.rate
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 2600
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
function pad(kit: Kit, t: number, notes: number[], dur: number, vel: number) {
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
function blip(kit: Kit, t: number, midi: number, vel: number) {
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

function kick(kit: Kit, t: number, vel: number, soft = false) {
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

function snare(kit: Kit, t: number, vel: number) {
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

function clap(kit: Kit, t: number, vel: number) {
  for (let i = 0; i < 3; i++) {
    noiseHit(kit, kit.drums, t + i * 0.011, { type: 'bandpass', freq: 1250, q: 0.9, decay: 0.012, gain: 0.26 * vel })
  }
  noiseHit(kit, kit.drums, t + 0.034, { type: 'bandpass', freq: 1400, q: 0.7, decay: 0.07, gain: 0.22 * vel })
}

function hat(kit: Kit, t: number, vel: number, open = false) {
  noiseHit(kit, kit.drums, t, { type: 'highpass', freq: 7200, q: 0.5, decay: open ? 0.09 : 0.016, gain: 0.13 * vel })
}

function brush(kit: Kit, t: number, vel: number) {
  noiseHit(kit, kit.drums, t, { type: 'bandpass', freq: 3000, q: 0.45, attack: 0.012, decay: 0.07, gain: 0.12 * vel })
}

/** A ride cymbal: the stick's tick, and a narrow ringing band over a softer
 * wash — close enough to shimmer, at a fraction of the cost of real partials,
 * which matters for something struck six times a bar. */
function ride(kit: Kit, t: number, vel: number) {
  noiseHit(kit, kit.drums, t, { type: 'highpass', freq: 8000, decay: 0.012, gain: 0.08 * vel })
  noiseHit(kit, kit.drums, t, { type: 'bandpass', freq: 5200, q: 6, decay: 0.3, gain: 0.07 * vel })
  noiseHit(kit, kit.drums, t, { type: 'bandpass', freq: 7200, q: 0.4, decay: 0.24, gain: 0.045 * vel })
}

function rim(kit: Kit, t: number, vel: number) {
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

function shaker(kit: Kit, t: number, vel: number) {
  noiseHit(kit, kit.drums, t, { type: 'bandpass', freq: 6500, q: 0.9, attack: 0.008, decay: 0.03, gain: 0.07 * vel })
}

/** Vinyl crackle and hiss: a few seconds of sparse clicks, looped. */
function crackle(kit: Kit, t: number) {
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
const swung = (beat: number, ratio: number) => {
  const whole = Math.floor(beat)
  const frac = beat - whole
  return Math.abs(frac - 0.5) < 1e-6 ? whole + ratio : beat
}

/* --- the styles ------------------------------------------------------------ */

interface Style<S> {
  bpm: number
  kit: Omit<Parameters<typeof makeKit>[2], 'spb'>
  init: (kit: Kit, t: number) => S
  bar: (kit: Kit, state: S, t: number, index: number, spb: number) => void
}

/** Keeps a queue of bars from the style's progressions, refilling as it runs
 * out — and every so often moving to a new key, so an hour does not sit on
 * one set of chords. */
class Changes {
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

/* Lo-fi: a lazy boom-bap, jazzy chords on a wobbly electric piano, a round sub
 * bass, vinyl crackle, everything a little dull at the top. */
const LOFI_PROGRESSIONS: Progression[] = [
  [[[2, 'm9']], [[7, 'dom13']], [[0, 'maj9']], [[9, 'm9']]],
  [[[5, 'maj9']], [[4, 'm7']], [[2, 'm9']], [[0, 'maj7']]],
  [[[9, 'm9']], [[5, 'maj9']], [[0, 'maj7']], [[7, 'sus']]],
  [[[0, 'maj9']], [[9, 'm7']], [[2, 'm9']], [[7, 'dom9']]],
  [[[4, 'm7']], [[9, 'm9']], [[2, 'm9']], [[7, 'dom7b9']]],
]

const lofi: Style<{ changes: Changes; prev: number[] | null; hook: number }> = {
  bpm: 74,
  kit: { level: 0.54, reverbSeconds: 2.2, sends: { drums: 0.08, keys: 0.3, bass: 0, lead: 0.35 }, lowpass: 4600, echoBeats: null },
  init: (kit, t) => {
    crackle(kit, t)
    const keys = [0, 2, 3, 5, 7, 9, 10]
    return { changes: new Changes(LOFI_PROGRESSIONS, pick(keys), keys), prev: null, hook: 0 }
  },
  bar: (kit, s, t, i, spb) => {
    const slots = s.changes.next()
    const at = (beat: number, lag = 0) => t + swung(beat, 0.6) * spb + lag + humanize(8)
    const drums = i >= 2 && !(i % 16 === 15 && chance(0.5))

    if (drums) {
      kick(kit, at(0), 0.9, true)
      if (chance(0.7)) kick(kit, at(2.5), 0.7, true)
      if (chance(0.25)) kick(kit, at(1.75), 0.5, true)
      snare(kit, at(1, 0.018), 0.75)
      snare(kit, at(3, 0.018), 0.8)
      for (let b = 0; b < 4; b += 0.5) {
        if (chance(0.08)) continue
        hat(kit, at(b), b % 1 === 0 ? rand(0.55, 0.7) : rand(0.3, 0.45), b === 3.5 && i % 4 === 3)
      }
    }

    for (const slot of slots) {
      const notes = voice(slot, 53, s.prev, { max: 4 })
      s.prev = notes
      const dur = slot.beats * spb * 0.96
      notes.forEach((note, n) => epiano(kit, t + slot.beat * spb + n * 0.018 + humanize(5), note, dur, rand(0.55, 0.7), (n - 1.5) * 0.18))
      if (slot.beats === 4 && chance(0.45)) {
        notes.forEach((note, n) => epiano(kit, at(2.5) + n * 0.014, note, 1.4 * spb, rand(0.35, 0.45), (n - 1.5) * 0.18))
      }
      const root = nearest(slot.root, 38)
      bass(kit, t + slot.beat * spb, root, Math.min(slot.beats, 1.6) * spb, 0.85, 'sub')
      if (slot.beats === 4 && chance(0.65)) bass(kit, at(2.5), chance(0.5) ? root + 7 : root, 0.9 * spb, 0.7, 'sub')
    }

    // Now and then a little melody on top, from the pentatonic scale.
    if (i >= 4 && i % 4 === 2 && chance(0.7)) {
      const key = s.changes.key
      let note = nearest((key + pick([0, 4, 7])) % 12, 76)
      const beats = [0.5, 1, 1.5, 2.5, 3, 3.5].filter(() => chance(0.55))
      for (const b of beats) {
        epiano(kit, at(b), note, 0.9 * spb, rand(0.4, 0.5), 0.25)
        note = step(note, chance(0.5) ? 1 : -1, key, [0, 2, 4, 7, 9])
        if (chance(0.3)) note = step(note, chance(0.5) ? 1 : -1, key, [0, 2, 4, 7, 9])
        note = Math.max(69, Math.min(86, note))
      }
    }
  },
}

/* Jazz: medium swing. Walking bass, ride and hi-hat, brushes, a pianist
 * comping rootless voicings, and a vibraphone that takes phrases. */
const JAZZ_PROGRESSIONS: Progression[] = [
  [[[2, 'm9'], [7, 'dom13']], [[0, 'maj9']], [[9, 'm7'], [2, 'dom9']], [[2, 'm9'], [7, 'dom7b9']], [[4, 'm7'], [9, 'dom7b9']], [[2, 'm9'], [7, 'dom13']], [[0, 'six9']], [[0, 'six9']]],
  [[[11, 'm7b5']], [[4, 'dom7b9']], [[9, 'm9']], [[9, 'm9']], [[2, 'm9']], [[7, 'dom13']], [[0, 'maj9']], [[4, 'dom7b9']]],
  [[[0, 'six9'], [9, 'm7']], [[2, 'm9'], [7, 'dom13']], [[0, 'six9'], [9, 'm7']], [[2, 'm9'], [7, 'dom13']], [[0, 'dom9']], [[5, 'maj9'], [6, 'dim7']], [[0, 'six9'], [7, 'dom13']], [[0, 'six9']]],
  [[[0, 'dom13']], [[5, 'dom9']], [[0, 'dom13']], [[0, 'dom13']], [[5, 'dom9']], [[6, 'dim7']], [[0, 'dom13']], [[9, 'dom7b9']], [[2, 'm9']], [[7, 'dom13']], [[0, 'dom13'], [9, 'dom7b9']], [[2, 'm9'], [7, 'dom13']]],
]

const jazz: Style<{ changes: Changes; prev: number[] | null; bassNote: number; solo: number }> = {
  bpm: 118,
  kit: { level: 0.5, reverbSeconds: 1.6, sends: { drums: 0.12, keys: 0.16, bass: 0.03, lead: 0.28 }, lowpass: null, echoBeats: null },
  init: () => {
    const keys = [5, 10, 3, 0, 7]
    return { changes: new Changes(JAZZ_PROGRESSIONS, pick(keys), keys), prev: null, bassNote: 41, solo: 0 }
  },
  bar: (kit, s, t, i, spb) => {
    const slots = s.changes.next()
    const nextSlots = s.changes.peek()
    const key = s.changes.key
    const at = (beat: number) => t + swung(beat, 0.66) * spb + humanize(9)

    // Ride: the spang-a-lang, and the hi-hat foot on two and four.
    for (const [b, v] of [[0, 0.7], [1, 0.9], [1.5, 0.45], [2, 0.7], [3, 0.9], [3.5, 0.45]] as const) ride(kit, at(b), v * rand(0.85, 1))
    hat(kit, at(1), 0.35)
    hat(kit, at(3), 0.35)
    for (let b = 0; b < 4; b += 0.5) if (chance(0.12)) brush(kit, at(b), rand(0.4, 0.7))
    if (chance(0.15)) kick(kit, at(pick([2.5, 3.5])), 0.35, true)

    // The walking bass: the root on a chord's first beat, chord tones in
    // between, and on the last beat before a change a half step into the next
    // root.
    const slotAt = (beat: number) => slots.find((sl) => beat >= sl.beat && beat < sl.beat + sl.beats) ?? slots[0]
    for (let beat = 0; beat < 4; beat++) {
      const slot = slotAt(beat)
      const changing = beat === slot.beat + slot.beats - 1
      const target = changing ? (beat === 3 ? nextSlots[0] : slotAt(beat + 1)) : null
      let note: number
      if (beat === slot.beat) note = nearest(slot.root, s.bassNote)
      else if (target && slot.beats > 1) {
        const goal = nearest(target.root, s.bassNote)
        note = goal + (chance(0.5) ? 1 : -1)
      } else {
        const tones = slot.tones.slice(1, 4).map((iv) => (slot.root + iv) % 12)
        note = nearest(pick(tones), s.bassNote + (chance(0.5) ? 2 : -2))
      }
      while (note < 33) note += 12
      while (note > 50) note -= 12
      s.bassNote = note
      bass(kit, t + beat * spb + humanize(6), note, spb * 0.9, rand(0.75, 0.9), 'upright')
    }

    // Comping: short rootless chords on off-beats.
    for (const slot of slots) {
      const notes = voice(slot, 55, s.prev, { rootless: true, max: 4 })
      s.prev = notes
      const hits = slot.beats === 4 ? pick([[0, 2.5], [1.5, 3], [0.5, 2], [2]]) : pick([[0], [0.5], [1]])
      for (const h of hits) {
        const when = at(slot.beat + h)
        notes.forEach((note, n) => piano(kit, when + n * 0.006, note, rand(0.35, 0.7) * spb, rand(0.42, 0.55), (n - 1.5) * 0.12, true))
      }
    }

    // The vibraphone takes a phrase over two bars every so often.
    if (i >= 4 && i % 4 === 0 && chance(0.7)) {
      let note = nearest((key + pick([4, 7, 11, 2])) % 12, 76)
      let beat = pick([0.5, 1, 1.5])
      const length = Math.floor(rand(5, 11))
      let dir: 1 | -1 = chance(0.5) ? 1 : -1
      for (let n = 0; n < length && beat < 7.5; n++) {
        const last = n === length - 1
        vibes(kit, t + swung(beat, 0.66) * spb + humanize(10), note, last ? 1.2 * spb : 0.6 * spb, rand(0.55, 0.75), 0.35)
        if (chance(0.25)) dir = dir === 1 ? -1 : 1
        note = step(note, dir, key, MAJOR)
        if (chance(0.3)) note = step(note, dir, key, MAJOR)
        if (note > 88 || note < 67) {
          dir = note > 88 ? -1 : 1
          note = step(note, dir, key, MAJOR)
        }
        beat += chance(0.8) ? 0.5 : 1
      }
    }
  },
}

/* Soft piano: slow chords, a low root held under a rising and falling
 * arpeggio, a melody note now and then, a lot of room around it. */
const PIANO_PROGRESSIONS: Progression[] = [
  [[[0, 'maj9']], [[0, 'maj9']], [[9, 'm9']], [[9, 'm9']], [[5, 'maj9']], [[5, 'maj9']], [[7, 'sus']], [[7, 'add9']]],
  [[[9, 'm9']], [[9, 'm9']], [[5, 'maj9']], [[5, 'maj9']], [[0, 'add9']], [[0, 'add9']], [[7, 'sus']], [[7, 'add9']]],
  [[[5, 'maj9']], [[5, 'maj9']], [[4, 'm7']], [[4, 'm7']], [[2, 'm9']], [[2, 'm9']], [[0, 'maj9']], [[0, 'maj9']]],
]

const softPiano: Style<{ changes: Changes; prev: number[] | null }> = {
  bpm: 58,
  kit: { level: 3.4, reverbSeconds: 2.8, sends: { drums: 0, keys: 0.5, bass: 0.4, lead: 0.5 }, lowpass: 7500, echoBeats: null },
  init: () => {
    const keys = [0, 2, 5, 7, 9]
    return { changes: new Changes(PIANO_PROGRESSIONS, pick(keys), keys), prev: null }
  },
  bar: (kit, s, t, i, spb) => {
    const slot = s.changes.next()[0]
    const key = s.changes.key
    const root = nearest(slot.root, 43)
    piano(kit, t + humanize(10), root, 3.9 * spb, 0.5, -0.2)
    piano(kit, t + 1.5 * spb + humanize(15), root + 7, 2.4 * spb, 0.3, -0.15)

    const notes = voice(slot, 60, s.prev, { max: 4 })
    s.prev = notes
    const run8 = [...notes, notes[notes.length - 1] + 12, ...notes.slice(1, -1).reverse()]
    run8.forEach((note, n) => {
      const beat = 0.5 + n * 0.5
      if (beat > 3.5 || chance(0.22)) return
      piano(kit, t + beat * spb + humanize(22), note, (4 - beat + 1.5) * spb, rand(0.26, 0.4), (n / run8.length - 0.5) * 0.6)
    })

    if (i % 2 === 1 && chance(0.75)) {
      const top = nearest((key + pick(MAJOR)) % 12, 79)
      piano(kit, t + pick([0, 2, 2.5]) * spb + humanize(20), top, 2.5 * spb, rand(0.38, 0.48), 0.2)
    }
  },
}

/* Bossa nova: nylon guitar — thumb on the bass, fingers syncopated on the
 * chords — rim clicks on the clave, a shaker, and a flute from time to time. */
const BOSSA_PROGRESSIONS: Progression[] = [
  [[[0, 'maj9']], [[0, 'maj9']], [[2, 'dom9']], [[2, 'dom9']], [[2, 'm9']], [[1, 'dom7b9']], [[0, 'maj9']], [[1, 'dom7b9']]],
  [[[2, 'm9']], [[7, 'dom13']], [[0, 'maj9']], [[0, 'maj9']], [[2, 'm9']], [[7, 'dom13']], [[4, 'm7']], [[9, 'dom7b9']]],
  [[[9, 'm9']], [[9, 'm9']], [[2, 'dom9']], [[2, 'dom9']], [[4, 'm7b5']], [[9, 'dom7b9']], [[2, 'm9']], [[7, 'dom13']]],
]

const bossa: Style<{ changes: Changes; prev: number[] | null }> = {
  bpm: 128,
  kit: { level: 1.5, reverbSeconds: 1.7, sends: { drums: 0.08, keys: 0.2, bass: 0.05, lead: 0.3 }, lowpass: null, echoBeats: null },
  init: () => {
    const keys = [0, 5, 2, 7, 10]
    return { changes: new Changes(BOSSA_PROGRESSIONS, pick(keys), keys), prev: null }
  },
  bar: (kit, s, t, i, spb) => {
    const slot = s.changes.next()[0]
    const key = s.changes.key
    const at = (beat: number) => t + beat * spb + humanize(6)
    const root = nearest(slot.root, 43)
    const fifth = root + 7 > 52 ? root - 5 : root + 7

    pluck(kit, at(0), root, 1.4 * spb, 0.95, -0.1)
    pluck(kit, at(1.5), fifth, 0.5 * spb, 0.7, -0.1)
    pluck(kit, at(2), root, 1.4 * spb, 0.9, -0.1)
    pluck(kit, at(3.5), fifth, 0.5 * spb, 0.7, -0.1)

    const notes = voice(slot, 57, s.prev, { rootless: true, max: 4 })
    s.prev = notes
    const hits = i % 2 === 0 ? [0.5, 1.5, 3] : [0.5, 2, 3.5]
    for (const h of hits) notes.forEach((note, n) => pluck(kit, at(h) + n * 0.009, note, 0.45 * spb, rand(0.5, 0.62), 0.15 + n * 0.05))

    for (const h of i % 2 === 0 ? [0, 1.5, 3] : [1, 2.5]) rim(kit, at(h), 0.5)
    for (let b = 0; b < 4; b += 0.5) shaker(kit, at(b), b % 1 === 0 ? 0.45 : 0.75)
    kick(kit, at(0), 0.35, true)
    kick(kit, at(2), 0.3, true)

    if (i >= 4 && i % 8 === 4) {
      let note = nearest((key + pick([4, 7, 9])) % 12, 76)
      let beat = pick([0, 0.5, 1])
      let dir: 1 | -1 = -1
      while (beat < 7) {
        const len = pick([0.5, 1, 1, 1.5])
        flute(kit, t + beat * spb + humanize(8), note, len * spb * 0.95, 0.8)
        if (chance(0.3)) dir = dir === 1 ? -1 : 1
        note = Math.max(69, Math.min(86, step(note, dir, key, MAJOR)))
        beat += len
        if (chance(0.15)) beat += 1
      }
    }
  },
}

/* Synthwave, laid back: a swelling pad, an octave-bouncing bass, a sixteenth
 * arpeggio into an echo, a big clap on two and four. */
const SYNTH_PROGRESSIONS: Progression[] = [
  [[[0, 'madd9']], [[8, 'add9']], [[3, 'add9']], [[10, 'add9']]],
  [[[0, 'madd9']], [[5, 'min']], [[8, 'add9']], [[7, 'min']]],
  [[[8, 'add9']], [[10, 'add9']], [[0, 'madd9']], [[0, 'madd9']]],
]

const synthwave: Style<{ changes: Changes; prev: number[] | null }> = {
  bpm: 94,
  kit: { level: 0.85, reverbSeconds: 2.4, sends: { drums: 0.22, keys: 0.3, bass: 0, lead: 0.2 }, lowpass: null, echoBeats: 0.75 },
  init: () => {
    const keys = [9, 4, 6, 2, 11]
    return { changes: new Changes(SYNTH_PROGRESSIONS, pick(keys), keys), prev: null }
  },
  bar: (kit, s, t, i, spb) => {
    const slot = s.changes.next()[0]
    const at = (beat: number) => t + beat * spb + humanize(3)
    const notes = voice(slot, 57, s.prev, { max: 4 })
    s.prev = notes
    pad(kit, t, notes, 4 * spb, 1)

    if (i >= 1) {
      const root = nearest(slot.root, 36)
      for (let b = 0; b < 4; b += 0.5) bass(kit, at(b), b % 1 === 0 ? root : root + 12, 0.42 * spb, b % 1 === 0 ? 0.9 : 0.7, 'synth')
    }
    if (i >= 2) {
      const arp = [...notes, notes[0] + 12, notes[1] + 12]
      for (let n = 0; n < 16; n++) {
        const idx = n % 8 < 4 ? n % 4 : 3 - (n % 4)
        blip(kit, at(n / 4), arp[Math.min(arp.length - 1, idx + (n % 16 >= 8 ? 1 : 0))], n % 4 === 0 ? 0.9 : 0.6)
      }
    }
    if (i >= 4) {
      kick(kit, at(0), 0.85)
      kick(kit, at(2), 0.8)
      if (chance(0.35)) kick(kit, at(2.75), 0.55)
      clap(kit, at(1), 0.8)
      clap(kit, at(3), 0.85)
      for (let b = 0; b < 4; b += 0.25) hat(kit, at(b), b % 0.5 === 0 ? 0.35 : 0.2, b % 1 === 0.5 && chance(0.4))
    }
  },
}

// Each style's state is its own business; the player only passes it back in.
const STYLES = { lofi, jazz, piano: softPiano, bossa, synthwave } as unknown as Record<MusicId, Style<unknown>>

/* --- playing ---------------------------------------------------------------- */

export interface MusicSession {
  stop(fade?: number): void
}

const LOOKAHEAD = 1.5

function prepare(ctx: BaseAudioContext, destination: AudioNode, id: MusicId, startAt: number) {
  const style = STYLES[id]
  const spb = 60 / style.bpm
  const kit = makeKit(ctx, destination, { ...style.kit, spb })
  const state = style.init(kit, startAt)
  return { style, spb, kit, state }
}

/** Starts a style playing into `destination`, fading in. */
export function startMusic(ctx: AudioContext, destination: AudioNode, id: MusicId): MusicSession {
  const start = ctx.currentTime + 0.12
  const { style, spb, kit, state } = prepare(ctx, destination, id, start)
  kit.out.gain.setValueAtTime(0, ctx.currentTime)
  kit.out.gain.linearRampToValueAtTime(1, start + 1.2)

  let nextBar = start
  let index = 0
  let stopped = false
  const tick = () => {
    if (stopped) return
    // After the device slept, the clock has jumped on: pick up from now rather
    // than trying to play every bar that was missed.
    if (nextBar < ctx.currentTime - 0.2) nextBar = ctx.currentTime + 0.05
    while (nextBar < ctx.currentTime + LOOKAHEAD) {
      style.bar(kit, state, nextBar, index, spb)
      nextBar += 4 * spb
      index++
    }
  }
  tick()
  const timer = setInterval(tick, 250)

  return {
    stop(fade = 0.6) {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      const now = ctx.currentTime
      kit.out.gain.cancelScheduledValues(now)
      kit.out.gain.setValueAtTime(kit.out.gain.value, now)
      kit.out.gain.linearRampToValueAtTime(0, now + fade)
      setTimeout(() => {
        for (const src of [...kit.sources]) {
          try {
            src.stop()
          } catch {
            // Not started yet, or already finished.
          }
          src.disconnect()
        }
        kit.sources.length = 0
        for (const node of kit.nodes) node.disconnect()
      }, (fade + 0.15) * 1000)
    },
  }
}

/** Writes `bars` bars straight into a context — for rendering offline to check
 * levels, where there is no clock to wait on. */
export function renderMusic(ctx: BaseAudioContext, destination: AudioNode, id: MusicId, bars: number) {
  const { style, spb, kit, state } = prepare(ctx, destination, id, 0)
  kit.out.gain.value = 1
  for (let i = 0; i < bars; i++) style.bar(kit, state, 0.05 + i * 4 * spb, i, spb)
  return 0.05 + bars * 4 * spb
}
