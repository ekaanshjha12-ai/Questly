import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, X, Share, Plus, MoreVertical } from 'lucide-react'
import {
  isStandalone,
  nativePrompt,
  platform,
  promptInstall,
  subscribe,
  wasInstalled,
} from '../lib/install'

const DISMISS_KEY = 'questly:v1:install-dismissed'

/** Manual steps per platform, for when no native prompt is on offer — Safari has
 * no install API at all, and Chrome only offers one once its own engagement
 * heuristics are satisfied. Without these the feature is undiscoverable. */
function ManualSteps() {
  const kind = platform()

  if (kind === 'ios') {
    return (
      <p className="text-xs leading-relaxed text-slate-400">
        Tap <Share className="inline h-3.5 w-3.5 -translate-y-px text-slate-300" /> in Safari&apos;s toolbar, scroll
        down, then tap <span className="text-slate-300">Add to Home Screen</span>.
      </p>
    )
  }

  if (kind === 'unsupported') {
    return (
      <p className="text-xs leading-relaxed text-slate-400">
        This browser can&apos;t install web apps. Open{' '}
        <span className="text-slate-300">questly-production-f6ea.up.railway.app</span> in Chrome or Safari and try
        again.
      </p>
    )
  }

  return (
    <p className="text-xs leading-relaxed text-slate-400">
      Open the browser menu <MoreVertical className="inline h-3.5 w-3.5 text-slate-300" /> and tap{' '}
      <span className="text-slate-300">Install app</span>
      {kind === 'android-chrome' && (
        <>
          {' '}
          or <span className="text-slate-300">Add to Home screen</span>
        </>
      )}
      .
    </p>
  )
}

/** Small header affordance, always present until the app is installed. The
 * automatic banner can be dismissed for good, and on some platforms it never
 * appears at all, so there has to be a way to find this on purpose. */
export function InstallButton() {
  const [, force] = useState(0)
  const [sheet, setSheet] = useState(false)

  useEffect(() => subscribe(() => force((n) => n + 1)), [])

  if (isStandalone() || wasInstalled()) return null

  async function onClick() {
    // Falls back to instructions whenever the browser gave us no prompt to run.
    if (!(await promptInstall())) setSheet(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        title="Install Questly"
        aria-label="Install Questly"
        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-ink-800 hover:text-gold-300"
      >
        <Download className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {sheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-4 backdrop-blur-sm sm:items-center sm:pb-0"
            onClick={() => setSheet(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="How to install Questly"
              className="w-full max-w-sm rounded-2xl border border-ink-600 bg-ink-900 p-5 shadow-2xl [margin-bottom:env(safe-area-inset-bottom)]"
            >
              <div className="mb-3 flex items-center gap-3">
                <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100">Add Questly to your home screen</p>
                  <p className="text-[11px] text-slate-500">Opens full screen and works offline.</p>
                </div>
              </div>

              <ManualSteps />

              <button
                type="button"
                onClick={() => setSheet(false)}
                className="mt-4 w-full rounded-xl border border-ink-600 py-2 text-sm text-slate-300 transition-colors hover:bg-ink-800"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/**
 * The automatic offer.
 *
 * Shown once the browser hands over an install event, or — on platforms that
 * never will — after a short delay. Dismissing it is remembered, which is why
 * `InstallButton` also exists as a permanent way back in.
 */
export default function InstallPrompt() {
  const [hasNative, setHasNative] = useState(() => Boolean(nativePrompt()))
  const [showManual, setShowManual] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return Boolean(localStorage.getItem(DISMISS_KEY))
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (isStandalone() || dismissed) return

    const unsubscribe = subscribe(() => setHasNative(Boolean(nativePrompt())))

    // Safari never fires the event, so it is offered the manual route after a
    // delay long enough not to interrupt someone mid-signup.
    let timer = 0
    if (platform() === 'ios') timer = window.setTimeout(() => setShowManual(true), 4000)

    return () => {
      unsubscribe()
      if (timer) window.clearTimeout(timer)
    }
  }, [dismissed])

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Private mode — it will simply ask again next time.
    }
    setDismissed(true)
  }

  async function install() {
    await promptInstall()
    dismiss()
  }

  const open = !dismissed && !isStandalone() && !wasInstalled() && (hasNative || showManual)

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
              {hasNative ? (
                <>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Add it to your home screen — opens full screen and works offline.
                  </p>
                  <button
                    type="button"
                    onClick={() => void install()}
                    className="mt-2 flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-gold-500 to-ember-500 px-3 py-1.5 text-xs font-semibold text-onAccent"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Install
                  </button>
                </>
              ) : (
                <div className="mt-0.5">
                  <ManualSteps />
                </div>
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
