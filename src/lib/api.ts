import type { AppState, GoalCategory, PlanItem, QuestPeriod, QuestPool, SuccessOutlook } from '../types'

export interface AuthUser {
  id: string
  email: string
  /** Everything below comes from the server. A user recalled from this
   * device's cache for an offline start has only id and email, so these are
   * optional and "unknown" must not be read as "missing". */
  username?: string | null
  displayName?: string | null
  /** `YYYY-MM-DD`. */
  birthdate?: string | null
  bio?: string | null
  /** Changes whenever the picture does; null when there is none. */
  avatarVersion?: string | null
  profileComplete?: boolean
  challengesOpen?: boolean
  /** Under-18 accounts only: whether adults may message and challenge them. */
  adultMessages?: boolean
}

export class ApiError extends Error {
  status: number
  /** Machine-readable reason, when the server gives one — `underage`,
   * `username_taken` and so on — so the UI can act on it rather than parse
   * the message. */
  code: string | null
  /** Which input the server objected to, when it says — so a form can put the
   * message beside the right field. */
  field: string | null
  constructor(message: string, status: number, code: string | null = null, field: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.field = field
  }
}

/** The device's IANA timezone, so the server can turn days over at the
 * player's own midnight. */
function timezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {}
  if (init?.body) headers['Content-Type'] = 'application/json'
  const tz = timezone()
  if (tz) headers['X-Timezone'] = tz
  const res = await fetch(path, {
    // Session lives in an httpOnly cookie, so it must ride along on every call.
    credentials: 'same-origin',
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
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
    const body =
      payload && typeof payload === 'object' ? (payload as { error?: unknown; code?: unknown; field?: unknown }) : {}
    const message = body.error !== undefined ? String(body.error) : `Request failed (${res.status})`
    throw new ApiError(
      message,
      res.status,
      typeof body.code === 'string' ? body.code : null,
      typeof body.field === 'string' ? body.field : null,
    )
  }

  return payload as T
}

export function authConfig() {
  return request<{ inviteRequired: boolean }>('/api/auth/config')
}

export interface SignupInput {
  email: string
  password: string
  inviteCode?: string
  name: string
  username: string
  birthdate: string
  bio?: string
}

