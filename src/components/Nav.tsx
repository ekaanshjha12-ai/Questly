import { LayoutDashboard, ScrollText, Trophy, Shield, ListChecks, CalendarDays, Timer, Layers } from 'lucide-react'

export type View = 'dashboard' | 'todos' | 'schedule' | 'focus' | 'cards' | 'goals' | 'avatar' | 'achievements'

interface Props {
  view: View
  onChange: (view: View) => void
}

/** `short` keeps the phone labels narrow enough that eight tabs still fit on a
 * 360px screen without scrolling. */
const TABS: { id: View; label: string; short: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Quest Log', short: 'Quests', icon: LayoutDashboard },
  { id: 'todos', label: 'To-Do', short: 'To-Do', icon: ListChecks },
  { id: 'schedule', label: 'Schedule', short: 'Plan', icon: CalendarDays },
  { id: 'focus', label: 'Focus', short: 'Focus', icon: Timer },
  { id: 'cards', label: 'Study', short: 'Study', icon: Layers },
  { id: 'goals', label: 'Goals', short: 'Goals', icon: ScrollText },
  { id: 'avatar', label: 'Avatar', short: 'Hero', icon: Shield },
  { id: 'achievements', label: 'Achievements', short: 'Awards', icon: Trophy },
]

export default function Nav({ view, onChange }: Props) {
  return (
    <nav className="flex gap-0.5 rounded-xl border border-ink-600 bg-ink-850/70 p-1 sm:gap-1">
      {TABS.map((tab) => {
        const Icon = tab.icon
        const active = tab.id === view
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
            // Stacked icon-over-label on phones, inline on wider screens. The
            // min-height keeps every tap target comfortably past 44px.
            //
            // min-w-0 is load-bearing: flex items default to min-width:auto and
            // refuse to shrink below their content, so without it seven tabs
            // force the whole page wider than the viewport and clip every
            // screen, not just this bar.
            className={`flex min-h-[3rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium leading-none transition-colors sm:min-h-0 sm:flex-row sm:gap-1.5 sm:px-2 sm:py-2 sm:text-xs ${
              active ? 'bg-gradient-to-r from-gold-500 to-ember-500 text-ink-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {/* Short labels at every width — the full ones need ~990px and the
                content column is capped at 672px, so they never fit. */}
            <span className="truncate">{tab.short}</span>
          </button>
        )
      })}
    </nav>
  )
}
