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

import type { MusicId } from './musicCatalog'

export { MUSIC, type MusicDef, type MusicGroup, type MusicId } from './musicCatalog'

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
