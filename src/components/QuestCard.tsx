import { motion } from 'framer-motion'
import { Check, Zap, ShieldCheck, Camera } from 'lucide-react'
import type { Quest } from '../types'
import { getCategoryMeta } from '../data/categories'
import type { GoalCategory } from '../types'

interface Props {
  quest: Quest
  category: GoalCategory
  goalTitle: string
  onToggle: (questId: string) => void
  onVerify: (questId: string) => void
}

export default function QuestCard({ quest, category, goalTitle, onToggle, onVerify }: Props) {
  const meta = getCategoryMeta(category)
  const verified = Boolean(quest.verifiedBy)

  return (
    <motion.div
      layout
      className={`group flex w-full items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
        verified
          ? 'border-gold-500/40 bg-gold-500/5'
          : quest.completed
            ? 'border-mystic-500/30 bg-mystic-500/5'
            : 'border-ink-600 bg-ink-800/60 hover:border-ink-500 hover:bg-ink-800'
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(quest.id)}
        disabled={verified}
        aria-label={quest.completed ? `Mark "${quest.title}" as not done` : `Mark "${quest.title}" as done`}
        title={verified ? 'Verified quests stay completed' : undefined}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          quest.completed
            ? 'border-mystic-400 bg-mystic-500 text-white'
            : 'border-ink-500 bg-ink-900 text-transparent group-hover:border-slate-400'
        } ${verified ? 'cursor-default' : ''}`}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </button>

      <button
        type="button"
        onClick={() => onToggle(quest.id)}
        disabled={verified}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <span
          className={`block text-sm font-medium ${
            quest.completed ? 'text-slate-400 line-through' : 'text-slate-100'
          }`}
        >
          {quest.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span>
            {meta.icon} {goalTitle}
          </span>
          {verified && (
            <span className="flex items-center gap-1 text-gold-400" title={quest.verificationNote}>
              <ShieldCheck className="h-3 w-3" />
              Verified
            </span>
          )}
        </span>
      </button>

      {!verified && (
        <button
          type="button"
          onClick={() => onVerify(quest.id)}
          aria-label={`Verify "${quest.title}" with proof`}
          title="Verify with a photo or your voice for bonus XP"
          className="mt-0.5 shrink-0 rounded-lg border border-ink-600 p-1.5 text-slate-500 transition-colors hover:border-gold-500/50 hover:text-gold-400"
        >
          <Camera className="h-3.5 w-3.5" />
        </button>
      )}

      <span className="mt-0.5 flex shrink-0 items-center gap-1 rounded-full bg-gold-500/10 px-2 py-1 text-[11px] font-semibold text-gold-400">
        <Zap className="h-3 w-3" />+{quest.xp}
      </span>
    </motion.div>
  )
}
