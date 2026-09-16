import { ageOn, parseBirthdate } from '../profile.js'

/**
 * Quests are written for the person doing them. A sixteen-year-old gets
 * school, pocket money and plenty of sleep rather than networking events,
 * debt and progress photos; someone past sixty-five gets gentler exercise.
 *
 *   teen         15 to 17
 *   young_adult  18 to 24
 *   adult        25 to 64
 *   senior       65 and over
 *
 * Only the group is ever used or passed on — never the date of birth. An
 * account without one gets the adult wording.
 */
export const AGE_GROUPS = ['teen', 'young_adult', 'adult', 'senior']

export function questAgeGroup(birthdate, today = new Date()) {
  const parts = parseBirthdate(birthdate)
  if (!parts) return 'adult'
  const age = ageOn(parts, today)
  if (age < 18) return 'teen'
  if (age < 25) return 'young_adult'
  if (age < 65) return 'adult'
  return 'senior'
}

/** What the quest writer and the planner are told about who they are writing for. */
export const AGE_GUIDANCE = {
  teen:
    'They are a teenager (15 to 17), most likely at school and living with a parent or guardian. Keep every task safe and suitable for that age and make it fit around school. ' +
    'No dieting, calorie counting, weight targets, body measurements or progress photos: aim at health, strength, fitness and skill instead. ' +
    'Money means pocket money, savings or small earnings, never loans, credit, investing or crypto. ' +
    'Nothing involving alcohol, driving, dating, meeting strangers or being out late, and plan for 8 to 10 hours of sleep. ' +
    'Suggest a parent, guardian, teacher or coach where their help makes sense.',
  young_adult: 'They are a young adult (18 to 24), often studying, starting out at work or living on a tight budget.',
  adult: 'They are an adult.',
  senior:
    'They are 65 or older. Favour low-impact exercise, balance, mobility and steady pacing, and suggest checking with a doctor before a big change in exercise.',
}
