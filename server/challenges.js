import { screenInput } from './moderation.js'
import { ageOn, parseBirthdate } from './profile.js'

/**
 * The rules of a challenge between two players.
 *
 * Everything that decides what a challenge is — its terms, when it starts and
 * ends, what state it is in, who completed it — lives here, on the server,
 * because two people are relying on the same answer. The client only ever
 * displays what this produces.
 */

export const DAY_MS = 24 * 60 * 60 * 1000

export const DURATIONS = [3, 5, 7, 14, 21, 30]
export const REWARD_TIERS = [50, 100, 250, 500, 750, 1000, 1500, 2000]

/**
 * The most XP a challenge may pay, per day it lasts.
 *
 * Rewards are paid by the app, not by either player, which makes a challenge
 * between two friends who never intend to do anything a way to print XP. This
 * caps the rate so that farming it earns about what honest daily play already
 * does, and the running-challenge limit below caps the volume.
 */
export const XP_PER_DAY_CAP = 75

/** How long an offer waits for an answer before it expires. */
export const OFFER_TTL_MS = 3 * DAY_MS
/** Open offers one person can have out at once. */
export const MAX_PENDING_SENT = 5
/** Accepted or running challenges one person can be in at once. */
export const MAX_RUNNING = 3
export const MAX_START_AHEAD_MS = 30 * DAY_MS
/** A dated start must leave time to read the offer and answer it. */
export const MIN_START_LEAD_MS = 60 * 60 * 1000

export const TERMS_TEXT = 'Both participants must follow the agreed rules.'

export function rewardCap(days) {
  return days * XP_PER_DAY_CAP
}

/**
 * Challenges only happen between people in the same age band: both under 18,
 * or both 18 and over.
 *
 * Accepting a challenge opens a private chat, and a private chat between an
 * adult and a minor who do not know each other is the situation child-safety
 * guidance says an app should not create by default. Keeping bands apart costs
 * the competitive idea nothing, since each band still has everyone its own age.
 */
export function ageBand(birthdate, now = new Date()) {
  const parts = parseBirthdate(birthdate)
  if (!parts) return null
  return ageOn(parts, now) < 18 ? 'under18' : 'adult'
}

function cleanText(value, { min, max, label }) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (text.length < min) return { error: `${label} needs at least ${min} characters.` }
  if (text.length > max) return { error: `${label} can be at most ${max} characters.` }
  if (!screenInput(text, { allowLength: max }).ok) return { error: `${label} was blocked by the content filter.` }
  return { value: text }
}

/**
 * Checks and normalises a challenge offer.
 *
 * @returns {{ ok: true, value: object } | { ok: false, error: string, field: string }}
 */
