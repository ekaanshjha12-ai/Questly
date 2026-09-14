import { db } from '../db.js'

/**
 * Product analytics, kept deliberately thin.
 *
 * An event is a name, a day and at most a few small numbers or ids. Nothing
 * typed by a player, no email, no IP. Events are tied to the account only so
 * retention can be counted, and they are deleted with it.
 */

export const EVENTS = new Set([
  'signup',
  'onboarding_completed',
  'first_quest',
  'quest_completed',
  'first_focus_session',
  'focus_completed',
  'level_up',
  'challenge_created',
  'challenge_accepted',
  'challenge_completed',
  'club_created',
  'club_joined',
  'club_trials_passed',
  'club_challenge_completed',
  'post_created',
  'item_purchased',
])

function cleanProps(props) {
  if (!props || typeof props !== 'object') return null
  const out = {}
  for (const [key, value] of Object.entries(props).slice(0, 8)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.round(value * 100) / 100
    else if (typeof value === 'boolean') out[key] = value
    else if (typeof value === 'string' && /^[a-z0-9_.:-]{1,40}$/i.test(value)) out[key] = value
  }
  return Object.keys(out).length ? JSON.stringify(out) : null
}

export function track(userId, event, props = null) {
  if (!EVENTS.has(event)) return
  try {
    const now = new Date()
    db.run('INSERT INTO analytics_events (at, day, user_id, event, props) VALUES (?, ?, ?, ?, ?)', [
      now.toISOString(),
      now.toISOString().slice(0, 10),
      userId ?? null,
      event,
      cleanProps(props),
    ])
  } catch {
    // Analytics never fails a request.
  }
}

/** Records that an account was active today (UTC), once per day. */
const seenToday = new Map()
export function markActive(userId) {
  if (!userId) return
  const day = new Date().toISOString().slice(0, 10)
  if (seenToday.get(userId) === day) return
  seenToday.set(userId, day)
  if (seenToday.size > 50_000) seenToday.clear()
  try {
    db.run('INSERT OR IGNORE INTO daily_active (user_id, day) VALUES (?, ?)', [userId, day])
  } catch {
    // Best effort.
  }
}

/** Whether this is the first time an account has recorded `event`. */
export function isFirst(userId, event) {
  return !db.get('SELECT 1 AS x FROM analytics_events WHERE user_id = ? AND event = ? LIMIT 1', [userId, event])
}
