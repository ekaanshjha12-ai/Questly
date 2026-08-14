import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Loader2, Sparkles, X } from 'lucide-react'
import type { AppState } from '../types'
import { fetchTour, type Tour } from '../lib/api'
import Mascot3D from './Mascot3D'

const SEEN_KEY = 'questly:v1:tour-seen'

export function hasSeenTour(userId: string): boolean {
  try {
    return localStorage.getItem(`${SEEN_KEY}:${userId}`) === '1'
  } catch {
    return true // Storage unavailable — better silent than looping forever.
  }
}

function markSeen(userId: string) {
  try {
    localStorage.setItem(`${SEEN_KEY}:${userId}`, '1')
  } catch {
    // Private mode — it will offer once more next time, which is harmless.
  }
}

/**
 * The guide's walkthrough, shown once after onboarding.
 *
 * Kept as slides rather than a single wall of text: the point is that someone
 * arrives at the app already knowing what each part is for, and eight short
 * cards get read where one long page gets skipped. Every card is skippable,
 * because a tour you cannot leave is an obstacle, not a welcome.
 */
export default function GuideTour({
  state,
  userId,
  onClose,
}: {
  state: AppState
  userId: string
  onClose: () => void
}) {
  const [tour, setTour] = useState<Tour | null>(null)
  const [index, setIndex] = useState(-1) // -1 is the opening, steps.length is the closing
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { tour: written } = await fetchTour(
          state.player.name,
          state.goals
            .filter((g) => !g.archived)
            .map((g) => ({ title: g.title, category: g.category, detail: g.detail })),
        )
        if (!cancelled) setTour(written)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // Runs once: the tour describes the goals set at onboarding, and should not
    // be rewritten underneath someone part-way through reading it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function finish() {
    markSeen(userId)
    onClose()
  }

  // A failure here should not trap anyone behind a modal.
  useEffect(() => {
    if (failed) finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed])

  const total = tour ? tour.steps.length + 2 : 0
  const position = index + 1
  const atEnd = tour ? index >= tour.steps.length : false

  const heading = !tour ? '' : index < 0 ? '' : atEnd ? 'One thing to do today' : tour.steps[index].title
  const body = !tour ? '' : index < 0 ? tour.opening : atEnd ? tour.closing : tour.steps[index].body

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-4 backdrop-blur-sm sm:items-center sm:pb-0"
      >
        <motion.div
          initial={{ y: 30, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          role="dialog"
          aria-label="Welcome walkthrough"
          className="w-full max-w-lg overflow-hidden rounded-2xl border border-ink-600 bg-ink-900 shadow-2xl [margin-bottom:env(safe-area-inset-bottom)]"
        >
          <div className="flex items-center justify-between border-b border-ink-700/70 px-4 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
              <Sparkles className="h-3 w-3 text-gold-400" />
              Your guide
            </p>
            <button
              type="button"
              onClick={finish}
              aria-label="Skip the walkthrough"
              className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-ink-800 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-3 p-4 sm:gap-4 sm:p-5">
            {/* The mascot stays mounted across slides so its idle motion is
                continuous — remounting per step would reset it to a dead pose. */}
            <div className="hidden sm:block">
              <Mascot3D size={148} speaking={Boolean(tour)} />
            </div>
            <div className="sm:hidden">
              <Mascot3D size={92} speaking={Boolean(tour)} />
            </div>

            <div className="flex min-h-[11rem] min-w-0 flex-1 flex-col">
              {!tour ? (
                <div className="flex flex-1 items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin text-gold-400" />
                  Getting to know your goals…
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.18 }}
                    className="flex-1"
                  >
                    {heading && (
                      <p className="font-display text-lg font-semibold text-slate-50">{heading}</p>
                    )}
                    <p className={`text-sm leading-relaxed text-slate-300 ${heading ? 'mt-1.5' : ''}`}>{body}</p>
                  </motion.div>
                </AnimatePresence>
              )}

              {tour && (
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIndex((i) => Math.max(-1, i - 1))}
                    disabled={index < 0}
                    aria-label="Previous"
                    className="rounded-xl border border-ink-600 p-2 text-slate-400 transition-colors hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>

                  <div className="flex flex-1 items-center justify-center gap-1" aria-hidden>
                    {Array.from({ length: total }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-1 rounded-full transition-all ${
                          i === position ? 'w-4 bg-gold-400' : 'w-1 bg-ink-600'
                        }`}
                      />
                    ))}
                  </div>

                  {atEnd ? (
                    <button
                      type="button"
                      onClick={finish}
                      className="rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 px-4 py-2 text-sm font-semibold text-onAccent"
                    >
                      Start
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIndex((i) => i + 1)}
                      aria-label="Next"
                      className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 px-3 py-2 text-sm font-semibold text-onAccent"
                    >
                      Next
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
