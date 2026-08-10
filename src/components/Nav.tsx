import { LayoutDashboard, ScrollText, Trophy, Shield, ListChecks, CalendarDays, Timer } from 'lucide-react'

export type View = 'dashboard' | 'todos' | 'schedule' | 'focus' | 'goals' | 'avatar' | 'achievements'

interface Props {
  view: View
  onChange: (view: View) => void
}

/** `short` keeps the phone labels narrow enough that seven tabs still fit on a
 * 360px screen without scrolling. */
const TABS: { id: View; label: string; short: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Quest Log', short: 'Quests', icon: LayoutDashboard },
  { id: 'todos', label: 'To-Do', short: 'To-Do', icon: ListChecks },
  { id: 'schedule', label: 'Schedule', short: 'Plan', icon: CalendarDays },
  { id: 'focus', label: 'Focus', short: 'Focus', icon: Timer },
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
            className={`flex min-h-[3rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium leading-none transition-colors sm:min-h-0 sm:flex-row sm:gap-1.5 sm:px-3 sm:py-2 sm:text-sm ${
              active ? 'bg-gradient-to-r from-gold-500 to-ember-500 text-ink-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="sm:hidden">{tab.short}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
