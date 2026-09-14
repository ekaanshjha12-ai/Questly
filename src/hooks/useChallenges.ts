import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchChallenges, type Challenge } from '../lib/api'

/**
 * The player's challenges, kept reasonably fresh.
 *
 * Rewards are paid by the server when a challenge settles; all this does is
 * notice a challenge finishing so the caller can fetch the new progress.
 *
 * Polled rather than pushed: a minute is plenty for "someone challenged you",
 * the app has no socket server to push with, and polling stops entirely while
 * the tab is hidden so a phone in a pocket is not fetching anything. Switching
 * back to the tab fetches immediately.
 */

const POLL_MS = 60_000

export function useChallenges({
  enabled,
  onSettled,
}: {
  enabled: boolean
  /** A challenge finished since the last look — progress may have changed. */
  onSettled?: () => void
}) {
  const [challenges, setChallenges] = useState<Challenge[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onSettledRef = useRef(onSettled)
  onSettledRef.current = onSettled
  // Ids seen finished. Null until the first load, so old results do not count
  // as news.
  const finished = useRef<Set<string> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const { challenges: list } = await fetchChallenges()
      setChallenges(list)
      setError(null)
      const done = new Set(list.filter((c) => c.status === 'completed').map((c) => c.id))
      const known = finished.current
      finished.current = done
      if (known && [...done].some((id) => !known.has(id))) onSettledRef.current?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load challenges.')
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void refresh()
    let timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      timer = 0
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, refresh])

  /** Replaces one challenge in the list after an action on it, so the list does
   * not wait for the next poll to show an accept or a check-in. */
  const upsert = useCallback((challenge: Challenge) => {
    setChallenges((current) => {
      const list = current ?? []
      const i = list.findIndex((c) => c.id === challenge.id)
      if (i < 0) return [challenge, ...list]
      const next = list.slice()
      next[i] = challenge
      return next
    })
  }, [])

  const incoming = (challenges ?? []).filter((c) => c.role === 'opponent' && c.status === 'pending')

  return { challenges, error, refresh, upsert, incomingCount: incoming.length }
}
