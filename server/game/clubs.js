import { randomUUID } from 'node:crypto'
import { db, findUserById } from '../db.js'
import { screenInput } from '../moderation.js'
import { track } from './analytics.js'
import { dayKey, safeTimezone } from './clock.js'
import { conflict, GameError, invalid, notFound } from './errors.js'
import { levelFromXp } from './levels.js'
import { notify } from './notify.js'
import { effectiveStreak, getProgressRow, transaction } from './rewards.js'
import { REGIONS } from './world.js'

/**
 * Clubs: communities with a home in the world, a way in, and a record.
 *
 * Every rule lives here and is checked on every request: who may join (level
 * and entry trials, judged from the server's own records), who may do what
 * (owner, officer, member), what a club challenge asks and pays, and what
 * happens to a member who misses a mandatory one. Club XP is its own ledger,
 * separate from Questly XP, so a club's standing can only move through things
 * the server saw happen. There are no stakes of any kind: the most a club can
 * do to a member is warn them, take back Club XP they earned, or remove them —
 * and a removed member can always come back through the trials.
 */

/* --- schema ------------------------------------------------------------------ */

db.run(`
  CREATE TABLE IF NOT EXISTS clubs (
    id           TEXT PRIMARY KEY,
    slug         TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL,
    rules        TEXT NOT NULL,
    region       TEXT NOT NULL,
    owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    min_level    INTEGER NOT NULL DEFAULT 1,
    consequence  TEXT NOT NULL DEFAULT 'warning',
    xp           INTEGER NOT NULL DEFAULT 0,
    reputation   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    archived_at  TEXT
  )
`)
db.run('CREATE INDEX IF NOT EXISTS idx_clubs_region ON clubs(region, xp)')

db.run(`
  CREATE TABLE IF NOT EXISTS club_members (
    club_id           TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role              TEXT NOT NULL DEFAULT 'member',
    status            TEXT NOT NULL,
    club_xp           INTEGER NOT NULL DEFAULT 0,
    warnings          INTEGER NOT NULL DEFAULT 0,
    trial_started_at  TEXT,
    joined_at         TEXT,
    left_at           TEXT,
    removed_reason    TEXT,
    PRIMARY KEY (club_id, user_id)
  )
`)
db.run('CREATE INDEX IF NOT EXISTS idx_club_members_user ON club_members(user_id, status)')

db.run(`
  CREATE TABLE IF NOT EXISTS club_trials (
    id        TEXT PRIMARY KEY,
    club_id   TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    position  INTEGER NOT NULL,
    kind      TEXT NOT NULL,
    target    INTEGER NOT NULL,
    title     TEXT NOT NULL
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS club_challenges (
    id           TEXT PRIMARY KEY,
    club_id      TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL,
    visibility   TEXT NOT NULL,
    kind         TEXT NOT NULL,
    target       INTEGER NOT NULL,
    duration_days INTEGER NOT NULL,
    club_xp      INTEGER NOT NULL,
    created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
    starts_at    TEXT NOT NULL,
    ends_at      TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    settled_at   TEXT
  )
`)
db.run('CREATE INDEX IF NOT EXISTS idx_club_challenges_club ON club_challenges(club_id, ends_at)')

db.run(`
  CREATE TABLE IF NOT EXISTS club_challenge_entries (
    challenge_id  TEXT NOT NULL REFERENCES club_challenges(id) ON DELETE CASCADE,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        TEXT NOT NULL,
    checkins      TEXT NOT NULL DEFAULT '[]',
    joined_at     TEXT NOT NULL,
    finished_at   TEXT,
    PRIMARY KEY (challenge_id, user_id)
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS club_xp_ledger (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id     TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source      TEXT NOT NULL,
    source_id   TEXT NOT NULL,
    xp          INTEGER NOT NULL,
    created_at  TEXT NOT NULL,
    UNIQUE (club_id, user_id, source, source_id)
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS club_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id     TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    deleted_at  TEXT
  )
`)
db.run('CREATE INDEX IF NOT EXISTS idx_club_messages ON club_messages(club_id, id)')

/* --- rules -------------------------------------------------------------------- */

export const CLUB_REGIONS = REGIONS.map((r) => r.id)
export const CONSEQUENCES = ['warning', 'standing', 'removal']
export const ROLES = ['owner', 'officer', 'member']
export const MAX_OWNED = 2
export const MIN_LEVEL_TO_CREATE = 3
export const MAX_MEMBERS = 500
export const MAX_TRIALS = 3
export const MAX_ACTIVE_CHALLENGES = 3
export const MAX_ACTIVE_MANDATORY = 2
export const CHALLENGE_DURATIONS = [3, 5, 7, 14, 21, 30]
export const VISIBILITIES = ['mandatory', 'optional', 'public']
export const CHALLENGE_KINDS = ['focus_minutes', 'checkin']

/** What an entry trial can ask for — each one judged from the server's records. */
export const TRIAL_KINDS = {
  focus_minutes: { min: 30, max: 1200, label: (n) => `${n} minutes of timed focus` },
  quests: { min: 1, max: 30, label: (n) => `Complete ${n} quest${n === 1 ? '' : 's'}` },
  streak: { min: 2, max: 30, label: (n) => `Reach a ${n}-day streak` },
  proof: { min: 1, max: 10, label: (n) => `Complete ${n} quest${n === 1 ? '' : 's'} with photo or voice proof` },
  duels: { min: 1, max: 5, label: (n) => `Finish ${n} duel${n === 1 ? '' : 's'} meeting the objective` },
}

/** Club XP a focus session earns a member: a point for every five minutes, up to two hours. */
export function focusClubXp(activeMs) {
  return Math.min(24, Math.floor(Math.max(0, activeMs) / 300_000))
}

/** What a club challenge pays in Club XP, set by the server from what it asks. */
export function challengeClubXp(kind, target) {
  return kind === 'focus_minutes' ? Math.min(300, Math.max(10, Math.round(target / 10))) : Math.min(300, Math.max(10, target * 10))
}

