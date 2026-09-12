import type { AppState } from '../types'
import type { PostKind } from './api'
import { dailyKey } from './period'
import { ACHIEVEMENTS } from './achievements'

/**
 * The social side's shared pieces: post kinds, what a level unlocks, and the
 * things from today worth sharing.
 */

export const POST_KINDS: { id: PostKind; label: string; emoji: string; prompt: string }[] = [
  { id: 'achievement', label: 'Achievement', emoji: '🏆', prompt: 'What did you get done?' },
  { id: 'learned', label: 'Learned', emoji: '💡', prompt: 'What did you learn today?' },
  { id: 'progress', label: 'Progress', emoji: '📈', prompt: 'How far along are you?' },
  { id: 'update', label: 'Update', emoji: '✍️', prompt: 'What are you working on?' },
]

export function kindMeta(kind: PostKind) {
  return POST_KINDS.find((k) => k.id === kind) ?? POST_KINDS[3]
}

/** Mirrors UNLOCKS in server/social.js, which is the copy that is enforced. */
export const UNLOCKS = { post: 1, message: 2, photo: 3, createClub: 10 } as const

export const UNLOCK_LIST: { key: 'post' | 'message' | 'photo' | 'createClub'; label: string }[] = [
  { key: 'post', label: 'Post to the feed' },
  { key: 'message', label: 'Message other players' },
  { key: 'photo', label: 'Post photos' },
  { key: 'createClub', label: 'Create a club' },
]

export interface ShareMoment {
  id: string
  kind: PostKind
  label: string
  text: string
}

/**
 * Today's finished work, turned into posts ready to share.
 *
 * This is the bridge from Focus mode to the feed: the work happens there, and
 * coming over here offers it back as something to post, so sharing progress is
 * one tap rather than retyping what the app already knows.
 */
export function shareMoments(state: AppState, now: Date = new Date()): ShareMoment[] {
  const today = dailyKey(now)
  const moments: ShareMoment[] = []

  const quests = state.quests.filter((q) => q.completedAt && dailyKey(new Date(q.completedAt)) === today)
  if (quests.length) {
    const xp = quests.reduce((sum, q) => sum + q.xp, 0)
    const names = quests.slice(0, 3).map((q) => `• ${q.title}`).join('\n')
    moments.push({
      id: 'quests',
      kind: 'achievement',
      label: `${quests.length} quest${quests.length === 1 ? '' : 's'} done`,
      text: `Finished ${quests.length} quest${quests.length === 1 ? '' : 's'} today (+${xp} XP)\n${names}`,
    })
  }

  const focusMs = state.sessions
    .filter((s) => s.endedAt && dailyKey(new Date(s.endedAt)) === today)
    .reduce((sum, s) => sum + Math.max(0, s.durationMs), 0)
  const minutes = Math.round(focusMs / 60000)
  if (minutes >= 10) {
    const label = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m focused` : `${minutes} min focused`
    moments.push({ id: 'focus', kind: 'progress', label, text: `Put in ${label} of deep work today.` })
  }

  const habits = state.habits.filter((h) => !h.archived && state.habitMarks[h.id]?.includes(today))
  if (habits.length) {
    moments.push({
      id: 'habits',
      kind: 'progress',
      label: `${habits.length} habit${habits.length === 1 ? '' : 's'} ticked`,
      text: `Kept up ${habits.length} habit${habits.length === 1 ? '' : 's'} today: ${habits.map((h) => h.name).join(', ')}.`,
    })
  }

  for (const [id, at] of Object.entries(state.unlockedAchievements)) {
    if (dailyKey(new Date(at)) !== today) continue
    const meta = ACHIEVEMENTS.find((a) => a.id === id)
    if (meta) {
      moments.push({ id: `ach-${id}`, kind: 'achievement', label: `${meta.icon} ${meta.title}`, text: `Unlocked "${meta.title}" — ${meta.description.toLowerCase()}.` })
    }
  }

  if (state.streak.current >= 2 && state.streak.lastCompletedDay === today) {
    moments.push({
      id: 'streak',
      kind: 'progress',
      label: `🔥 ${state.streak.current}-day streak`,
      text: `${state.streak.current} days in a row and counting.`,
    })
  }

  return moments
}

/* --- pictures ----------------------------------------------------------------- */

const MAX_SIDE = 1280

/**
 * Shrinks a photo to at most 1280px on its long side and re-encodes it as JPEG.
 *
 * The re-encode is the privacy step as much as the size one: it strips
 * everything the file carried besides pixels, including the GPS position a
 * phone camera stamps on most photos — which, on a public feed, would publish
 * where someone lives or studies.
 */
export async function preparePostImage(file: File): Promise<{ base64: string; mediaType: 'image/jpeg'; dataUrl: string }> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  if (file.size > 20 * 1024 * 1024) throw new Error('That picture is over 20MB. Choose a smaller one.')
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('That picture could not be read.'))
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('That picture could not be opened. Try a JPEG or PNG.'))
    el.src = source
  })
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot prepare pictures.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' }
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
