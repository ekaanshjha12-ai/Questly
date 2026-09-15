import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { db, DB_FILE, MEDIA_DIR } from './db.js'

/**
 * What the admin console knows about the running service and how Questly is
 * used.
 *
 * Request figures live in memory for the last hour — they reset on restart and
 * never hold who made a request, only which route and how it went. Product
 * analytics are aggregates over analytics_events and daily_active: counts and
 * shares, never a list of what a named person did.
 */

const MINUTE = 60_000
const DAY = 86_400_000
const WINDOW_MINUTES = 60
const startedAt = Date.now()

/* --- requests --------------------------------------------------------------- */

const buckets = new Map()
const recentErrors = []

/** The route a request matched, with ids taken out so requests group by route and carry nobody's id. */
function routeOf(req) {
  const matched = req.route?.path ? `${req.baseUrl ?? ''}${req.route.path}` : null
  if (matched) return matched
  return req.path
    .split('/')
    .map((part) => (/^[0-9a-f-]{16,}$/i.test(part) || /^\d+$/.test(part) || part.length > 40 ? ':id' : part))
    .join('/')
}

export function requestMetrics(req, res, next) {
  if (!req.path.startsWith('/api/')) return next()
  const start = process.hrtime.bigint()
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6
    const minute = Math.floor(Date.now() / MINUTE)
    let bucket = buckets.get(minute)
    if (!bucket) {
      bucket = { count: 0, clientErrors: 0, serverErrors: 0, totalMs: 0, samples: [] }
      buckets.set(minute, bucket)
      for (const key of buckets.keys()) if (key < minute - WINDOW_MINUTES) buckets.delete(key)
    }
    bucket.count++
    bucket.totalMs += ms
    if (bucket.samples.length < 400) bucket.samples.push(ms)
    if (res.statusCode >= 500) {
      bucket.serverErrors++
      recentErrors.push({ at: new Date().toISOString(), method: req.method, route: routeOf(req), status: res.statusCode })
      if (recentErrors.length > 20) recentErrors.shift()
    } else if (res.statusCode >= 400) {
      bucket.clientErrors++
    }
  })
  next()
}

/* --- system ------------------------------------------------------------------ */

function fileSize(path) {
  try {
    return existsSync(path) ? statSync(path).size : 0
  } catch {
    return 0
  }
}

let mediaCache = { at: 0, bytes: 0, files: 0 }
function mediaUsage() {
  if (Date.now() - mediaCache.at < 5 * MINUTE) return mediaCache
  let bytes = 0
  let files = 0
  try {
    if (existsSync(MEDIA_DIR)) {
      for (const name of readdirSync(MEDIA_DIR)) {
        const stat = statSync(join(MEDIA_DIR, name))
        if (!stat.isFile()) continue
        bytes += stat.size
        files++
      }
    }
  } catch {
    // Report what was counted.
  }
  mediaCache = { at: Date.now(), bytes, files }
  return mediaCache
}

function count(sql, args = []) {
  try {
    return db.get(sql, args)?.n ?? 0
  } catch {
    return null
  }
}

