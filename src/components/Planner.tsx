import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight, Plus, X, CalendarDays, GripVertical } from 'lucide-react'
import type { AppState, PlannerView, ScheduleEntry } from '../types'
import { periodKey as questPeriodKey } from '../lib/period'
import {
  DAY_BLOCKS,
  WEEKDAY_LABELS,
  monthGrid,
  periodKeyFor,
  periodLabel,
  shiftPeriod,
  weekDays,
  isSameDay,
} from '../lib/planner'

interface Props {
  state: AppState
  onSchedule: (refType: 'todo' | 'quest', refId: string, view: PlannerView, periodKey: string, slot: string) => void
  onMove: (entryId: string, periodKey: string, slot: string) => void
  onUnschedule: (entryId: string) => void
  onAddPlanned: (title: string, view: PlannerView, periodKey: string, slot: string) => void
  onToggleTodo: (todoId: string) => void
  onToggleQuest: (questId: string) => void
}

interface ResolvedTask {
  title: string
  done: boolean
}

type DragPayload =
  | { kind: 'new'; refType: 'todo' | 'quest'; refId: string }
  | { kind: 'move'; entryId: string }

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
  onSchedule,
  onMove,
  onUnschedule,
  onAddPlanned,
  onToggleTodo,
  onToggleQuest,
}: Props) {
  const [view, setView] = useState<PlannerView>('daily')
  const [cursor, setCursor] = useState(() => new Date())
  const [adding, setAdding] = useState<{ slot: string; label: string } | null>(null)
  const [draft, setDraft] = useState('')

  const activeKey = periodKeyFor(view, cursor)

  const todosById = useMemo(() => new Map(state.todos.map((t) => [t.id, t])), [state.todos])
  const questsById = useMemo(() => new Map(state.quests.map((q) => [q.id, q])), [state.quests])

  function resolve(entry: ScheduleEntry): ResolvedTask | null {
    if (entry.refType === 'todo') {
      const todo = todosById.get(entry.refId)
      return todo ? { title: todo.title, done: todo.done } : null
    }
    const quest = questsById.get(entry.refId)
    return quest ? { title: quest.title, done: quest.completed } : null
  }

  // Entries for the period on screen, grouped by slot. Dangling refs (task
  // deleted, or a quest from an expired period) are skipped.
  const entriesBySlot = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>()
    for (const entry of state.schedule) {
      if (entry.view !== view || entry.periodKey !== activeKey) continue
      if (!resolve(entry)) continue
      const list = map.get(entry.slot) ?? []
      list.push(entry)
      map.set(entry.slot, list)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.schedule, view, activeKey, todosById, questsById])

  const scheduledRefIds = useMemo(() => {
    const ids = new Set<string>()
    for (const entry of state.schedule) {
      if (entry.view === view && entry.periodKey === activeKey) ids.add(`${entry.refType}:${entry.refId}`)
    }
    return ids
  }, [state.schedule, view, activeKey])

  // Anything not yet placed in this period, ready to be dragged in.
  const backlog = useMemo(() => {
    const currentQuestKeys = {
      daily: questPeriodKey('daily'),
      weekly: questPeriodKey('weekly'),
      monthly: questPeriodKey('monthly'),
    }
    const items: { refType: 'todo' | 'quest'; refId: string; title: string; tag: string }[] = []

    for (const todo of state.todos) {
      if (todo.done) continue
      if (scheduledRefIds.has(`todo:${todo.id}`)) continue
      items.push({ refType: 'todo', refId: todo.id, title: todo.title, tag: 'To-do' })
    }
    for (const quest of state.quests) {
      if (quest.completed) continue
      if (quest.periodKey !== currentQuestKeys[quest.period]) continue
      if (scheduledRefIds.has(`quest:${quest.id}`)) continue
      items.push({ refType: 'quest', refId: quest.id, title: quest.title, tag: 'Quest' })
    }
    return items
  }, [state.todos, state.quests, scheduledRefIds])

  function handleDrop(payload: DragPayload, slot: string) {
    if (payload.kind === 'move') {
      onMove(payload.entryId, activeKey, slot)
    } else {
      onSchedule(payload.refType, payload.refId, view, activeKey, slot)
    }
  }

  function toggleEntry(entry: ScheduleEntry) {
    if (entry.refType === 'todo') onToggleTodo(entry.refId)
    else onToggleQuest(entry.refId)
  }

  function submitAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!adding || !draft.trim()) return
    onAddPlanned(draft, view, activeKey, adding.slot)
    setDraft('')
    setAdding(null)
  }

  function pickForSlot(refType: 'todo' | 'quest', refId: string) {
    if (!adding) return
    onSchedule(refType, refId, view, activeKey, adding.slot)
    setAdding(null)
  }

  const slotProps = (slot: string, label: string) => ({
    entries: entriesBySlot.get(slot) ?? [],
    resolve,
    isDropTarget: true,
    onDropPayload: (payload: DragPayload) => handleDrop(payload, slot),
    onOpenAdd: () => {
      setDraft('')
      setAdding({ slot, label })
    },
    onToggleEntry: toggleEntry,
    onRemoveEntry: (entry: ScheduleEntry) => onUnschedule(entry.id),
  })

  const today = new Date()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-slate-100">Schedule</h2>
        <div className="flex gap-1 rounded-xl border border-ink-600 bg-ink-850/70 p-1">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setView(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                view === tab.id
                  ? 'bg-gradient-to-r from-gold-500 to-ember-500 text-ink-950'
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
        <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
          <span className="hidden sm:inline">Unscheduled — drag into the planner, or use ＋ on any slot</span>
          <span className="sm:hidden">Unscheduled — tap ＋ on any slot to place one</span>
        </p>
        {backlog.length === 0 ? (
          <p className="py-2 text-xs text-slate-500">Everything here is placed. Nice.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {backlog.map((item) => (
              <div
                key={`${item.refType}:${item.refId}`}
                draggable
                onDragStart={(e) => {
                  const payload: DragPayload = { kind: 'new', refType: item.refType, refId: item.refId }
                  e.dataTransfer.setData('text/plain', JSON.stringify(payload))
                }}
                className="flex max-w-[15rem] cursor-grab items-center gap-1.5 rounded-lg border border-ink-600 bg-ink-800 px-2 py-1.5 active:cursor-grabbing hover:border-ink-500"
              >
                <GripVertical className="h-3 w-3 shrink-0 text-slate-600" />
                <span className="truncate text-[11px] text-slate-200" title={item.title}>
                  {item.title}
                </span>
                <span
                  className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${
                    item.tag === 'Quest' ? 'bg-gold-500/15 text-gold-400' : 'bg-mystic-500/15 text-mystic-400'
                  }`}
                >
                  {item.tag}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {view === 'daily' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {DAY_BLOCKS.map((block) => (
            <SlotCell key={block.id} label={block.label} hint={block.hint} minHeight="5.5rem" {...slotProps(block.id, block.label)} />
          ))}
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
              {...slotProps(String(i), WEEKDAY_LABELS[i])}
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
                  {...slotProps(String(day.getDate()), `${day.getDate()}`)}
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
                  className="rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 px-3 py-2 text-sm font-semibold text-ink-950 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add
                </button>
              </form>

              {backlog.length > 0 && (
                <>
                  <p className="mb-2 mt-4 text-[11px] uppercase tracking-wide text-slate-500">Or pick an existing one</p>
                  <div className="max-h-52 space-y-1 overflow-y-auto">
                    {backlog.map((item) => (
                      <button
                        key={`${item.refType}:${item.refId}`}
                        type="button"
                        onClick={() => pickForSlot(item.refType, item.refId)}
                        className="flex w-full items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-left transition-colors hover:border-ink-500"
                      >
                        <span className="flex-1 truncate text-xs text-slate-200">{item.title}</span>
                        <span
                          className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${
                            item.tag === 'Quest' ? 'bg-gold-500/15 text-gold-400' : 'bg-mystic-500/15 text-mystic-400'
                          }`}
                        >
                          {item.tag}
                        </span>
                      </button>
                    ))}
                  </div>
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
