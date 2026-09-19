import { useLayoutEffect, useRef, useState } from 'react'

/**
 * False for a moment after `key` changes, then true again.
 *
 * For a button that changes meaning where it stands — "Start quest" becoming
 * "Mark complete" — so a double tap, or a second tap because the first seemed
 * not to land, does not do the second thing by accident. A change of `scope`
 * (another quest in the same place) is a fresh start, not a change of meaning.
 */
export function useSettled(key: unknown, scope?: unknown, ms = 1200): boolean {
  const [settled, setSettled] = useState(true)
  const last = useRef({ key, scope })
  // Before paint, so the new label is never shown ready for a frame.
  useLayoutEffect(() => {
    const before = last.current
    last.current = { key, scope }
    if (before.key === key && before.scope === scope) return
    if (before.scope !== scope) {
      setSettled(true)
      return
    }
    setSettled(false)
    const id = window.setTimeout(() => setSettled(true), ms)
    return () => window.clearTimeout(id)
  }, [key, scope, ms])
  return settled
}
