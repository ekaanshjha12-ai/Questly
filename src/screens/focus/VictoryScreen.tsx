import { useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Clock, Share2, Sparkles, Star, Trophy } from 'lucide-react'
import type { FinishedFocus } from '../../game/GameProvider'
import { useGame } from '../../game/GameProvider'
import Button from '../../components/ui/Button'
import { RarityTag } from '../../components/ui/Tag'
import HeroSprite from '../../components/art/HeroSprite'
import ItemIcon from '../../components/art/ItemIcon'
import { formatClock } from '../../lib/time'

/**
 * The moment a focus session ends: what it was, how long, and everything it
 * paid — shown from the server's own settlement, so the numbers here are the
 * numbers in the ledger.
 */
export default function VictoryScreen({ result, onContinue, onShare }: { result: FinishedFocus; onContinue: () => void; onShare: () => void }) {
  const reduce = useReducedMotion()
  const { snapshot } = useGame()
  const { session, rewards, quest } = result
  const questDone = quest?.status === 'completed'
  const victory = session.status === 'completed' || questDone

  useEffect(() => {
    try {
      navigator.vibrate?.([30, 40, 60])
    } catch {
      // Not every device allows it.
    }
  }, [])

  const sparks = reduce ? [] : Array.from({ length: 14 }, (_, i) => i)

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-xl flex-col items-center px-5 pb-10 text-center safe-header">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_30%,rgba(226,166,52,0.16),transparent_60%)]" />

      <div className="relative mt-10">
        {sparks.map((i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-reward-300"
            style={{
              animation: `sparkle-drift ${1.6 + (i % 5) * 0.25}s ease-out ${i * 0.12}s infinite`,
              ['--dx' as string]: `${Math.cos((i / 14) * Math.PI * 2) * 90}px`,
              ['--dy' as string]: `${Math.sin((i / 14) * Math.PI * 2) * 90 - 20}px`,
            }}
          />
        ))}
        <motion.div initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
          <HeroSprite look={snapshot?.look} height={150} label="Your character, victorious" />
        </motion.div>
      </div>

      <motion.p
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-6 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-[0.25em] text-reward-400"
      >
        <Star className="h-4 w-4 fill-current" /> {victory ? 'Victory' : 'Session logged'} <Star className="h-4 w-4 fill-current" />
      </motion.p>
      <motion.h1
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-2 font-display text-3xl font-bold uppercase leading-tight text-slate-50"
      >
        {questDone ? 'Quest complete!' : victory ? 'Focus block complete' : 'Well fought'}
      </motion.h1>
      <p className="mt-1 text-sm text-slate-400">{quest?.title ?? session.label}</p>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="mt-6 grid w-full grid-cols-2 gap-3"
      >
        <div className="panel px-4 py-3">
          <p className="eyebrow flex items-center justify-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Focused
          </p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-50">{formatClock(session.activeMs)}</p>
        </div>
        <div className="panel border-reward-500/40 px-4 py-3">
          <p className="eyebrow flex items-center justify-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-reward-400" /> Earned
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-reward-400">+{rewards.xp} XP</p>
          {rewards.coins > 0 && <p className="text-[11px] text-reward-300">+{rewards.coins} coins</p>}
        </div>
      </motion.div>

      {rewards.capped && (
        <p className="mt-3 text-xs text-slate-500">You reached today&apos;s focus XP limit, so part of this session was not paid. It resets at midnight.</p>
      )}
      {session.xp === 0 && session.activeMs < 5 * 60_000 && <p className="mt-3 text-xs text-slate-500">Sessions shorter than five minutes are logged but do not earn XP.</p>}

      {(rewards.items.length > 0 || rewards.achievements.length > 0) && (
        <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="panel mt-4 w-full p-4 text-left">
          <p className="eyebrow mb-3 flex items-center justify-between">
            Reward unlocked <span className="tag border-reward-500/50 bg-reward-500/10 text-reward-300">New</span>
          </p>
          <ul className="space-y-2.5">
            {rewards.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-ink-600 bg-ink-950">
                  <ItemIcon itemId={item.id} size={40} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-100">{item.name}</span>
                  <RarityTag rarity={item.rarity} />
                </span>
              </li>
            ))}
            {rewards.achievements.map((a) => (
              <li key={a.id} className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-reward-500/40 bg-reward-500/10 text-reward-400">
                  <Trophy className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-100">{a.title}</span>
                  <span className="text-xs text-slate-400">{a.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      <div className="mt-auto grid w-full gap-2 pt-8">
        <Button variant="gold" block onClick={onContinue} className="!min-h-[52px]">
          Continue
        </Button>
        <Button variant="secondary" block icon={Share2} onClick={onShare}>
          Share progress
        </Button>
      </div>
    </div>
  )
}
