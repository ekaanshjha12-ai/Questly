import type { AppState, QuestPool, SuccessOutlook } from '../types'

export interface AuthUser {
  id: string
  email: string
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    // Session lives in an httpOnly cookie, so it must ride along on every call.
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })

  if (res.status === 204) return undefined as T

  const text = await res.text()
  // A proxy or crash page can return HTML even from an API path. Parsing
  // defensively turns that into a readable error instead of a SyntaxError.
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      if (!res.ok) throw new ApiError(`Server error (${res.status})`, res.status)
      throw new ApiError('The server sent an unexpected response.', res.status)
    }
  }

  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${res.status})`
    throw new ApiError(message, res.status)
  }

  return payload as T
}

export function authConfig() {
  return request<{ inviteRequired: boolean }>('/api/auth/config')
}

export function signup(email: string, password: string, inviteCode?: string) {
  return request<{ user: AuthUser; recoveryCode: string }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, inviteCode }),
  })
}

export function resetPassword(email: string, code: string, password: string) {
  return request<{ ok: true }>('/api/auth/reset', {
    method: 'POST',
    body: JSON.stringify({ email, code, password }),
  })
}

/** `mfaCode` is only sent on the second attempt: the server answers the first
 * with `mfa_required` when the account has a second factor, and the form then
 * asks for it. */
export function login(email: string, password: string, mfaCode?: string) {
  return request<{ user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, mfaCode }),
  })
}

export function logout() {
  return request<void>('/api/auth/logout', { method: 'POST' })
}

export function me() {
  return request<{ user: AuthUser }>('/api/me')
}

export function fetchState() {
  return request<{ state: AppState | null; version: number }>('/api/state')
}

export interface Verdict {
  verified: boolean
  confidence: number
  reason: string
}

export function verifyStatus() {
  return request<{ configured: boolean; limit: number; remaining: number }>('/api/verify/status')
}

export function verifyTask(
  payload:
    | {
        kind: 'photo'
        taskTitle: string
        imageBase64: string
        mediaType: string
        capturedAt: number | null
      }
    | { kind: 'voice'; taskTitle: string; transcript: string },
) {
  return request<Verdict>('/api/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function generateQuestPool(goal: { title: string; detail?: string; category: string }) {
  return request<{ pool: QuestPool }>('/api/goals/quests', {
    method: 'POST',
    body: JSON.stringify(goal),
  })
}

export interface SubtopicSuggestion {
  title: string
  blurb: string
}

export function suggestSubtopics(topic: string) {
  return request<{ subtopics: SubtopicSuggestion[] }>('/api/flashcards/subtopics', {
    method: 'POST',
    body: JSON.stringify({ topic }),
  })
}

export function writeCards(topic: string, subtopics: string[]) {
  return request<{ cards: { front: string; back: string; subtopic?: string }[] }>('/api/flashcards/cards', {
    method: 'POST',
    body: JSON.stringify({ topic, subtopics }),
  })
}

export interface ProbeQuestion {
  question: string
  probing: string
}

export interface ReportBody {
  score: number
  verdict: string
  strengths: string[]
  gaps: string[]
  misconceptions: string[]
  nextSteps: string[]
}

export function askExplainQuestions(topic: string, explanation: string) {
  return request<{ questions: ProbeQuestion[] }>('/api/explain/questions', {
    method: 'POST',
    body: JSON.stringify({ topic, explanation }),
  })
}

export function requestExplainReport(
  topic: string,
  explanation: string,
  answers: { question: string; answer: string }[],
) {
  return request<{ report: ReportBody }>('/api/explain/report', {
    method: 'POST',
    body: JSON.stringify({ topic, explanation, answers }),
  })
}

export interface PlanDailyItem {
  title: string
  dayOffset: number
  block: string
}

export interface PlanDatedItem {
  title: string
  dayOffset: number
}

export interface GeneratedPlan {
  todos: string[]
  daily: PlanDailyItem[]
  weekly: PlanDatedItem[]
  monthly: PlanDatedItem[]
}

/** A reference file, base64-encoded. Sent with the request and never stored —
 * the server decodes it, passes it to the model, and drops it. */
export interface PlanDocument {
  name: string
  mediaType: string
  data: string
}

export function askPlannerQuestions(goal: string, detail?: string, documents: PlanDocument[] = []) {
  return request<{ questions: string[] }>('/api/planner/questions', {
    method: 'POST',
    body: JSON.stringify({ goal, detail, documents }),
  })
}

export function generatePlan(
  goal: string,
  detail: string | undefined,
  answers: { question: string; answer: string }[],
  documents: PlanDocument[] = [],
) {
  return request<{ plan: GeneratedPlan }>('/api/planner/plan', {
    method: 'POST',
    body: JSON.stringify({ goal, detail, answers, documents }),
  })
}

export function analyseOutlook(
  stats: Record<string, number | null>,
  goals: {
    title: string
    category: string
    detail?: string
    ageDays: number
    questsCompleted: number
    questsVerified: number
    focusMinutes: number
  }[],
) {
  return request<{ outlook: Omit<SuccessOutlook, 'createdAt'> }>('/api/progress/outlook', {
    method: 'POST',
    body: JSON.stringify({ stats, goals }),
  })
}

export function saveState(state: AppState) {
  return request<{ version: number; updatedAt: string }>('/api/state', {
    method: 'PUT',
    body: JSON.stringify({ state }),
  })
}

export interface TourStep {
  id: string
  title: string
  body: string
}

export interface Tour {
  opening: string
  steps: TourStep[]
  closing: string
  generated: boolean
}

/** Always resolves to a usable tour — the server falls back to a plainer one
 * rather than failing, since this is the first thing a new account sees. */
export function fetchTour(name: string, goals: { title: string; category: string; detail?: string }[]) {
  return request<{ tour: Tour }>('/api/tour', {
    method: 'POST',
    body: JSON.stringify({ name, goals }),
  })
}

// --- admin setup -----------------------------------------------------------

export interface SetupInfo {
  email: string
  role: string
  minPassword: number
}

export function fetchSetupInfo(token: string) {
  return request<SetupInfo>(`/api/admin/setup/${encodeURIComponent(token)}`)
}

export function fetchSetupSecret(token: string) {
  return request<{ secret: string; otpauth: string }>(
    `/api/admin/setup/${encodeURIComponent(token)}/secret`,
  )
}

export function completeSetup(token: string, password: string, secret: string, mfaCode: string) {
  return request<{ ok: true; recoveryCode: string; backupCodes: string[] }>(
    `/api/admin/setup/${encodeURIComponent(token)}`,
    { method: 'POST', body: JSON.stringify({ password, secret, mfaCode }) },
  )
}

// --- admin console ---------------------------------------------------------

export interface AdminUserRow {
  id: string
  email: string
  role: string
  disabled: boolean
  mfaEnabled: boolean
  joinedAt: string
  lastLogin: string | null
  lastSeen: string | null
  name: string | null
  xp: number
  coins: number
  level: number
  rank: string
  streak: number
  successProbability: number | null
  goals: string[]
  questsCompleted: number
  questsVerified: number
  focusHours: number
  subscription: null
}

export interface AdminStats {
  generatedAt: string
  live: Record<string, number | null>
  gamification: {
    totalXp: number
    highestLevel: number
    averageStreak: number
    mostUsedHero: { name: string; count: number }[]
    top100: { position: number; email: string; name: string | null; xp: number; level: number; rank: string; streak: number }[]
  }
  study: {
    averageStudyHours: number
    totalStudyHours: number
    averageSessions: number
    totalSessions: number
    totalDecks: number
    totalCards: number
    popularSubjects: { name: string; count: number }[]
  }
  goals: {
    activeGoals: number
    questsCompleted: number
    questsTotal: number
    questCompletionRate: number
    averageSuccessProbability: number | null
    analysedAccounts: number
    commonGoals: { name: string; count: number }[]
    categories: { name: string; count: number }[]
  }
  ai: {
    totalRequests: number
    failedRequests: number
    averageResponseMs: number
    averageResponseMsToday: number
    failedToday: number
    costToday: number
    costThisMonth: number
    requestsThisMonth: number
    byEndpoint: { endpoint: string; count: number; cost: number }[]
  }
  analytics: {
    signups: { day: string; n: number }[]
    activeUsers: { day: string; n: number }[]
    aiUsage: { day: string; n: number; cost: number }[]
    verifications: { day: string; n: number }[]
    verificationRate: number | null
    retention7d: number | null
    subscriptionConversion: null
    churnRate: null
  }
  users: AdminUserRow[]
}

export function fetchAdminStats(force = false) {
  return request<AdminStats>(`/api/admin/stats${force ? '?force=1' : ''}`)
}

export function adminSetDisabled(id: string, disabled: boolean) {
  return request<{ ok: true }>(`/api/admin/users/${id}/disabled`, {
    method: 'POST',
    body: JSON.stringify({ disabled }),
  })
}

export function adminSuspend(id: string, days: number | null) {
  return request<{ ok: true; until: string | null }>(`/api/admin/users/${id}/suspend`, {
    method: 'POST',
    body: JSON.stringify(days === null ? { until: null } : { days }),
  })
}

export function adminGrantXp(id: string, delta: number) {
  return request<{ ok: true; xp: number; coins: number }>(`/api/admin/users/${id}/xp`, {
    method: 'POST',
    body: JSON.stringify({ delta }),
  })
}

export function adminResetLink(id: string) {
  return request<{ ok: true; path: string; expiresInMinutes: number }>(
    `/api/admin/users/${id}/reset-link`,
    { method: 'POST', body: JSON.stringify({}) },
  )
}

export function adminSetRole(id: string, role: string) {
  return request<{ ok: true }>(`/api/admin/users/${id}/role`, {
    method: 'POST',
    body: JSON.stringify({ role }),
  })
}

export function adminDeleteUser(id: string) {
  return request<void>(`/api/admin/users/${id}`, { method: 'DELETE' })
}

export function fetchAudit(limit = 100) {
  return request<{ entries: { id: number; at: string; email: string | null; event: string; outcome: string; ip: string | null; detail: string | null }[] }>(
    `/api/admin/audit?limit=${limit}`,
  )
}

// --- leaderboard -----------------------------------------------------------

export interface BoardRow {
  position: number
  name: string
  xp: number
  you?: boolean
}

export function fetchLeaderboard() {
  return request<{ top: BoardRow[]; me: BoardRow | null; total: number; hidden: boolean }>('/api/leaderboard')
}

export function setLeaderboardVisibility(hidden: boolean) {
  return request<{ ok: true; hidden: boolean }>('/api/leaderboard/visibility', {
    method: 'POST',
    body: JSON.stringify({ hidden }),
  })
}
