import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from './db.js'
import { SESSION_DAYS } from './auth.js'
import { MIN_AGE } from './profile.js'
import { RETENTION } from './retention.js'

/**
 * Terms, privacy, guidelines and safety: documents that can change without a
 * deploy.
 *
 * Every version is kept. The first comes from the Markdown files in
 * server/policies, and a newer file is picked up on boot for as long as nobody
 * has edited that document in the admin console; after that, the console's
 * version is the one in force. An edit can be marked as a material change,
 * which asks everyone to accept the Terms or Privacy Policy again.
 *
 * The documents carry placeholders filled in from the environment — who runs
 * Questly, how to reach them, retention periods, whether AI features are on —
 * so what they say matches how this deployment actually behaves.
 */

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'policies')

export const POLICIES = [
  { slug: 'terms', title: 'Terms of Service', acceptance: true },
  { slug: 'privacy', title: 'Privacy Policy', acceptance: true },
  { slug: 'guidelines', title: 'Community Guidelines', acceptance: false },
  { slug: 'safety', title: 'Safety Centre', acceptance: false },
]
const BY_SLUG = new Map(POLICIES.map((p) => [p.slug, p]))
export const POLICY_TITLE_MAX = 80
export const POLICY_BODY_MAX = 60_000

db.run(`
  CREATE TABLE IF NOT EXISTS policy_versions (
    slug        TEXT NOT NULL,
    version     INTEGER NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    material    INTEGER NOT NULL DEFAULT 0,
    from_file   INTEGER NOT NULL DEFAULT 0,
    note        TEXT,
    created_at  TEXT NOT NULL,
    created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (slug, version)
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS policy_acceptances (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    version     INTEGER NOT NULL,
    accepted_at TEXT NOT NULL,
    PRIMARY KEY (user_id, slug)
  )
`)

export function defaultBody(slug) {
  return readFileSync(join(DIR, `${slug}.md`), 'utf8').replace(/\r\n/g, '\n').trim()
}

function latest(slug) {
  return db.get('SELECT * FROM policy_versions WHERE slug = ? ORDER BY version DESC LIMIT 1', [slug]) ?? null
}

function insertVersion(slug, { title, body, material, fromFile, note = null, by = null }) {
  const version = (latest(slug)?.version ?? 0) + 1
  db.run(
    'INSERT INTO policy_versions (slug, version, title, body, material, from_file, note, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [slug, version, title, body, material ? 1 : 0, fromFile ? 1 : 0, note, new Date().toISOString(), by],
  )
  return version
}

/**
 * Brings the stored documents up to date with the files. The very first
 * version counts as material — nobody has accepted anything yet — and later
 * file changes do not, so a typo fix in the repository never asks everyone to
 * accept the terms again.
 */
export function syncPolicyFiles() {
  for (const { slug, title } of POLICIES) {
    let body
    try {
      body = defaultBody(slug)
    } catch {
      continue
    }
    const current = latest(slug)
    if (!current) insertVersion(slug, { title, body, material: true, fromFile: true, note: 'First version' })
    else if (current.from_file && current.body !== body) insertVersion(slug, { title: current.title, body, material: false, fromFile: true, note: 'Updated from the repository' })
  }
}
syncPolicyFiles()

/* --- placeholders ---------------------------------------------------------- */

const EMAIL = /^[^\s@<>()[\]]+@[^\s@<>()[\]]+\.[a-z]{2,}$/i
const clean = (value, max = 120) => String(value ?? '').replace(/[{}<>\n\r]/g, '').trim().slice(0, max)

export function policyVariables() {
  const email = clean(process.env.QUESTLY_CONTACT_EMAIL, 254)
  return {
    operator: clean(process.env.QUESTLY_OPERATOR_NAME) || 'the Questly team',
    contactEmail: EMAIL.test(email) ? email : '',
    governingLaw: clean(process.env.QUESTLY_GOVERNING_LAW),
    hostingProvider: clean(process.env.QUESTLY_HOSTING_PROVIDER),
    aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY),
    minimumAge: MIN_AGE,
    sessionDays: SESSION_DAYS,
    deletedContentDays: RETENTION.deletedContentDays,
    auditLogDays: RETENTION.auditLogDays,
    reportDays: RETENTION.reportDays,
    supportDays: RETENTION.supportDays,
  }
}

/**
 * `{{name}}` becomes the value; `{{#name}}…{{/name}}` stays only when the value
 * is set, `{{^name}}…{{/name}}` only when it is not. Sections can hold other
 * sections.
 */
