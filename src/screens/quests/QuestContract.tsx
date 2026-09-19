import { useState } from 'react'
import { m as motion, useReducedMotion } from 'framer-motion'
import { Check, Clock, Lock, Play, Plus, ListChecks, Sparkles, CalendarClock, Timer } from 'lucide-react'
import type { GameQuest } from '../../lib/api'
import { CATEGORY_LABEL, dueLabel, formatMinutes, isTimeable, progressLabel, questIcon } from '../../lib/questFormat'
import { ProgressBar } from '../../components/ui/Bars'
import { Parchment } from '../../components/ui/Panel'
import Tag, { QUEST_STATUS_LABEL, QUEST_TYPE_LABEL, RARITY_LABEL } from '../../components/ui/Tag'
import { useSettled } from '../../hooks/useSettled'

const RARITY_EDGE: Record<GameQuest['rarity'], string> = {
  common: 'before:bg-[#8f8a7d]',
  rare: 'before:bg-[#3f82c8]',
  epic: 'before:bg-[#8d5bd4]',
  legendary: 'before:bg-[#d4972a]',
}

const RARITY_GEM: Record<GameQuest['rarity'], string> = {
  common: 'bg-[#8f8a7d]',
  rare: 'bg-[#3f82c8]',
  epic: 'bg-[#8d5bd4]',
  legendary: 'bg-[#d4972a] shadow-[0_0_8px_rgba(212,151,42,0.8)]',
}

/**
 * A quest, drawn as a contract on parchment: what it is, what it pays, how far
 * along it is, and the one thing to do next. The coloured edge and gem are its
 * rarity.
 *
 * Starting a quest only marks it under way; the timer sits beside it for
 * anyone who wants to time the work, and is never required.
 */
export default function QuestContract({
  quest,
  onOpen,
  onStart,
  onComplete,
  onTimer,
  index = 0,
}: {
  quest: GameQuest
  onOpen: (quest: GameQuest) => void
  onStart: (quest: GameQuest) => Promise<unknown> | void
  onComplete: (quest: GameQuest) => Promise<unknown> | void
  onTimer: (quest: GameQuest) => void
  index?: number
}) {
  const reduce = useReducedMotion()
  const [busy, setBusy] = useState(false)
  const Icon = questIcon(quest)
  const done = quest.status === 'completed'
  const closed = done || quest.status === 'failed' || quest.status === 'expired'
  const due = dueLabel(quest.deadlineAt)
  const statusTone = done ? 'solid-green' : quest.status === 'in_progress' || quest.status === 'active' ? 'green' : quest.status === 'locked' ? 'neutral' : 'danger'
  const timeable = isTimeable(quest)
  // "Start quest" turns into "Mark complete" in the same place.
  const settled = useSettled(quest.status, quest.id)

  const workable = !closed && quest.status !== 'locked' && quest.status !== 'upcoming'
  const action: { label: string; icon: typeof Play; run: () => Promise<unknown> | void } | null = !workable
    ? null
    : timeable
      ? quest.status === 'in_progress'
        ? { label: 'Mark complete', icon: Check, run: () => onComplete(quest) }
        : { label: 'Start quest', icon: Play, run: () => onStart(quest) }
      : quest.progress.kind === 'count'
        ? { label: 'Log progress', icon: Plus, run: () => onOpen(quest) }
        : quest.progress.kind === 'milestones'
          ? { label: 'Milestones', icon: ListChecks, run: () => onOpen(quest) }
          : null

  async function act(run: () => Promise<unknown> | void) {
    setBusy(true)
    try {
      await run()
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.3 }}
    >
      <Parchment
        muted={closed && !done}
        className={`relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1 ${RARITY_EDGE[quest.rarity]} ${
          quest.rarity === 'legendary' && !closed ? 'ring-1 ring-[#d4972a]/60' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => onOpen(quest)}
          className="block w-full rounded-[0.9rem] px-4 pb-3 pt-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1f7a52]"
          aria-label={`${quest.title}, ${QUEST_TYPE_LABEL[quest.type]}, ${QUEST_STATUS_LABEL[quest.status]}, ${quest.xp} XP, ${RARITY_LABEL[quest.rarity]}`}
        >
          <div className="flex items-center justify-between gap-2">
            <Tag tone="ink">{QUEST_TYPE_LABEL[quest.type]}</Tag>
            <span className="flex items-center gap-1.5">
              {quest.verified && (
                <Tag tone="ink" className="!bg-[#1f7a52] !text-[#f3fbf6]">
                  <Sparkles className="h-2.5 w-2.5" /> Verified
                </Tag>
              )}
              <Tag tone={statusTone} className={statusTone === 'green' ? '!border-[#1f7a52]/50 !bg-[#1f7a52]/10 !text-[#1c6a47]' : statusTone === 'danger' ? '!text-[#9a2b2b]' : ''}>
                {quest.status === 'locked' && <Lock className="h-2.5 w-2.5" />}
                {QUEST_STATUS_LABEL[quest.status]}
              </Tag>
            </span>
          </div>

          <div className="mt-3 flex gap-3">
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#2b2216] text-[#efe2c4] shadow-[inset_0_0_0_2px_rgba(239,226,196,0.15)]">
              <Icon className="h-6 w-6" aria-hidden />
              <span className={`absolute -right-1 -top-1 h-3 w-3 rotate-45 rounded-[2px] ring-2 ring-[#f3e9d2] ${RARITY_GEM[quest.rarity]}`} aria-hidden />
              {done && (
                <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-[#1f7a52]/85">
                  <Check className="h-7 w-7 text-white" strokeWidth={3} />
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className={`font-display text-[1.15rem] font-bold uppercase leading-tight tracking-[0.01em] text-parch-ink ${closed ? 'opacity-80' : ''}`}>
                {quest.title}
              </h3>
              {quest.description && <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-parch-soft">{quest.description}</p>}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-parch-soft">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {formatMinutes(quest.durationMin)}
            </span>
            {due && (
              <span className="flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                {due}
              </span>
            )}
            <span className="ml-auto uppercase tracking-[0.08em]">{done ? 'Complete' : quest.progress.kind === 'check' ? progressLabel(quest) : `${quest.progress.percent}% complete`}</span>
          </div>

          {quest.progress.kind !== 'check' && !done && (
            <div className="mt-2">
              <div className="mb-1 flex justify-between text-[10.5px] font-semibold text-parch-soft">
                <span>{progressLabel(quest)}</span>
                <span>{quest.progress.percent}%</span>
              </div>
              <ProgressBar percent={quest.progress.percent} onParchment />
            </div>
          )}

          <div className="mt-3 flex items-center gap-3">
            <span className="font-display text-[15px] font-bold text-[#a8741a]">+{quest.xp} XP</span>
            <span className="text-[11px] font-semibold text-parch-soft">{CATEGORY_LABEL[quest.category]}</span>
          </div>
        </button>

        {action && (
          <div className="flex gap-2 px-4 pb-4">
            <button type="button" disabled={busy || !settled} onClick={() => void act(action.run)} className="btn-ink min-w-0 flex-1">
              <action.icon className="h-4 w-4" aria-hidden />
              {action.label}
            </button>
            {timeable && (
              <button type="button" onClick={() => onTimer(quest)} className="btn-ink-outline shrink-0 px-3" aria-label={`Time ${quest.title} with the timer`}>
                <Timer className="h-4 w-4" aria-hidden />
                Timer
              </button>
            )}
          </div>
        )}
      </Parchment>
    </motion.article>
  )
}