export function systemHealth({ features = {}, retention = {}, lastSweep = null } = {}) {
  const now = Date.now()
  const minute = Math.floor(now / MINUTE)
  const perMinute = []
  let total = 0
  let clientErrors = 0
  let serverErrors = 0
  let totalMs = 0
  const samples = []
  for (let m = minute - (WINDOW_MINUTES - 1); m <= minute; m++) {
    const bucket = buckets.get(m)
    perMinute.push({ at: new Date(m * MINUTE).toISOString(), count: bucket?.count ?? 0, errors: bucket?.serverErrors ?? 0 })
    if (!bucket) continue
    total += bucket.count
    clientErrors += bucket.clientErrors
    serverErrors += bucket.serverErrors
    totalMs += bucket.totalMs
    samples.push(...bucket.samples)
  }
  samples.sort((a, b) => a - b)
  const memory = process.memoryUsage()
  const media = mediaUsage()
  const nowIso = new Date(now).toISOString()

  return {
    generatedAt: nowIso,
    process: {
      startedAt: new Date(startedAt).toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      platform: process.platform,
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
    },
    requests: {
      lastHour: total,
      clientErrors,
      serverErrors,
      averageMs: total ? Math.round(totalMs / total) : null,
      p95Ms: samples.length ? Math.round(samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))]) : null,
      perMinute,
      recentErrors: [...recentErrors].reverse(),
    },
    storage: {
      databaseBytes: fileSize(DB_FILE) + fileSize(`${DB_FILE}-wal`),
      mediaBytes: media.bytes,
      mediaFiles: media.files,
    },
    records: {
      users: count('SELECT COUNT(*) AS n FROM users'),
      activeSessions: count('SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?', [nowIso]),
      posts: count('SELECT COUNT(*) AS n FROM posts WHERE deleted_at IS NULL'),
      comments: count('SELECT COUNT(*) AS n FROM post_comments WHERE deleted_at IS NULL'),
      directMessages: count('SELECT COUNT(*) AS n FROM direct_messages'),
      quests: count('SELECT COUNT(*) AS n FROM quests'),
      focusSessions: count('SELECT COUNT(*) AS n FROM focus_sessions'),
      clubs: count('SELECT COUNT(*) AS n FROM clubs WHERE archived_at IS NULL'),
      duels: count('SELECT COUNT(*) AS n FROM challenges'),
      openReports: count("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
      openSupport: count("SELECT COUNT(*) AS n FROM support_requests WHERE status = 'open'"),
      auditEntries: count('SELECT COUNT(*) AS n FROM audit_log'),
      blockedLastDay: count("SELECT COUNT(*) AS n FROM audit_log WHERE event LIKE 'moderation.%' AND outcome = 'blocked' AND at > ?", [new Date(now - DAY).toISOString()]),
    },
    features,
    retention: { ...retention, lastSweep },
  }
}

/* --- product analytics ---------------------------------------------------------- */

const dayKey = (t) => new Date(t).toISOString().slice(0, 10)
const addDays = (day, n) => dayKey(Date.parse(`${day}T00:00:00Z`) + n * DAY)

const TREND_EVENTS = [
  ['quest_completed', 'Quests completed'],
  ['focus_completed', 'Focus sessions finished'],
  ['level_up', 'Level-ups'],
  ['challenge_created', 'Duels offered'],
  ['challenge_accepted', 'Duels accepted'],
  ['club_joined', 'Clubs joined'],
  ['club_challenge_completed', 'Club challenges completed'],
  ['post_created', 'Adventure Log posts'],
]

const RETENTION_WINDOWS = [
  { key: 'd1', label: 'Next day', from: 1, to: 1 },
  { key: 'w1', label: 'Week 1', from: 1, to: 7 },
  { key: 'w2', label: 'Week 2', from: 8, to: 14 },
  { key: 'w4', label: 'Week 4', from: 22, to: 28 },
]

let analyticsCache = { at: 0, data: null }