export function validateTerms(input, now = Date.now()) {
  const name = cleanText(input?.name, { min: 3, max: 60, label: 'The name' })
  if (name.error) return { ok: false, error: name.error, field: 'name' }

  const objective = cleanText(input?.objective, { min: 3, max: 140, label: 'The objective' })
  if (objective.error) return { ok: false, error: objective.error, field: 'objective' }

  // Rules keep their line breaks; only runs of spaces are squeezed.
  const rulesRaw = String(input?.rules ?? '').trim()
  if (rulesRaw.length < 3) return { ok: false, error: 'Write at least one rule.', field: 'rules' }
  if (rulesRaw.length > 600) return { ok: false, error: 'Rules can be at most 600 characters.', field: 'rules' }
  if (!screenInput(rulesRaw, { allowLength: 600 }).ok) {
    return { ok: false, error: 'The rules were blocked by the content filter.', field: 'rules' }
  }

  const days = Number(input?.durationDays)
  if (!DURATIONS.includes(days)) return { ok: false, error: 'Pick a duration from the list.', field: 'durationDays' }

  const reward = Number(input?.rewardXp)
  if (!REWARD_TIERS.includes(reward)) return { ok: false, error: 'Pick a reward from the list.', field: 'rewardXp' }
  if (reward > rewardCap(days)) {
    return {
      ok: false,
      error: `A ${days}-day challenge can pay at most ${rewardCap(days)} XP.`,
      field: 'rewardXp',
    }
  }

  const proof = input?.proof === 'required' ? 'required' : input?.proof === 'optional' ? 'optional' : null
  if (!proof) return { ok: false, error: 'Choose whether proof is required.', field: 'proof' }

  // Completion means checking in on at least this many days. Never less than
  // half: a challenge you can finish by showing up twice in a fortnight is not
  // one.
  const minCheckins = Number(input?.minCheckins)
  const floor = Math.ceil(days / 2)
  if (!Number.isInteger(minCheckins) || minCheckins < floor || minCheckins > days) {
    return { ok: false, error: `Completion must be between ${floor} and ${days} check-ins.`, field: 'minCheckins' }
  }

  let startsAt = null
  if (input?.startMode === 'date') {
    const at = Date.parse(String(input?.startsAt ?? ''))
    if (!Number.isFinite(at)) return { ok: false, error: 'Pick a start date.', field: 'startsAt' }
    if (at < now + MIN_START_LEAD_MS) {
      return { ok: false, error: 'Start at least an hour from now, so they have time to answer.', field: 'startsAt' }
    }
    if (at > now + MAX_START_AHEAD_MS) return { ok: false, error: 'Start within the next 30 days.', field: 'startsAt' }
    startsAt = new Date(at).toISOString()
  } else if (input?.startMode !== 'accept') {
    return { ok: false, error: 'Choose when the challenge starts.', field: 'startMode' }
  }

  return {
    ok: true,
    value: {
      name: name.value,
      objective: objective.value,
      rules: rulesRaw,
      durationDays: days,
      rewardXp: reward,
      proof,
      minCheckins,
      startMode: startsAt ? 'date' : 'accept',
      startsAt,
      endsAt: startsAt ? new Date(Date.parse(startsAt) + days * DAY_MS).toISOString() : null,
      // An offer cannot outlive its own start: accepting a challenge that should
      // already have begun would start it short.
      expiresAt: new Date(Math.min(now + OFFER_TTL_MS, startsAt ? Date.parse(startsAt) : Infinity)).toISOString(),
    },
  }
}

/**
 * What state a challenge is in right now.
 *
 * Only the decisions are stored — sent, accepted, rejected, cancelled, settled.
 * Everything that follows from the clock (expired, active, finished) is worked
 * out when it is read, so nothing depends on a scheduled job having run.
 */
export function deriveStatus(row, now = Date.now()) {
  switch (row.status) {
    case 'pending':
      return now >= Date.parse(row.expires_at) ? 'expired' : 'pending'
    case 'accepted':
      if (now < Date.parse(row.starts_at)) return 'accepted'
      return now < Date.parse(row.ends_at) ? 'active' : 'due'
    default:
      return row.status
  }
}

/** Which day of the challenge it is, from 0, or null outside it. */
export function dayIndex(row, now = Date.now()) {
  if (!row.starts_at || !row.ends_at) return null
  const start = Date.parse(row.starts_at)
  if (now < start || now >= Date.parse(row.ends_at)) return null
  return Math.floor((now - start) / DAY_MS)
}

export function validateCheckinNote(note, proof) {
  const text = String(note ?? '').trim()
  if (text.length > 280) return { ok: false, error: 'Keep the note under 280 characters.' }
  if (proof === 'required' && text.length < 10) {
    return { ok: false, error: 'Proof is required: say what you did today in at least 10 characters.' }
  }
  if (text && !screenInput(text, { allowLength: 280 }).ok) {
    return { ok: false, error: 'That note was blocked by the content filter.' }
  }
  return { ok: true, value: text || null }
}

export function validateMessage(body) {
  const text = String(body ?? '').trim()
  if (!text) return { ok: false, error: 'Write a message first.' }
  if (text.length > 500) return { ok: false, error: 'Messages can be at most 500 characters.' }
  if (!screenInput(text, { allowLength: 500 }).ok) {
    return { ok: false, error: 'That message was blocked by the content filter.' }
  }
  return { ok: true, value: text }
}
