/**
 * Days, weeks and months as the player lives them.
 *
 * Daily quests, streaks and daily reward ceilings all turn over at the
 * player's own midnight, not the server's. The timezone is an IANA name the
 * client reports and the server checks; everything here derives calendar
 * dates from real instants through Intl, so no offset arithmetic is trusted
 * from the client.
 */

const DAY_MS = 86_400_000
const formatters = new Map()

function formatter(timeZone) {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(timeZone, f)
  }
  return f
}

export const DEFAULT_TIMEZONE = 'UTC'

export function isValidTimezone(value) {
  if (typeof value !== 'string' || !value || value.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(value)) return false
  try {
    formatter(value)
    return true
  } catch {
    return false
  }
}

export function safeTimezone(value) {
  return isValidTimezone(value) ? value : DEFAULT_TIMEZONE
}

/** The wall-clock reading in `timeZone` at an instant. */
export function localParts(timeZone, date = new Date()) {
  const parts = {}
  for (const part of formatter(safeTimezone(timeZone)).formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second }
}

const pad = (n) => String(n).padStart(2, '0')

export function dayKey(timeZone, date = new Date()) {
  const { year, month, day } = localParts(timeZone, date)
  return `${year}-${pad(month)}-${pad(day)}`
}

/** ISO-8601 week of the local date, e.g. `2026-W37`. */
export function weekKey(timeZone, date = new Date()) {
  const { year, month, day } = localParts(timeZone, date)
  const d = new Date(Date.UTC(year, month - 1, day))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
  return `${d.getUTCFullYear()}-W${pad(week)}`
}

export function monthKey(timeZone, date = new Date()) {
  const { year, month } = localParts(timeZone, date)
  return `${year}-${pad(month)}`
}

export function periodKey(period, timeZone, date = new Date()) {
  if (period === 'daily') return dayKey(timeZone, date)
  if (period === 'weekly') return weekKey(timeZone, date)
  return monthKey(timeZone, date)
}

/** A counter that rises by one each period, for rotating goals through slots. */
export function periodOrdinal(period, timeZone, date = new Date()) {
  const { year, month, day } = localParts(timeZone, date)
  if (period === 'daily') return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS)
  if (period === 'weekly') {
    const [y, w] = weekKey(timeZone, date).split('-W')
    return Number(y) * 53 + Number(w)
  }
  return year * 12 + (month - 1)
}

/** The day before a `YYYY-MM-DD` key. */
export function previousDay(key) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d) - DAY_MS)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Whole days from one key to another (positive when `to` is later). */
export function daysBetween(fromKey, toKey) {
  const [y1, m1, d1] = fromKey.split('-').map(Number)
  const [y2, m2, d2] = toKey.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS)
}

/** How far ahead of UTC `timeZone` is at an instant, in ms. */
function offsetMs(timeZone, instant) {
  const p = localParts(timeZone, new Date(instant))
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000
}

/** The instant a local wall-clock midnight happens. Refined once, which
 * settles the hour a DST change can move it by. */
function localMidnight(timeZone, year, month, day) {
  const guess = Date.UTC(year, month - 1, day)
  let instant = guess - offsetMs(timeZone, guess)
  instant = guess - offsetMs(timeZone, instant)
  return instant
}

/**
 * When the period named by a key ends, in this timezone — for quests carried
 * over from before the server generated them, which only know their key.
 */
export function periodEndForKey(period, key, timeZone) {
  const tz = safeTimezone(timeZone)
  let next
  if (period === 'daily') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
    if (!m) return null
    next = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1))
  } else if (period === 'weekly') {
    const m = /^(\d{4})-W(\d{2})$/.exec(key)
    if (!m) return null
    // Monday of ISO week 1 is the Monday on or before 4 January.
    const jan4 = new Date(Date.UTC(Number(m[1]), 0, 4))
    const week1Monday = Date.UTC(Number(m[1]), 0, 4 - ((jan4.getUTCDay() || 7) - 1))
    next = new Date(week1Monday + Number(m[2]) * 7 * DAY_MS)
  } else {
    const m = /^(\d{4})-(\d{2})$/.exec(key)
    if (!m) return null
    next = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1))
  }
  return new Date(localMidnight(tz, next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())).toISOString()
}

/** The midnight that ends a run of `days` local days starting today: 1 is the end of today, 7 a week from now. */
export function endOfDays(days, timeZone, date = new Date()) {
  const tz = safeTimezone(timeZone)
  const { year, month, day } = localParts(tz, date)
  const next = new Date(Date.UTC(year, month - 1, day + days))
  return new Date(localMidnight(tz, next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())).toISOString()
}

/** When the current day, week (Monday start) or month ends for this player. */
export function periodEnd(period, timeZone, date = new Date()) {
  const tz = safeTimezone(timeZone)
  const { year, month, day } = localParts(tz, date)
  let next
  if (period === 'daily') {
    next = new Date(Date.UTC(year, month - 1, day + 1))
  } else if (period === 'weekly') {
    const today = new Date(Date.UTC(year, month - 1, day))
    const dayNum = today.getUTCDay() || 7
    next = new Date(Date.UTC(year, month - 1, day + (8 - dayNum)))
  } else {
    next = new Date(Date.UTC(year, month, 1))
  }
  return new Date(localMidnight(tz, next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())).toISOString()
}
