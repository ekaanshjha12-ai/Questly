import {
  rand,
  chance,
  pick,
  humanize,
  MAJOR,
  type Progression,
  nearest,
  voice,
  piano,
  type Style,
  Changes,
  bowl,
  drone,
  handpan,
  noiseHit,
  ping,
  spacePad,
  subSwell,
  tingsha,
} from './band'

/**
 * Music that barely moves: soft piano, a handpan, singing bowls, deep space.
 */

/* Soft piano: slow chords, a low root held under a rising and falling
 * arpeggio, a melody note now and then, a lot of room around it. */
const PIANO_PROGRESSIONS: Progression[] = [
  [[[0, 'maj9']], [[0, 'maj9']], [[9, 'm9']], [[9, 'm9']], [[5, 'maj9']], [[5, 'maj9']], [[7, 'sus']], [[7, 'add9']]],
  [[[9, 'm9']], [[9, 'm9']], [[5, 'maj9']], [[5, 'maj9']], [[0, 'add9']], [[0, 'add9']], [[7, 'sus']], [[7, 'add9']]],
  [[[5, 'maj9']], [[5, 'maj9']], [[4, 'm7']], [[4, 'm7']], [[2, 'm9']], [[2, 'm9']], [[0, 'maj9']], [[0, 'maj9']]],
]

export const softPiano: Style<{ changes: Changes; prev: number[] | null }> = {
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

/* Handpan: a steel handpan in D Kurd, a low centre note and eight around it,
 * played in rolling syncopated patterns that lean on a different chord each
 * bar, with soft finger taps in between. */
const KURD = [50, 57, 58, 60, 62, 64, 65, 67, 69]
/** Which notes of the pan each bar leans on: D minor, B flat, C and A minor
 * shapes, as positions around the pan. */
const PAN_CHORDS = [
  [1, 4, 6, 8],
  [2, 4, 6],
  [3, 5, 7],
  [1, 3, 5, 8],
]
const PAN_ORDERS = [
  [0, 1, 2, 3],
  [0, 2, 1, 3],
  [3, 1, 2, 0],
]

export const handpanStyle: Style<{ offset: number; rhythm: number[]; order: number[] }> = {
  bpm: 92,
  kit: { level: 1.08, reverbSeconds: 2.4, sends: { drums: 0.1, keys: 0.3, bass: 0, lead: 0.3 }, lowpass: null, echoBeats: null },
  init: () => ({ offset: pick([0, 2, -2, 3, -3]), rhythm: [], order: [] }),
  bar: (kit, s, t, i, spb) => {
    const notes = KURD.map((n) => n + s.offset)
    const at = (sixteenth: number) => t + (sixteenth / 4) * spb + humanize(6)
    // A rhythm and a phrase shape held for four bars, so it grooves rather
    // than wanders. 2 is the centre note, 1 a note around the pan.
    if (i % 4 === 0 || !s.rhythm.length) {
      s.rhythm = Array.from({ length: 16 }, (_, k) => (k === 0 || k === 10 ? 2 : k % 4 === 0 || chance(0.38) ? 1 : 0))
      s.order = pick(PAN_ORDERS)
    }
    const chord = PAN_CHORDS[i % PAN_CHORDS.length]
    let n = 0
    s.rhythm.forEach((cell, k) => {
      if (cell === 2) {
        handpan(kit, at(k), notes[0], k === 0 ? 1 : 0.8, 0)
      } else if (cell === 1) {
        let idx = chord[s.order[n % s.order.length] % chord.length]
        n++
        if (i % 4 === 3 && k >= 12) idx = Math.min(notes.length - 1, idx + 1)
        handpan(kit, at(k), notes[idx], rand(0.5, 0.78), (idx / notes.length - 0.5) * 0.9)
      } else if (chance(0.16)) {
        noiseHit(kit, kit.drums, at(k), { type: 'bandpass', freq: 2200, q: 0.9, decay: 0.015, gain: 0.045 })
      }
    })
  },
}

/* Singing bowls: bowls struck now and then over a low drone, sometimes one
 * rubbed until it sings, and the bright clink of tingsha. */
export const bowlsStyle: Style<{ root: number }> = {
  bpm: 40,
  kit: { level: 1.35, reverbSeconds: 3.4, sends: { drums: 0, keys: 0.35, bass: 0.15, lead: 0.4 }, lowpass: null, echoBeats: null },
  init: () => ({ root: pick([196, 174.6, 220, 207.7]) }),
  bar: (kit, s, t, i, spb) => {
    const ratios = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2]
    if (i % 4 === 0) drone(kit, t, [s.root / 2, (s.root * 3) / 4], 16 * spb + 2, 1)
    if (i === 0 || chance(0.72)) bowl(kit, t + rand(0, 1.5) * spb, s.root * pick(ratios), rand(0.75, 1), rand(-0.5, 0.5))
    if (chance(0.3)) bowl(kit, t + rand(2, 3.5) * spb, s.root * pick(ratios) * pick([1, 2]), rand(0.45, 0.6), rand(-0.6, 0.6))
    if (i % 6 === 3 && chance(0.6)) bowl(kit, t, s.root, 0.9, 0, true)
    if (i % 8 === 7 && chance(0.5)) tingsha(kit, t + 3 * spb, 0.8)
  },
}

/* Deep space: pads drifting through slow suspended chords, a sub swelling
 * underneath, stars pinging far off into the echo. */
const SPACE_PROGRESSIONS: Progression[] = [
  [[[0, 'sus2']], [[0, 'sus2']], [[8, 'maj7']], [[8, 'maj7']], [[5, 'sus2']], [[5, 'sus2']], [[10, 'sus4']], [[10, 'sus4']]],
  [[[0, 'madd9']], [[0, 'madd9']], [[3, 'add9']], [[3, 'add9']], [[10, 'add9']], [[10, 'add9']], [[7, 'sus4']], [[7, 'sus4']]],
]

export const space: Style<{ changes: Changes }> = {
  bpm: 52,
  kit: { level: 0.75, reverbSeconds: 3.6, sends: { drums: 0, keys: 0.5, bass: 0.05, lead: 0.5 }, lowpass: null, echoBeats: 1.5 },
  init: () => {
    const keys = [2, 9, 4, 0, 7]
    return { changes: new Changes(SPACE_PROGRESSIONS, pick(keys), keys) }
  },
  bar: (kit, s, t, i, spb) => {
    const slot = s.changes.next()[0]
    if (i % 2 === 0) {
      spacePad(kit, t, voice(slot, 50, null, { max: 4 }), 8 * spb, 1)
      subSwell(kit, t, nearest(slot.root, 33), 8 * spb, 1)
    }
    for (let k = 0; k < 3; k++) if (chance(0.45)) ping(kit, t + rand(0, 4) * spb, rand(0.4, 1), rand(-0.8, 0.8))
  },
}
