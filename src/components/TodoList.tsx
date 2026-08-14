import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Plus, Trash2, Zap, ListChecks } from 'lucide-react'
import type { Todo } from '../types'
import { TODO_XP } from '../hooks/useAppState'

interface Props {
  todos: Todo[]
  onAdd: (title: string) => void
  onToggle: (todoId: string) => void
  onDelete: (todoId: string) => void
  onClearDone: () => void
}

function TodoRow({
  todo,
  onToggle,
  onDelete,
}: {
  todo: Todo
  onToggle: (todoId: string) => void
  onDelete: (todoId: string) => void
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.18 }}
      className={`group flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
        todo.done ? 'border-mystic-500/30 bg-mystic-500/5' : 'border-ink-600 bg-ink-800/60 hover:border-ink-500'
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(todo.id)}
        aria-label={todo.done ? `Mark "${todo.title}" as not done` : `Mark "${todo.title}" as done`}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          todo.done
            ? 'border-mystic-400 bg-mystic-500 text-white'
            : 'border-ink-500 bg-ink-900 text-transparent hover:border-slate-400'
        }`}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </button>

      <button type="button" onClick={() => onToggle(todo.id)} className="flex-1 min-w-0 text-left">
        <span className={`block text-sm font-medium ${todo.done ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
          {todo.title}
        </span>
      </button>

      {!todo.done && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-gold-500/10 px-2 py-1 text-[11px] font-semibold text-gold-400">
          <Zap className="h-3 w-3" />+{TODO_XP}
        </span>
      )}

      <button
        type="button"
        onClick={() => onDelete(todo.id)}
        aria-label={`Delete "${todo.title}"`}
        className="shrink-0 rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-ink-700 hover:text-ember-400"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}

export default function TodoList({ todos, onAdd, onToggle, onDelete, onClearDone }: Props) {
  const [draft, setDraft] = useState('')

  const { active, done } = useMemo(
    () => ({
      active: todos.filter((t) => !t.done),
      done: todos.filter((t) => t.done),
    }),
    [todos],
  )

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    onAdd(draft)
    setDraft('')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-slate-100">To-Do List</h2>
        <span className="text-xs text-slate-400">
          {done.length}/{todos.length} done
        </span>
      </div>

      <div className="rounded-2xl border border-ink-600 bg-ink-850/70 p-4">
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add anything you need to get done…"
            maxLength={120}
            autoComplete="off"
            name="questly-new-todo"
            className="flex-1 rounded-xl border border-ink-600 bg-ink-900 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/40"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 px-4 py-2.5 text-sm font-semibold text-onAccent transition-opacity disabled:cursor-not-allowed disabled:opacity-40 hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>
        <p className="mt-2 text-[11px] text-slate-500">
          Each one you finish earns {TODO_XP} XP and keeps your streak alive.
        </p>
      </div>

      {todos.length === 0 && (
        <div className="rounded-2xl border border-dashed border-ink-600 bg-ink-850/40 p-10 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-gold-400" />
          <p className="mt-3 text-sm text-slate-300">Nothing on the list yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Quests come from your goals — this is for everything else.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wide text-slate-500">To do ({active.length})</h3>
          <AnimatePresence initial={false}>
            {active.map((todo) => (
              <TodoRow key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </AnimatePresence>
        </section>
      )}

      {done.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wide text-slate-500">Done ({done.length})</h3>
            <button
              type="button"
              onClick={onClearDone}
              className="text-xs text-slate-500 transition-colors hover:text-ember-400"
            >
              Clear completed
            </button>
          </div>
          <AnimatePresence initial={false}>
            {done.map((todo) => (
              <TodoRow key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </AnimatePresence>
        </section>
      )}
    </div>
  )
}
