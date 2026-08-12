/**
 * Captures the install offer as early as possible.
 *
 * Chrome fires `beforeinstallprompt` once the site becomes installable, which
 * happens moments after the service worker registers — and it never fires again
 * or replays for a late listener. The banner component mounts far later than
 * that: it lives inside the signed-in app, which waits on a session check and a
 * state fetch first. A listener attached from there always misses the event, so
 * the install offer never appeared at all.
 *
 * Registering here, at module scope, means the listener exists before React
 * renders. The event is held so any component that mounts later can still find
 * it.
 */

export interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let captured: InstallEvent | null = null
let installed = false
const listeners = new Set<() => void>()

function announce() {
  for (const fn of listeners) fn()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress Chrome's own mini-infobar so the offer appears where we choose.
    event.preventDefault()
    captured = event as InstallEvent
    announce()
  })

  window.addEventListener('appinstalled', () => {
    installed = true
    captured = null
    announce()
  })
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** True once the app is running from the home screen rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS reports installed apps through a non-standard flag.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  // iPadOS 13+ reports itself as a Mac, so touch support disambiguates it.
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  )
}

/** Firefox and in-app webviews can neither prompt nor add to the home screen. */
export function isFirefox(): boolean {
  if (typeof navigator === 'undefined') return false
  return /firefox|fxios/i.test(navigator.userAgent)
}

export function wasInstalled(): boolean {
  return installed
}

/** The native one-tap offer, when the browser gave us one. */
export function nativePrompt(): InstallEvent | null {
  return captured
}

/** Runs the native prompt. Returns false when there is nothing to run, so the
 * caller can fall back to showing manual instructions. */
export async function promptInstall(): Promise<boolean> {
  if (!captured) return false
  const event = captured
  await event.prompt()
  const { outcome } = await event.userChoice
  // A prompt can only be used once; Chrome sends a fresh event if it declines
  // to install now and becomes eligible again later.
  captured = null
  if (outcome === 'accepted') installed = true
  announce()
  return true
}

export type Platform = 'ios' | 'android-chrome' | 'desktop' | 'unsupported'

export function platform(): Platform {
  if (isIos()) return 'ios'
  if (isFirefox()) return 'unsupported'
  if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) return 'android-chrome'
  return 'desktop'
}
