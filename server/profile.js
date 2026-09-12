import { screenInput } from './moderation.js'

/**
 * The rules for a profile: username, display name, birthdate, bio and picture.
 *
 * All of it is checked here, on the server, whatever the sign-up screen already
 * checked. The screen is a convenience that answers instantly; this is the part
 * that holds, because anything in the browser can be skipped by sending the
 * request directly.
 */

/** The youngest age that can hold an account. */
export const MIN_AGE = 15
const MAX_AGE = 120

export const BIO_MAX = 160
export const NAME_MAX = 24

/**
 * Handles that would let one account pass itself off as the app, its staff, or
 * a system message. Matched after normalising, so "Admin" and "admin." do not
 * slip past.
 */
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'superuser', 'sysadmin', 'system', 'support', 'help', 'helpdesk',
  'staff', 'team', 'mod', 'moderator', 'official', 'security', 'questly', 'questlyapp', 'anthropic',
  'claude', 'owner', 'null', 'undefined', 'me', 'you', 'api', 'www', 'mail', 'noreply', 'no_reply',
])

export function normalizeUsername(value) {
  return String(value ?? '').trim().replace(/^@+/, '').toLowerCase()
}

/** @returns {string | null} what is wrong, or null when it is fine */
export function validateUsername(value) {
  const username = normalizeUsername(value)
  if (username.length < 3) return 'Usernames need at least 3 characters.'
  if (username.length > 20) return 'Usernames can be at most 20 characters.'
  if (!/^[a-z0-9_.]+$/.test(username)) return 'Use only letters, numbers, dots and underscores.'
  if (/^[._]|[._]$/.test(username)) return 'Usernames cannot start or end with a dot or underscore.'
  if (/\.\./.test(username)) return 'Usernames cannot have two dots in a row.'
  if (RESERVED.has(username.replace(/[._]/g, ''))) return 'That username is reserved.'
  if (!screenInput(username, { allowLength: 20 }).ok) return 'That username is not allowed.'
  return null
}

export function validateDisplayName(value) {
  const name = String(value ?? '').trim()
  if (!name) return 'Enter a name.'
  if (name.length > NAME_MAX) return `Names can be at most ${NAME_MAX} characters.`
  if (!screenInput(name, { allowLength: NAME_MAX }).ok) return 'That name is not allowed.'
  return null
}

export function validateBio(value) {
  const bio = String(value ?? '').trim()
  if (!bio) return null
  if (bio.length > BIO_MAX) return `Bios can be at most ${BIO_MAX} characters.`
  if (!screenInput(bio, { allowLength: BIO_MAX }).ok) return 'That bio was blocked by the content filter.'
  return null
}

/**
 * Parses a strict `YYYY-MM-DD` into its parts, or null.
 *
 * Strict on purpose. `new Date('2010-02-31')` quietly becomes March 3rd, and a
 * lenient parse is exactly the kind of gap an age check cannot have — so the
 * date is rebuilt from its parts and must come back unchanged.
 */
export function parseBirthdate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim())
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null
  }
  return { year, month, day }
}

/** Whole years between a birthdate and `today`, counting a birthday that has
 * not arrived yet this year as not yet had. */
export function ageOn(parts, today = new Date()) {
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth() + 1
  const d = today.getUTCDate()
  let age = y - parts.year
  if (m < parts.month || (m === parts.month && d < parts.day)) age--
  return age
}

/**
 * @returns {{ ok: true, value: string } | { ok: false, error: string, code: string }}
 */
export function checkBirthdate(value, today = new Date()) {
  const parts = parseBirthdate(value)
  if (!parts) return { ok: false, error: 'Enter your date of birth.', code: 'bad_birthdate' }
  const age = ageOn(parts, today)
  if (age < 0) return { ok: false, error: 'That date is in the future.', code: 'bad_birthdate' }
  if (age > MAX_AGE) return { ok: false, error: 'Check the year on that date.', code: 'bad_birthdate' }
  if (age < MIN_AGE) {
    return { ok: false, error: `You need to be ${MIN_AGE} or older to use Questly.`, code: 'underage' }
  }
  const pad = (n) => String(n).padStart(2, '0')
  return { ok: true, value: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}` }
}

/* --- profile picture ------------------------------------------------------ */

/** The client crops and shrinks to 256px before sending, which lands well under
 * 100KB. The ceiling leaves room for a PNG without letting anyone park a
 * multi-megabyte file in the database. */
export const AVATAR_MAX_BYTES = 400 * 1024

const SIGNATURES = {
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) =>
    b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
}

/**
 * Checks a profile picture is what it claims to be.
 *
 * The declared type is not trusted: the first bytes have to match it. SVG is
 * never accepted — it is a document that can carry script, not a picture — and
 * the file is served back with its checked type and `nosniff`, so a browser
 * cannot be talked into treating it as anything else.
 *
 * @returns {{ ok: true, bytes: Buffer, mime: string } | { ok: false, error: string }}
 */
export function checkAvatar(imageBase64, mediaType) {
  if (typeof imageBase64 !== 'string' || !imageBase64) return { ok: false, error: 'A picture is required.' }
  const signature = SIGNATURES[mediaType]
  if (!signature) return { ok: false, error: 'Use a JPEG, PNG or WebP picture.' }
  if ((imageBase64.length * 3) / 4 > AVATAR_MAX_BYTES) return { ok: false, error: 'That picture is too large.' }
  const bytes = Buffer.from(imageBase64, 'base64')
  if (!bytes.length || bytes.length > AVATAR_MAX_BYTES) return { ok: false, error: 'That picture is too large.' }
  if (!signature(bytes)) return { ok: false, error: 'That file is not the picture it claims to be.' }
  return { ok: true, bytes, mime: mediaType }
}
