import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight, Plus, X, CalendarDays, GripVertical, Search } from 'lucide-react'
import type { AppState, PlannerView, ScheduleEntry } from '../types'
import type { GameQuest } from '../lib/api'
import { dailyKey } from '../lib/period'
import {
  DAY_BLOCKS,
  WEEKDAY_LABELS,
  monthGrid,
  periodLabel,
  shiftPeriod,
  weekDays,
  isSameDay,
} from '../lib/planner'

interface Props {
  state: AppState
  /** The quest board: open quests and what was finished today. */
  quests: GameQuest[]
  onSchedule: (refType: 'todo' | 'quest', refId: string, date: string, block?: string) => void
  onMove: (entryId: string, date: string, block?: string | null) => void
  onUnschedule: (entryId: string) => void
  /** Writes a new optional quest and places it. */
  onAddPlanned: (title: string, date: string, block?: string) => void
  /** Ticks a quest done where a tick completes it; otherwise opens it. */
  onToggleQuest: (quest: GameQuest) => void
}

interface ResolvedTask {
  title: string
  done: boolean
}

type DragPayload =
  | { kind: 'new'; refType: 'todo' | 'quest'; refId: string }
  | { kind: 'move'; entryId: string }

/** Something not placed on any day yet. */
interface BacklogItem {
  refType: 'todo' | 'quest'
  refId: string
  title: string
  tag: string
  /** "Daily · 20 XP" for a quest; empty for a to-do. */
  detail: string
}

type BacklogFilter = 'all' | 'quest' | 'todo'

const FILTERS: { id: BacklogFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'quest', label: 'Quests' },
  { id: 'todo', label: 'Optional' },
]

const TYPE_LABEL = { main: 'Main quest', side: 'Side quest', daily: 'Daily quest', club: 'Club quest', challenge: 'Challenge', optional: 'Optional' } as const

/**
 * The tasks still waiting for a place, as a searchable list that scrolls in a
 * box of its own — rather than every quest laid across the page at once, which
 * with a few goals' worth of quests was a wall to hunt through.
 *
 * `drag` rows are dragged onto the planner; `pick` rows place themselves on
 * tap, for the add sheet.
 */