export function clubLevel(xp) {
  return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 60))
}

export function clubXpForLevel(level) {
  return (Math.max(1, level) - 1) ** 2 * 60
}

/** How the club's building looks, and what the club is called for it. */
export function clubTier(level) {
  if (level >= 15) return { id: 'landmark', name: 'Landmark' }
  if (level >= 10) return { id: 'headquarters', name: 'Headquarters' }
  if (level >= 5) return { id: 'hall', name: 'Guild Hall' }
  return { id: 'workshop', name: 'Workshop' }
}

export function memberRank(contribution) {
  if (contribution >= 1500) return 'Elite'
  if (contribution >= 500) return 'Builder'
  if (contribution >= 100) return 'Contributor'
  return 'New Member'
}

function cleanText(value, { min, max, label, field, multiline = false }) {
  const raw = String(value ?? '').trim()
  const text = multiline ? raw.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : raw.replace(/\s+/g, ' ')
  if (text.length < min) throw invalid(`${label} needs at least ${min} characters.`, field)
  if (text.length > max) throw invalid(`${label} can be at most ${max} characters.`, field)
  if (!screenInput(text, { allowLength: max }).ok) throw invalid(`${label} was blocked by the content filter.`, field)
  return text
}

function slugFrom(name) {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'club'
  let slug = base
  for (let n = 2; db.get('SELECT 1 AS x FROM clubs WHERE slug = ?', [slug]); n += 1) slug = `${base}-${n}`
  return slug
}

function playerLevel(userId) {
  return levelFromXp(getProgressRow(userId)?.xp ?? 0)
}

/* --- loading and permissions ------------------------------------------------------ */

export function loadClub(slugOrId, { includeArchived = false } = {}) {
  const row = db.get('SELECT * FROM clubs WHERE slug = ? OR id = ?', [String(slugOrId), String(slugOrId)])
  if (!row || (row.archived_at && !includeArchived)) throw notFound('That club')
  return row
}

function membership(clubId, userId) {
  return db.get('SELECT * FROM club_members WHERE club_id = ? AND user_id = ?', [clubId, userId]) ?? null
}

function isActive(m) {
  return m && m.status === 'active'
}

function canManage(m) {
  return isActive(m) && (m.role === 'owner' || m.role === 'officer')
}

function requireRole(club, userId, roles) {
  const m = membership(club.id, userId)
  if (!isActive(m) || !roles.includes(m.role)) throw new GameError(403, 'Only club leaders can do that.', 'forbidden')
  return m
}

/* --- club XP ------------------------------------------------------------------------- */

/** Adds (or, for a penalty, takes back) Club XP once per source. Returns what moved. */
function creditClubXp(clubId, userId, source, sourceId, xp) {
  if (!xp) return 0
  const member = membership(clubId, userId)
  if (!member) return 0
  // A penalty never takes a member below zero.
  const amount = xp < 0 ? -Math.min(member.club_xp, -xp) : xp
  if (!amount) return 0
  const inserted = db.run(
    'INSERT OR IGNORE INTO club_xp_ledger (club_id, user_id, source, source_id, xp, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [clubId, userId, source, String(sourceId), amount, new Date().toISOString()],
  )
  if (!inserted.changes) return 0
  db.run('UPDATE club_members SET club_xp = MAX(0, club_xp + ?) WHERE club_id = ? AND user_id = ?', [amount, clubId, userId])
  db.run('UPDATE clubs SET xp = MAX(0, xp + ?), updated_at = ? WHERE id = ?', [amount, new Date().toISOString(), clubId])
  return amount
}

/**
 * Credits a finished focus session to every club the player is an active
 * member of. Sessions from before they joined count for nothing.
 */
export function creditClubFocus(userId, session) {
  if (!session || !['completed', 'ended'].includes(session.status) || !session.endedAt) return
  const clubs = db.all("SELECT m.club_id, m.joined_at FROM club_members m JOIN clubs c ON c.id = m.club_id WHERE m.user_id = ? AND m.status = 'active' AND c.archived_at IS NULL", [userId])
  const xp = focusClubXp(session.activeMs ?? 0)
  if (!xp || !clubs.length) return
  transaction(() => {
    for (const c of clubs) {
      if (c.joined_at && Date.parse(session.startedAt) >= Date.parse(c.joined_at)) creditClubXp(c.club_id, userId, 'focus', session.id, xp)
    }
  })
}

/** Catches up focus credit for one member — for sessions settled outside the finish route. */
function syncMemberFocus(clubId, userId, joinedAt) {
  if (!joinedAt) return
  const sessions = db.all(
    `SELECT s.id, s.status, s.started_at, s.ended_at, s.active_ms FROM focus_sessions s
     WHERE s.user_id = ? AND s.status IN ('completed', 'ended') AND s.started_at >= ?
       AND NOT EXISTS (SELECT 1 FROM club_xp_ledger l WHERE l.club_id = ? AND l.user_id = s.user_id AND l.source = 'focus' AND l.source_id = s.id)
     ORDER BY s.started_at LIMIT 200`,
    [userId, joinedAt, clubId],
  )
  if (!sessions.length) return
  transaction(() => {
    for (const s of sessions) creditClubXp(clubId, userId, 'focus', s.id, focusClubXp(s.active_ms ?? 0))
  })
}

/* --- creating and editing ---------------------------------------------------------------- */

