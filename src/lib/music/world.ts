import {
  type Bol,
  Changes,
  type Progression,
  type Style,
  bansuri,
  bowed,
  chance,
  drip,
  flute,
  frameDrum,
  gong,
  humanize,
  kenong,
  koto,
  mtof,
  nearest,
  overtoneVoice,
  pick,
  pluck,
  rand,
  saron,
  shakuhachi,
  step,
  tabla,
  tanpura,
  voice,
  windBed,
} from './band'

/**
 * Music from further afield: Mongolian throat singing, an evening raga, a zen
 * garden, a Celtic harp, a gamelan.
 *
 * Each is a sketch of the tradition built from synthesis rather than a
 * recording of it, so it keeps to what those instruments and forms do: the
 * overtone series a throat singer sings from, the phrases of Raga Yaman and
 * the sixteen beats of teentaal, the hirajoshi scale, the lilt of six-eight,
 * the slow core melody and gong cycle of gamelan.
 */

/* Mongolian throat singing: a khöömei singer's drone with the overtone melody
 * whistling above it, a horsehead fiddle holding the fifth and answering with
 * tunes of its own, the gallop on a frame drum, wind over the steppe. */
const PENTATONIC = [0, 2, 4, 7, 9]
/** Harmonics a singer can pick out over the drone: over the root, the 6th is
 * a fifth, the 8th the root again, the 9th a ninth, the 10th a third, the
 * 12th a fifth — the overtone series's own pentatonic. */
const OVERTONES = [6, 8, 9, 10, 12]

export const throat: Style<{ key: number }> = {
  bpm: 96,
  kit: { level: 1.2, reverbSeconds: 3, sends: { drums: 0.12, keys: 0.25, bass: 0.1, lead: 0.28 }, lowpass: null, echoBeats: null },
  init: (kit, t) => {
    windBed(kit, t, 0.045)
    return { key: pick([43, 45, 42, 44]) }
  },
  bar: (kit, s, t, i, spb) => {
    const f0 = mtof(s.key)
    // Sections of four bars alternate between the singer and the fiddle's tune.
    const singer = Math.floor(i / 4) % 2 === 0

    // The fiddle holds root and fifth under everything, re-bowed every two bars.
    if (i % 2 === 0) {
      bowed(kit, t, s.key + 12, 8 * spb - 0.1, 0.5, -0.25)
      bowed(kit, t + 0.04, s.key + 19, 8 * spb - 0.1, 0.36, -0.3)
    }

    // The singer starts straight away: it is what someone choosing this came for.
    if (singer && i % 2 === 0) {
      // One breath across two bars, the whistle stepping between neighbouring
      // harmonics.
      const melody: { at: number; harmonic: number }[] = []
      let h = pick([8, 9, 10])
      for (let beat = 0.5; beat < 7; beat += pick([0.5, 1, 1, 1.5])) {
        const idx = OVERTONES.indexOf(h)
        if (chance(0.75)) h = OVERTONES[Math.max(0, Math.min(OVERTONES.length - 1, idx + (chance(0.5) ? 1 : -1)))]
        melody.push({ at: t + beat * spb, harmonic: h })
      }
      overtoneVoice(kit, t + 0.1, 7.2 * spb, f0, [{ at: t, harmonic: 8 }, ...melody], 0.85, chance(0.25))
    }

    if (!singer && i % 2 === 0) {
      let note = nearest((s.key + pick([0, 4, 7])) % 12, s.key + 26)
      let prev: number | undefined
      for (let beat = pick([0, 0.5]); beat < 7.5; ) {
        const len = pick([0.5, 1, 1, 1.5, 2])
        const slide = prev !== undefined && prev !== note && Math.abs(prev - note) <= 3 && chance(0.4) ? prev : undefined
        bowed(kit, t + beat * spb, note, len * spb * 0.95, 0.85, 0.25, slide)
        prev = note
        note = Math.max(s.key + 19, Math.min(s.key + 38, step(note, chance(0.5) ? 1 : -1, s.key, PENTATONIC)))
        beat += len
      }
    }

    // The gallop: a strong beat and two quick ones, like hooves.
    if (i >= 4 && !(i % 8 === 7 && chance(0.5))) {
      for (let beat = 0; beat < 4; beat++) {
        frameDrum(kit, t + beat * spb + humanize(5), 0.75)
        frameDrum(kit, t + (beat + 0.5) * spb + humanize(5), 0.32, true)
        frameDrum(kit, t + (beat + 0.75) * spb + humanize(5), 0.42, true)
      }
    }
  },
}

/* Evening raga: Raga Yaman on the bansuri over a tanpura's drone — slow and
 * free at first, the alap, then in time once the tabla comes in with
 * teentaal. */
