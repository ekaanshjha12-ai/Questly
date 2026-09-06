import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  CalendarDays, ChevronRight, Layers, LayoutDashboard, ListChecks,
  ScrollText, Shield, Timer, Trophy,
} from 'lucide-react'
import type { AppState } from '../types'
import type { View } from './Nav'
import { periodKey } from '../lib/period'
import { computeStats } from '../lib/progress'
import { rankForLevel } from '../data/ranks'
import Greeting from './Greeting'

/**
 * The landing screen: one card per section.
 *
 * Each carries a live figure rather than a description, because "3 open" tells
 * you whether to tap and "your to-do list" does not. The whole point of a hub
 * is deciding where to go, and that decision is made on the numbers.
 */
export default function HomeScreen({
  state,
  onGo,
}: {
  state: AppState
  onGo: (view: View) => void
}) {
  const cards = useMemo(() => {
    const stats = computeStats(state)
    const todayKey = periodKey('daily')
    const today = state.quests.filter((q) => q.period === 'daily' && q.periodKey === todayKey)
    const doneToday = today.filter((q) => q.completed).length
    const openTodos = state.todos.filter((t) => !t.done).length
    const activeGoals = state.goals.filter((g) => !g.archived).length
    const scheduled = state.schedule.length
    const cardCount = state.decks.reduce((sum, d) => sum + d.cards.length, 0)
    const rank = rankForLevel(state.progression.level)
    const hours = Math.round((stats.totalFocusMs / 3600000) * 10) / 10

    return [
      {
        id: 'dashboard' as View,
        icon: LayoutDashboard,
        title: 'Quests',
        stat: today.length ? `${doneToday} of ${today.length} done today` : 'No quests yet',
        tone: 'gold' as const,
        wide: true,
      },
      {
        id: 'todos' as View,
        icon: ListChecks,
        title: 'To-Do',
        stat: openTodos ? `${openTodos} open` : 'All clear',
        tone: 'mystic' as const,
      },
      {
        id: 'schedule' as View,
        icon: CalendarDays,
        title: 'Plan',
        stat: scheduled ? `${scheduled} placed` : 'Nothing scheduled',
        tone: 'gold' as const,
      },
      {
        id: 'focus' as View,
        icon: Timer,
        title: 'Focus',
        stat: stats.focusSessions ? `${hours}h over ${stats.focusSessions}` : 'Start a session',
        tone: 'ember' as const,
      },
      {
        id: 'cards' as View,
        icon: Layers,
        title: 'Study',
        stat: cardCount ? `${cardCount} cards` : 'Make a deck',
        tone: 'mystic' as const,
      },
      {
        id: 'goals' as View,
        icon: ScrollText,
        title: 'Goals',
        stat: activeGoals ? `${activeGoals} active` : 'Set your first',
        tone: 'gold' as const,
      },
      {
        id: 'avatar' as View,
        icon: Shield,
        title: 'Hero',
        stat: `${rank.name} · Level ${state.progression.level}`,
        tone: 'ember' as const,
      },
      {
        id: 'achievements' as View,
        icon: Trophy,
        title: 'Progress',
        stat: state.outlook ? `${state.outlook.probability}% likely` : `${stats.questsVerified} verified`,
        tone: 'mystic' as const,
      },
    ]
  }, [state])

  const TONE = {
    gold: 'text-gold-400',
    ember: 'text-ember-400',
    mystic: 'text-mystic-400',
  }

  return (
    <div className="space-y-5">
      <Greeting state={state} />

      <div className="grid grid-cols-2 gap-3">
        {cards.map((card, i) => {
          const Icon = card.icon
          return (
            <motion.button
              key={card.id}
              type="button"
              onClick={() => onGo(card.id)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.035, type: 'spring', stiffness: 320, damping: 26 }}
              // Both halves of the press live here. The CSS handles the shadow
              // collapsing; the transform has to be framer's, since its inline
              // style would overwrite a CSS one and the two would fight.
              whileTap={{ scale: 0.975, y: 4 }}
              className={`group flex items-center gap-3 rounded-2xl border border-ink-600 bg-ink-850 p-4 text-left ${
                card.wide ? 'col-span-2' : ''
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-800">
                <Icon className={`h-5 w-5 ${TONE[card.tone]}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-sm font-semibold text-slate-50">{card.title}</span>
                <span className="block truncate text-xs text-slate-400">{card.stat}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5" />
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
