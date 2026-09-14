import {
  rand,
  chance,
  pick,
  humanize,
  MAJOR,
  type Progression,
  nearest,
  voice,
  step,
  epiano,
  piano,
  vibes,
  flute,
  bass,
  pluck,
  pad,
  blip,
  kick,
  snare,
  clap,
  hat,
  brush,
  ride,
  rim,
  shaker,
  crackle,
  swung,
  type Style,
  Changes,
  celesta,
  chip,
  chipBass,
  chipHat,
  chipKick,
  chipSnare,
  fireplace,
  softPad,
} from './band'

/**
 * Music with a groove to it: lo-fi, jazz, bossa nova, synthwave, a cozy
 * fireplace, an 8-bit quest.
 */

/* Lo-fi: a lazy boom-bap, jazzy chords on a wobbly electric piano, a round sub
 * bass, vinyl crackle, everything a little dull at the top. */
const LOFI_PROGRESSIONS: Progression[] = [
  [[[2, 'm9']], [[7, 'dom13']], [[0, 'maj9']], [[9, 'm9']]],
  [[[5, 'maj9']], [[4, 'm7']], [[2, 'm9']], [[0, 'maj7']]],
  [[[9, 'm9']], [[5, 'maj9']], [[0, 'maj7']], [[7, 'sus']]],
  [[[0, 'maj9']], [[9, 'm7']], [[2, 'm9']], [[7, 'dom9']]],
  [[[4, 'm7']], [[9, 'm9']], [[2, 'm9']], [[7, 'dom7b9']]],
]

