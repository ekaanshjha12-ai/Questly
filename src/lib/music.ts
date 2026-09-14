/**
 * Music, composed while it plays.
 *
 * Nothing here is a recording. Each style is a small band built from Web Audio
 * nodes — pianos, guitars and harps, basses, drums and tabla, flutes, a
 * throat singer, a horsehead fiddle, singing bowls, bronze gamelan — and a
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

import { makeKit, type Style } from './music/band'
import { bossa, chiptune, cozy, jazz, lofi, synthwave } from './music/chill'
import { bowlsStyle, handpanStyle, softPiano, space } from './music/calm'
import { celtic, gamelan, raga, throat, zen } from './music/world'

export type MusicId =
  | 'lofi'
  | 'jazz'
  | 'piano'
  | 'bossa'
  | 'synthwave'
  | 'cozy'
  | 'chiptune'
  | 'handpan'
  | 'bowls'
  | 'space'
  | 'throat'
  | 'raga'
  | 'zen'
  | 'celtic'
  | 'gamelan'

/** Chill has a groove, calm barely moves, world is from somewhere else. */
export type MusicGroup = 'chill' | 'calm' | 'world'

export interface MusicDef {
  id: MusicId
  group: MusicGroup
  name: string
  blurb: string
  icon: string
  bpm: number
}

export const MUSIC: MusicDef[] = [
  { id: 'lofi', group: 'chill', name: 'Lo-fi beats', blurb: 'Dusty drums, warm keys, vinyl crackle.', icon: '🎧', bpm: 74 },
  { id: 'cozy', group: 'chill', name: 'Cozy fireplace', blurb: 'Fingerpicked guitar and a music box by the fire.', icon: '🔥', bpm: 80 },
  { id: 'jazz', group: 'chill', name: 'Jazz café', blurb: 'Walking bass, brushes, a vibraphone solo.', icon: '🎷', bpm: 118 },
  { id: 'bossa', group: 'chill', name: 'Bossa nova', blurb: 'Nylon guitar and a gentle Brazilian sway.', icon: '🌴', bpm: 128 },
  { id: 'synthwave', group: 'chill', name: 'Synthwave', blurb: 'Retro pads under a pulsing arpeggio.', icon: '🌆', bpm: 94 },
  { id: 'chiptune', group: 'chill', name: '8-bit quest', blurb: 'An adventure theme from an old handheld.', icon: '👾', bpm: 116 },
  { id: 'piano', group: 'calm', name: 'Soft piano', blurb: 'Slow, spacious chords to think to.', icon: '🎹', bpm: 58 },
  { id: 'handpan', group: 'calm', name: 'Handpan', blurb: 'Warm steel tones in rolling patterns.', icon: '🛸', bpm: 92 },
  { id: 'bowls', group: 'calm', name: 'Singing bowls', blurb: 'Tibetan bowls ringing over a low drone.', icon: '🔔', bpm: 40 },
  { id: 'space', group: 'calm', name: 'Deep space', blurb: 'Slow pads drifting, distant stars.', icon: '🌌', bpm: 52 },
  { id: 'throat', group: 'world', name: 'Mongolian throat singing', blurb: 'Khöömei overtones, horsehead fiddle, the gallop.', icon: '🐎', bpm: 96 },
  { id: 'raga', group: 'world', name: 'Evening raga', blurb: 'Tanpura drone, bansuri flute, tabla.', icon: '🪔', bpm: 66 },
  { id: 'zen', group: 'world', name: 'Zen garden', blurb: 'Shakuhachi and koto, water on stone.', icon: '🎋', bpm: 58 },
  { id: 'celtic', group: 'world', name: 'Celtic harp', blurb: 'Rolling harp and a tin whistle tune.', icon: '☘️', bpm: 64 },
  { id: 'gamelan', group: 'world', name: 'Gamelan', blurb: 'Bronze bells, kettle gongs, the great gong.', icon: '🥁', bpm: 80 },
]

// Each style's state is its own business; the player only passes it back in.
const STYLES = {
  lofi,
  jazz,
  piano: softPiano,
  bossa,
  synthwave,
  cozy,
  chiptune,
  handpan: handpanStyle,
  bowls: bowlsStyle,
  space,
  throat,
  raga,
  zen,
  celtic,
  gamelan,
} as unknown as Record<MusicId, Style<unknown>>

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
