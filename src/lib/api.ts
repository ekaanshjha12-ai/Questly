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

export function login(email: string, password: string) {
  return request<{ user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
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

export function askPlannerQuestions(goal: string, detail?: string) {
  return request<{ questions: string[] }>('/api/planner/questions', {
    method: 'POST',
    body: JSON.stringify({ goal, detail }),
  })
}

export function generatePlan(goal: string, detail: string | undefined, answers: { question: string; answer: string }[]) {
  return request<{ plan: GeneratedPlan }>('/api/planner/plan', {
    method: 'POST',
    body: JSON.stringify({ goal, detail, answers }),
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
