import { db } from './db.js'
import { levelFromXp, rankForLevel as rankFor } from './game/levels.js'

/**
 * Aggregates the admin dashboards.
 *
 * Progress — XP, coins, level, streak, quests, focus time, what each hero
 * wears — comes from the server's own game tables. Notebook data — goals,
 * decks, outlooks — still lives in each player's document and is parsed here.
 * Fine at this scale; past a few thousand accounts the notebook counters
 * worth charting should be denormalised as they are written.
 *
 * Results are cached briefly because a dashboard refresh should not re-parse
 * every account on every panel.
 */

const CACHE_MS = 30_000
let cache = { at: 0, data: null }

function rankForLevel(level) {
  return rankFor(level).id
}

const dayKey = (d) => new Date(d).toISOString().slice(0, 10)
const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

function topOf(counter, limit = 8) {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))
}

/** Notebook data from one player's document. */
function readNotebook(raw) {
  let s
  try {
    s = JSON.parse(raw)
  } catch {
    return null
  }
  const goals = Array.isArray(s?.goals) ? s.goals : []
  const decks = Array.isArray(s?.decks) ? s.decks : []
  return {
    name: String(s?.player?.name ?? '').slice(0, 60),
    goals: goals.filter((g) => !g?.archived),
    archivedGoals: goals.filter((g) => g?.archived).length,
    decks,
    cardCount: decks.reduce((sum, d) => sum + (Array.isArray(d?.cards) ? d.cards.length : 0), 0),
    outlook: Number(s?.outlook?.probability),
    reports: Array.isArray(s?.reports) ? s.reports.length : 0,
  }
}

/** A table that belongs to a feature not yet created reads as empty. */
function safeAll(sql, params = []) {
  try {
    return db.all(sql, params)
  } catch {
    return []
  }
}

