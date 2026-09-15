/**
 * The music styles Questly can play, as the interface lists them. Kept apart
 * from the composer in music.ts so naming what is playing never loads the band
 * that plays it.
 */

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
