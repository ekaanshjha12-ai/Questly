/** mm:ss, or h:mm:ss once the duration passes an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

/** Compact human duration for history rows: "45s", "12m", "1h 5m". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const totalMinutes = Math.round(totalSeconds / 60)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}

export const MAX_SESSION_XP = 120

/** One XP per focused minute, floored at 1 so short sessions still count and
 * capped so a stopwatch left running overnight can't mint thousands of XP. */
export function sessionXp(durationMs: number): number {
  const minutes = Math.round(durationMs / 60000)
  return Math.min(MAX_SESSION_XP, Math.max(1, minutes))
}
