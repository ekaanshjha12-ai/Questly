import type { GoalCategory } from '../types'
import { CATEGORIES } from '../data/categories'

interface Props {
  value: GoalCategory
  onChange: (category: GoalCategory) => void
}

export default function CategoryPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {CATEGORIES.map((cat) => {
        const active = cat.id === value
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onChange(cat.id)}
            className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-xs font-medium transition-all ${
              active
                ? 'border-gold-500/60 bg-gold-500/10 text-gold-300 shadow-glow'
                : 'border-ink-600 bg-ink-800/60 text-slate-300 hover:border-ink-500 hover:bg-ink-800'
            }`}
          >
            <span className="text-xl">{cat.icon}</span>
            <span className="text-center leading-tight">{cat.label}</span>
          </button>
        )
      })}
    </div>
  )
}
