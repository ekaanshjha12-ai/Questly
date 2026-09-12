import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MousePointer2, X } from 'lucide-react'
import {
  CURSOR_FX,
  CURSOR_SETS,
  applyCursorPrefs,
  cursorUrl,
  loadCursorPrefs,
  saveCursorPrefs,
  type CursorPrefs,
  type CursorSet,
} from '../lib/cursors'

const FINE_POINTER = '(hover: hover) and (pointer: fine)'

/**
 * Cursor picker on the left rail, above the theme switch.
 *
 * Only shown when there is a mouse or trackpad. On a phone there is no cursor
 * to change, and a control that visibly does nothing is worse than no control.
 */
export default function CursorButton() {
  const [fine, setFine] = useState(() => window.matchMedia(FINE_POINTER).matches)
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState<CursorPrefs>(loadCursorPrefs)

  // A laptop can gain or lose a mouse while the app is open.
  useEffect(() => {
    const query = window.matchMedia(FINE_POINTER)
    const onChange = () => setFine(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function update(next: Partial<CursorPrefs>) {
    const merged = { ...prefs, ...next }
    setPrefs(merged)
    saveCursorPrefs(merged)
    applyCursorPrefs(merged)
  }

  if (!fine) return null

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change cursor"
        aria-expanded={open}
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="fixed bottom-[14rem] left-0 z-40 flex h-12 w-11 items-center justify-center rounded-r-xl border border-l-0 border-ink-600 bg-ink-850/90 text-slate-400 shadow-lg transition-colors hover:text-gold-300 md:bottom-auto md:top-[calc(50%-9.25rem)]"
      >
        <MousePointer2 className="h-5 w-5" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              role="dialog"
              aria-label="Cursor"
              className="fixed bottom-[8rem] left-14 z-50 w-[19rem] rounded-2xl border border-ink-600 bg-ink-900 p-3 shadow-2xl md:bottom-auto md:top-[calc(50%-12rem)]"
            >
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-semibold text-slate-100">Cursor</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-ink-800 hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">Hover a tile to try it before you pick.</p>

              <div className="mt-2.5 grid grid-cols-2 gap-2">
                {CURSOR_SETS.map((set) => (
                  <SetTile
                    key={set.id}
                    set={set}
                    active={prefs.set === set.id}
                    onPick={() => update({ set: set.id })}
                  />
                ))}
              </div>

              <p className="mt-4 text-[10px] uppercase tracking-wide text-slate-500">Animation</p>
              <div className="mt-1.5 grid grid-cols-4 gap-1 rounded-xl border border-ink-600 bg-ink-850 p-1">
                {CURSOR_FX.map((fx) => (
                  <button
                    key={fx.id}
                    type="button"
                    onClick={() => update({ fx: fx.id })}
                    aria-pressed={prefs.fx === fx.id}
                    className={`rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors ${
                      prefs.fx === fx.id
                        ? 'bg-gradient-to-r from-gold-500 to-ember-500 text-onAccent'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {fx.name}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                {CURSOR_FX.find((f) => f.id === prefs.fx)?.blurb}
                {prefs.fx !== 'none' && ' — click anywhere to see it.'}
              </p>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

function SetTile({ set, active, onPick }: { set: CursorSet; active: boolean; onPick: () => void }) {
  // The tile wears its own cursor, so hovering it is the preview.
  const cursor = set.pointer ? `${cursorUrl(set.pointer)}, pointer` : 'pointer'

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      style={{ cursor }}
      className={`flex items-center gap-2 rounded-xl border p-2 text-left transition-colors ${
        active ? 'border-gold-500 bg-gold-500/10' : 'border-ink-600 bg-ink-850 hover:border-ink-500'
      }`}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-800"
        aria-hidden
      >
        {set.default ? (
          <img
            src={`data:image/svg+xml,${encodeURIComponent(set.default.svg)}`}
            alt=""
            width={32}
            height={32}
            style={set.pixelated ? { imageRendering: 'pixelated' } : undefined}
          />
        ) : (
          <MousePointer2 className="h-5 w-5 text-slate-300" />
        )}
      </span>
      <span className="min-w-0">
        <span className={`block text-xs font-semibold ${active ? 'text-gold-300' : 'text-slate-100'}`}>
          {set.name}
        </span>
        <span className="block text-[10px] leading-tight text-slate-500">{set.blurb}</span>
      </span>
    </button>
  )
}
