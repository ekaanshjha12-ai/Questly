import { db, getState } from '../db.js'
import { getProgressRow } from './rewards.js'

/**
 * A new player's first quests, judged from what they have actually done.
 *
 * Each step is checked against the server's own records, so the checklist
 * cannot be ticked from the browser — and finishing it is what grants the
 * Drafting Quill. Steps for parts of Questly that are not open yet are not
 * listed rather than shown as something to do.
 */

const STEPS = [
  {
    id: 'focus',
    title: 'Complete your first Focus Session',
    body: 'Five focused minutes or more, timed by Questly.',
    link: '/focus',
    done: (userId) =>
      Boolean(db.get("SELECT 1 AS x FROM focus_sessions WHERE user_id = ? AND status IN ('completed', 'ended') AND active_ms >= 300000 LIMIT 1", [userId])),
  },
  {
    id: 'character',
    title: 'Customise your character',
    body: 'Choose how your hero looks.',
    link: '/profile/wardrobe',
    done: (userId) => {
      try {
        return Boolean(JSON.parse(getProgressRow(userId)?.flags ?? '{}').appearanceSet)
      } catch {
        return false
      }
    },
  },
  {
    id: 'card',
    title: 'Design your Questly Card',
    body: 'Make the card other players see.',
    link: '/profile/card',
    done: (userId) => {
      try {
        const row = getState(userId)
        const card = row ? JSON.parse(row.data)?.card : null
        return Boolean(card && Array.isArray(card.items))
      } catch {
        return false
      }
    },
  },
  {
    id: 'quest',
    title: 'Complete a quest',
    body: 'Any quest on your board counts.',
    link: '/quests',
    done: (userId) => Boolean(db.get("SELECT 1 AS x FROM quests WHERE user_id = ? AND status = 'completed' LIMIT 1", [userId])),
  },
]

export function onboardingSteps(userId) {
  const steps = STEPS.map((step) => ({ id: step.id, title: step.title, body: step.body, link: step.link, done: step.done(userId) }))
  return { steps, complete: steps.every((s) => s.done) }
}

/** Records a flag the checklist reads, e.g. that the player chose a look. */
export function setFlag(userId, key, value) {
  const row = getProgressRow(userId)
  if (!row) return
  let flags = {}
  try {
    flags = JSON.parse(row.flags ?? '{}') ?? {}
  } catch {
    flags = {}
  }
  if (flags[key] === value) return
  flags[key] = value
  db.run('UPDATE player_progress SET flags = ? WHERE user_id = ?', [JSON.stringify(flags), userId])
}