export const lofi: Style<{ changes: Changes; prev: number[] | null; hook: number }> = {
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

export const jazz: Style<{ changes: Changes; prev: number[] | null; bassNote: number; solo: number }> = {
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

/* Bossa nova: nylon guitar — thumb on the bass, fingers syncopated on the
 * chords — rim clicks on the clave, a shaker, and a flute from time to time. */
const BOSSA_PROGRESSIONS: Progression[] = [
  [[[0, 'maj9']], [[0, 'maj9']], [[2, 'dom9']], [[2, 'dom9']], [[2, 'm9']], [[1, 'dom7b9']], [[0, 'maj9']], [[1, 'dom7b9']]],
  [[[2, 'm9']], [[7, 'dom13']], [[0, 'maj9']], [[0, 'maj9']], [[2, 'm9']], [[7, 'dom13']], [[4, 'm7']], [[9, 'dom7b9']]],
  [[[9, 'm9']], [[9, 'm9']], [[2, 'dom9']], [[2, 'dom9']], [[4, 'm7b5']], [[9, 'dom7b9']], [[2, 'm9']], [[7, 'dom13']]],
]

export const bossa: Style<{ changes: Changes; prev: number[] | null }> = {
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

export const synthwave: Style<{ changes: Changes; prev: number[] | null }> = {
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

/* Cozy fireplace: a guitar fingerpicked by the fire, a music box drifting over
 * it now and then, a warm pad underneath, the fire itself crackling. */
const COZY_PROGRESSIONS: Progression[] = [
  [[[0, 'maj7']], [[9, 'm7']], [[5, 'maj7']], [[7, 'six']]],
  [[[0, 'add9']], [[4, 'm7']], [[5, 'maj7']], [[5, 'six']]],
  [[[9, 'm7']], [[5, 'maj7']], [[0, 'add9']], [[7, 'sus4']]],
  [[[5, 'maj7']], [[0, 'maj7']], [[2, 'm7']], [[7, 'six']]],
]

export const cozy: Style<{ changes: Changes }> = {
  bpm: 80,
  kit: { level: 1.3, reverbSeconds: 1.8, sends: { drums: 0, keys: 0.16, bass: 0, lead: 0.35 }, lowpass: 7000, echoBeats: null },
  init: (kit, t) => {
    fireplace(kit, t)
    const keys = [7, 2, 0, 5, 9]
    return { changes: new Changes(COZY_PROGRESSIONS, pick(keys), keys) }
  },
  bar: (kit, s, t, i, spb) => {
    const slot = s.changes.next()[0]
    const key = s.changes.key
    const at = (beat: number) => t + swung(beat, 0.56) * spb + humanize(7)
    const root = nearest(slot.root, 45)
    const upper = voice(slot, 57, null, { max: 4 })

    // Travis picking: the thumb alternates root and fifth on the beat, the
    // fingers pick the chord between.
    for (let beat = 0; beat < 4; beat++) {
      pluck(kit, at(beat), beat % 2 === 0 ? root : root + 7, 1.5 * spb, beat % 2 === 0 ? 0.9 : 0.72, -0.15, 2000)
    }
    const fingers = [upper[1], upper[2], upper[upper.length - 1], upper[2]]
    ;[0.5, 1.5, 2.5, 3.5].forEach((b, n) => pluck(kit, at(b), fingers[n] ?? upper[0], 1.1 * spb, rand(0.42, 0.58), 0.2, 2400))
    if (chance(0.5)) pluck(kit, at(0), upper[upper.length - 1], 1.6 * spb, 0.5, 0.25, 2400)

    softPad(kit, t, [root + 12, upper[0], upper[1]], 4 * spb, 1)

    if (i >= 2 && i % 4 === 1 && chance(0.8)) {
      let note = nearest((key + pick([4, 7, 0])) % 12, 79)
      for (const b of [0, 1, 1.5, 2, 3].filter(() => chance(0.72))) {
        celesta(kit, at(b), note, 1.2 * spb, rand(0.5, 0.7), 0.3)
        note = Math.max(74, Math.min(91, step(note, chance(0.55) ? -1 : 1, key, [0, 2, 4, 7, 9])))
      }
    }
  },
}

/* 8-bit quest: an adventure theme on an old handheld. A pulse-wave tune that
 * states an idea and bends it to each chord for four bars, an arpeggio, a
 * triangle bass, noise drums. */
const CHIP_PROGRESSIONS: Progression[] = [
  [[[0, 'maj']], [[7, 'maj']], [[9, 'min']], [[5, 'maj']]],
  [[[9, 'min']], [[5, 'maj']], [[0, 'maj']], [[7, 'maj']]],
  [[[0, 'maj']], [[5, 'maj']], [[7, 'maj']], [[0, 'maj']]],
  [[[5, 'maj']], [[7, 'maj']], [[4, 'min']], [[9, 'min']]],
]

export const chiptune: Style<{ changes: Changes; motif: { beat: number; steps: number; len: number }[] }> = {
  bpm: 116,
  kit: { level: 0.9, reverbSeconds: 1, sends: { drums: 0, keys: 0.04, bass: 0, lead: 0.08 }, lowpass: 10000, echoBeats: null },
  init: () => {
    const keys = [0, 7, 2, 5]
    return { changes: new Changes(CHIP_PROGRESSIONS, pick(keys), keys), motif: [] }
  },
  bar: (kit, s, t, i, spb) => {
    const slot = s.changes.next()[0]
    const key = s.changes.key
    const at = (beat: number) => t + beat * spb

    if (i % 4 === 0 || !s.motif.length) {
      s.motif = []
      for (let beat = 0; beat < 4; ) {
        const len = pick([0.5, 0.5, 1, 0.25, 0.75])
        if (chance(0.8)) s.motif.push({ beat, steps: Math.floor(rand(-2, 5)), len })
        beat += len
      }
    }
    if (i >= 2) {
      const base = nearest(slot.root, 74)
      for (const m of s.motif) {
        let note = base
        for (let k = 0; k < Math.abs(m.steps); k++) note = step(note, m.steps > 0 ? 1 : -1, key, MAJOR)
        if (i % 4 === 3 && m.beat >= 2) note = step(note, 1, key, MAJOR)
        chip(kit, at(m.beat), note, Math.min(m.len, 4 - m.beat) * spb * 0.9, 0.9, { duty: 0.25 })
      }
    }

    const triad = slot.tones
      .slice(0, 3)
      .map((iv) => nearest((slot.root + iv) % 12, 66))
      .sort((a, b) => a - b)
    for (let k = 0; k < 16; k++) chip(kit, at(k / 4), triad[k % 3] + (Math.floor(k / 3) % 2) * 12, 0.2 * spb, 0.5, { duty: 0.5, gain: 0.02 })
    const bassRoot = nearest(slot.root, 40)
    for (let b = 0; b < 4; b += 0.5) chipBass(kit, at(b), b % 1 === 0 ? bassRoot : bassRoot + 12, 0.42 * spb, 0.85)

    if (i >= 1) {
      chipKick(kit, at(0), 1)
      chipKick(kit, at(2), 0.9)
      if (chance(0.3)) chipKick(kit, at(2.5), 0.6)
      chipSnare(kit, at(1), 0.8)
      chipSnare(kit, at(3), 0.8)
      for (let b = 0; b < 4; b += 0.5) chipHat(kit, at(b), b % 1 === 0 ? 0.6 : 0.4)
    }
  },
}