export function productAnalytics({ force = false, now = Date.now() } = {}) {
  if (!force && analyticsCache.data && now - analyticsCache.at < MINUTE) return analyticsCache.data
  const today = dayKey(now)
  const since30 = new Date(now - 30 * DAY).toISOString()

  // How far the accounts made in the last 30 days have got.
  const reached = (events) =>
    count(
      `SELECT COUNT(DISTINCT e.user_id) AS n FROM analytics_events e JOIN users u ON u.id = e.user_id
       WHERE u.created_at >= ? AND e.event IN (${events.map(() => '?').join(', ')})`,
      [since30, ...events],
    )
  const cohort = count('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', [since30])
  const funnel = [
    { key: 'signup', label: 'Created an account', count: cohort },
    { key: 'onboarding', label: 'Finished onboarding', count: reached(['onboarding_completed']) },
    { key: 'first_quest', label: 'Completed a first quest', count: reached(['first_quest']) },
    { key: 'first_focus', label: 'Finished a first focus session', count: reached(['first_focus_session']) },
    {
      key: 'returned',
      label: 'Came back on a later day',
      count: count(
        'SELECT COUNT(DISTINCT a.user_id) AS n FROM daily_active a JOIN users u ON u.id = a.user_id WHERE u.created_at >= ? AND a.day > substr(u.created_at, 1, 10)',
        [since30],
      ),
    },
    { key: 'social', label: 'Offered or accepted a duel, or joined a club', count: reached(['challenge_created', 'challenge_accepted', 'club_joined']) },
  ]

  const activeSince = (day) => count('SELECT COUNT(DISTINCT user_id) AS n FROM daily_active WHERE day >= ?', [day])
  const dau = count('SELECT COUNT(*) AS n FROM daily_active WHERE day = ?', [today])
  const wau = activeSince(addDays(today, -6))
  const mau = activeSince(addDays(today, -29))
  const weekOfDaily = count('SELECT COUNT(*) AS n FROM daily_active WHERE day >= ?', [addDays(today, -6)])
  const active = {
    dau,
    wau,
    mau,
    // Average daily actives over the week, as a share of monthly actives.
    stickiness: mau ? Math.round((weekOfDaily / 7 / mau) * 1000) / 10 : null,
  }

  // Retention by the week accounts were made, over the last eight weeks.
  const since56 = now - 56 * DAY
  const users = db.all('SELECT id, substr(created_at, 1, 10) AS day FROM users WHERE created_at >= ?', [new Date(since56).toISOString()])
  const activeDays = new Map()
  for (const row of db.all('SELECT user_id, day FROM daily_active WHERE day >= ?', [dayKey(since56)])) {
    if (!activeDays.has(row.user_id)) activeDays.set(row.user_id, new Set())
    activeDays.get(row.user_id).add(row.day)
  }
  const weekOf = (day) => {
    const date = new Date(`${day}T00:00:00Z`)
    return addDays(day, -((date.getUTCDay() + 6) % 7))
  }
  const byWeek = new Map()
  for (const user of users) {
    const week = weekOf(user.day)
    if (!byWeek.has(week)) byWeek.set(week, [])
    byWeek.get(week).push(user)
  }
  const cohorts = [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([week, members]) => ({
      week,
      size: members.length,
      windows: RETENTION_WINDOWS.map((w) => {
        // Only accounts whose whole window has passed are counted.
        const eligible = members.filter((m) => addDays(m.day, w.to) < today)
        const kept = eligible.filter((m) => {
          const days = activeDays.get(m.id)
          if (!days) return false
          for (let d = w.from; d <= w.to; d++) if (days.has(addDays(m.day, d))) return true
          return false
        })
        return { key: w.key, eligible: eligible.length, retained: kept.length, rate: eligible.length ? Math.round((kept.length / eligible.length) * 1000) / 10 : null }
      }),
    }))

  // What people did, day by day, over 30 days.
  const firstDay = addDays(today, -29)
  const days = Array.from({ length: 30 }, (_, i) => addDays(firstDay, i))
  const counts = new Map()
  for (const row of db.all(
    `SELECT day, event, COUNT(*) AS n FROM analytics_events WHERE day >= ? AND event IN (${TREND_EVENTS.map(() => '?').join(', ')}) GROUP BY day, event`,
    [firstDay, ...TREND_EVENTS.map(([e]) => e)],
  )) {
    counts.set(`${row.event}|${row.day}`, row.n)
  }
  const trends = TREND_EVENTS.map(([event, label]) => {
    const series = days.map((day) => ({ day, n: counts.get(`${event}|${day}`) ?? 0 }))
    return { event, label, total: series.reduce((sum, d) => sum + d.n, 0), series }
  })

  const data = { generatedAt: new Date(now).toISOString(), cohortDays: 30, funnel, active, retention: { windows: RETENTION_WINDOWS.map(({ key, label }) => ({ key, label })), cohorts }, trends }
  analyticsCache = { at: now, data }
  return data
}
