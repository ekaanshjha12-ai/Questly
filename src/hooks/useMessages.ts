import { useCallback, useEffect, useState } from 'react'
import { fetchConversations, type Conversation } from '../lib/api'

/**
 * The inbox: every conversation, with unread messages and waiting requests
 * counted for the badges.
 *
 * Polled like challenges, and never while the tab is hidden. It runs faster
 * while Social mode is on screen, where the list is being looked at, and slower
 * in Focus mode, where all it feeds is a badge. An open chat announces what it
 * changed — read, sent, accepted — so the counts update without waiting.
 */

export const MESSAGES_CHANGED = 'questly:messages-changed'

/** Tells the inbox to look again: something was read, sent or answered. */
export function announceMessagesChanged() {
  window.dispatchEvent(new CustomEvent(MESSAGES_CHANGED))
}

export function useMessages({ enabled, fast }: { enabled: boolean; fast: boolean }) {
  const [conversations, setConversations] = useState<Conversation[] | null>(null)
  const [counts, setCounts] = useState({ unread: 0, requests: 0 })
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetchConversations()
      setConversations(res.conversations)
      setCounts({ unread: res.unread, requests: res.requests })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load messages.')
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, fast ? 30_000 : 90_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onChanged = () => void refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(MESSAGES_CHANGED, onChanged)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(MESSAGES_CHANGED, onChanged)
    }
  }, [enabled, fast, refresh])

  return { conversations, unread: counts.unread, requests: counts.requests, error, refresh }
}

export type Inbox = ReturnType<typeof useMessages>
