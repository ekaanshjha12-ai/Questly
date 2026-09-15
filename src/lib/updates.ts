/**
 * Keeps an open or installed app on the version that is deployed.
 *
 * A phone keeps an installed app in memory for days and a single-page app never
 * reloads by itself, so without this a player can go on using an old build long
 * after a new one shipped. A build is named by its fingerprinted main script,
 * the same name the server reports from `/api/version`.
 *
 * - Back in the app after a while away: load the new build straight away,
 *   unless something typed is still on screen.
 * - While the app is in use: check now and then, and switch at the next change
 *   of screen (see the router) rather than under the player's fingers.
 */

const RESUME_AFTER_MS = 60_000
const CHECK_EVERY_MS = 15 * 60_000

let newerBuild = false

function ownBuild(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
  return script ? new URL(script.src, window.location.origin).pathname : null
}

async function isOutOfDate(): Promise<boolean> {
  const mine = ownBuild()
  if (!mine) return false
  try {
    const res = await fetch('/api/version', { cache: 'no-store', credentials: 'same-origin' })
    if (!res.ok) return false
    const { build } = (await res.json()) as { build?: string | null }
    newerBuild = Boolean(build && build !== mine)
  } catch {
    // Offline or between deploys: try again next time.
  }
  return newerBuild
}

/** Something the player typed that a reload would lose. */
function unsavedTyping(): boolean {
  return Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('textarea, input[type="text"], input[type="search"], input:not([type])')).some(
    (field) => !field.readOnly && !field.disabled && field.value.trim() !== '',
  )
}

/** Whether a newer build is out; the router then changes screen with a full page load. */
export function updateReady(): boolean {
  return newerBuild
}

export function watchForUpdates() {
  if (!ownBuild()) return
  let hiddenAt = 0
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    if (!hiddenAt || Date.now() - hiddenAt < RESUME_AFTER_MS) return
    void isOutOfDate().then((outOfDate) => {
      if (outOfDate && !unsavedTyping()) window.location.reload()
    })
  })
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void isOutOfDate()
  }, CHECK_EVERY_MS)
}