function BacklogPicker({
  items,
  mode,
  onPick,
  autoFocus = false,
  maxHeight,
}: {
  items: BacklogItem[]
  mode: 'drag' | 'pick'
  onPick?: (item: BacklogItem) => void
  autoFocus?: boolean
  maxHeight: string
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<BacklogFilter>('all')

  const counts = {
    all: items.length,
    quest: items.filter((i) => i.refType === 'quest').length,
    todo: items.filter((i) => i.refType === 'todo').length,
  }
  const q = query.trim().toLowerCase()
  const shown = items.filter((i) => (filter === 'all' || i.refType === filter) && (!q || i.title.toLowerCase().includes(q)))

  const row = (item: BacklogItem) => (
    <>
      {mode === 'drag' && <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-600" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-slate-200" title={item.title}>
          {item.title}
        </span>
        {item.detail && <span className="block text-[10px] text-slate-500">{item.detail}</span>}
      </span>
      <span
        className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${
          item.tag === 'Quest' ? 'bg-gold-500/15 text-gold-400' : 'bg-mystic-500/15 text-mystic-400'
        }`}
      >
        {item.tag}
      </span>
      {mode === 'pick' && <Plus className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
    </>
  )

  return (
    <div>
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 80))}
            placeholder="Search quests and to-dos"
            aria-label="Search unscheduled tasks"
            autoFocus={autoFocus}
            autoComplete="off"
            className="w-full rounded-lg border border-ink-600 bg-ink-950 py-1.5 pl-8 pr-7 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-slate-200"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="inline-flex gap-0.5 rounded-lg border border-ink-600 bg-ink-800 p-0.5" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                filter === f.id ? 'bg-ink-600 text-slate-50' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label} <span className="tabular-nums text-slate-500">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-2 space-y-1 overflow-y-auto overscroll-contain pr-1" style={{ maxHeight }}>
        {shown.map((item) => (
          <li key={`${item.refType}:${item.refId}`}>
            {mode === 'drag' ? (
              <div
                draggable
                onDragStart={(e) => {
                  const payload: DragPayload = { kind: 'new', refType: item.refType, refId: item.refId }
                  e.dataTransfer.setData('text/plain', JSON.stringify(payload))
                }}
                className="flex cursor-grab items-center gap-2 rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1.5 active:cursor-grabbing hover:border-ink-500"
              >
                {row(item)}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onPick?.(item)}
                className="flex w-full items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-left transition-colors hover:border-ink-500"
              >
                {row(item)}
              </button>
            )}
          </li>
        ))}
      </ul>

      {shown.length === 0 && (
        <p className="py-3 text-center text-xs text-slate-500">
          {q ? `Nothing matches "${query.trim()}".` : filter === 'quest' ? 'No quests waiting.' : 'No to-dos waiting.'}
        </p>
      )}
      {shown.length > 0 && (q || filter !== 'all') && (
        <p className="mt-1 text-right text-[10px] text-slate-500">
          Showing {shown.length} of {items.length}
        </p>
      )}
    </div>
  )
}

const VIEW_TABS: { id: PlannerView; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
]

function TaskChip({
  entry,
  task,
  onToggle,
  onRemove,
}: {
  entry: ScheduleEntry
  task: ResolvedTask
  onToggle: () => void
  onRemove: () => void
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      draggable
      onDragStart={(e) => {
        const payload: DragPayload = { kind: 'move', entryId: entry.id }
        ;(e as unknown as React.DragEvent).dataTransfer.setData('text/plain', JSON.stringify(payload))
      }}
      className={`group flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left ${
        task.done ? 'border-mystic-500/30 bg-mystic-500/10' : 'border-ink-600 bg-ink-800 hover:border-ink-500'
      }`}
    >
      <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-slate-600" />
      <button
        type="button"
        onClick={onToggle}
        aria-label={task.done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
          task.done ? 'border-mystic-400 bg-mystic-500 text-white' : 'border-ink-500 bg-ink-900 text-transparent'
        }`}
      >
        <Check className="h-2.5 w-2.5" strokeWidth={4} />
      </button>
      <span
        className={`flex-1 truncate text-[11px] leading-tight ${
          task.done ? 'text-slate-500 line-through' : 'text-slate-200'
        }`}
        title={task.title}
      >
        {task.title}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove "${task.title}" from schedule`}
        className="shrink-0 rounded p-0.5 text-slate-600 transition-opacity sm:opacity-0 hover:text-ember-400 sm:group-hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </motion.div>
  )
}

function SlotCell({
  label,
  hint,
  entries,
  resolve,
  highlight,
  muted,
  minHeight,
  isDropTarget,
  onDropPayload,
  onOpenAdd,
  onToggleEntry,
  onRemoveEntry,
}: {
  label: string
  hint?: string
  entries: ScheduleEntry[]
  resolve: (entry: ScheduleEntry) => ResolvedTask | null
  highlight?: boolean
  muted?: boolean
  minHeight: string
  isDropTarget: boolean
  onDropPayload: (payload: DragPayload) => void
  onOpenAdd: () => void
  onToggleEntry: (entry: ScheduleEntry) => void
  onRemoveEntry: (entry: ScheduleEntry) => void
}) {
  const [over, setOver] = useState(false)

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        try {
          const payload = JSON.parse(e.dataTransfer.getData('text/plain')) as DragPayload
          onDropPayload(payload)
        } catch {
          // Ignore drops that aren't ours (e.g. text dragged in from elsewhere).
        }
      }}
      className={`group/slot flex flex-col rounded-xl border p-2 transition-colors ${
        over && isDropTarget
          ? 'border-gold-500/70 bg-gold-500/10'
          : highlight
            ? 'border-gold-500/40 bg-ink-800/70'
            : muted
              ? 'border-ink-700/60 bg-ink-850/30'
              : 'border-ink-600 bg-ink-850/60'
      }`}
      style={{ minHeight }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <div className="min-w-0">
          <p className={`truncate text-[11px] font-semibold ${muted ? 'text-slate-600' : 'text-slate-300'}`}>{label}</p>
          {hint && <p className="text-[9px] text-slate-600">{hint}</p>}
        </div>
        <button
          type="button"
          onClick={onOpenAdd}
          aria-label={`Add task to ${label}`}
          className="shrink-0 rounded-md p-0.5 text-slate-600 transition-colors hover:bg-ink-700 hover:text-gold-400"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1">
        <AnimatePresence initial={false}>
          {entries.map((entry) => {
            const task = resolve(entry)
            if (!task) return null
            return (
              <TaskChip
                key={entry.id}
                entry={entry}
                task={task}
                onToggle={() => onToggleEntry(entry)}
                onRemove={() => onRemoveEntry(entry)}
              />
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function Planner({
  state,
  quests,
  onSchedule,
  onMove,
  onUnschedule,
  onAddPlanned,
  onToggleQuest,
}: Props) {
  const [view, setView] = useState<PlannerView>('daily')
  const [cursor, setCursor] = useState(() => new Date())
  const [adding, setAdding] = useState<{ date: string; block?: string; label: string } | null>(null)
  const [draft, setDraft] = useState('')

  const questsById = useMemo(() => new Map(quests.map((q) => [q.id, q])), [quests])

  // To-dos became optional quests and kept their ids, so a placement of either
  // kind resolves against the same board.
  function resolve(entry: ScheduleEntry): ResolvedTask | null {
    const quest = questsById.get(entry.refId)
    return quest ? { title: quest.title, done: quest.status === 'completed' } : null
  }

  // Every placement, keyed by the day it sits on. All three views read this same
  // map, which is what makes a task assigned once show up in all of them.
  // Dangling refs (task deleted, or a quest from an expired period) are skipped.
  const entriesByDate = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>()
    for (const entry of state.schedule) {
      if (!resolve(entry)) continue
      const list = map.get(entry.date) ?? []
      list.push(entry)
      map.set(entry.date, list)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.schedule, questsById])

  // Scheduled anywhere, not just in the period on screen — otherwise a task
  // already placed on another day would offer itself for placing again.
  const scheduledRefIds = useMemo(() => {
    const ids = new Set<string>()
    for (const entry of state.schedule) ids.add(entry.refId)
    return ids
  }, [state.schedule])

  // Anything not placed on any day yet, ready to be dragged in. A task already
  // sitting somewhere is absent from every view's list rather than offering
  // itself for a second placement — moving it is done by dragging the chip.
  const backlog = useMemo(() => {
    const items: BacklogItem[] = []
    for (const quest of quests) {
      if (quest.status !== 'active' && quest.status !== 'in_progress' && quest.status !== 'upcoming') continue
      if (scheduledRefIds.has(quest.id)) continue
      items.push({
        refType: quest.type === 'optional' ? 'todo' : 'quest',
        refId: quest.id,
        title: quest.title,
        tag: TYPE_LABEL[quest.type],
        detail: `${quest.xp} XP`,
      })
    }
    return items
  }, [quests, scheduledRefIds])

  /** `block` undefined on a move means "keep the time it already had" — dragging
   * between weekday columns should not silently clear the hour. Dropping into a
   * daily cell passes one explicitly, and Anytime passes null to clear it. */
  function handleDrop(payload: DragPayload, date: string, block?: string | null) {
    if (payload.kind === 'move') {
      onMove(payload.entryId, date, block)
    } else {
      onSchedule(payload.refType, payload.refId, date, block ?? undefined)
    }
  }

  function toggleEntry(entry: ScheduleEntry) {
    const quest = questsById.get(entry.refId)
    if (quest) onToggleQuest(quest)
  }

  function submitAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!adding || !draft.trim()) return
    onAddPlanned(draft, adding.date, adding.block)
    setDraft('')
    setAdding(null)
  }

  function pickForSlot(refType: 'todo' | 'quest', refId: string) {
    if (!adding) return
    onSchedule(refType, refId, adding.date, adding.block)
    setAdding(null)
  }

  /** One day's cell. `block` narrows it to a time of day in the daily view;
   * weekly and monthly cells hold the whole day. */
  const cellProps = (date: string, label: string, block?: string | null) => ({
    entries: (entriesByDate.get(date) ?? []).filter((e) =>
      block === undefined ? true : block === null ? !e.block : e.block === block,
    ),
    resolve,
    isDropTarget: true,
    onDropPayload: (payload: DragPayload) => handleDrop(payload, date, block),
    onOpenAdd: () => {
      setDraft('')
      setAdding({ date, block: block ?? undefined, label })
    },
    onToggleEntry: toggleEntry,
    onRemoveEntry: (entry: ScheduleEntry) => onUnschedule(entry.id),
  })

  const today = new Date()
  const cursorKey = dailyKey(cursor)
  const anytimeToday = (entriesByDate.get(cursorKey) ?? []).filter((e) => !e.block)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="sr-only">Schedule</h2>
        <div className="flex gap-1 rounded-xl border border-ink-600 bg-ink-850/70 p-1">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setView(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                view === tab.id
                  ? 'bg-gradient-to-r from-gold-500 to-ember-500 text-onAccent'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-xl border border-ink-600 bg-ink-850/70 px-3 py-2">
        <button
          type="button"
          onClick={() => setCursor((c) => shiftPeriod(view, c, -1))}
          aria-label="Previous period"
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-ink-700 hover:text-slate-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-100">{periodLabel(view, cursor)}</p>
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="text-[11px] text-slate-500 transition-colors hover:text-gold-400"
          >
            Jump to today
          </button>
        </div>
        <button
          type="button"
          onClick={() => setCursor((c) => shiftPeriod(view, c, 1))}
          aria-label="Next period"
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-ink-700 hover:text-slate-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="rounded-2xl border border-ink-600 bg-ink-850/70 p-3">
        <p className="mb-2 flex items-baseline justify-between gap-2 text-[11px] uppercase tracking-wide text-slate-500">
          <span>Unscheduled</span>
          <span className="normal-case tracking-normal text-slate-500">
            <span className="hidden sm:inline">Drag onto the planner, or use ＋ on any slot</span>
            <span className="sm:hidden">Tap ＋ on any slot to place one</span>
          </span>
        </p>
        {backlog.length === 0 ? (
          <p className="py-2 text-xs text-slate-500">Everything here is placed. Nice.</p>
        ) : (
          <BacklogPicker items={backlog} mode="drag" maxHeight="13rem" />
        )}
      </div>

      {view === 'daily' && (
        <div className="space-y-2">
          {/* Placements made from the weekly or monthly grid carry no time of
              day, so they need somewhere to live here. Hidden when empty. */}
          {anytimeToday.length > 0 && (
            <SlotCell
              label="Anytime"
              hint="No set time"
              minHeight="4rem"
              {...cellProps(cursorKey, 'Anytime', null)}
            />
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {DAY_BLOCKS.map((block) => (
              <SlotCell
                key={block.id}
                label={block.label}
                hint={block.hint}
                minHeight="5.5rem"
                {...cellProps(cursorKey, block.label, block.id)}
              />
            ))}
          </div>
        </div>
      )}

      {view === 'weekly' && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {weekDays(cursor).map((day, i) => (
            <SlotCell
              key={i}
              label={WEEKDAY_LABELS[i]}
              hint={day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              highlight={isSameDay(day, today)}
              minHeight="7rem"
              {...cellProps(dailyKey(day), WEEKDAY_LABELS[i])}
            />
          ))}
        </div>
      )}

      {view === 'monthly' && (
        <div className="space-y-2">
          <div className="grid grid-cols-7 gap-2">
            {WEEKDAY_LABELS.map((label) => (
              <p key={label} className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                {label}
              </p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {monthGrid(cursor).map((day, i) =>
              day ? (
                <SlotCell
                  key={i}
                  label={String(day.getDate())}
                  highlight={isSameDay(day, today)}
                  minHeight="5rem"
                  {...cellProps(dailyKey(day), `${day.getDate()}`)}
                />
              ) : (
                <div key={i} className="rounded-xl border border-dashed border-ink-700/40" style={{ minHeight: '5rem' }} />
              ),
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
            onClick={() => setAdding(null)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-ink-600 bg-ink-900 p-5 shadow-2xl"
            >
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-gold-400" />
                <p className="text-sm font-semibold text-slate-100">Add to {adding.label}</p>
              </div>

              <form onSubmit={submitAdd} className="flex gap-2">
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="New task…"
                  maxLength={120}
                  autoComplete="off"
                  name="questly-planner-task"
                  className="flex-1 rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 px-3 py-2 text-sm font-semibold text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add
                </button>
              </form>

              {backlog.length > 0 && (
                <>
                  <p className="mb-2 mt-4 text-[11px] uppercase tracking-wide text-slate-500">Or pick an existing one</p>
                  <BacklogPicker items={backlog} mode="pick" onPick={(item) => pickForSlot(item.refType, item.refId)} maxHeight="15rem" />
                </>
              )}

              <button
                type="button"
                onClick={() => setAdding(null)}
                className="mt-4 w-full rounded-xl border border-ink-600 py-2 text-sm text-slate-300 transition-colors hover:bg-ink-800"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