const RAGA_PHRASES = [
  [-1, 2, 4],
  [4, 2, 0],
  [4, 6, 9, 11, 12],
  [11, 9, 7],
  [6, 4, 2, 0],
  [7, 6, 4, 2],
  [9, 11, 14, 12],
  [-1, 2, 4, 6, 7],
  [12, 11, 9, 7, 6, 4],
  [2, 4, 6, 4, 2, 0],
  [4, 6, 7, 6, 4],
]
const TEENTAAL: Bol[] = ['dha', 'dhin', 'dhin', 'dha', 'dha', 'dhin', 'dhin', 'dha', 'dha', 'tin', 'tin', 'ta', 'ta', 'dhin', 'dhin', 'dha']

export const raga: Style<{ sa: number; prev: number }> = {
  bpm: 66,
  kit: { level: 1.5, reverbSeconds: 2.6, sends: { drums: 0.08, keys: 0.2, bass: 0, lead: 0.3 }, lowpass: null, echoBeats: null },
  init: () => {
    const sa = pick([49, 50, 48])
    return { sa, prev: sa + 12 }
  },
  bar: (kit, s, t, i, spb) => {
    const sa = s.sa
    // Pa, Sa, Sa, low Sa: the cycle a tanpura always plays.
    ;([
      [sa + 7, 0, -0.3],
      [sa + 12, 0.75, 0],
      [sa + 12, 1.5, 0.1],
      [sa, 2.25, 0.3],
    ] as const).forEach(([note, beat, pan], n) => tanpura(kit, t + beat * spb + humanize(6), note, n === 3 ? 1 : 0.8, pan))

    const alap = i < 8
    if (alap ? i % 2 === 0 : chance(0.8)) {
      let beat = alap ? rand(0.2, 1) : pick([0, 0.5])
      const end = alap ? 7 : 3.75
      let prev = s.prev
      while (beat < end) {
        const phrase = pick(RAGA_PHRASES)
        for (let k = 0; k < phrase.length && beat < end; k++) {
          const note = sa + 12 + phrase[k]
          const last = k === phrase.length - 1
          const len = alap ? (last ? rand(1.5, 2.5) : pick([0.75, 1, 1.25])) : last ? pick([1, 1.5]) : pick([0.25, 0.5, 0.5])
          const glide = note !== prev && Math.abs(note - prev) <= 4 && chance(alap ? 0.45 : 0.25)
          bansuri(kit, t + beat * spb + humanize(12), note, len * spb * 0.97, rand(0.7, 0.9), glide ? prev : undefined)
          prev = note
          beat += len
        }
        beat += alap ? rand(0.5, 1.5) : pick([0, 0.5, 0.5])
      }
      s.prev = prev
    }

    if (!alap) {
      for (let b = 0; b < 4; b++) {
        tabla(kit, t + b * spb + humanize(5), TEENTAAL[(i % 4) * 4 + b], b === 0 && i % 4 === 0 ? 1 : 0.8, sa)
        if (chance(0.3)) tabla(kit, t + (b + 0.5) * spb + humanize(5), 'te', 0.55, sa)
      }
    }
  },
}

/* Zen garden: koto patterns in the hirajoshi scale, a shakuhachi's long
 * swelling notes, water dripping on stone. */
const HIRAJOSHI = [0, 2, 3, 7, 8]

export const zen: Style<{ key: number; prev: number }> = {
  bpm: 58,
  kit: { level: 3, reverbSeconds: 3, sends: { drums: 0, keys: 0.3, bass: 0, lead: 0.38 }, lowpass: null, echoBeats: null },
  init: () => {
    const key = pick([62, 64, 57, 59])
    return { key, prev: key + 12 }
  },
  bar: (kit, s, t, i, spb) => {
    const key = s.key
    const strings = [key - 12, key - 5, key, key + 3, key + 7, key + 8]
    pick([
      [0, 2, 3, 4],
      [0, 3, 2, 5],
      [1, 2, 4, 3],
      [0, 4, 3, 2],
    ]).forEach((idx, n) => {
      if (n > 0 && chance(0.15)) return
      koto(kit, t + n * spb + humanize(15), strings[idx], 1.8 * spb, rand(0.5, 0.75), (n - 1.5) * 0.25, chance(0.12))
    })

    if (i >= 2 && i % 2 === 0 && chance(0.85)) {
      let beat = rand(0, 1)
      let prev = s.prev
      const count = pick([2, 3, 3, 4])
      for (let n = 0; n < count && beat < 7; n++) {
        const note = key + 12 + pick(HIRAJOSHI) - (chance(0.25) ? 12 : 0)
        const len = Math.min(pick([1.5, 2, 2.5, 3]), 7.8 - beat)
        const slide = note !== prev && Math.abs(note - prev) <= 5 && chance(0.35) ? prev : undefined
        shakuhachi(kit, t + beat * spb, note, len * spb, rand(0.75, 0.95), slide)
        prev = note
        beat += len + pick([0, 0.5, 1])
      }
      s.prev = prev
    }

    if (chance(0.4)) drip(kit, t + rand(0, 4) * spb, rand(0.5, 1))
  },
}

/* Celtic harp: a harp rolling chords in a lilting six-eight, a tin whistle with
 * the little cuts players put on notes, a soft bodhrán. Each beat here is a
 * dotted quarter, split in three. */
