import { useMemo } from 'react'
import type { AppState } from '../types'
import type { QuestPeriod } from '../types'
import { periodKey, PERIOD_LABEL } from '../lib/period'
import QuestCard from './QuestCard'
import PlayerHeader from './PlayerHeader'
import Greeting from './Greeting'
import { Sparkles } from 'lucide-react'
import { appearanceFor } from '../lib/appearance'
import type { LevelInfo } from '../lib/leveling'

interface Props {
  state: AppState
  levelInfo: LevelInfo
  onToggleQuest: (questId: string) => void
  onVerifyQuest: (questId: string) => void
  onOpenAvatar: () => void
}

const SECTION_META: Record<QuestPeriod, { title: string; subtitle: string; icon: string }> = {
  daily: { title: 'Daily Quests', subtitle: 'Refresh every day', icon: '🗡️' },
  weekly: { title: 'Weekly Quests', subtitle: 'Refresh every week', icon: '🛡️' },
  monthly: { title: 'Monthly Boss', subtitle: 'Refresh every month', icon: '🐉' },
}

export default function Dashboard({ state, levelInfo, onToggleQuest, onVerifyQuest, onOpenAvatar }: Props) {
  const appearance = useMemo(() => appearanceFor(state), [state])
  const activeGoals = useMemo(() => state.goals.filter((g) => !g.archived), [state.goals])
  const goalsById = useMemo(() => Object.fromEntries(state.goals.map((g) => [g.id, g])), [state.goals])

  const currentKeys: Record<QuestPeriod, string> = useMemo(
    () => ({
      daily: periodKey('daily'),
      weekly: periodKey('weekly'),
      monthly: periodKey('monthly'),
    }),
    [],
  )

  const questsByPeriod = useMemo(() => {
    const groups: Record<QuestPeriod, typeof state.quests> = { daily: [], weekly: [], monthly: [] }
    for (const quest of state.quests) {
      const goal = goalsById[quest.goalId]
      if (!goal || goal.archived) continue
      if (quest.periodKey !== currentKeys[quest.period]) continue
      groups[quest.period].push(quest)
    }
    return groups
  }, [state.quests, goalsById, currentKeys])

  if (activeGoals.length === 0) {
    return (
      <div className="space-y-6">
        <Greeting state={state} />
        <PlayerHeader
          player={state.player}
          levelInfo={levelInfo}
          streak={state.streak}
          appearance={appearance}
          onOpenAvatar={onOpenAvatar}
        />
        <div className="rounded-2xl border border-dashed border-ink-600 bg-ink-850/40 p-10 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-gold-400" />
          <p className="mt-3 text-slate-300">No active goals yet. Add one from the Goals tab to get quests.</p>
        </div>
      </div>
    )
  }

  const periods: QuestPeriod[] = ['daily', 'weekly', 'monthly']

  return (
    <div className="space-y-6">
      <Greeting state={state} />
      <PlayerHeader
        player={state.player}
        levelInfo={levelInfo}
        streak={state.streak}
        appearance={appearance}
        onOpenAvatar={onOpenAvatar}
      />

      {periods.map((period) => {
        const quests = questsByPeriod[period]
        const meta = SECTION_META[period]
        const completedCount = quests.filter((q) => q.completed).length

        return (
          <section key={period} className="rounded-2xl border border-ink-600 bg-ink-850/70 p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">{meta.icon}</span>
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-100">{meta.title}</h3>
                  <p className="text-[11px] text-slate-500">{meta.subtitle}</p>
                </div>
              </div>
              <span className="text-xs font-medium text-slate-400">
                {completedCount}/{quests.length}
              </span>
            </div>

            <div className="space-y-2">
              {quests.length === 0 && <p className="text-sm text-slate-500 py-2">No {PERIOD_LABEL[period].toLowerCase()} quests right now.</p>}
              {quests.map((quest) => {
                const goal = goalsById[quest.goalId]
                return (
                  <QuestCard
                    key={quest.id}
                    quest={quest}
                    category={goal?.category ?? 'general'}
                    goalTitle={goal?.title ?? ''}
                    onToggle={onToggleQuest}
                    onVerify={onVerifyQuest}
                  />
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