export function renderPolicy(template, values = policyVariables()) {
  let out = template
  for (let pass = 0; pass < 6; pass++) {
    const next = out.replace(/\{\{([#^])(\w+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (_, mode, key, inner) => ((mode === '#') === Boolean(values[key]) ? inner : ''))
    if (next === out) break
    out = next
  }
  out = out.replace(/\{\{(\w+)\}\}/g, (_, key) => (values[key] === undefined || values[key] === null ? '' : String(values[key])))
  // Numbered sections are numbered again, so one left out leaves no gap.
  let section = 0
  out = out.replace(/^## \d+\. /gm, () => `## ${++section}. `)
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/* --- reading ---------------------------------------------------------------- */

export function isPolicySlug(slug) {
  return BY_SLUG.has(slug)
}

export function listPolicies() {
  return POLICIES.map(({ slug }) => {
    const row = latest(slug)
    return row ? { slug, title: row.title, version: row.version, updatedAt: row.created_at } : null
  }).filter(Boolean)
}

export function publicPolicy(slug) {
  const row = BY_SLUG.has(slug) ? latest(slug) : null
  if (!row) return null
  return { slug, title: row.title, version: row.version, updatedAt: row.created_at, body: renderPolicy(row.body) }
}

/** The version of a document everyone must have accepted: its latest material one. */
function requiredVersion(slug) {
  return db.get('SELECT MAX(version) AS v FROM policy_versions WHERE slug = ? AND material = 1', [slug])?.v ?? null
}

/** Terms and privacy versions this player still has to accept. */
export function pendingAcceptances(userId) {
  const pending = []
  for (const { slug, acceptance } of POLICIES) {
    if (!acceptance) continue
    const required = requiredVersion(slug)
    if (!required) continue
    const accepted = db.get('SELECT version FROM policy_acceptances WHERE user_id = ? AND slug = ?', [userId, slug])?.version ?? 0
    if (accepted < required) pending.push({ slug, title: latest(slug)?.title ?? BY_SLUG.get(slug).title, version: required })
  }
  return pending
}

/** Records acceptance of the documents in force now. */
export function acceptPolicies(userId) {
  const now = new Date().toISOString()
  for (const { slug, acceptance } of POLICIES) {
    if (!acceptance) continue
    const row = latest(slug)
    if (!row) continue
    db.run(
      `INSERT INTO policy_acceptances (user_id, slug, version, accepted_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, slug) DO UPDATE SET version = excluded.version, accepted_at = excluded.accepted_at`,
      [userId, slug, row.version, now],
    )
  }
}

/* --- editing ------------------------------------------------------------------ */

export function adminPolicyView() {
  return POLICIES.map(({ slug, acceptance }) => {
    const row = latest(slug)
    const history = db.all(
      `SELECT v.version, v.material, v.from_file, v.note, v.created_at, u.email
       FROM policy_versions v LEFT JOIN users u ON u.id = v.created_by
       WHERE v.slug = ? ORDER BY v.version DESC LIMIT 30`,
      [slug],
    )
    const required = acceptance ? requiredVersion(slug) : null
    return {
      slug,
      title: row?.title ?? BY_SLUG.get(slug).title,
      body: row?.body ?? '',
      version: row?.version ?? 0,
      updatedAt: row?.created_at ?? null,
      fromFile: Boolean(row?.from_file),
      acceptance,
      requiredVersion: required,
      acceptedCurrent: required
        ? db.get('SELECT COUNT(*) AS n FROM policy_acceptances WHERE slug = ? AND version >= ?', [slug, required])?.n ?? 0
        : null,
      history: history.map((h) => ({
        version: h.version,
        material: Boolean(h.material),
        fromFile: Boolean(h.from_file),
        note: h.note,
        createdAt: h.created_at,
        by: h.email ?? null,
      })),
    }
  })
}

/** @returns {{ ok: true, version: number } | { ok: false, error: string }} */
export function savePolicy(slug, input, adminId) {
  const doc = BY_SLUG.get(slug)
  if (!doc) return { ok: false, error: 'No such document.' }
  const title = String(input?.title ?? '').replace(/\s+/g, ' ').trim()
  const body = String(input?.body ?? '').replace(/\r\n/g, '\n').trim()
  if (!title || title.length > POLICY_TITLE_MAX) return { ok: false, error: `Give the document a title of up to ${POLICY_TITLE_MAX} characters.` }
  if (body.length < 50) return { ok: false, error: 'The document is too short to publish.' }
  if (body.length > POLICY_BODY_MAX) return { ok: false, error: `Documents can be at most ${POLICY_BODY_MAX.toLocaleString()} characters.` }
  const current = latest(slug)
  const material = doc.acceptance && input?.material === true
  if (current && current.title === title && current.body === body && !material) return { ok: false, error: 'Nothing has changed.' }
  const note = String(input?.note ?? '').trim().slice(0, 200) || null
  return { ok: true, version: insertVersion(slug, { title, body, material, fromFile: false, note, by: adminId }) }
}

/** Goes back to the text in the repository, as a new version that follows the file again. */
export function resetPolicy(slug, adminId) {
  const doc = BY_SLUG.get(slug)
  if (!doc) return { ok: false, error: 'No such document.' }
  const body = defaultBody(slug)
  const current = latest(slug)
  if (current?.from_file && current.body === body) return { ok: false, error: 'This document already uses the default text.' }
  return { ok: true, version: insertVersion(slug, { title: doc.title, body, material: false, fromFile: true, note: 'Reset to the default text', by: adminId }) }
}