function validateClubInput(input, { partial = false } = {}) {
  const out = {}
  if (!partial || input?.name !== undefined) out.name = cleanText(input?.name, { min: 3, max: 40, label: 'The name', field: 'name' })
  if (!partial || input?.description !== undefined) {
    out.description = cleanText(input?.description, { min: 10, max: 400, label: 'The description', field: 'description', multiline: true })
  }
  if (!partial || input?.rules !== undefined) out.rules = cleanText(input?.rules, { min: 10, max: 1000, label: 'The rules', field: 'rules', multiline: true })
  if (!partial || input?.region !== undefined) {
    if (!CLUB_REGIONS.includes(input?.region)) throw invalid('Choose where in the world the club stands.', 'region')
    out.region = input.region
  }
  if (!partial || input?.minLevel !== undefined) {
    const level = Math.round(Number(input?.minLevel ?? 1))
    if (!Number.isFinite(level) || level < 1 || level > 50) throw invalid('The level requirement has to be between 1 and 50.', 'minLevel')
    out.min_level = level
  }
  if (!partial || input?.consequence !== undefined) {
    const consequence = input?.consequence ?? 'warning'
    if (!CONSEQUENCES.includes(consequence)) throw invalid('Choose what happens when a mandatory challenge is missed.', 'consequence')
    out.consequence = consequence
  }
  return out
}