export function computeAdminStats({ force = false } = {}) {
  if (!force && cache.data && Date.now() - cache.at < CACHE_MS) return cache.data

  const users = db.all(`
    SELECT u.id, u.email, u.role, u.disabled, u.mfa_enabled, u.created_at, u.display_name,
           s.data AS state, s.updated_at AS state_updated,
           p.xp, p.coins, p.streak_current, p.streak_longest, p.updated_at AS progress_updated
    FROM users u
    LEFT JOIN states s ON s.user_id = u.id
    LEFT JOIN player_progress p ON p.user_id = u.id
  `)
  const questCounts = new Map(
    safeAll(
      `SELECT user_id, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verified, COUNT(*) AS total
       FROM quests GROUP BY user_id`,
    ).map((r) => [r.user_id, r]),
  )
  const focusCounts = new Map(
    safeAll(
      `SELECT user_id, COUNT(*) AS sessions, COALESCE(SUM(active_ms), 0) AS ms FROM focus_sessions
       WHERE status IN ('completed', 'ended') GROUP BY user_id`,
    ).map((r) => [r.user_id, r]),
  )
  const worn = new Map(safeAll("SELECT user_id, item_id FROM user_equipment WHERE slot = 'special'").map((r) => [r.user_id, r.item_id]))

  const now = today()
  const d7 = daysAgo(7)
  const d30 = daysAgo(30)

  const heroes = new Map()
  const goalTitles = new Map()
  const goalCategories = new Map()
  const subjects = new Map()

  let totalXp = 0
  let highestLevel = 0
  let streakSum = 0
  let focusMsSum = 0
  let sessionSum = 0
  let deckSum = 0
  let cardSum = 0
  let outlookSum = 0
  let outlookCount = 0
  let questsCompleted = 0
  let questsTotal = 0
  let goalsActive = 0
  let players = 0

  const rows = []

  for (const u of users) {
    const notebook = u.state ? readNotebook(u.state) : null
    const xp = u.xp ?? 0
    const level = levelFromXp(xp)
    const quests = questCounts.get(u.id)
    const focus = focusCounts.get(u.id)
    const hasProgress = u.xp !== null && u.xp !== undefined

    if (hasProgress || notebook) {
      players++
      totalXp += xp
      highestLevel = Math.max(highestLevel, level)
      streakSum += u.streak_current ?? 0
      focusMsSum += focus?.ms ?? 0
      sessionSum += focus?.sessions ?? 0
      questsCompleted += quests?.completed ?? 0
      questsTotal += quests?.total ?? 0
      const hero = worn.get(u.id) ?? '(starter)'
      heroes.set(hero, (heroes.get(hero) ?? 0) + 1)
    }
    if (notebook) {
      deckSum += notebook.decks.length
      cardSum += notebook.cardCount
      goalsActive += notebook.goals.length
      if (Number.isFinite(notebook.outlook)) {
        outlookSum += notebook.outlook
        outlookCount++
      }
      for (const g of notebook.goals) {
        const title = String(g?.title ?? '').trim().slice(0, 80)
        if (title) goalTitles.set(title, (goalTitles.get(title) ?? 0) + 1)
        const cat = String(g?.category ?? 'general')
        goalCategories.set(cat, (goalCategories.get(cat) ?? 0) + 1)
      }
      for (const d of notebook.decks) {
        const topic = String(d?.topic ?? '').trim().slice(0, 80)
        if (topic) subjects.set(topic, (subjects.get(topic) ?? 0) + 1)
      }
    }

    const lastLogin = db.get(
      "SELECT at FROM audit_log WHERE user_id = ? AND event = 'auth.login' AND outcome = 'success' ORDER BY id DESC LIMIT 1",
      [u.id],
    )?.at ?? null

    rows.push({
      id: u.id,
      email: u.email,
      role: u.role ?? 'user',
      disabled: Boolean(u.disabled),
      mfaEnabled: Boolean(u.mfa_enabled),
      joinedAt: u.created_at,
      lastLogin,
      lastSeen: [u.state_updated, u.progress_updated].filter(Boolean).sort().pop() ?? null,
      name: u.display_name ?? notebook?.name ?? null,
      xp,
      coins: u.coins ?? 0,
      level,
      rank: rankForLevel(level),
      streak: u.streak_current ?? 0,
      successProbability: Number.isFinite(notebook?.outlook) ? notebook.outlook : null,
      goals: (notebook?.goals ?? []).map((g) => String(g?.title ?? '').slice(0, 80)).filter(Boolean),
      questsCompleted: quests?.completed ?? 0,
      questsVerified: quests?.verified ?? 0,
      focusHours: Math.round(((focus?.ms ?? 0) / 3600000) * 10) / 10,
      // No subscription system exists yet, so this is reported as absent rather
      // than invented. It becomes real the day payments land.
      subscription: null,
    })
  }
  const withState = players

  // --- activity, from sources the client cannot write -----------------------
  // An account counts as active on a day it saved its notebook or touched the
  // game (daily_active), whichever it did.
  const activeToday = db.get(
    'SELECT COUNT(*) AS n FROM (SELECT user_id FROM daily_active WHERE day = ? UNION SELECT user_id FROM states WHERE substr(updated_at, 1, 10) = ?)',
    [now, now],
  )?.n ?? 0
  const dau = activeToday
  const mau = db.get(
    'SELECT COUNT(*) AS n FROM (SELECT user_id FROM daily_active WHERE day >= ? UNION SELECT user_id FROM states WHERE substr(updated_at, 1, 10) >= ?)',
    [d30, d30],
  )?.n ?? 0
  const newToday = db.get('SELECT COUNT(*) AS n FROM users WHERE substr(created_at, 1, 10) = ?', [now])?.n ?? 0

  const proofsToday = db.all(
    'SELECT kind, COUNT(*) AS n FROM photo_proofs WHERE substr(created_at, 1, 10) = ? GROUP BY kind',
    [now],
  )
  const photosToday = proofsToday.find((r) => r.kind === 'photo')?.n ?? 0
  const voiceToday = proofsToday.find((r) => r.kind === 'voice')?.n ?? 0

  // --- AI usage ------------------------------------------------------------
  const aiToday = db.get(
    'SELECT COUNT(*) AS n, SUM(cost_usd) AS cost, AVG(duration_ms) AS avg_ms, SUM(1 - ok) AS failed FROM ai_usage WHERE day = ?',
    [now],
  ) ?? {}
  const aiMonth = db.get(
    "SELECT COUNT(*) AS n, SUM(cost_usd) AS cost FROM ai_usage WHERE substr(day, 1, 7) = ?",
    [now.slice(0, 7)],
  ) ?? {}
  const aiAll = db.get('SELECT COUNT(*) AS n, SUM(1 - ok) AS failed, AVG(duration_ms) AS avg_ms FROM ai_usage') ?? {}
  const aiByEndpoint = db.all(
    'SELECT endpoint, COUNT(*) AS n, SUM(cost_usd) AS cost FROM ai_usage GROUP BY endpoint ORDER BY n DESC LIMIT 12',
  )

  // --- series for the graphs ----------------------------------------------
  const signups = db.all(
    'SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM users WHERE substr(created_at, 1, 10) >= ? GROUP BY day ORDER BY day',
    [d30],
  )
  const activeSeries = db.all(
    `SELECT day, COUNT(DISTINCT user_id) AS n FROM (
       SELECT user_id, day FROM daily_active WHERE day >= ?
       UNION SELECT user_id, substr(updated_at, 1, 10) AS day FROM states WHERE substr(updated_at, 1, 10) >= ?
     ) GROUP BY day ORDER BY day`,
    [d30, d30],
  )
  const aiSeries = db.all(
    'SELECT day, COUNT(*) AS n, SUM(cost_usd) AS cost FROM ai_usage WHERE day >= ? GROUP BY day ORDER BY day',
    [d30],
  )
  const verifySeries = db.all(
    'SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM photo_proofs WHERE substr(created_at, 1, 10) >= ? GROUP BY day ORDER BY day',
    [d30],
  )

  const verifyAttempts = db.get('SELECT SUM(count) AS n FROM verify_usage')?.n ?? 0
  const verifyAccepted = db.get('SELECT COUNT(*) AS n FROM photo_proofs')?.n ?? 0

  const data = {
    generatedAt: new Date().toISOString(),
    live: {
      totalUsers: users.length,
      activeToday,
      dau,
      mau,
      newToday,
      photosToday,
      voiceToday,
      aiRequestsToday: aiToday.n ?? 0,
      // Reported as null, not zero: there is no billing system, and a zero
      // would read as "nobody is paying" rather than "not built".
      mrr: null,
      activeSubscribers: null,
    },
    gamification: {
      totalXp,
      highestLevel,
      averageStreak: withState ? Math.round((streakSum / withState) * 10) / 10 : 0,
      mostUsedHero: topOf(heroes, 10),
      top100: [...rows].sort((a, b) => b.xp - a.xp).slice(0, 100).map((r, i) => ({
        position: i + 1,
        email: r.email,
        name: r.name,
        xp: r.xp,
        level: r.level,
        rank: r.rank,
        streak: r.streak,
      })),
    },
    study: {
      averageStudyHours: withState ? Math.round((focusMsSum / withState / 3600000) * 10) / 10 : 0,
      totalStudyHours: Math.round((focusMsSum / 3600000) * 10) / 10,
      averageSessions: withState ? Math.round((sessionSum / withState) * 10) / 10 : 0,
      totalSessions: sessionSum,
      totalDecks: deckSum,
      totalCards: cardSum,
      popularSubjects: topOf(subjects, 12),
    },
    goals: {
      activeGoals: goalsActive,
      questsCompleted,
      questsTotal,
      questCompletionRate: questsTotal ? Math.round((questsCompleted / questsTotal) * 1000) / 10 : 0,
      averageSuccessProbability: outlookCount ? Math.round(outlookSum / outlookCount) : null,
      analysedAccounts: outlookCount,
      commonGoals: topOf(goalTitles, 12),
      categories: topOf(goalCategories, 12),
    },
    ai: {
      totalRequests: aiAll.n ?? 0,
      failedRequests: aiAll.failed ?? 0,
      averageResponseMs: Math.round(aiAll.avg_ms ?? 0),
      averageResponseMsToday: Math.round(aiToday.avg_ms ?? 0),
      failedToday: aiToday.failed ?? 0,
      costToday: Math.round((aiToday.cost ?? 0) * 10000) / 10000,
      costThisMonth: Math.round((aiMonth.cost ?? 0) * 10000) / 10000,
      requestsThisMonth: aiMonth.n ?? 0,
      byEndpoint: aiByEndpoint.map((r) => ({
        endpoint: r.endpoint,
        count: r.n,
        cost: Math.round((r.cost ?? 0) * 10000) / 10000,
      })),
    },
    analytics: {
      signups,
      activeUsers: activeSeries,
      aiUsage: aiSeries.map((r) => ({ day: r.day, n: r.n, cost: Math.round((r.cost ?? 0) * 10000) / 10000 })),
      verifications: verifySeries,
      verificationRate: verifyAttempts ? Math.round((verifyAccepted / verifyAttempts) * 1000) / 10 : null,
      retention7d: retention(d7),
      // Both need a billing system before they can mean anything.
      subscriptionConversion: null,
      churnRate: null,
    },
    users: rows,
  }

  cache = { at: Date.now(), data }
  return data
}

/**
 * Share of accounts created before the window that were still active inside it.
 * A blunt measure, but an honest one, and it needs no extra tables.
 */
function retention(since) {
  const eligible = db.get('SELECT COUNT(*) AS n FROM users WHERE substr(created_at, 1, 10) < ?', [since])?.n ?? 0
  if (!eligible) return null
  const returned = db.get(
    `SELECT COUNT(DISTINCT a.user_id) AS n FROM (
       SELECT user_id, day FROM daily_active WHERE day >= ?
       UNION SELECT user_id, substr(updated_at, 1, 10) AS day FROM states WHERE substr(updated_at, 1, 10) >= ?
     ) a JOIN users u ON u.id = a.user_id WHERE substr(u.created_at, 1, 10) < ?`,
    [since, since, since],
  )?.n ?? 0
  return Math.round((returned / eligible) * 1000) / 10
}

export function invalidateAdminStats() {
  cache = { at: 0, data: null }
}

export { dayKey }