export function signup(input: SignupInput) {
  return request<{ user: AuthUser; recoveryCode: string }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function checkUsername(username: string) {
  return request<{ available: boolean; error: string | null }>(
    `/api/auth/username?u=${encodeURIComponent(username)}`,
  )
}

export function updateProfile(fields: { name?: string; username?: string; birthdate?: string; bio?: string }) {
  return request<{ user: AuthUser }>('/api/me/profile', {
    method: 'PUT',
    body: JSON.stringify(fields),
  })
}

export function uploadAvatar(imageBase64: string, mediaType: string) {
  return request<{ avatarVersion: string }>('/api/me/avatar', {
    method: 'PUT',
    body: JSON.stringify({ imageBase64, mediaType }),
  })
}

/** Versioned, so a new picture is a new URL and the old one can be cached
 * indefinitely. */
export function avatarUrl(version: string | null | undefined): string | null {
  return version ? `/api/me/avatar?v=${encodeURIComponent(version)}` : null
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

/** Deletes the account and everything in it. Needs the current password. */
export function deleteAccount(password: string) {
  return request<void>('/api/account/delete', { method: 'POST', body: JSON.stringify({ password }) })
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
  payload: (
    | {
        kind: 'photo'
        taskTitle: string
        imageBase64: string
        mediaType: string
        capturedAt: number | null
      }
    | { kind: 'voice'; taskTitle: string; transcript: string }
  ) & { questId?: string },
) {
  return request<Verdict & { quest?: GameQuest; rewards?: RewardSummary; questError?: string }>('/api/verify', {
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

/** A goal's written quests arrived: swap today's untouched quests for them. */
export function refreshGoalQuests(goalId: string) {
  return request<{ ok: true }>('/api/quests/refresh-goal', { method: 'POST', body: JSON.stringify({ goalId }) })
}

export function saveState(state: AppState) {
  return request<{ version: number; updatedAt: string; rewards: RewardSummary | null }>('/api/state', {
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

/** `secret` and `mfaCode` are accepted by the server but not sent: a second
 * factor is optional, and this deployment has no device to run one on. */
export function completeSetup(token: string, password: string) {
  return request<{ ok: true; recoveryCode: string; backupCodes: string[] }>(
    `/api/admin/setup/${encodeURIComponent(token)}`,
    { method: 'POST', body: JSON.stringify({ password }) },
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
  /** Derived server-side from XP, so it reveals nothing the XP figure does not. */
  rank: string
  you?: boolean
  /** Present only when this viewer may open the player's card. */
  username?: string | null
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

/* --- players and challenges ---------------------------------------------- */

/** Another player, as the server lets you see them. */
export interface PlayerSummary {
  username: string
  name: string
  xp: number
  level: number
  rank: string
  avatarVersion: string | null
  /** How their character looks: base appearance and what they wear. */
  look?: Look
}

export interface PublicPlayer extends PlayerSummary {
  /** Always shown on the card. */
  age: number | null
  bio: string | null
  joined: string
  card: import('../types').CardDesign | null
  record: { completed: number; finished: number }
  canChallenge: boolean
  challengeNote: string | null
}

/** Every state a challenge can be in. `draft` only ever exists on this device,
 * while an offer is being written; `due` is momentary, between the end of a
 * challenge and the server settling it. */
export type ChallengeStatus =
  | 'draft'
  | 'pending'
  | 'accepted'
  | 'active'
  | 'due'
  | 'completed'
  | 'rejected'
  | 'expired'
  | 'cancelled'

export interface ChallengeCheckin {
  side: 'creator' | 'opponent'
  day: number
  note: string | null
  at: string
}

export interface Challenge {
  id: string
  role: 'creator' | 'opponent'
  status: ChallengeStatus
  name: string
  objective: string
  rules: string
  terms: string
  durationDays: number
  rewardXp: number
  proof: 'required' | 'optional'
  minCheckins: number
  startMode: 'accept' | 'date'
  createdAt: string
  expiresAt: string
  respondedAt: string | null
  startsAt: string | null
  endsAt: string | null
  completedAt: string | null
  creator: PlayerSummary | null
  opponent: PlayerSummary | null
  /** Which day of the challenge it is, from 0, while it is running. */
  today: number | null
  rewards: { creator: number; opponent: number } | null
  checkins?: ChallengeCheckin[]
  /** The other side's age group when it differs from yours, for the chat's safety note. */
  otherAge?: 'adult' | 'under18' | null
}

export interface ChallengeTermsInput {
  name: string
  objective: string
  rules: string
  durationDays: number
  rewardXp: number
  proof: 'required' | 'optional'
  minCheckins: number
  startMode: 'accept' | 'date'
  startsAt?: string
}

export interface ChallengeMessage {
  id: number
  side: 'creator' | 'opponent'
  mine: boolean
  body: string
  at: string
}

/** A search result. `you` marks your own account, shown when you search for
 * yourself but not something you can message or challenge. */
export type FoundPlayer = PlayerSummary & { you?: boolean }

export function searchPlayers(q: string) {
  return request<{ results: FoundPlayer[] }>(`/api/users/search?q=${encodeURIComponent(q)}`)
}

export function fetchPlayer(username: string) {
  return request<{ player: PublicPlayer }>(`/api/users/${encodeURIComponent(username)}`)
}

export function playerAvatarUrl(username: string, version: string | null | undefined): string | null {
  return version ? `/api/users/${encodeURIComponent(username)}/avatar?v=${encodeURIComponent(version)}` : null
}

export function blockPlayer(username: string) {
  return request<{ ok: true }>(`/api/users/${encodeURIComponent(username)}/block`, { method: 'POST' })
}

export function reportPlayer(username: string, reason: string, challengeId?: string) {
  return request<{ ok: true }>(`/api/users/${encodeURIComponent(username)}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason, challengeId }),
  })
}

export function updateSettings(settings: { challengesOpen?: boolean; adultMessages?: boolean }) {
  return request<{ user: AuthUser }>('/api/me/settings', { method: 'PUT', body: JSON.stringify(settings) })
}

export function fetchChallenges() {
  return request<{ challenges: Challenge[] }>('/api/challenges')
}

export function fetchChallenge(id: string) {
  return request<{ challenge: Challenge }>(`/api/challenges/${encodeURIComponent(id)}`)
}

export function sendChallenge(opponent: string, terms: ChallengeTermsInput) {
  return request<{ challenge: Challenge }>('/api/challenges', {
    method: 'POST',
    body: JSON.stringify({ opponent, ...terms }),
  })
}

export function respondToChallenge(id: string, accept: boolean) {
  return request<{ challenge: Challenge }>(`/api/challenges/${encodeURIComponent(id)}/respond`, {
    method: 'POST',
    body: JSON.stringify({ accept }),
  })
}

export function withdrawChallenge(id: string) {
  return request<{ challenge: Challenge }>(`/api/challenges/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
}

export function checkInChallenge(id: string, note: string) {
  return request<{ challenge: Challenge }>(`/api/challenges/${encodeURIComponent(id)}/checkin`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
}

export function fetchChallengeMessages(id: string, after = 0) {
  return request<{ messages: ChallengeMessage[]; open: boolean }>(
    `/api/challenges/${encodeURIComponent(id)}/messages?after=${after}`,
  )
}

export function sendChallengeMessage(id: string, body: string) {
  return request<{ message: ChallengeMessage }>(`/api/challenges/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

/* --- feed ------------------------------------------------------------------ */

export type PostKind = 'update' | 'learned' | 'achievement' | 'progress'

/** A video that has been uploaded, checked and converted. */
export interface PostVideo {
  id: string
  url: string
  poster: string
  durationMs: number
  width: number
  height: number
}

export interface Post {
  id: string
  kind: PostKind
  body: string
  createdAt: string
  image: string | null
  video: PostVideo | null
  author: PlayerSummary | null
  mine: boolean
}

export function fetchFeed(before?: string, user?: string) {
  const params = new URLSearchParams()
  if (before) params.set('before', before)
  if (user) params.set('user', user)
  const q = params.toString()
  return request<{ posts: Post[]; more: boolean }>(`/api/feed${q ? `?${q}` : ''}`)
}

export function createPost(input: { kind: PostKind; body: string; imageBase64?: string; mediaType?: string; videoId?: string }) {
  return request<{ post: Post; rewards: RewardSummary | null }>('/api/posts', { method: 'POST', body: JSON.stringify(input) })
}

/**
 * Sends a video to be checked and converted, reporting upload progress as it
 * goes — which fetch cannot do, hence XMLHttpRequest. The file goes up as raw
 * bytes rather than inside JSON, since base64 would add a third to a file that
 * can be 50MB. `onUploaded` fires once the bytes are all sent and the server
 * has started checking.
 */
export function uploadPostVideo(
  file: File,
  { onProgress, onUploaded, signal }: { onProgress?: (share: number) => void; onUploaded?: () => void; signal?: AbortSignal } = {},
): Promise<{ video: PostVideo }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/posts/videos')
    xhr.withCredentials = true
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    xhr.upload.onload = () => onUploaded?.()
    xhr.onload = () => {
      let payload: { video?: PostVideo; error?: string; code?: string } = {}
      try {
        payload = JSON.parse(xhr.responseText || '{}')
      } catch {
        // Not JSON — a proxy error page, say. Handled below by status.
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload.video) resolve({ video: payload.video })
      else reject(new ApiError(payload.error ?? `Upload failed (${xhr.status})`, xhr.status, payload.code ?? null))
    }
    xhr.onerror = () => reject(new ApiError('The upload was interrupted. Check your connection and try again.', 0))
    xhr.onabort = () => reject(new ApiError('Upload cancelled.', 0, 'aborted'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(file)
  })
}

export function deletePost(id: string) {
  return request<void>(`/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function reportPost(id: string, reason: string) {
  return request<{ ok: true }>(`/api/posts/${encodeURIComponent(id)}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

/** Whether this server can check, and so accept, photos and videos. */
export function fetchMediaAvailability() {
  return request<{ imagesChecked: boolean; videosAvailable: boolean }>('/api/social/media')
}

/* --- messages ---------------------------------------------------------------- */

export interface Conversation {
  id: string
  /** `request` until the person it was sent to replies or accepts. */
  status: 'request' | 'open'
  /** A request someone sent you, waiting on your answer. */
  requestForMe: boolean
  other: PlayerSummary | null
  lastMessage: { body: string; mine: boolean } | null
  lastMessageAt: string
  unread: number
  /** Set when the two are in different age groups: the other person's group,
   * which decides the safety note shown in the chat. */
  otherAge: 'adult' | 'under18' | null
}

export interface DirectMessage {
  id: number
  mine: boolean
  body: string
  at: string
}

export function fetchConversations() {
  return request<{ conversations: Conversation[]; unread: number; requests: number }>('/api/messages')
}

/** Whether you already have a conversation with this player. */
export function lookupConversation(username: string) {
  return request<{ conversationId: string | null; player: PlayerSummary }>(
    `/api/messages/with/${encodeURIComponent(username)}`,
  )
}

export function fetchConversation(id: string, after = 0) {
  return request<{ conversation: Conversation; messages: DirectMessage[] }>(
    `/api/messages/${encodeURIComponent(id)}?after=${after}`,
  )
}

export function startConversation(username: string, body: string) {
  return request<{ conversation: Conversation }>('/api/messages/start', {
    method: 'POST',
    body: JSON.stringify({ username, body }),
  })
}

export function sendDirectMessage(id: string, body: string) {
  return request<{ message: DirectMessage }>(`/api/messages/${encodeURIComponent(id)}`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

export function acceptConversation(id: string) {
  return request<{ conversation: Conversation }>(`/api/messages/${encodeURIComponent(id)}/accept`, { method: 'POST' })
}

export function declineConversation(id: string) {
  return request<{ ok: true }>(`/api/messages/${encodeURIComponent(id)}/decline`, { method: 'POST' })
}

/* --- the game: progress, quests, focus, inventory, Chronicle ------------------ */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type QuestType = 'main' | 'side' | 'daily' | 'club' | 'challenge' | 'optional'
export type QuestStatus = 'locked' | 'upcoming' | 'active' | 'in_progress' | 'completed' | 'failed' | 'expired'
export type ProgressKind = 'check' | 'minutes' | 'count' | 'milestones'
export type Difficulty = 'easy' | 'normal' | 'hard' | 'heroic'
export type Slot = 'head' | 'clothing' | 'back' | 'tool' | 'pet' | 'badge' | 'special'

export interface Appearance {
  body: 'a' | 'b'
  skin: 'porcelain' | 'fair' | 'tan' | 'olive' | 'brown' | 'deep'
  hair: 'short' | 'long' | 'bun' | 'curly' | 'shaved' | 'braid' | 'mohawk' | 'bob'
  hairColor: 'black' | 'brown' | 'auburn' | 'blonde' | 'silver' | 'teal' | 'plum' | 'ember'
  eyes: 'dark' | 'blue' | 'green' | 'amber'
}

export interface Look {
  appearance: Appearance | null
  equipment: Partial<Record<Slot, string>>
}

export interface Progress {
  xp: number
  coins: number
  level: number
  xpIntoLevel: number
  xpForNext: number
  rank: { id: string; name: string }
  nextRank: { id: string; name: string; level: number } | null
  streak: { current: number; longest: number; activeToday: boolean }
  timezone: string
  today: string
  path: string | null
  appearance: Appearance | null
  flags: Record<string, unknown>
}

export interface GameQuest {
  id: string
  type: QuestType
  origin: 'user' | 'plan' | 'generated' | 'legacy_todo' | 'club' | 'challenge' | 'onboarding'
  title: string
  description: string | null
  category: GoalCategory
  difficulty: Difficulty
  durationMin: number
  xp: number
  xpPaid: number
  rarity: Rarity
  status: QuestStatus
  progress: {
    kind: ProgressKind
    target: number
    value: number
    unit: string | null
    percent: number
    milestones: { index: number; title: string; done: boolean }[] | null
  }
  period: QuestPeriod | null
  goalId: string | null
  clubId: string | null
  challengeId: string | null
  minLevel: number | null
  startsAt: string | null
  deadlineAt: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  updatedAt: string
  verified: { by: 'photo' | 'voice'; at: string } | null
  pinned: boolean
}

export interface QuestInput {
  type: 'main' | 'side' | 'optional'
  title: string
  description?: string
  category?: GoalCategory
  difficulty?: Difficulty
  durationMin: number
  progressKind?: ProgressKind
  target?: number
  unit?: string
  milestones?: string[]
  startsAt?: string | null
  deadlineAt?: string | null
  goalId?: string | null
}

export type FocusStatus = 'running' | 'paused' | 'completed' | 'ended' | 'abandoned'

export interface FocusSessionView {
  id: string
  kind: 'timer' | 'stopwatch'
  label: string
  questId: string | null
  challengeId: string | null
  clubId: string | null
  goalId: string | null
  targetMs: number | null
  status: FocusStatus
  startedAt: string
  pausedAt: string | null
  pausedMs: number
  pauses: number
  endedAt: string | null
  activeMs: number
  xp: number
  xpPreview: number
  plan: PlanItem[]
  legacy: boolean
  serverNow: string
}

export interface FocusTotals {
  todayMs: number
  weekMs: number
  totalMs: number
  sessions: number
}

export interface AchievementView {
  id: string
  title: string
  description: string
  icon: string
  xp: number
  unlockedAt: string | null
}

export interface RewardSummary {
  xp: number
  coins: number
  capped: boolean
  levelBefore: number
  levelAfter: number
  achievements: AchievementView[]
  items: { id: string; name: string; slot: Slot; rarity: Rarity }[]
  streak: { current: number; extended: boolean } | null
  entries: { source: string; label: string | null; xp: number; coins: number }[]
  progress: Progress
}

export interface Caps {
  focusXpLeft: number
  selfReportedXpLeft: number
  focusXpDaily: number
  selfReportedXpDaily: number
}

export interface OnboardingStep {
  id: string
  title: string
  body: string
  link: string
  done: boolean
}

export interface GameSnapshot {
  progress: Progress
  /** XP earned today, in the player's own day. */
  todayXp: number
  onboarding: { steps: OnboardingStep[]; complete: boolean }
  focus: FocusSessionView | null
  focusTotals: FocusTotals
  quests: GameQuest[]
  featuredQuestId: string | null
  look: Look
  notifications: { unread: number }
  caps: Caps
  achievements: { unlocked: number; total: number; recent: AchievementView[] }
}

export interface InventoryItem {
  id: string
  name: string
  slot: Slot
  rarity: Rarity
  description: string
  source: string
  state: 'equipped' | 'owned' | 'available' | 'locked'
  acquiredAt: string | null
  price: number | null
  minLevel: number | null
  affordable: boolean | null
  model: boolean
}

export interface Inventory {
  coins: number
  level: number
  slots: Slot[]
  items: InventoryItem[]
  equipment: Partial<Record<Slot, string>>
  appearance: Appearance | null
}

export interface ChronicleEntry {
  id: number
  kind: string
  title: string
  body: string | null
  link: string | null
  data: Record<string, unknown> | null
  createdAt: string
  read: boolean
}

export interface LedgerEntry {
  id: number
  source: string
  label: string | null
  xp: number
  coins: number
  verified: boolean
  day: string
  at: string
}

export interface ProgressStatsResponse {
  stats: {
    totalFocusMs: number
    focusSessions: number
    currentStreak: number
    longestStreak: number
    questsCompleted: number
    questsVerified: number
    todosCompleted: number
    todosOpen: number
    level: number
    xp: number
    accountAgeDays: number
    activeDays: number
    activeDaysLast14: number
    completionsLast7: number
    completionsLast30: number
    daysSinceLastActivity: number | null
  }
  goals: {
    id: string
    title: string
    category: string
    detail?: string
    ageDays: number
    questsCompleted: number
    questsVerified: number
    focusMinutes: number
  }[]
}

export interface ActivityDay {
  date: string
  quests: number
  verified: number
  todos: number
  sessions: number
  focusMs: number
}

/** A completion that paid: the quest as it now stands and what it earned. */
export interface QuestResult {
  quest: GameQuest
  rewards?: RewardSummary
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })
const id = (value: string) => encodeURIComponent(value)

export const game = {
  snapshot: () => request<GameSnapshot>('/api/game'),
  setTimezone: (timezone: string) => request<{ progress: Progress }>('/api/game/timezone', { method: 'PUT', body: JSON.stringify({ timezone }) }),
  setAppearance: (appearance: Appearance) =>
    request<{ appearance: Appearance }>('/api/game/appearance', { method: 'PUT', body: JSON.stringify({ appearance }) }),
  history: (before?: number) => request<{ entries: LedgerEntry[]; more: boolean }>(`/api/progress/history${before ? `?before=${before}` : ''}`),
  stats: () => request<ProgressStatsResponse>('/api/progress/stats'),
  activity: (days: number) => request<{ today: string; days: ActivityDay[] }>(`/api/progress/activity?days=${days}`),
  achievements: () => request<{ achievements: AchievementView[] }>('/api/achievements'),

  quests: () => request<{ quests: GameQuest[]; featuredQuestId: string | null; caps: Caps }>('/api/quests'),
  questHistory: (before?: string) =>
    request<{ quests: GameQuest[]; more: boolean }>(`/api/quests/history${before ? `?before=${id(before)}` : ''}`),
  quest: (questId: string) => request<{ quest: GameQuest }>(`/api/quests/${id(questId)}`),
  createQuest: (input: QuestInput) => request<{ quest: GameQuest }>('/api/quests', json(input)),
  /** Adds a generated plan's tasks as quests, all or none. */
  createPlanQuests: (items: { title: string; kind: 'todo' | 'daily' | 'weekly' | 'monthly' }[]) =>
    request<{ quests: GameQuest[] }>('/api/quests/plan', json({ items })),
  updateQuest: (questId: string, input: Partial<QuestInput>) =>
    request<{ quest: GameQuest }>(`/api/quests/${id(questId)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteQuest: (questId: string) => request<void>(`/api/quests/${id(questId)}`, { method: 'DELETE' }),
  startQuest: (questId: string) => request<{ quest: GameQuest }>(`/api/quests/${id(questId)}/start`, json({})),
  pinQuest: (questId: string, pinned: boolean) => request<{ quest: GameQuest }>(`/api/quests/${id(questId)}/pin`, json({ pinned })),
  completeQuest: (questId: string) => request<QuestResult>(`/api/quests/${id(questId)}/complete`, json({})),
  logProgress: (questId: string, delta: number) => request<QuestResult>(`/api/quests/${id(questId)}/progress`, json({ delta })),
  setMilestone: (questId: string, index: number, done: boolean) =>
    request<QuestResult>(`/api/quests/${id(questId)}/milestones/${index}`, json({ done })),
  abandonQuest: (questId: string) => request<{ quest: GameQuest }>(`/api/quests/${id(questId)}/abandon`, json({})),

  currentFocus: () => request<{ session: FocusSessionView | null }>('/api/focus/current'),
  focusHistory: (before?: string) =>
    request<{ sessions: FocusSessionView[]; more: boolean; totals: FocusTotals }>(`/api/focus/history${before ? `?before=${id(before)}` : ''}`),
  startFocus: (input: { kind: 'timer' | 'stopwatch'; targetMinutes?: number; label?: string; questId?: string | null; goalId?: string | null; plan?: PlanItem[] }) =>
    request<{ session: FocusSessionView }>('/api/focus', json(input)),
  pauseFocus: (sessionId: string) => request<{ session: FocusSessionView }>(`/api/focus/${id(sessionId)}/pause`, json({})),
  resumeFocus: (sessionId: string) => request<{ session: FocusSessionView }>(`/api/focus/${id(sessionId)}/resume`, json({})),
  finishFocus: (sessionId: string) =>
    request<{ session: FocusSessionView; rewards: RewardSummary; quest: GameQuest | null }>(`/api/focus/${id(sessionId)}/finish`, json({})),
  abandonFocus: (sessionId: string) => request<{ session: FocusSessionView }>(`/api/focus/${id(sessionId)}/abandon`, json({})),
  updateFocusPlan: (sessionId: string, plan: PlanItem[]) =>
    request<{ session: FocusSessionView }>(`/api/focus/${id(sessionId)}/plan`, { method: 'PUT', body: JSON.stringify({ plan }) }),
  hideFocus: (sessionId: string) => request<void>(`/api/focus/${id(sessionId)}`, { method: 'DELETE' }),

  inventory: () => request<Inventory>('/api/inventory'),
  equip: (slot: Slot, itemId: string | null) =>
    request<{ equipment: Partial<Record<Slot, string>> }>('/api/inventory/equip', json({ slot, itemId })),
  buy: (itemId: string) => request<{ inventory: Inventory; rewards: RewardSummary }>('/api/inventory/buy', json({ itemId })),

  notifications: (before?: number) =>
    request<{ notifications: ChronicleEntry[]; more: boolean; unread: number }>(`/api/notifications${before ? `?before=${before}` : ''}`),
  unread: () => request<{ unread: number }>('/api/notifications/unread'),
  markRead: (ids?: number[]) => request<{ unread: number }>('/api/notifications/read', json(ids ? { ids } : {})),
}