const DORIAN = [0, 2, 3, 5, 7, 9, 10]
const CELTIC_PROGRESSIONS: Progression[] = [
  [[[0, 'min']], [[10, 'maj']], [[5, 'maj']], [[0, 'min']]],
  [[[0, 'min']], [[3, 'maj']], [[10, 'maj']], [[0, 'min']]],
  [[[0, 'min']], [[5, 'maj']], [[3, 'maj']], [[10, 'maj']]],
]

export const celtic: Style<{ changes: Changes; prev: number[] | null }> = {
  bpm: 64,
  kit: { level: 1.2, reverbSeconds: 2.4, sends: { drums: 0.08, keys: 0.25, bass: 0, lead: 0.3 }, lowpass: null, echoBeats: null },
  init: () => {
    const keys = [2, 7, 9, 4]
    return { changes: new Changes(CELTIC_PROGRESSIONS, pick(keys), keys), prev: null }
  },
  bar: (kit, s, t, i, spb) => {
    const slot = s.changes.next()[0]
    const key = s.changes.key
    const third = spb / 3
    const root = nearest(slot.root, 43)
    const tones = voice(slot, 55, s.prev, { max: 3 })
    s.prev = tones
    const roll = [...tones, ...tones.map((n) => n + 12)]

    for (let beat = 0; beat < 4; beat++) {
      pluck(kit, t + beat * spb + humanize(8), beat % 2 === 0 ? root : root + 7, 1.5 * spb, 0.8, -0.2, 2600)
      for (let k = 1; k < 3; k++) {
        const pos = beat % 2 === 0 ? (beat + k) % roll.length : roll.length - 1 - ((beat + k) % roll.length)
        pluck(kit, t + (beat * 3 + k) * third + humanize(8), roll[pos], 1.2 * spb, rand(0.45, 0.6), 0.2, 3600)
      }
    }

    // The whistle takes every other four bars.
    if (i >= 4 && Math.floor(i / 4) % 2 === 1) {
      let note = nearest((key + pick([0, 7, 3])) % 12, 81)
      for (let k = 0; k < 12; k++) {
        if (chance(0.12)) continue
        const when = t + k * third + humanize(6)
        const cut = chance(0.22)
        if (cut) flute(kit, when, step(step(note, 1, key, DORIAN), 1, key, DORIAN), 0.04, 0.45)
        flute(kit, when + (cut ? 0.04 : 0), note, (chance(0.2) ? 2 : 1) * third * 0.95, 0.9)
        note = Math.max(74, Math.min(93, step(note, chance(0.5) ? 1 : -1, key, DORIAN)))
        if (chance(0.25)) note = Math.max(74, Math.min(93, step(note, chance(0.5) ? 1 : -1, key, DORIAN)))
      }
    }

    if (i >= 2) {
      for (let beat = 0; beat < 4; beat++) {
        frameDrum(kit, t + beat * spb + humanize(6), 0.45)
        if (chance(0.55)) frameDrum(kit, t + (beat * 3 + 2) * third + humanize(6), 0.22, true)
      }
    }
  },
}

/* Gamelan: bronze bars playing a slow core melody, a softer bar running around
 * it and anticipating each next note, kettle gongs marking the beat, and the
 * great gong closing every cycle. */
const PELOG = [0, 1, 3, 7, 8]

export const gamelan: Style<{ key: number; core: number[] }> = {
  bpm: 80,
  kit: { level: 1.9, reverbSeconds: 2.6, sends: { drums: 0.1, keys: 0.25, bass: 0.15, lead: 0.25 }, lowpass: null, echoBeats: null },
  init: () => ({ key: pick([62, 60, 64, 65]), core: [] }),
  bar: (kit, s, t, i, spb) => {
    const key = s.key
    const note = (degree: number, octave = 0) => key + PELOG[((degree % 5) + 5) % 5] + 12 * (Math.floor(degree / 5) + octave)
    if (i % 8 === 0 || !s.core.length) {
      let d = Math.floor(rand(0, 5))
      s.core = Array.from({ length: 8 }, () => (d = Math.max(0, Math.min(7, d + pick([-2, -1, 1, 1, 2])))))
    }
    const half = i % 2 === 0 ? s.core.slice(0, 4) : s.core.slice(4)
    const following = i % 2 === 0 ? s.core[4] : s.core[0]
    half.forEach((deg, b) => {
      saron(kit, t + b * spb + humanize(4), note(deg), 0.9 * spb, 0.9, -0.2)
      saron(kit, t + (b + 0.5) * spb + humanize(4), note(half[b + 1] ?? following, 1), 0.45 * spb, 0.5, 0.3, true)
      if (chance(0.45)) saron(kit, t + (b + 0.75) * spb + humanize(4), note(deg + 1, 1), 0.3 * spb, 0.38, 0.35, true)
    })
    kenong(kit, t + spb, note(0, -1), 0.6)
    kenong(kit, t + 3 * spb, note(2, -1), 0.6)
    if (i % 4 === 3) gong(kit, t + 3.95 * spb, mtof(key - 24), 1)
  },
}

