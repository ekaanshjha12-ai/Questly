import { db } from './db.js'
import { levelFromXp } from './statecheck.js'

/**
 * Aggregates the admin dashboards.
 *
 * Almost everything the console shows — XP, levels, streaks, goals, sessions,
 * decks — lives inside each user's state document rather than in columns, so
 * these figures come from parsing every row and folding them together. That is
 * fine at this scale and would not be past a few thousand accounts; at that
 * point the counters worth charting should be denormalised as they are written.
 *
 * Results are cached briefly because a dashboard refresh should not re-parse
 * every account on every panel.
 */

const CACHE_MS = 30_000
let cache = { at: 0, data: null }

const RANKS = [
  ['heisenberg', 40], ['god', 30], ['celestial', 24], ['king', 18],
  ['monarch', 14], ['champion', 10], ['knight', 6], ['soldier', 3], ['recruit', 1],
]

function rankForLevel(level) {
  for (const [id, min] of RANKS) if (level >= min) return id
  return 'recruit'
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

/** Everything derivable from one user's state document. */
function readState(raw) {
  let s
  try {
    s = JSON.parse(raw)
  } catch {
    return null
  }
  const xp = Number(s?.player?.xp) || 0
  const sessions = Array.isArray(s?.sessions) ? s.sessions : []
  const quests = Array.isArray(s?.quests) ? s.quests : []
  const goals = Array.isArray(s?.goals) ? s.goals : []
  const decks = Array.isArray(s?.decks) ? s.decks : []

  return {
    name: String(s?.player?.name ?? '').slice(0, 60),
    xp,
    coins: Number(s?.player?.coins) || 0,
    // Recomputed rather than trusted: the stored level is client-written.
    level: levelFromXp(xp),
    claimedLevel: Number(s?.progression?.level) || 1,
    streak: Number(s?.streak?.current) || 0,
    longestStreak: Number(s?.streak?.longest) || 0,
    hero: s?.collection?.active ?? null,
    goals: goals.filter((g) => !g?.archived),
    archivedGoals: goals.filter((g) => g?.archived).length,
    questsCompleted: quests.filter((q) => q?.completed).length,
    questsVerified: quests.filter((q) => q?.verifiedBy).length,
    questsTotal: quests.length,
    todosDone: (Array.isArray(s?.todos) ? s.todos : []).filter((t) => t?.done).length,
    focusMs: sessions.reduce((sum, x) => sum + Math.max(0, Number(x?.durationMs) || 0), 0),
    focusSessions: sessions.length,
    decks,
    cardCount: decks.reduce((sum, d) => sum + (Array.isArray(d?.cards) ? d.cards.length : 0), 0),
    outlook: Number(s?.outlook?.probability),
    reports: Array.isArray(s?.reports) ? s.reports.length : 0,
  }
}

export function computeAdminStats({ force = false } = {}) {
  if (!force && cache.data && Date.now() - cache.at < CACHE_MS) return cache.data

  const users = db.all(`
    SELECT u.id, u.email, u.role, u.disabled, u.mfa_enabled, u.created_at, u.max_xp,
           s.data AS state, s.updated_at AS state_updated
    FROM users u LEFT JOIN states s ON s.user_id = u.id
  `)

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
  let withState = 0

  const rows = []

  for (const u of users) {
    const parsed = u.state ? readState(u.state) : null
    if (parsed) {
      withState++
      totalXp += parsed.xp
      highestLevel = Math.max(highestLevel, parsed.level)
      streakSum += parsed.streak
      focusMsSum += parsed.focusMs
      sessionSum += parsed.focusSessions
      deckSum += parsed.decks.length
      cardSum += parsed.cardCount
      questsCompleted += parsed.questsCompleted
      questsTotal += parsed.questsTotal
      goalsActive += parsed.goals.length
      if (Number.isFinite(parsed.outlook)) {
        outlookSum += parsed.outlook
        outlookCount++
      }
      if (parsed.hero) heroes.set(parsed.hero, (heroes.get(parsed.hero) ?? 0) + 1)
      else heroes.set('(starter)', (heroes.get('(starter)') ?? 0) + 1)

      for (const g of parsed.goals) {
        const title = String(g?.title ?? '').trim().slice(0, 80)
        if (title) goalTitles.set(title, (goalTitles.get(title) ?? 0) + 1)
        const cat = String(g?.category ?? 'general')
        goalCategories.set(cat, (goalCategories.get(cat) ?? 0) + 1)
      }
      for (const d of parsed.decks) {
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
      lastSeen: u.state_updated ?? null,
      name: parsed?.name ?? null,
      xp: parsed?.xp ?? 0,
      coins: parsed?.coins ?? 0,
      level: parsed?.level ?? 1,
      rank: rankForLevel(parsed?.level ?? 1),
      streak: parsed?.streak ?? 0,
      successProbability: Number.isFinite(parsed?.outlook) ? parsed.outlook : null,
      goals: (parsed?.goals ?? []).map((g) => String(g?.title ?? '').slice(0, 80)).filter(Boolean),
      questsCompleted: parsed?.questsCompleted ?? 0,
      questsVerified: parsed?.questsVerified ?? 0,
      focusHours: Math.round(((parsed?.focusMs ?? 0) / 3600000) * 10) / 10,
      // No subscription system exists yet, so this is reported as absent rather
      // than invented. It becomes real the day payments land.
      subscription: null,
    })
  }

  // --- activity, from sources the client cannot write -----------------------
  const activeToday = db.get(
    'SELECT COUNT(DISTINCT user_id) AS n FROM states WHERE substr(updated_at, 1, 10) = ?',
    [now],
  )?.n ?? 0
  const dau = activeToday
  const mau = db.get(
    'SELECT COUNT(DISTINCT user_id) AS n FROM states WHERE substr(updated_at, 1, 10) >= ?',
    [d30],
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
    'SELECT substr(updated_at, 1, 10) AS day, COUNT(DISTINCT user_id) AS n FROM states WHERE substr(updated_at, 1, 10) >= ? GROUP BY day ORDER BY day',
    [d30],
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
    `SELECT COUNT(DISTINCT s.user_id) AS n FROM states s JOIN users u ON u.id = s.user_id
     WHERE substr(u.created_at, 1, 10) < ? AND substr(s.updated_at, 1, 10) >= ?`,
    [since, since],
  )?.n ?? 0
  return Math.round((returned / eligible) * 1000) / 10
}

export function invalidateAdminStats() {
  cache = { at: 0, data: null }
}

export { dayKey }
