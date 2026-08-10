import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, X, Share } from 'lucide-react'

const DISMISS_KEY = 'questly:v1:install-dismissed'

/** Chrome fires this so a site can offer its own install button. Not in the DOM
 * lib types, since it is not part of the standard. */
interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS reports installed apps through a non-standard flag.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * Offers to install the app.
 *
 * Two paths, because the platforms differ. Chrome hands the page a
 * `beforeinstallprompt` event, so Android gets a real one-tap button. Safari
 * has no such API at all, so iOS can only be shown where the Share menu item
 * is — without that instruction most people never discover it exists.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    if (localStorage.getItem(DISMISS_KEY)) return

    const onPrompt = (event: Event) => {
      // Stop Chrome's own mini-infobar so the offer appears where we want it.
      event.preventDefault()
      setDeferred(event as InstallEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // Safari never fires that event, so iOS is offered the manual route after a
    // short delay — long enough not to interrupt someone mid-signup.
    let timer = 0
    if (isIos()) timer = window.setTimeout(() => setShowIosHint(true), 4000)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Private mode — it will simply ask again next time.
    }
    setDeferred(null)
    setShowIosHint(false)
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    dismiss()
  }

  const open = Boolean(deferred) || showIosHint

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-2xl border border-gold-500/40 bg-ink-900/95 p-3 shadow-2xl backdrop-blur [margin-bottom:env(safe-area-inset-bottom)]"
        >
          <div className="flex items-start gap-3">
            <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-100">Install Questly</p>
              {deferred ? (
                <p className="mt-0.5 text-xs text-slate-400">
                  Add it to your home screen — opens full screen and works offline.
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-slate-400">
                  Tap <Share className="inline h-3 w-3 -translate-y-px" /> below, then{' '}
                  <span className="text-slate-300">Add to Home Screen</span>.
                </p>
              )}

              {deferred && (
                <button
                  type="button"
                  onClick={() => void install()}
                  className="mt-2 flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-gold-500 to-ember-500 px-3 py-1.5 text-xs font-semibold text-ink-950"
                >
                  <Download className="h-3.5 w-3.5" />
                  Install
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss install prompt"
              className="shrink-0 rounded-lg p-1 text-slate-500 transition-colors hover:bg-ink-800 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
