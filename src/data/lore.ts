/**
 * The card face for each character: stats, an ability and a piece of lore.
 *
 * Written by hand and fixed here rather than generated, for two reasons. A
 * character whose story changes between visits is not a character, and this
 * costs nothing to ship — no key, no call, no wait, and it works offline.
 *
 * The numbers are derived from rank rather than invented, so the ladder the
 * prices already describe is the same one the cards show. A Heisenberg card
 * that did not visibly outclass a Soldier would undercut what the shop is
 * asking you to save up for.
 *
 * They are flavour. Nothing here changes how the app behaves — abilities read
 * as a description of the person who earned that rank, not a mechanic.
 */

export interface CharacterCard {
  /** Matches CHARACTER_MODELS[].id */
  id: string
  hp: number
  /** Named to fit the app: what you bring, hold, and keep. */
  power: number
  focus: number
  resolve: number
  ability: { name: string; effect: string }
  /** Two or three lines. Long enough to mean something, short enough to read. */
  lore: string
  /** One-word class, shown as a tag. */
  archetype: string
}

export const CHARACTER_CARDS: CharacterCard[] = [
  {
    id: 'red-plumed-warrior',
    hp: 320,
    power: 34,
    focus: 22,
    resolve: 41,
    archetype: 'Footsoldier',
    ability: {
      name: 'First Light',
      effect: 'Turns up before anyone is watching. The hardest habit, learned first.',
    },
    lore: 'Bronze, a crest, and a shield dented in places nobody asked about. She has no title and wants none. What she has is a record of mornings.',
  },
  {
    id: 'obsidian-sentinel',
    hp: 620,
    power: 58,
    focus: 44,
    resolve: 74,
    archetype: 'Guardian',
    ability: {
      name: 'Hold the Line',
      effect: 'A bad day does not become a bad week. The streak survives the gap.',
    },
    lore: 'Black plate, crimson cloak, and a post nobody relieves him from. He is not the strongest thing on the field. He is the thing still standing on it.',
  },
  {
    id: 'darkwing-knight',
    hp: 1180,
    power: 96,
    focus: 71,
    resolve: 108,
    archetype: 'Campaigner',
    ability: {
      name: 'Long Campaign',
      effect: 'Built for the months, not the morning. Pace over intensity, every time.',
    },
    lore: 'Winged, horned, and armed for a war measured in seasons. He stopped counting individual victories a long time ago; he counts ground held.',
  },
  {
    id: 'ivory-queen',
    hp: 1840,
    power: 132,
    focus: 124,
    resolve: 151,
    archetype: 'Sovereign',
    ability: {
      name: 'Quiet Authority',
      effect: 'Rules her own routine. No negotiation with the version of her that wants to stop.',
    },
    lore: 'Crowned in pearl, and never once raised her voice to be obeyed. Her court learned that the schedule is not a suggestion. So did she.',
  },
  {
    id: 'elven-sovereign',
    hp: 2760,
    power: 178,
    focus: 196,
    resolve: 204,
    archetype: 'Monarch',
    ability: {
      name: 'Moonlit Discipline',
      effect: 'Works when nobody would notice if she did not. That is the whole trick.',
    },
    lore: 'Robed in moonlight with her blade at rest, because it has not needed drawing in years. The kingdom runs. She keeps it running.',
  },
  {
    id: 'starlit-fairy',
    hp: 4100,
    power: 236,
    focus: 312,
    resolve: 268,
    archetype: 'Celestial',
    ability: {
      name: 'Weightless',
      effect: 'The habit stopped costing anything. It is simply what happens now.',
    },
    lore: 'Wings of glass and starlight, barely bound to the ground at all. She does not remember deciding to keep going. It stopped being a decision.',
  },
  {
    id: 'benediction-blue',
    hp: 6400,
    power: 344,
    focus: 428,
    resolve: 402,
    archetype: 'Divine',
    ability: {
      name: 'Verdict',
      effect: 'Hand raised, judgement given. What was a goal is now simply a fact about you.',
    },
    lore: 'The hand is raised and the verdict is already given. Nothing is being asked of you any more. This is what you are.',
  },
  {
    id: 'hazmat-tycoon',
    hp: 9999,
    power: 512,
    focus: 604,
    resolve: 640,
    archetype: 'Apex',
    ability: {
      name: 'The One Who Knocks',
      effect: 'Not waiting for the day to happen. The day is waiting.',
    },
    lore: 'Yellow suit, empty barrels, nothing left to prove to anyone. He did not become this by wanting it. He became it by showing up, and never once stopping.',
  },
]

const BY_ID = new Map(CHARACTER_CARDS.map((c) => [c.id, c]))

export function cardFor(modelId: string): CharacterCard | null {
  return BY_ID.get(modelId) ?? null
}

/** The highest value on each axis, so a bar can be drawn as a share of the best
 * in the set rather than an arbitrary ceiling. */
export const CARD_MAX = {
  hp: Math.max(...CHARACTER_CARDS.map((c) => c.hp)),
  power: Math.max(...CHARACTER_CARDS.map((c) => c.power)),
  focus: Math.max(...CHARACTER_CARDS.map((c) => c.focus)),
  resolve: Math.max(...CHARACTER_CARDS.map((c) => c.resolve)),
}

/**
 * How full to draw a stat bar, 0–1.
 *
 * Not `value / max`. The ladder is exponential — 320 HP at the bottom against
 * 9999 at the top — so a linear bar draws the first seven characters as an
 * empty line and only the last one as a bar, which tells you nothing and looks
 * broken. Taking the log against the ceiling and squaring the result keeps the
 * ordering exact, keeps the four axes visibly different within one card, and
 * still leaves the weakest character with something to look at.
 *
 * The printed number stays the real one. This governs the drawing only.
 */
export function barFill(value: number, max: number): number {
  if (value <= 1 || max <= 1) return 0
  const t = Math.log(value) / Math.log(max)
  return Math.min(1, t * t)
}
