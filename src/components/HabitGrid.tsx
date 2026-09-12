import { Fragment, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Settings2, Trash2, X } from 'lucide-react'
import type { AppState, MoodSlot } from '../types'
import { HABIT_COLORS, MOODS, findMood, habitColor, nextHabitColor } from '../data/moods'
import { dailyKey } from '../lib/period'

/**
 * The hand-tracked grid: your habits down the side, the month across the top,
 * and a square you tick yourself.
 *
 * Nothing here is generated, scored or verified, and ticking a box grants no
 * XP. That is the point — the rest of the app decides what you should be doing
 * and checks that you did it, and this is the one page where you write the rows
 * and mark them off on your own word. Making it pay XP would immediately make
 * it worth lying to.
 *
 * Laid out as one CSS grid rather than a table so every row shares a single
 * column definition: the day columns cannot drift out of line with their
 * headers, which is the failure a table of independent rows invites.
 */

interface Props {
  state: AppState
  onAddHabit: (name: string, color: string) => void
  onRenameHabit: (habitId: string, name: string) => void
  onRecolorHabit: (habitId: string, color: string) => void
  onDeleteHabit: (habitId: string) => void
  onToggleMark: (habitId: string, date: string) => void
  onSetMood: (date: string, slot: MoodSlot, moodId: string | null) => void
}

const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const CELL = 22
const LABEL_W = 132

