import { useMemo, useState } from 'react'
import { Plus, Archive } from 'lucide-react'
import type { Goal, GoalCategory } from '../types'
import { detectCategory, getCategoryMeta } from '../data/categories'
import CategoryPicker from './CategoryPicker'

interface Props {
  goals: Goal[]
  onAddGoal: (title: string, category: GoalCategory) => void
  onArchiveGoal: (goalId: string) => void
}

export default function GoalsManager({ goals, onAddGoal, onArchiveGoal }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<GoalCategory>('general')
  const [categoryTouched, setCategoryTouched] = useState(false)

  const suggested = useMemo(() => detectCategory(title), [title])
  const effectiveCategory = categoryTouched ? category : suggested

  const active = goals.filter((g) => !g.archived)
  const archived = goals.filter((g) => g.archived)

  function submit() {
    if (!title.trim()) return
    onAddGoal(title, effectiveCategory)
    setTitle('')
    setCategory('general')
    setCategoryTouched(false)
    setShowForm(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-slate-100">Your Goals</h2>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 px-3.5 py-2 text-sm font-semibold text-onAccent hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New Goal
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-ink-600 bg-ink-850/70 p-4 sm:p-5 space-y-4">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Write a novel, Save $10,000, Get promoted"
            maxLength={80}
            autoComplete="off"
            name="questly-new-goal"
            className="w-full rounded-xl border border-ink-600 bg-ink-900 px-4 py-3 text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/40"
          />
          <CategoryPicker
            value={effectiveCategory}
            onChange={(c) => {
              setCategoryTouched(true)
              setCategory(c)
            }}
          />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="rounded-xl border border-ink-600 px-4 py-2.5 text-sm text-slate-300 hover:bg-ink-800">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!title.trim()}
              className="flex-1 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2.5 font-semibold text-onAccent disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            >
              Create Quest Line
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {active.length === 0 && !showForm && (
          <p className="text-sm text-slate-500 py-4 text-center">No active goals. Create one to start earning quests.</p>
        )}
        {active.map((goal) => {
          const meta = getCategoryMeta(goal.category)
          return (
            <div
              key={goal.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-800/60 px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl">{meta.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-100 truncate">{goal.title}</p>
                  {goal.detail ? (
                    <p className="text-[11px] text-slate-400 truncate" title={goal.detail}>
                      {goal.detail}
                    </p>
                  ) : null}
                  <p className="text-[11px] text-slate-500">{meta.label}</p>
                </div>
              </div>
              <button
                onClick={() => onArchiveGoal(goal.id)}
                title="Archive goal"
                className="shrink-0 flex items-center gap-1 rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs text-slate-400 hover:border-ember-500/50 hover:text-ember-400"
              >
                <Archive className="h-3.5 w-3.5" /> Archive
              </button>
            </div>
          )
        })}
      </div>

      {archived.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs uppercase tracking-wide text-slate-500">Archived</h3>
          {archived.map((goal) => {
            const meta = getCategoryMeta(goal.category)
            return (
              <div key={goal.id} className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-800/30 px-4 py-3 opacity-60">
                <span className="text-xl grayscale">{meta.icon}</span>
                <p className="text-sm text-slate-400 truncate">{goal.title}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
