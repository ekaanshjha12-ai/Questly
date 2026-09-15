import type { AppState } from '../types'
import type { GameSnapshot, PostKind } from './api'
import { dailyKey } from './period'

/**
 * The social side's shared pieces: post kinds, and the things from today worth
 * sharing.
 */

export const POST_KINDS: { id: PostKind; label: string; emoji: string; prompt: string }[] = [
  { id: 'achievement', label: 'Achievement', emoji: '🏆', prompt: 'What did you get done?' },
  { id: 'learned', label: 'Learned', emoji: '💡', prompt: 'What did you learn today?' },
  { id: 'progress', label: 'Progress', emoji: '📈', prompt: 'How far along are you?' },
  { id: 'update', label: 'Update', emoji: '✍️', prompt: 'What are you working on?' },
]

const ANNOUNCEMENT = { id: 'announcement' as const, label: 'Announcement', emoji: '📣', prompt: 'What does the club need to know?' }

export function kindMeta(kind: PostKind) {
  if (kind === 'announcement') return ANNOUNCEMENT
  return POST_KINDS.find((k) => k.id === kind) ?? POST_KINDS[3]
}

/** Mirrors the limits in server/media.js. */
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024
export const VIDEO_MAX_SECONDS = 60

/**
 * A chosen video's length and a local preview of it, read before anything is
 * uploaded, so one that is too long is turned away at once rather than after
 * a 50MB upload. The browser may not be able to decode every format a phone
 * records — the server can — so a file the browser cannot read is let through
 * with an unknown length and the server has the final say.
 */
export async function readVideoFile(file: File): Promise<{ previewUrl: string; durationMs: number | null }> {
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(file.name)) {
    throw new Error('Choose a video file.')
  }
  if (file.size > VIDEO_MAX_BYTES) throw new Error(`That video is over ${VIDEO_MAX_BYTES / 1024 / 1024}MB. Trim it or choose a shorter one.`)
  const previewUrl = URL.createObjectURL(file)
  const durationMs = await new Promise<number | null>((resolve) => {
    const el = document.createElement('video')
    el.preload = 'metadata'
    el.muted = true
    let settled = false
    const done = (value: number | null) => {
      if (settled) return
      settled = true
      el.removeAttribute('src')
      el.load()
      resolve(value)
    }
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null)
    el.onerror = () => done(null)
    setTimeout(() => done(null), 8000)
    el.src = previewUrl
  })
  if (durationMs !== null && durationMs > (VIDEO_MAX_SECONDS + 0.5) * 1000) {
    URL.revokeObjectURL(previewUrl)
    throw new Error(`Videos can be at most ${VIDEO_MAX_SECONDS} seconds. That one is ${Math.round(durationMs / 1000)}.`)
  }
  return { previewUrl, durationMs }
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

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
export function shareMoments(state: AppState, snapshot: GameSnapshot | null, now: Date = new Date()): ShareMoment[] {
  const today = dailyKey(now)
  const moments: ShareMoment[] = []

  if (snapshot) {
    // The board holds what was finished today.
    const quests = snapshot.quests.filter((q) => q.status === 'completed')
    if (quests.length) {
      const xp = quests.reduce((sum, q) => sum + q.xpPaid, 0)
      const names = quests.slice(0, 3).map((q) => `• ${q.title}`).join('\n')
      moments.push({
        id: 'quests',
        kind: 'achievement',
        label: `${quests.length} quest${quests.length === 1 ? '' : 's'} done`,
        text: `Finished ${quests.length} quest${quests.length === 1 ? '' : 's'} today${xp ? ` (+${xp} XP)` : ''}\n${names}`,
      })
    }

    const minutes = Math.round(snapshot.focusTotals.todayMs / 60000)
    if (minutes >= 10) {
      const label = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m focused` : `${minutes} min focused`
      moments.push({ id: 'focus', kind: 'progress', label, text: `Put in ${label} of deep work today.` })
    }

    for (const a of snapshot.achievements.recent) {
      if (!a.unlockedAt || dailyKey(new Date(a.unlockedAt)) !== today) continue
      moments.push({ id: `ach-${a.id}`, kind: 'achievement', label: a.title, text: `Unlocked "${a.title}" — ${a.description.toLowerCase()}` })
    }

    const streak = snapshot.progress.streak
    if (streak.current >= 2 && streak.activeToday) {
      moments.push({ id: 'streak', kind: 'progress', label: `${streak.current}-day streak`, text: `${streak.current} days in a row and counting.` })
    }
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