function monthDays(year: number, month: number): Date[] {
  const days: Date[] = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

export default function HabitGrid({
  state,
  onAddHabit,
  onRenameHabit,
  onRecolorHabit,
  onDeleteHabit,
  onToggleMark,
  onSetMood,
}: Props) {
  const today = new Date()
  const todayKey = dailyKey(today)

  const [offset, setOffset] = useState(0)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  // The mood you are holding. Tapping a square paints it, tapping it again with
  // the same mood clears it — the paper version, without a popover per cell.
  const [pen, setPen] = useState(MOODS[0].id)

  const shown = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1)
    return { year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }
  }, [offset, today])

  const days = useMemo(() => monthDays(shown.year, shown.month), [shown.year, shown.month])
  const habits = state.habits.filter((h) => !h.archived)

  const columns = `${LABEL_W}px repeat(${days.length}, ${CELL}px)`

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const name = draft.trim()
    if (!name) return
    onAddHabit(name, nextHabitColor(state.habits.map((h) => h.color)))
    setDraft('')
  }

  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-850 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-display text-sm font-semibold text-slate-100">Your habits</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Add your own rows and tick the days off yourself.
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOffset((o) => o - 1)}
            aria-label="Previous month"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-ink-800 hover:text-slate-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[8.5rem] text-center text-xs font-medium text-slate-200">
            {shown.label}
          </span>
          <button
            type="button"
            onClick={() => setOffset((o) => o + 1)}
            // Nothing to see past this month, and letting the view run forward
            // forever just means getting lost in empty grids.
            disabled={offset >= 0}
            aria-label="Next month"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-ink-800 hover:text-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-label="Edit habits"
            aria-pressed={editing}
            className={`ml-1 rounded-lg p-1.5 transition-colors ${
              editing ? 'bg-gold-500/15 text-gold-300' : 'text-slate-400 hover:bg-ink-800 hover:text-slate-100'
            }`}
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {habits.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-ink-600 p-4 text-center text-xs text-slate-500">
          No habits yet. Add one below — “Drink water”, “Read 10 pages”, anything you want to keep
          an eye on.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: columns }}>
            {/* weekday letters */}
            <Corner />
            {days.map((d) => (
              <div
                key={`w-${d.getDate()}`}
                className="text-center text-[9px] leading-none text-slate-500"
              >
                {WEEKDAY_LETTER[d.getDay()]}
              </div>
            ))}

            {/* day numbers */}
            <Corner />
            {days.map((d) => {
              const isToday = dailyKey(d) === todayKey
              return (
                <div
                  key={`n-${d.getDate()}`}
                  className={`text-center text-[9px] leading-none tabular-nums ${
                    isToday ? 'font-bold text-gold-300' : 'text-slate-500'
                  }`}
                >
                  {d.getDate()}
                </div>
              )
            })}

            {habits.map((habit) => {
              const marks = new Set(state.habitMarks[habit.id] ?? [])
              const hex = habitColor(habit.color)
              const inMonth = days.filter((d) => marks.has(dailyKey(d))).length

              return (
                <Fragment key={habit.id}>
                  <RowLabel>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: hex }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{habit.name}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">{inMonth}</span>
                  </RowLabel>

                  {days.map((d) => {
                    const key = dailyKey(d)
                    const marked = marks.has(key)
                    const future = key > todayKey
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={future}
                        onClick={() => onToggleMark(habit.id, key)}
                        aria-label={`${habit.name}, ${key}${marked ? ', done' : ''}`}
                        aria-pressed={marked}
                        title={`${habit.name} — ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                        className={`h-[22px] rounded-[5px] transition-transform active:scale-90 ${
                          marked ? '' : 'bg-ink-800'
                        } ${future ? 'cursor-not-allowed opacity-30' : ''} ${
                          key === todayKey ? 'ring-1 ring-gold-400/70' : ''
                        }`}
                        style={marked ? { background: hex } : undefined}
                      />
                    )
                  })}
                </Fragment>
              )
            })}

            {/* --- mood, two rows: morning and evening --------------------- */}
            {(['am', 'pm'] as MoodSlot[]).map((slot) => (
              <Fragment key={slot}>
                <RowLabel>
                  <span className="min-w-0 flex-1 truncate uppercase tracking-wide text-slate-400">
                    Mood {slot}
                  </span>
                </RowLabel>
                {days.map((d) => {
                  const key = dailyKey(d)
                  const mood = findMood(state.moods[key]?.[slot])
                  const future = key > todayKey
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={future}
                      // Tapping with the mood already there clears it, so the
                      // same tap that made a mistake undoes it.
                      onClick={() => onSetMood(key, slot, mood?.id === pen ? null : pen)}
                      aria-label={`Mood ${slot}, ${key}${mood ? `, ${mood.name}` : ''}`}
                      title={mood ? `${mood.name} — ${key}` : `Tap to mark ${key}`}
                      className={`h-[22px] rounded-[5px] transition-transform active:scale-90 ${
                        mood ? '' : 'bg-ink-800'
                      } ${future ? 'cursor-not-allowed opacity-30' : ''} ${
                        key === todayKey ? 'ring-1 ring-gold-400/70' : ''
                      }`}
                      style={mood ? { background: mood.hex } : undefined}
                    />
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {/* --- the mood pen ---------------------------------------------------- */}
      <div className="mt-4 border-t border-ink-700 pt-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">
          Pick a mood, then tap a square
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MOODS.map((mood) => (
            <button
              key={mood.id}
              type="button"
              onClick={() => setPen(mood.id)}
              aria-pressed={mood.id === pen}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                mood.id === pen
                  ? 'border-transparent text-onAccent'
                  : 'border-ink-600 text-slate-300 hover:text-slate-100'
              }`}
              style={mood.id === pen ? { background: mood.hex } : undefined}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: mood.id === pen ? 'rgba(0,0,0,0.35)' : mood.hex }}
                aria-hidden
              />
              {mood.emoji} {mood.name}
            </button>
          ))}
        </div>
      </div>

      {/* --- add a habit ----------------------------------------------------- */}
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a habit…"
          maxLength={40}
          className="min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-gold-500/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="flex shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 px-3 py-2 text-xs font-semibold text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </form>

      {/* --- rename, recolour, remove ---------------------------------------- */}
      {editing && habits.length > 0 && (
        <div className="mt-3 space-y-2 rounded-xl border border-ink-600 bg-ink-800 p-3">
          {habits.map((habit) => (
            <div key={habit.id} className="flex flex-wrap items-center gap-2">
              <input
                value={habit.name}
                onChange={(e) => onRenameHabit(habit.id, e.target.value)}
                maxLength={40}
                aria-label={`Rename ${habit.name}`}
                className="min-w-0 flex-1 rounded-lg border border-ink-600 bg-ink-850 px-2 py-1.5 text-xs text-slate-100 focus:border-gold-500/50 focus:outline-none"
              />
              <div className="flex gap-1">
                {HABIT_COLORS.map((swatch) => (
                  <button
                    key={swatch.id}
                    type="button"
                    onClick={() => onRecolorHabit(habit.id, swatch.id)}
                    aria-label={swatch.name}
                    title={swatch.name}
                    className={`h-4 w-4 rounded-full transition-transform hover:scale-110 ${
                      habit.color === swatch.id ? 'ring-2 ring-slate-50 ring-offset-1 ring-offset-ink-800' : ''
                    }`}
                    style={{ background: swatch.hex }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => onDeleteHabit(habit.id)}
                aria-label={`Delete ${habit.name}`}
                className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-ink-850 hover:text-ember-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <p className="flex items-start gap-1.5 pt-1 text-[10px] text-slate-500">
            <X className="mt-px h-3 w-3 shrink-0" />
            Deleting a habit also removes every tick it has.
          </p>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/** The empty top-left cells. They have to carry the same sticky background as
 * the labels below, or the day numbers scroll out from under them. */
function Corner() {
  return <div className="sticky left-0 z-10 bg-ink-850" style={{ width: LABEL_W }} />
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="sticky left-0 z-10 flex items-center gap-1.5 bg-ink-850 pr-2 text-[11px] text-slate-200"
      style={{ width: LABEL_W }}
    >
      {children}
    </div>
  )
}
