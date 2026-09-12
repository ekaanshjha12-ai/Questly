import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchChallenges, type Challenge } from '../lib/api'

/**
 * The player's challenges, kept reasonably fresh, and rewards paid in as they
 * land.
 *
 * Polled rather than pushed: a minute is plenty for "someone challenged you",
 * the app has no socket server to push with, and polling stops entirely while
 * the tab is hidden so a phone in a pocket is not fetching anything. Switching
 * back to the tab fetches immediately.
 */

const POLL_MS = 60_000

export function useChallenges({
  enabled,
  claimed,
  onReward,
}: {
  enabled: boolean
  /** Ids already paid into state. */
  claimed: string[]
  onReward: (challengeId: string, xp: number) => void
}) {
  const [challenges, setChallenges] = useState<Challenge[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const claimedRef = useRef(claimed)
  claimedRef.current = claimed
  const onRewardRef = useRef(onReward)
  onRewardRef.current = onReward

  const refresh = useCallback(async () => {
    try {
      const { challenges: list } = await fetchChallenges()
      setChallenges(list)
      setError(null)
      for (const c of list) {
        if (c.status !== 'completed' || !c.rewards) continue
        const xp = c.role === 'creator' ? c.rewards.creator : c.rewards.opponent
        if (xp > 0 && !claimedRef.current.includes(c.id)) onRewardRef.current(c.id, xp)
      }
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
