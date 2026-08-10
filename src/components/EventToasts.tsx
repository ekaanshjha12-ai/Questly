import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Flame, Trophy, Zap } from 'lucide-react'
import type { AppEvent } from '../hooks/useAppState'
import { ACHIEVEMENTS } from '../lib/achievements'
import { findRank, rankForLevel } from '../data/ranks'

interface Props {
  events: AppEvent[]
  onDismiss: (id: string) => void
}

const AUTO_DISMISS_MS: Record<AppEvent['type'], number> = {
  xp: 1400,
  streak: 2200,
  achievement: 3200,
  levelup: 3600,
  rank: 4000,
}

function EventToast({ event, onDismiss }: { event: AppEvent; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(event.id), AUTO_DISMISS_MS[event.type])
    return () => clearTimeout(t)
  }, [event, onDismiss])

  if (event.type === 'xp') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 0, scale: 0.9 }}
        animate={{ opacity: 1, y: -8, scale: 1 }}
        exit={{ opacity: 0 }}
        className="flex items-center gap-1.5 rounded-full bg-gold-500 px-3 py-1.5 text-sm font-bold text-ink-950 shadow-glow"
      >
        <Zap className="h-4 w-4" /> +{event.amount} XP
      </motion.div>
    )
  }

  if (event.type === 'streak') {
    return (
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 40 }}
        className="flex items-center gap-2 rounded-xl border border-ember-500/40 bg-ink-850 px-4 py-3 shadow-xl"
      >
        <Flame className="h-5 w-5 text-ember-500" />
        <div>
          <p className="text-sm font-semibold text-ember-400">{event.days}-day streak!</p>
          <p className="text-xs text-slate-400">Keep the fire alive</p>
        </div>
      </motion.div>
    )
  }

  if (event.type === 'achievement') {
    const meta = ACHIEVEMENTS.find((a) => a.id === event.achievementId)
    return (
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 40 }}
        className="flex items-center gap-3 rounded-xl border border-gold-500/40 bg-ink-850 px-4 py-3 shadow-xl"
      >
        <span className="text-2xl">{meta?.icon ?? '🏅'}</span>
        <div>
          <p className="text-xs uppercase tracking-wide text-gold-400">Achievement Unlocked</p>
          <p className="text-sm font-semibold text-slate-100">{meta?.title ?? 'Achievement'}</p>
        </div>
      </motion.div>
    )
  }

  return null
}

export function ToastStack({ events, onDismiss }: Props) {
  // Level-ups and rank-ups get their own modal, so they never join the stack.
  const stackable = events.filter((e) => e.type !== 'levelup' && e.type !== 'rank')
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex flex-col-reverse items-end gap-2">
      <AnimatePresence>
        {stackable.map((e) => (
          <EventToast key={e.id} event={e} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}

export function LevelUpModal({ events, onDismiss }: Props) {
  // A rank-up always coincides with a level-up. When both fire, the rank is the
  // bigger news, so it wins the modal and the level-up is dismissed quietly.
  const rankEvent = events.find((e) => e.type === 'rank')
  const levelup = events.find((e) => e.type === 'levelup')

  useEffect(() => {
    if (rankEvent && levelup) onDismiss(levelup.id)
  }, [rankEvent, levelup, onDismiss])

  if (rankEvent && rankEvent.type === 'rank') {
    const rank = findRank(rankEvent.rankId)
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={() => onDismiss(rankEvent.id)}
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 18 }}
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border bg-gradient-to-b from-ink-800 to-ink-900 p-8 text-center"
            style={{ borderColor: `${rank.color}80`, boxShadow: `0 0 60px -12px ${rank.color}` }}
          >
            <motion.div
              className="absolute inset-x-0 top-0 h-1"
              style={{ background: rank.color }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            />
            <motion.span
              className="block text-6xl"
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 12 }}
            >
              {rank.icon}
            </motion.span>
            <p className="mt-4 text-xs uppercase tracking-[0.25em]" style={{ color: rank.color }}>
              Rank Up
            </p>
            <p className="font-display text-4xl font-bold text-slate-50 mt-1">{rank.name}</p>
            <p className="mt-2 text-sm text-slate-400">{rank.blurb}</p>
            <p className="mt-4 text-xs text-slate-500">A new character is available in the Avatar tab.</p>
            <button
              onClick={() => onDismiss(rankEvent.id)}
              className="mt-6 w-full rounded-xl py-2.5 font-semibold text-ink-950 hover:opacity-90"
              style={{ background: rank.color }}
            >
              Claim it
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <AnimatePresence>
      {levelup && levelup.type === 'levelup' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => onDismiss(levelup.id)}
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0, rotate: -4 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="relative w-full max-w-sm rounded-2xl border border-gold-500/50 bg-gradient-to-b from-ink-800 to-ink-900 p-8 text-center shadow-glow"
          >
            <Trophy className="mx-auto h-12 w-12 text-gold-400" />
            <p className="mt-3 text-xs uppercase tracking-[0.2em] text-gold-400">Level Up</p>
            <p className="font-display text-4xl font-bold text-slate-50 mt-1">Level {levelup.level}</p>
            <p className="mt-2 text-sm text-slate-400">You are a {rankForLevel(levelup.level).name}</p>
            <button
              onClick={() => onDismiss(levelup.id)}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2.5 font-semibold text-ink-950 hover:opacity-90"
            >
              Onward!
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
