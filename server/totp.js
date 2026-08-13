import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * RFC 6238 time-based one-time passwords, on top of RFC 4226 HOTP.
 *
 * Implemented directly rather than pulled in as a dependency: it is about forty
 * lines of HMAC, and an authentication primitive is exactly the kind of thing
 * worth not handing to an unaudited transitive dependency tree.
 */

const DIGITS = 6
const PERIOD_SECONDS = 30
/** One step either side, so a phone clock drifting by a few seconds still works. */
const DRIFT_STEPS = 1

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function generateSecret(bytes = 20) {
  const buf = randomBytes(bytes)
  let bits = ''
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0')
  let out = ''
  for (let i = 0; i + 5 <= bits.length; i += 5) out += BASE32[parseInt(bits.slice(i, i + 5), 2)]
  return out
}

function base32Decode(secret) {
  const clean = String(secret ?? '').toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = ''
  for (const char of clean) {
    const index = BASE32.indexOf(char)
    if (index < 0) continue
    bits += index.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

function hotp(key, counter) {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', key).update(buf).digest()
  // Dynamic truncation, RFC 4226 section 5.3.
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3]
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0')
}

function constantEquals(a, b) {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** True when `code` is valid for `secret` right now, allowing a step of drift. */
export function verifyTotp(secret, code, now = Date.now()) {
  const normalized = String(code ?? '').replace(/\D/g, '')
  if (normalized.length !== DIGITS) return false
  const key = base32Decode(secret)
  if (!key.length) return false

  const step = Math.floor(now / 1000 / PERIOD_SECONDS)
  for (let drift = -DRIFT_STEPS; drift <= DRIFT_STEPS; drift++) {
    if (constantEquals(hotp(key, step + drift), normalized)) return true
  }
  return false
}

/** The URI an authenticator app scans. Contains the shared secret, so it is only
 * ever shown to the account's own owner during enrolment. */
export function otpauthUrl({ secret, email, issuer = 'Questly' }) {
  const label = encodeURIComponent(`${issuer}:${email}`)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

const BACKUP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Single-use codes for when the phone is lost. Returned once, stored hashed. */
export function generateBackupCodes(count = 8) {
  const codes = []
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(10)
    let code = ''
    for (let j = 0; j < 10; j++) {
      if (j === 5) code += '-'
      code += BACKUP_ALPHABET[bytes[j] % BACKUP_ALPHABET.length]
    }
    codes.push(code)
  }
  return codes
}

export function normalizeBackupCode(code) {
  return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}
