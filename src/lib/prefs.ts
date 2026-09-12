import { useEffect, useState } from 'react'

/**
 * Small per-device preferences that are not the theme or the cursor.
 *
 * Kept in the browser rather than in the saved state, like those two: whether
 * confetti is welcome is a matter of the screen and the setting you are in (a
 * phone in a meeting, a desk at home), not a fact about the account.
 */

const CELEBRATIONS_KEY = 'questly:v1:celebrations'
const CHANGED = 'questly:celebrations-changed'

export function celebrationsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(CELEBRATIONS_KEY)
    if (raw === 'on') return true
    if (raw === 'off') return false
  } catch {
    // Storage blocked — use the default below.
  }
  // Someone who has asked their system for less motion does not get confetti
  // unless they turn it on here.
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function setCelebrationsEnabled(on: boolean): void {
  try {
    localStorage.setItem(CELEBRATIONS_KEY, on ? 'on' : 'off')
  } catch {
    // Private mode — lasts until reload.
  }
  window.dispatchEvent(new CustomEvent<boolean>(CHANGED, { detail: on }))
}

/** Live value, so the switch on the Personalise screen and the celebration
 * itself agree without a reload. */
export function useCelebrations(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(celebrationsEnabled)

  useEffect(() => {
    const onChanged = (e: Event) => setOn((e as CustomEvent<boolean>).detail)
    window.addEventListener(CHANGED, onChanged)
    return () => window.removeEventListener(CHANGED, onChanged)
  }, [])

  return [on, setCelebrationsEnabled]
}
