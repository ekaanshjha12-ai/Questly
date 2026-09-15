/** The four parts of the player's day, read from their own clock. Home's room and the World Map both follow it. */
export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night'

export function timeOfDay(date = new Date()): TimeOfDay {
  const h = date.getHours()
  if (h >= 5 && h < 11) return 'morning'
  if (h >= 11 && h < 17) return 'day'
  if (h >= 17 && h < 20) return 'evening'
  return 'night'
}
