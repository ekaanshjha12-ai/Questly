import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Volume2, VolumeX, X, Moon } from 'lucide-react'
import { SOUNDS } from '../lib/noise'
import type { NoiseControls } from '../hooks/useNoise'

const SLEEP_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: 'Off', minutes: null },
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
]

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Animated purely through a ref — driving this from React state would re-render
 * the whole app sixty times a second. */
function LevelMeter({ getLevel, active }: { getLevel: () => number; active: boolean }) {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return
    let frame = 0
    const tick = () => {
      const el = barRef.current
      if (el) el.style.transform = `scaleX(${0.12 + getLevel() * 0.88})`
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, getLevel])

  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-ink-700">
      <div
        ref={barRef}
        className="h-full origin-left rounded-full bg-gradient-to-r from-mystic-400 to-gold-400"
        style={{ transform: 'scaleX(0.12)' }}
      />
    </div>
  )
}

export default function NoiseButton({ noise }: { noise: NoiseControls }) {
  const [open, setOpen] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const playing = noise.playing !== null

  // Only ticks while the panel is open, so a closed panel costs nothing.
  useEffect(() => {
    if (!open || noise.sleepAt === null) {
      setRemaining(null)
      return
    }
    const update = () => setRemaining(noise.sleepAt! - Date.now())
    update()
    const id = window.setInterval(update, 1000)
    return () => window.clearInterval(id)
  }, [open, noise.sleepAt])

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={playing ? 'Ambient sound playing — open controls' : 'Open ambient sound'}
        aria-expanded={open}
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className={`fixed right-0 top-1/2 z-40 flex h-14 w-11 -translate-y-1/2 items-center justify-center rounded-l-xl border border-r-0 shadow-lg transition-colors ${
          playing
            ? 'border-mystic-400/50 bg-mystic-500/20 text-mystic-300'
            : 'border-ink-600 bg-ink-850/90 text-slate-400 hover:text-slate-200'
        }`}
      >
        {playing ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        {playing && (
          <motion.span
            className="absolute inset-0 rounded-l-xl border border-mystic-400/60"
            animate={{ opacity: [0.6, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
            />

            <motion.div
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              role="dialog"
              aria-label="Ambient sound"
              className="fixed right-0 top-1/2 z-50 max-h-[85vh] w-[19rem] max-w-[calc(100vw-1.5rem)] -translate-y-1/2 overflow-y-auto rounded-l-2xl border border-r-0 border-ink-600 bg-ink-900/95 p-4 shadow-2xl backdrop-blur"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="font-display text-sm font-semibold text-slate-100">Ambient sound</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close ambient sound"
                  className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-ink-800 hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                {SOUNDS.map((sound) => {
                  const active = noise.playing === sound.id
                  return (
                    <button
                      key={sound.id}
                      type="button"
                      onClick={() => noise.toggle(sound.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? 'border-mystic-400/50 bg-mystic-500/10'
                          : 'border-ink-700 bg-ink-850/60 hover:border-ink-500'
                      }`}
                    >
                      <span className="text-lg">{sound.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-xs font-semibold ${active ? 'text-mystic-300' : 'text-slate-200'}`}
                        >
                          {sound.name}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">{sound.blurb}</span>
                      </span>
                      {active && <span className="text-[10px] font-semibold text-mystic-300">ON</span>}
                    </button>
                  )
                })}
              </div>

              {playing && (
                <div className="mt-3">
                  <LevelMeter getLevel={noise.getLevel} active={playing} />
                </div>
              )}

              <div className="mt-4">
                <label htmlFor="noise-volume" className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Volume</span>
                  <span className="text-slate-500">{Math.round(noise.volume * 100)}%</span>
                </label>
                <input
                  id="noise-volume"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={noise.volume}
                  onChange={(e) => noise.setVolume(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-700 accent-mystic-400"
                />
              </div>

              <div className="mt-4">
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Moon className="h-3 w-3" />
                  Sleep timer
                  {remaining !== null && remaining > 0 && (
                    <span className="ml-auto font-mono text-mystic-300">{formatRemaining(remaining)}</span>
                  )}
                </p>
                <div className="flex gap-1">
                  {SLEEP_OPTIONS.map((option) => {
                    const active =
                      option.minutes === null ? noise.sleepAt === null : noise.sleepAt !== null && remaining !== null
                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => noise.setSleepMinutes(option.minutes)}
                        className={`flex-1 rounded-lg border px-1 py-1.5 text-[11px] transition-colors ${
                          option.minutes === null && active
                            ? 'border-mystic-400/50 bg-mystic-500/10 text-mystic-300'
                            : 'border-ink-700 bg-ink-850/60 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1.5 text-[10px] text-slate-600">
                  Off means it keeps playing until you stop it.
                </p>
              </div>

              {playing && (
                <button
                  type="button"
                  onClick={noise.stop}
                  className="mt-4 w-full rounded-xl border border-ink-600 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-ember-500/50 hover:text-ember-400"
                >
                  Stop sound
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
