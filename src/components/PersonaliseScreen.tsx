import { useEffect, useRef, useState } from 'react'
import { Check, MonitorSmartphone, Moon, MousePointer2, PartyPopper, Sun, UserRound } from 'lucide-react'
import type { AppState } from '../types'
import { useTheme, type ThemeChoice } from '../hooks/useTheme'
import { useCelebrations } from '../lib/prefs'
import CursorPicker from './CursorPicker'

/**
 * How the app looks and feels, in one place.
 *
 * Only things that change the experience rather than the data: a name, the
 * theme, the cursor, and whether progress gets confetti. Everything except the
 * name is stored per device — the same person may want a quiet dark screen on a
 * phone at night and the sword and sparks on a desktop.
 */
export default function PersonaliseScreen({
  state,
  onRename,
}: {
  state: AppState
  onRename: (name: string) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold text-slate-50">Personalise</h2>
        <p className="mt-0.5 text-xs text-slate-500">Make it yours. Changes apply straight away.</p>
      </div>

      <Section icon={UserRound} title="Your name" note="What the app calls you, and how you appear on the leaderboard.">
        <NameField name={state.player.name} onRename={onRename} />
      </Section>

      <Section icon={Sun} title="Theme" note="The day/night switch on the side does the same thing.">
        <ThemePicker />
      </Section>

      <Section icon={MousePointer2} title="Cursor" note="Hover a tile to try it before you pick.">
        <CursorPicker />
      </Section>

      <Section icon={PartyPopper} title="Celebrations" note="Confetti when you level up or reach a new rank.">
        <CelebrationToggle />
      </Section>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Section({
  icon: Icon,
  title,
  note,
  children,
}: {
  icon: typeof Sun
  title: string
  note: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-ink-600 bg-ink-850 p-4">
      <div className="flex items-start gap-2.5">
        <span className="icon-well flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-800">
          <Icon className="h-4 w-4 text-gold-400" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold text-slate-100">{title}</p>
          <p className="text-[11px] text-slate-500">{note}</p>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/**
 * Saved when you leave the field or press Enter, not on every keystroke — each
 * change to the state is a save to the server, and half-typed names are not
 * worth sending.
 */
function NameField({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(name)
  const [saved, setSaved] = useState(false)
  const editing = useRef(false)
  // Escape resets the draft and blurs, and blurring commits. The draft reset has
  // not rendered yet when the blur fires, so without this flag Escape would save
  // exactly what it was meant to throw away.
  const cancelled = useRef(false)

  // Follow a rename made elsewhere (another device syncing in) unless the user
  // is part-way through typing their own.
  useEffect(() => {
    if (!editing.current) setDraft(name)
  }, [name])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 1600)
    return () => clearTimeout(t)
  }, [saved])

  function commit() {
    editing.current = false
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    const next = draft.trim()
    if (!next) {
      setDraft(name)
      return
    }
    if (next !== name) {
      onRename(next)
      setSaved(true)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => {
          editing.current = true
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            cancelled.current = true
            setDraft(name)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        maxLength={24}
        aria-label="Your name"
        className="min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-gold-500/50 focus:outline-none"
      />
      <span
        className={`flex shrink-0 items-center gap-1 text-[11px] text-gold-400 transition-opacity ${
          saved ? 'opacity-100' : 'opacity-0'
        }`}
        aria-live="polite"
      >
        <Check className="h-3.5 w-3.5" />
        {saved ? 'Saved' : ''}
      </span>
    </div>
  )
}

const THEMES: { id: ThemeChoice; label: string; icon: typeof Sun; page: string; card: string }[] = [
  { id: 'light', label: 'Light', icon: Sun, page: '#e6e6e6', card: '#ffffff' },
  { id: 'dark', label: 'Dark', icon: Moon, page: '#0b0b0b', card: '#1f1f1f' },
  { id: 'system', label: 'Match device', icon: MonitorSmartphone, page: '', card: '' },
]

/** The three-way choice the switch on the rail cannot offer — "match my device"
 * lives here, since a switch only has two positions. */
function ThemePicker() {
  const { choice, setChoice } = useTheme()

  return (
    <div className="grid grid-cols-3 gap-2">
      {THEMES.map((theme) => {
        const Icon = theme.icon
        const active = choice === theme.id
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => setChoice(theme.id)}
            aria-pressed={active}
            className={`rounded-xl border p-2 text-left transition-colors ${
              active ? 'border-gold-500 bg-gold-500/10' : 'border-ink-600 bg-ink-800 hover:border-ink-500'
            }`}
          >
            {/* A miniature of the page: ground, a card, and the green accent. */}
            <span
              className="relative block h-12 overflow-hidden rounded-lg border border-ink-600"
              style={
                theme.id === 'system'
                  ? { background: 'linear-gradient(135deg, #e6e6e6 0 50%, #0b0b0b 50% 100%)' }
                  : { background: theme.page }
              }
              aria-hidden
            >
              {theme.id === 'system' ? (
                <>
                  <span className="absolute left-2 top-2 h-3 w-8 rounded-sm bg-white" />
                  <span className="absolute bottom-2 right-2 h-3 w-8 rounded-sm" style={{ background: '#1f1f1f' }} />
                </>
              ) : (
                <span
                  className="absolute inset-x-2 top-2 flex h-6 items-center gap-1 rounded-md px-1.5"
                  style={{ background: theme.card }}
                >
                  <span className="h-2 w-2 rounded-full bg-[#4ade80]" />
                  <span
                    className="h-1 flex-1 rounded-full"
                    style={{ background: theme.id === 'light' ? '#d4d4d4' : '#3a3a3a' }}
                  />
                </span>
              )}
            </span>
            <span className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-200">
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{theme.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function CelebrationToggle() {
  const [on, setOn] = useCelebrations()

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn(!on)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2.5 text-left"
    >
      <span className="text-xs text-slate-200">{on ? 'On' : 'Off'}</span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-gold-500' : 'bg-ink-600'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-[1.35rem]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}
