import { useCallback, useEffect, useState } from 'react'

/**
 * Which side of Questly is showing: Focus (the work) or Social (the people).
 *
 * Remembered per device, like the theme — someone might keep a laptop on Focus
 * and a phone on Social. Every component asking gets the same answer, kept in
 * step by an event, because the switch in the header and the screens it swaps
 * live in different parts of the tree.
 */

export type AppMode = 'focus' | 'social'

const KEY = 'questly:v1:mode'
const CHANGED = 'questly:mode-changed'

function stored(): AppMode {
  try {
    return localStorage.getItem(KEY) === 'social' ? 'social' : 'focus'
  } catch {
    return 'focus'
  }
}

export function useMode() {
  const [mode, setModeState] = useState<AppMode>(stored)

  useEffect(() => {
    const onChanged = (e: Event) => setModeState((e as CustomEvent<AppMode>).detail)
    window.addEventListener(CHANGED, onChanged)
    return () => window.removeEventListener(CHANGED, onChanged)
  }, [])

  const setMode = useCallback((next: AppMode) => {
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Private mode — the choice lasts until reload.
    }
    setModeState(next)
    window.dispatchEvent(new CustomEvent<AppMode>(CHANGED, { detail: next }))
  }, [])

  return { mode, setMode }
}
