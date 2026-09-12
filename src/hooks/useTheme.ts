import { useCallback, useEffect, useState } from 'react'

export type ThemeChoice = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

const KEY = 'questly:v1:theme'

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function storedChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(KEY)
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
  } catch {
    return 'system'
  }
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === 'system' ? systemTheme() : choice
}

/**
 * Writes the theme onto the root element, where the CSS variables are keyed.
 *
 * Also kept in sync with the browser chrome colour, so the status bar on an
 * installed phone app matches the page instead of staying black behind a white
 * screen.
 */
export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement
  root.setAttribute('data-theme', resolved)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#e6e6e6' : '#0b0b0b')
}

/** Fired whenever any control changes the theme, so every other control showing
 * it can follow. */
const CHANGED = 'questly:theme-changed'

/**
 * Theme state, with "system" as a real option rather than a one-off read.
 *
 * Following the OS means following it as it changes — someone whose phone flips
 * to light at sunrise should see the app flip too, without reopening it — so the
 * media query stays subscribed while the choice is `system`.
 *
 * Two controls can change it — the day/night switch on the rail and the
 * Personalise screen — and each holds its own copy of this state. Without the
 * change event, picking Dark on one would leave the other showing Light until
 * it next remounted.
 */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(storedChoice)
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(storedChoice()))

  useEffect(() => {
    const onChanged = (e: Event) => {
      const next = (e as CustomEvent<ThemeChoice>).detail
      // Setting the same value is a no-op in React, which is what stops the
      // instances echoing the event back and forth.
      setChoice(next)
    }
    window.addEventListener(CHANGED, onChanged)
    return () => window.removeEventListener(CHANGED, onChanged)
  }, [])

  useEffect(() => {
    const next = resolveTheme(choice)
    setResolved(next)
    applyTheme(next)
    try {
      localStorage.setItem(KEY, choice)
    } catch {
      // Private mode — the choice simply won't survive a reload.
    }
    window.dispatchEvent(new CustomEvent<ThemeChoice>(CHANGED, { detail: choice }))

    if (choice !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      const updated = systemTheme()
      setResolved(updated)
      applyTheme(updated)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [choice])

  /** Cycles dark → light → system, so the automatic option is reachable without
   * a separate menu. */
  const cycle = useCallback(() => {
    setChoice((current) => (current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark'))
  }, [])

  return { choice, resolved, setChoice, cycle }
}