export function createClub(userId, input) {
  const value = validateClubInput(input)
  if (playerLevel(userId) < MIN_LEVEL_TO_CREATE) throw conflict(`Reach level ${MIN_LEVEL_TO_CREATE} to found a club.`, 'level_too_low')
  const owned = db.get('SELECT COUNT(*) AS n FROM clubs WHERE owner_id = ? AND archived_at IS NULL', [userId])?.n ?? 0
  if (owned >= MAX_OWNED) throw conflict(`You can lead at most ${MAX_OWNED} clubs.`, 'too_many_clubs')
  if (db.get('SELECT 1 AS x FROM clubs WHERE lower(name) = lower(?) AND archived_at IS NULL', [value.name])) throw conflict('A club with that name already exists.', 'name_taken')

  const id = randomUUID()
  const now = new Date().toISOString()
  transaction(() => {
    db.run(
      `INSERT INTO clubs (id, slug, name, description, rules, region, owner_id, min_level, consequence, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, slugFrom(value.name), value.name, value.description, value.rules, value.region, userId, value.min_level, value.consequence, now, now],
    )
    db.run("INSERT INTO club_members (club_id, user_id, role, status, joined_at) VALUES (?, ?, 'owner', 'active', ?)", [id, userId, now])
  })
  track(userId, 'club_created', { region: value.region })
  return loadClub(id)
}

export function updateClub(userId, slug, input) {
  const club = loadClub(slug)
  requireRole(club, userId, ['owner'])
  const value = validateClubInput(input, { partial: true })
  const keys = Object.keys(value)
  if (!keys.length) return club
  if (value.name && value.name.toLowerCase() !== club.name.toLowerCase() && db.get('SELECT 1 AS x FROM clubs WHERE lower(name) = lower(?) AND archived_at IS NULL AND id != ?', [value.name, club.id])) {
    throw conflict('A club with that name already exists.', 'name_taken')
  }
  // Column names come from validateClubInput's own keys only.
  db.run(`UPDATE clubs SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...keys.map((k) => value[k]), new Date().toISOString(), club.id])
  return loadClub(club.id)
}

export function setTrials(userId, slug, trials) {
  const club = loadClub(slug)
  requireRole(club, userId, ['owner'])
  if (!Array.isArray(trials)) throw invalid('Send the list of trials.', 'trials')
  if (trials.length > MAX_TRIALS) throw invalid(`A club can set at most ${MAX_TRIALS} entry trials.`, 'trials')
  const clean = trials.map((t, i) => {
    const kind = TRIAL_KINDS[t?.kind] ? t.kind : null
    if (!kind) throw invalid('Choose what each trial asks for.', 'trials')
    const spec = TRIAL_KINDS[kind]
    const target = Math.round(Number(t?.target))
    if (!Number.isFinite(target) || target < spec.min || target > spec.max) throw invalid(`Trial ${i + 1} needs a target between ${spec.min} and ${spec.max}.`, 'trials')
    const title = t?.title ? cleanText(t.title, { min: 3, max: 60, label: `Trial ${i + 1}'s name`, field: 'trials' }) : spec.label(target)
    return { kind, target, title }
  })
  transaction(() => {
    db.run('DELETE FROM club_trials WHERE club_id = ?', [club.id])
    clean.forEach((t, i) => db.run('INSERT INTO club_trials (id, club_id, position, kind, target, title) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), club.id, i, t.kind, t.target, t.title]))
    db.run('UPDATE clubs SET updated_at = ? WHERE id = ?', [new Date().toISOString(), club.id])
  })
  return trialsFor(club.id)
}

export function closeClub(userId, slug) {
  const club = loadClub(slug)
  requireRole(club, userId, ['owner'])
  const now = new Date().toISOString()
  const members = db.all("SELECT user_id FROM club_members WHERE club_id = ? AND status = 'active' AND user_id != ?", [club.id, userId])
  db.run('UPDATE clubs SET archived_at = ?, updated_at = ? WHERE id = ?', [now, now, club.id])
  for (const m of members) {
    notify(m.user_id, { kind: 'club_removed', title: `${club.name} has closed`, body: 'Its leader closed the club. Your Questly progress is unaffected.', link: '/clubs' })
  }
}

/* --- trials and membership ---------------------------------------------------------------- */

function trialsFor(clubId) {
  return db.all('SELECT * FROM club_trials WHERE club_id = ? ORDER BY position', [clubId])
}

function trialProgress(trial, userId, since) {
  if (!since) return 0
  if (trial.kind === 'focus_minutes') {
    const ms = db.get(
      "SELECT COALESCE(SUM(active_ms), 0) AS n FROM focus_sessions WHERE user_id = ? AND status IN ('completed', 'ended') AND started_at >= ?",
      [userId, since],
    )?.n ?? 0
    return Math.floor(ms / 60_000)
  }
  if (trial.kind === 'quests') {
    return db.get("SELECT COUNT(*) AS n FROM quests WHERE user_id = ? AND status = 'completed' AND completed_at >= ?", [userId, since])?.n ?? 0
  }
  if (trial.kind === 'proof') {
    return db.get("SELECT COUNT(*) AS n FROM quests WHERE user_id = ? AND status = 'completed' AND verified_at IS NOT NULL AND verified_at >= ?", [userId, since])?.n ?? 0
  }
  if (trial.kind === 'duels') {
    return db.get(
      `SELECT COUNT(*) AS n FROM challenges WHERE status = 'completed' AND completed_at >= ?
         AND ((creator_id = ? AND creator_reward > 0) OR (opponent_id = ? AND opponent_reward > 0))`,
      [since, userId, userId],
    )?.n ?? 0
  }
  const progress = getProgressRow(userId)
  return progress ? effectiveStreak(progress, dayKey(safeTimezone(progress.timezone))) : 0
}

function trialsView(club, userId, member) {
  const since = member?.status === 'trial' ? member.trial_started_at : null
  return trialsFor(club.id).map((t) => {
    const current = since ? Math.min(t.target, trialProgress(t, userId, since)) : 0
    return { id: t.id, kind: t.kind, title: t.title, target: t.target, current, met: Boolean(since) && current >= t.target }
  })
}

function activeCount(clubId) {
  return db.get("SELECT COUNT(*) AS n FROM club_members WHERE club_id = ? AND status = 'active'", [clubId])?.n ?? 0
}

function activate(club, userId, { viaTrials }) {
  const now = new Date().toISOString()
  db.run(
    `UPDATE club_members SET status = 'active', role = CASE WHEN role = 'owner' THEN 'owner' ELSE 'member' END, joined_at = ?, trial_started_at = NULL, removed_reason = NULL
     WHERE club_id = ? AND user_id = ?`,
    [now, club.id, userId],
  )
  if (viaTrials) db.run('UPDATE clubs SET reputation = reputation + 1 WHERE id = ?', [club.id])
  const who = findUserById(userId)
  if (club.owner_id !== userId) {
    notify(club.owner_id, {
      kind: 'club_joined',
      title: `${who?.display_name ?? who?.username ?? 'Someone'} joined ${club.name}`,
      body: viaTrials ? 'They passed the entry trials.' : 'They met the level requirement.',
      link: `/clubs/${club.slug}/members`,
    })
  }
  track(userId, 'club_joined', { trials: viaTrials })
  if (viaTrials) track(userId, 'club_trials_passed')
}

/**
 * The way in. Below the level requirement nothing starts. With no trials the
 * player joins at once; otherwise the trials begin now, and only what the
 * player does from this moment counts toward them.
 */
export function beginTrials(userId, slug) {
  const club = loadClub(slug)
  const level = playerLevel(userId)
  if (level < club.min_level) throw conflict(`${club.name} asks for level ${club.min_level}. You are level ${level}.`, 'level_too_low')
  const member = membership(club.id, userId)
  if (member?.status === 'active') throw conflict('You are already a member.', 'already_member')
  if (member?.status === 'trial') throw conflict('Your trials are already under way.', 'already_trial')
  if (activeCount(club.id) >= MAX_MEMBERS) throw conflict('This club is full.', 'club_full')
  const now = new Date().toISOString()
  const trials = trialsFor(club.id)
  transaction(() => {
    if (member) {
      db.run("UPDATE club_members SET status = 'trial', role = 'member', trial_started_at = ?, left_at = NULL WHERE club_id = ? AND user_id = ?", [now, club.id, userId])
    } else {
      db.run("INSERT INTO club_members (club_id, user_id, role, status, trial_started_at) VALUES (?, ?, 'member', 'trial', ?)", [club.id, userId, now])
    }
    if (!trials.length) activate(club, userId, { viaTrials: false })
  })
  return clubView(userId, club.slug)
}

/** Checks the trials again on the server and, if every one is met, lets the player in. */
export function completeTrials(userId, slug) {
  const club = loadClub(slug)
  const member = membership(club.id, userId)
  if (member?.status !== 'trial') throw conflict('Begin the entry trials first.', 'not_on_trial')
  const level = playerLevel(userId)
  if (level < club.min_level) throw conflict(`${club.name} asks for level ${club.min_level}.`, 'level_too_low')
  const trials = trialsView(club, userId, member)
  const missing = trials.filter((t) => !t.met)
  if (missing.length) throw conflict(`Not yet: ${missing.map((t) => t.title).join(', ')}.`, 'trials_incomplete', { trials })
  if (activeCount(club.id) >= MAX_MEMBERS) throw conflict('This club is full.', 'club_full')
  transaction(() => activate(club, userId, { viaTrials: true }))
  return clubView(userId, club.slug)
}

export function leaveClub(userId, slug) {
  const club = loadClub(slug)
  const member = membership(club.id, userId)
  if (!member || !['active', 'trial'].includes(member.status)) throw conflict('You are not in this club.', 'not_member')
  if (member.role === 'owner') throw conflict('A leader cannot leave their own club. Close it instead.', 'owner_cannot_leave')
  db.run("UPDATE club_members SET status = 'left', left_at = ?, trial_started_at = NULL WHERE club_id = ? AND user_id = ?", [new Date().toISOString(), club.id, userId])
}

export function removeMember(actorId, slug, targetUserId, reason) {
  const club = loadClub(slug)
  const actor = requireRole(club, actorId, ['owner', 'officer'])
  const target = membership(club.id, targetUserId)
  if (!target || !['active', 'trial'].includes(target.status)) throw notFound('That member')
  if (target.role === 'owner') throw new GameError(403, 'The leader cannot be removed.', 'forbidden')
  if (target.role === 'officer' && actor.role !== 'owner') throw new GameError(403, 'Only the leader can remove an officer.', 'forbidden')
  const why = reason ? cleanText(reason, { min: 3, max: 200, label: 'The reason', field: 'reason' }) : 'Removed by the club leaders'
  db.run("UPDATE club_members SET status = 'removed', role = 'member', removed_reason = ?, left_at = ?, trial_started_at = NULL WHERE club_id = ? AND user_id = ?", [
    why,
    new Date().toISOString(),
    club.id,
    targetUserId,
  ])
  notify(targetUserId, { kind: 'club_removed', title: `You were removed from ${club.name}`, body: `${why}. You can rejoin by completing the entry trials again.`, link: `/clubs/${club.slug}` })
}

export function setRole(actorId, slug, targetUserId, role) {
  const club = loadClub(slug)
  requireRole(club, actorId, ['owner'])
  if (role !== 'officer' && role !== 'member') throw invalid('Choose officer or member.', 'role')
  const target = membership(club.id, targetUserId)
  if (!isActive(target)) throw notFound('That member')
  if (target.role === 'owner') throw new GameError(403, 'The leader’s role cannot change.', 'forbidden')
  db.run('UPDATE club_members SET role = ? WHERE club_id = ? AND user_id = ?', [role, club.id, targetUserId])
}

export function inviteToClub(actorId, slug, target) {
  const club = loadClub(slug)
  requireRole(club, actorId, ['owner', 'officer'])
  if (!target || target.disabled) throw notFound('That player')
  const existing = membership(club.id, target.id)
  if (isActive(existing)) throw conflict('They are already a member.', 'already_member')
  const actor = findUserById(actorId)
  notify(target.id, {
    kind: 'club_invitation',
    title: `${actor?.display_name ?? actor?.username ?? 'A club leader'} invited you to ${club.name}`,
    body: club.min_level > 1 ? `Level ${club.min_level} and the entry trials open the door.` : 'Complete the entry trials to join.',
    link: `/clubs/${club.slug}`,
    dedupeKey: `club-invite:${club.id}`,
  })
}

/* --- challenges ---------------------------------------------------------------------------- */

function dayIndex(challenge, at) {
  return Math.floor((at - Date.parse(challenge.starts_at)) / 86_400_000)
}

function entryProgress(challenge, entry) {
  if (challenge.kind === 'checkin') {
    try {
      return new Set(JSON.parse(entry.checkins)).size
    } catch {
      return 0
    }
  }
  const from = Date.parse(entry.joined_at) > Date.parse(challenge.starts_at) ? entry.joined_at : challenge.starts_at
  const ms = db.get(
    "SELECT COALESCE(SUM(active_ms), 0) AS n FROM focus_sessions WHERE user_id = ? AND status IN ('completed', 'ended') AND started_at >= ? AND ended_at < ?",
    [entry.user_id, from, challenge.ends_at],
  )?.n ?? 0
  return Math.floor(ms / 60_000)
}

export function createChallenge(actorId, slug, input) {
  const club = loadClub(slug)
  requireRole(club, actorId, ['owner', 'officer'])
  const title = cleanText(input?.title, { min: 3, max: 60, label: 'The title', field: 'title' })
  const description = cleanText(input?.description, { min: 3, max: 300, label: 'The description', field: 'description', multiline: true })
  if (!VISIBILITIES.includes(input?.visibility)) throw invalid('Choose mandatory, optional or public.', 'visibility')
  if (!CHALLENGE_KINDS.includes(input?.kind)) throw invalid('Choose timed focus or daily check-ins.', 'kind')
  const days = Number(input?.durationDays)
  if (!CHALLENGE_DURATIONS.includes(days)) throw invalid('Pick a duration from the list.', 'durationDays')
  const target = Math.round(Number(input?.target))
  if (input.kind === 'focus_minutes' && (!Number.isFinite(target) || target < 30 || target > days * 240)) {
    throw invalid(`Ask for between 30 and ${days * 240} minutes of focus.`, 'target')
  }
  if (input.kind === 'checkin' && (!Number.isFinite(target) || target < 1 || target > days)) throw invalid(`Ask for between 1 and ${days} check-in days.`, 'target')

  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const active = db.all('SELECT visibility FROM club_challenges WHERE club_id = ? AND ends_at > ?', [club.id, nowIso])
  if (active.length >= MAX_ACTIVE_CHALLENGES) throw conflict(`A club can run ${MAX_ACTIVE_CHALLENGES} challenges at once.`, 'too_many_challenges')
  if (input.visibility === 'mandatory' && active.filter((c) => c.visibility === 'mandatory').length >= MAX_ACTIVE_MANDATORY) {
    throw conflict(`At most ${MAX_ACTIVE_MANDATORY} mandatory challenges can run at once.`, 'too_many_mandatory')
  }

  const id = randomUUID()
  const clubXp = challengeClubXp(input.kind, target)
  const endsAt = new Date(now + days * 86_400_000).toISOString()
  const members = db.all("SELECT user_id FROM club_members WHERE club_id = ? AND status = 'active'", [club.id])
  transaction(() => {
    db.run(
      `INSERT INTO club_challenges (id, club_id, title, description, visibility, kind, target, duration_days, club_xp, created_by, starts_at, ends_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, club.id, title, description, input.visibility, input.kind, target, days, clubXp, actorId, nowIso, endsAt, nowIso],
    )
    // Everyone who is a member when a mandatory challenge starts is in it.
    if (input.visibility === 'mandatory') {
      for (const m of members) db.run("INSERT OR IGNORE INTO club_challenge_entries (challenge_id, user_id, status, joined_at) VALUES (?, ?, 'joined', ?)", [id, m.user_id, nowIso])
    }
  })
  for (const m of members) {
    if (m.user_id === actorId) continue
    notify(m.user_id, {
      kind: input.visibility === 'mandatory' ? 'club_mandatory' : 'club_announcement',
      title: input.visibility === 'mandatory' ? `Mandatory challenge in ${club.name}: ${title}` : `New challenge in ${club.name}: ${title}`,
      body: `${input.kind === 'focus_minutes' ? `${target} minutes of timed focus` : `${target} check-in days`} in ${days} days · +${clubXp} Club XP`,
      link: `/clubs/${club.slug}/challenges`,
    })
  }
  return challengeView(getChallenge(id), actorId)
}

function getChallenge(id) {
  return db.get('SELECT * FROM club_challenges WHERE id = ?', [id]) ?? null
}

function loadChallenge(club, id) {
  const row = db.get('SELECT * FROM club_challenges WHERE id = ? AND club_id = ?', [String(id), club.id])
  if (!row) throw notFound('That challenge')
  return row
}

export function joinChallenge(userId, slug, challengeId) {
  const club = loadClub(slug)
  const challenge = loadChallenge(club, challengeId)
  if (Date.now() >= Date.parse(challenge.ends_at)) throw conflict('This challenge has ended.', 'challenge_ended')
  const member = membership(club.id, userId)
  if (challenge.visibility !== 'public' && !isActive(member)) throw new GameError(403, 'Only members can join this challenge.', 'members_only')
  const inserted = db.run("INSERT OR IGNORE INTO club_challenge_entries (challenge_id, user_id, status, joined_at) VALUES (?, ?, 'joined', ?)", [
    challenge.id,
    userId,
    new Date().toISOString(),
  ])
  if (!inserted.changes) throw conflict('You are already in this challenge.', 'already_joined')
  return challengeView(challenge, userId)
}

export function checkInChallenge(userId, slug, challengeId) {
  const club = loadClub(slug)
  const challenge = loadChallenge(club, challengeId)
  if (challenge.kind !== 'checkin') throw conflict('This challenge counts timed focus. Start a focus session instead.', 'focus_challenge')
  const now = Date.now()
  if (now >= Date.parse(challenge.ends_at)) throw conflict('This challenge has ended.', 'challenge_ended')
  const entry = db.get('SELECT * FROM club_challenge_entries WHERE challenge_id = ? AND user_id = ?', [challenge.id, userId])
  if (!entry) throw conflict('Join the challenge first.', 'not_joined')
  const days = new Set(JSON.parse(entry.checkins || '[]'))
  const today = dayIndex(challenge, now)
  if (days.has(today)) throw conflict('You have already checked in today.', 'already_checked_in')
  days.add(today)
  db.run('UPDATE club_challenge_entries SET checkins = ? WHERE challenge_id = ? AND user_id = ?', [JSON.stringify([...days].sort((a, b) => a - b)), challenge.id, userId])
  return challengeView(challenge, userId)
}

/**
 * Settles a challenge whose time is up, once: completions earn Club XP and
 * reputation; a member who missed a mandatory challenge meets the club's
 * consequence — a warning, the Club XP it would have paid taken back, or
 * removal. The leader is never removed; they are warned instead.
 */
function settleChallenge(club, challenge) {
  if (challenge.settled_at || Date.now() < Date.parse(challenge.ends_at)) return
  const now = new Date().toISOString()
  transaction(() => {
    const claimed = db.run('UPDATE club_challenges SET settled_at = ? WHERE id = ? AND settled_at IS NULL', [now, challenge.id])
    if (!claimed.changes) return
    const entries = db.all("SELECT * FROM club_challenge_entries WHERE challenge_id = ? AND status = 'joined'", [challenge.id])
    for (const entry of entries) {
      const done = entryProgress(challenge, entry) >= challenge.target
      db.run('UPDATE club_challenge_entries SET status = ?, finished_at = ? WHERE challenge_id = ? AND user_id = ?', [done ? 'completed' : 'failed', now, challenge.id, entry.user_id])
      const member = membership(club.id, entry.user_id)
      if (done) {
        if (isActive(member)) {
          creditClubXp(club.id, entry.user_id, 'challenge', challenge.id, challenge.club_xp)
          db.run('UPDATE clubs SET reputation = reputation + 1 WHERE id = ?', [club.id])
          track(entry.user_id, 'club_challenge_completed', { visibility: challenge.visibility })
        }
        notify(entry.user_id, {
          kind: 'club_announcement',
          title: `Challenge complete: ${challenge.title}`,
          body: isActive(member) ? `+${challenge.club_xp} Club XP in ${club.name}` : `You completed a public challenge from ${club.name}.`,
          link: `/clubs/${club.slug}/challenges`,
        })
        continue
      }
      if (challenge.visibility !== 'mandatory' || !isActive(member)) continue
      const consequence = member.role === 'owner' && club.consequence === 'removal' ? 'warning' : club.consequence
      if (consequence === 'removal') {
        db.run("UPDATE club_members SET status = 'removed', role = 'member', removed_reason = ?, left_at = ? WHERE club_id = ? AND user_id = ?", [
          `Missed the mandatory challenge "${challenge.title}"`,
          now,
          club.id,
          entry.user_id,
        ])
        notify(entry.user_id, {
          kind: 'club_removed',
          title: `You were removed from ${club.name}`,
          body: `You missed the mandatory challenge "${challenge.title}". You can rejoin by completing the entry trials again.`,
          link: `/clubs/${club.slug}`,
        })
      } else if (consequence === 'standing') {
        const taken = -creditClubXp(club.id, entry.user_id, 'penalty', challenge.id, -challenge.club_xp)
        notify(entry.user_id, {
          kind: 'club_mandatory',
          title: `Missed: ${challenge.title}`,
          body: taken ? `${taken} Club XP was taken back in ${club.name}.` : `You missed a mandatory challenge in ${club.name}.`,
          link: `/clubs/${club.slug}/challenges`,
        })
      } else {
        db.run('UPDATE club_members SET warnings = warnings + 1 WHERE club_id = ? AND user_id = ?', [club.id, entry.user_id])
        notify(entry.user_id, {
          kind: 'club_mandatory',
          title: `Warning in ${club.name}`,
          body: `You missed the mandatory challenge "${challenge.title}".`,
          link: `/clubs/${club.slug}/challenges`,
        })
      }
    }
  })
}

function settleDue(club) {
  const due = db.all('SELECT * FROM club_challenges WHERE club_id = ? AND settled_at IS NULL AND ends_at <= ?', [club.id, new Date().toISOString()])
  for (const challenge of due) settleChallenge(club, challenge)
}

function challengeView(challenge, viewerId) {
  const entry = db.get('SELECT * FROM club_challenge_entries WHERE challenge_id = ? AND user_id = ?', [challenge.id, viewerId]) ?? null
  const now = Date.now()
  const participants = db.get('SELECT COUNT(*) AS n FROM club_challenge_entries WHERE challenge_id = ?', [challenge.id])?.n ?? 0
  const completed = db.get("SELECT COUNT(*) AS n FROM club_challenge_entries WHERE challenge_id = ? AND status = 'completed'", [challenge.id])?.n ?? 0
  let checkedInToday = false
  if (entry && challenge.kind === 'checkin') {
    try {
      checkedInToday = JSON.parse(entry.checkins).includes(dayIndex(challenge, now))
    } catch {
      checkedInToday = false
    }
  }
  return {
    id: challenge.id,
    title: challenge.title,
    description: challenge.description,
    visibility: challenge.visibility,
    kind: challenge.kind,
    target: challenge.target,
    durationDays: challenge.duration_days,
    clubXp: challenge.club_xp,
    startsAt: challenge.starts_at,
    endsAt: challenge.ends_at,
    state: challenge.settled_at || now >= Date.parse(challenge.ends_at) ? 'ended' : 'active',
    participants,
    completed,
    mine: entry
      ? { status: entry.status, progress: Math.min(challenge.target, entryProgress(challenge, entry)), checkedInToday }
      : null,
  }
}

export function listChallenges(userId, slug) {
  const club = loadClub(slug)
  settleDue(club)
  const member = membership(club.id, userId)
  const rows = db.all('SELECT * FROM club_challenges WHERE club_id = ? ORDER BY ends_at DESC LIMIT 40', [club.id])
  // Outsiders see public challenges only.
  const visible = isActive(member) ? rows : rows.filter((c) => c.visibility === 'public')
  return visible.map((c) => challengeView(c, userId))
}

/* --- reading a club ------------------------------------------------------------------------- */

function publicPlayer(row, look) {
  return {
    username: row.username,
    name: String(row.display_name ?? row.username ?? 'Adventurer').slice(0, 40),
    level: levelFromXp(row.xp ?? 0),
    look,
  }
}

export function clubSummary(club, viewerId = null) {
  const level = clubLevel(club.xp)
  const members = activeCount(club.id)
  const mine = viewerId ? membership(club.id, viewerId) : null
  return {
    id: club.id,
    slug: club.slug,
    name: club.name,
    description: club.description,
    region: club.region,
    minLevel: club.min_level,
    xp: club.xp,
    level,
    tier: clubTier(level),
    reputation: club.reputation,
    members,
    trials: db.get('SELECT COUNT(*) AS n FROM club_trials WHERE club_id = ?', [club.id])?.n ?? 0,
    myStatus: mine && ['active', 'trial'].includes(mine.status) ? mine.status : null,
  }
}

export function listClubs(viewerId, { q = '', region = null, mine = false } = {}) {
  const where = ['c.archived_at IS NULL']
  const args = []
  if (mine) {
    where.push("EXISTS (SELECT 1 FROM club_members m WHERE m.club_id = c.id AND m.user_id = ? AND m.status IN ('active', 'trial'))")
    args.push(viewerId)
  }
  if (region && CLUB_REGIONS.includes(region)) {
    where.push('c.region = ?')
    args.push(region)
  }
  const term = String(q ?? '').trim().toLowerCase().slice(0, 40)
  if (term) {
    where.push("(lower(c.name) LIKE ? ESCAPE '\\' OR lower(c.description) LIKE ? ESCAPE '\\')")
    const like = `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
    args.push(like, like)
  }
  const rows = db.all(`SELECT c.* FROM clubs c WHERE ${where.join(' AND ')} ORDER BY c.xp DESC, c.created_at DESC LIMIT 50`, args)
  return rows.map((c) => clubSummary(c, viewerId))
}

/** The clubs shown standing in each region of the world: the three largest. */
export function clubsByRegion() {
  const out = {}
  for (const region of CLUB_REGIONS) {
    out[region] = db.all('SELECT * FROM clubs WHERE region = ? AND archived_at IS NULL ORDER BY xp DESC, created_at LIMIT 3', [region]).map((c) => {
      const level = clubLevel(c.xp)
      return { slug: c.slug, name: c.name, level, tier: clubTier(level).id, members: activeCount(c.id) }
    })
  }
  return out
}

export function clubView(viewerId, slug, { lookFor = () => null } = {}) {
  const club = loadClub(slug)
  settleDue(club)
  const fresh = loadClub(club.id)
  const member = membership(fresh.id, viewerId)
  if (isActive(member)) syncMemberFocus(fresh.id, viewerId, member.joined_at)
  const current = loadClub(club.id)
  const level = clubLevel(current.xp)
  const owner = findUserById(current.owner_id)
  const me = membership(current.id, viewerId)
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const weeklyXp = db.get('SELECT COALESCE(SUM(xp), 0) AS n FROM club_xp_ledger WHERE club_id = ? AND xp > 0 AND created_at > ?', [current.id, week])?.n ?? 0
  return {
    ...clubSummary(current, viewerId),
    rules: current.rules,
    consequence: current.consequence,
    createdAt: current.created_at,
    nextLevelXp: clubXpForLevel(level + 1),
    levelXp: clubXpForLevel(level),
    activity: { weeklyClubXp: weeklyXp },
    owner: owner ? publicPlayer({ ...owner, xp: getProgressRow(owner.id)?.xp ?? 0 }, lookFor(owner.id)) : null,
    trialsList: trialsView(current, viewerId, me),
    me: me && ['active', 'trial'].includes(me.status)
      ? {
          status: me.status,
          role: me.role,
          clubXp: me.club_xp,
          rank: memberRank(me.club_xp),
          warnings: me.warnings,
          trialStartedAt: me.trial_started_at,
          joinedAt: me.joined_at,
        }
      : me?.status === 'removed'
        ? { status: 'removed', role: 'member', clubXp: me.club_xp, rank: memberRank(me.club_xp), warnings: me.warnings, removedReason: me.removed_reason }
        : null,
    permissions: {
      edit: isActive(me) && me.role === 'owner',
      manage: canManage(me),
      chat: isActive(me),
      post: isActive(me),
      announce: canManage(me),
    },
    playerLevel: playerLevel(viewerId),
  }
}

export function clubLeaderboard(slug, { lookFor = () => null, viewerId = null } = {}) {
  const club = loadClub(slug)
  const rows = db.all(
    `SELECT m.user_id, m.role, m.status, m.club_xp, m.warnings, m.joined_at, u.username, u.display_name, p.xp
     FROM club_members m JOIN users u ON u.id = m.user_id LEFT JOIN player_progress p ON p.user_id = m.user_id
     WHERE m.club_id = ? AND m.status = 'active' AND u.disabled = 0
     ORDER BY m.club_xp DESC, m.joined_at ASC LIMIT 100`,
    [club.id],
  )
  return rows.map((r, i) => ({
    position: i + 1,
    player: publicPlayer(r, lookFor(r.user_id)),
    role: r.role,
    clubXp: r.club_xp,
    rank: memberRank(r.club_xp),
    warnings: viewerId && canManage(membership(club.id, viewerId)) ? r.warnings : undefined,
    joinedAt: r.joined_at,
    you: r.user_id === viewerId,
  }))
}

/* --- chat ------------------------------------------------------------------------------------- */

export function listClubMessages(viewerId, slug, afterId = 0, { hidden = () => false } = {}) {
  const club = loadClub(slug)
  if (!isActive(membership(club.id, viewerId))) throw new GameError(403, 'Only members can read the club chat.', 'members_only')
  const rows = afterId
    ? db.all(
        `SELECT m.*, u.username, u.display_name FROM club_messages m JOIN users u ON u.id = m.user_id
         WHERE m.club_id = ? AND m.id > ? AND m.deleted_at IS NULL ORDER BY m.id LIMIT 100`,
        [club.id, afterId],
      )
    : db.all(
        `SELECT * FROM (SELECT m.*, u.username, u.display_name FROM club_messages m JOIN users u ON u.id = m.user_id
           WHERE m.club_id = ? AND m.deleted_at IS NULL ORDER BY m.id DESC LIMIT 100) ORDER BY id`,
        [club.id],
      )
  return rows
    .filter((m) => m.user_id === viewerId || !hidden(m.user_id))
    .map((m) => ({
      id: m.id,
      body: m.body,
      at: m.created_at,
      mine: m.user_id === viewerId,
      author: { username: m.username, name: String(m.display_name ?? m.username ?? 'Adventurer').slice(0, 40) },
    }))
}

export function postClubMessage(userId, slug, body) {
  const club = loadClub(slug)
  if (!isActive(membership(club.id, userId))) throw new GameError(403, 'Only members can write in the club chat.', 'members_only')
  const minuteAgo = new Date(Date.now() - 60_000).toISOString()
  const recent = db.get('SELECT COUNT(*) AS n FROM club_messages WHERE club_id = ? AND user_id = ? AND created_at > ?', [club.id, userId, minuteAgo])?.n ?? 0
  if (recent >= 20) throw new GameError(429, 'Slow down a little — try again in a moment.', 'rate_limited')
  const result = db.run('INSERT INTO club_messages (club_id, user_id, body, created_at) VALUES (?, ?, ?, ?)', [club.id, userId, body, new Date().toISOString()])
  return Number(result.lastInsertRowid)
}

export function deleteClubMessage(actorId, slug, messageId) {
  const club = loadClub(slug)
  const message = db.get('SELECT * FROM club_messages WHERE id = ? AND club_id = ? AND deleted_at IS NULL', [Number(messageId), club.id])
  if (!message) throw notFound('That message')
  const actor = membership(club.id, actorId)
  if (message.user_id !== actorId && !canManage(actor)) throw new GameError(403, 'Only club leaders can remove other people’s messages.', 'forbidden')
  db.run('UPDATE club_messages SET deleted_at = ? WHERE id = ?', [new Date().toISOString(), message.id])
}

/* --- posts ------------------------------------------------------------------------------------- */

/** Whether a player may post in a club's feed, and whether as an announcement. */
export function clubPostRights(userId, slug) {
  const club = loadClub(slug)
  const member = membership(club.id, userId)
  return { club, post: isActive(member), announce: canManage(member) }
}

export function notifyAnnouncement(club, authorId, body) {
  const members = db.all("SELECT user_id FROM club_members WHERE club_id = ? AND status = 'active' AND user_id != ?", [club.id, authorId])
  for (const m of members) {
    notify(m.user_id, {
      kind: 'club_announcement',
      title: `Announcement in ${club.name}`,
      body: body.length > 100 ? `${body.slice(0, 100)}…` : body,
      link: `/clubs/${club.slug}/feed`,
    })
  }
}

export function canModeratePost(userId, clubId) {
  return canManage(membership(clubId, userId))
}

export function isClubMember(userId, clubId) {
  return isActive(membership(clubId, userId))
}

/* --- admin ------------------------------------------------------------------------------------- */

export function adminListClubs() {
  return db
    .all(
      `SELECT c.*, u.username AS owner_username, u.email AS owner_email FROM clubs c JOIN users u ON u.id = c.owner_id
       ORDER BY c.archived_at IS NOT NULL, c.created_at DESC LIMIT 200`,
    )
    .map((c) => ({ ...clubSummary(c), owner: { username: c.owner_username, email: c.owner_email }, archivedAt: c.archived_at, createdAt: c.created_at }))
}

export function adminSetArchived(clubId, archived) {
  const club = db.get('SELECT * FROM clubs WHERE id = ?', [String(clubId)])
  if (!club) throw notFound('That club')
  db.run('UPDATE clubs SET archived_at = ?, updated_at = ? WHERE id = ?', [archived ? new Date().toISOString() : null, new Date().toISOString(), club.id])
  return club
}
