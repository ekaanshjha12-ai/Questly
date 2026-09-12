import { useEffect, useState } from 'react'
import { MousePointer2 } from 'lucide-react'
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
 * Choose a cursor set and an animation.
 *
 * Applied the moment you pick, so the page you are looking at is the preview —
 * and each tile wears its own cursor, so hovering one shows it before you
 * commit.
 */
export default function CursorPicker() {
  const [prefs, setPrefs] = useState<CursorPrefs>(loadCursorPrefs)
  const [fine, setFine] = useState(() => window.matchMedia(FINE_POINTER).matches)

  // A laptop can gain or lose a mouse while the app is open.
  useEffect(() => {
    const query = window.matchMedia(FINE_POINTER)
    const onChange = () => setFine(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  function update(next: Partial<CursorPrefs>) {
    const merged = { ...prefs, ...next }
    setPrefs(merged)
    saveCursorPrefs(merged)
    applyCursorPrefs(merged)
  }

  return (
    <div>
      {!fine && (
        // Still selectable, because the choice is saved per device and may be
        // made on a tablet that later gets a keyboard and trackpad — but say
        // plainly why nothing visibly changes.
        <p className="mb-3 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-[11px] text-slate-400">
          Cursors only show with a mouse or trackpad. Your choice is saved for when you use one.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CURSOR_SETS.map((set) => (
          <SetTile key={set.id} set={set} active={prefs.set === set.id} onPick={() => update({ set: set.id })} />
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
        {prefs.fx !== 'none' && fine && ' — click anywhere to see it.'}
      </p>
    </div>
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
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-800" aria-hidden>
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
        <span className="block truncate text-[10px] text-slate-500">{set.blurb}</span>
      </span>
    </button>
  )
}
