/**
 * The two palettes the hand-tracked grid uses.
 *
 * These are the one place in the app that does not go through the theme tokens,
 * and that is deliberate. Every token is a shade of the same green, which is
 * right for surfaces and wrong here: eight habits drawn in eight greens is a
 * grid you cannot read, and the whole point of the colour is telling one row
 * from another at a glance. So the hues are fixed, and chosen mid-toned enough
 * to hold up against both the pale theme and the dark one.
 *
 * Stored by key, not by value, so the palette can be retuned later without
 * rewriting anyone's saved habits.
 */

export interface Swatch {
  id: string
  name: string
  hex: string
}

export const HABIT_COLORS: Swatch[] = [
  { id: 'magenta', name: 'Magenta', hex: '#e0439b' },
  { id: 'violet', name: 'Violet', hex: '#8b5cf6' },
  { id: 'blue', name: 'Blue', hex: '#3b82f6' },
  { id: 'cyan', name: 'Cyan', hex: '#0ea5b7' },
  { id: 'green', name: 'Green', hex: '#2fa84f' },
  { id: 'lime', name: 'Lime', hex: '#84cc16' },
  { id: 'amber', name: 'Amber', hex: '#e0a020' },
  { id: 'orange', name: 'Orange', hex: '#ea7317' },
  { id: 'red', name: 'Red', hex: '#e0483f' },
  { id: 'slate', name: 'Slate', hex: '#64748b' },
]

const HABIT_BY_ID = new Map(HABIT_COLORS.map((c) => [c.id, c]))

/** Falls back to the first swatch rather than to nothing: a habit with an
 * unrecognised colour must still be visible in the grid. */
export function habitColor(id: string): string {
  return (HABIT_BY_ID.get(id) ?? HABIT_COLORS[0]).hex
}

/** The next unused colour, so adding habits one after another does not give
 * the first three rows the same swatch. */
export function nextHabitColor(used: string[]): string {
  const taken = new Set(used)
  return (HABIT_COLORS.find((c) => !taken.has(c.id)) ?? HABIT_COLORS[used.length % HABIT_COLORS.length]).id
}

export interface Mood extends Swatch {
  emoji: string
}

/**
 * A short fixed list rather than free text.
 *
 * The value of a mood row is being able to scan a month and see the shape of
 * it, and that only works if the same feeling gets the same colour every time.
 * Free text would give you thirty spellings of "tired".
 */
export const MOODS: Mood[] = [
  { id: 'happy', name: 'Happy', emoji: '🙂', hex: '#e0a020' },
  { id: 'excited', name: 'Excited', emoji: '🤩', hex: '#e0439b' },
  { id: 'productive', name: 'Productive', emoji: '⚡', hex: '#2fa84f' },
  { id: 'relaxed', name: 'Relaxed', emoji: '😌', hex: '#0ea5b7' },
  { id: 'grateful', name: 'Grateful', emoji: '💛', hex: '#8b5cf6' },
  { id: 'stressed', name: 'Stressed', emoji: '😖', hex: '#ea7317' },
  { id: 'bad', name: 'Bad day', emoji: '🌧️', hex: '#e0483f' },
]

const MOOD_BY_ID = new Map(MOODS.map((m) => [m.id, m]))

export function findMood(id: string | undefined): Mood | null {
  return id ? (MOOD_BY_ID.get(id) ?? null) : null
}
