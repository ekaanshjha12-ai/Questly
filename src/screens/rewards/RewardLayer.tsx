import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Crown, Flame, Sparkles, Trophy } from 'lucide-react'
import { useGame, type Celebration } from '../../game/GameProvider'
import { useRouter } from '../../app/router'
import Button from '../../components/ui/Button'
import { RarityTag } from '../../components/ui/Tag'
import HeroSprite from '../../components/art/HeroSprite'
import ItemIcon from '../../components/art/ItemIcon'
import { rankForLevel } from '../../data/ranks'

/**
 * Where earning things is shown: small banners for XP, streaks, achievements
 * and items, and the whole screen for a level-up. Everything shown came from
 * a server reward summary.
 */
export default function RewardLayer() {
  const { celebrations, dismissCelebration } = useGame()
  const level = celebrations.find((c) => c.type === 'level') as Extract<Celebration, { type: 'level' }> | undefined
  const banners = celebrations.filter((c) => c.type !== 'level').slice(0, 3)

  return createPortal(
    <>
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[75] flex flex-col items-center gap-2 px-4 safe-header">
        <AnimatePresence>
          {!level && banners.map((c) => <Banner key={c.id} celebration={c} onDone={() => dismissCelebration(c.id)} />)}
        </AnimatePresence>
      </div>
      <AnimatePresence>{level && <LevelUp key={level.id} celebration={level} onClose={() => dismissCelebration(level.id)} />}</AnimatePresence>
    </>,
    document.body,
  )
}

function Banner({ celebration, onDone }: { celebration: Celebration; onDone: () => void }) {
  const reduce = useReducedMotion()
  useEffect(() => {
    const t = window.setTimeout(onDone, celebration.type === 'xp' ? 2600 : 4200)
    return () => window.clearTimeout(t)
  }, [celebration.type, onDone])

  let icon = <Sparkles className="h-5 w-5" />
  let title = ''
  let body: string | null = null
  let accent = 'text-reward-400 border-reward-500/40'
  switch (celebration.type) {
    case 'xp':
      title = `+${celebration.amount} XP`
      body = celebration.capped ? 'Daily limit reached for self-reported XP.' : celebration.label
      break
    case 'streak':
      icon = <Flame className="h-5 w-5" />
      title = `${celebration.days}-day streak`
      body = 'Come back tomorrow to keep it burning.'
      accent = 'text-[#f08a3c] border-[#f08a3c]/40'
      break
    case 'achievement':
      icon = <Trophy className="h-5 w-5" />
      title = celebration.achievement.title
      body = `Achievement unlocked${celebration.achievement.xp ? ` · +${celebration.achievement.xp} XP` : ''}`
      break
    case 'item':
      icon = <ItemIcon itemId={celebration.item.id} size={28} />
      title = celebration.item.name
      body = 'Added to your wardrobe'
      accent = 'text-gold-300 border-gold-500/40'
      break
    default:
      break
  }

  return (
    <motion.button
      type="button"
      layout
      onClick={onDone}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
      className={`panel-raised pointer-events-auto flex w-full max-w-sm items-center gap-3 border px-4 py-2.5 text-left ${accent}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-current/30 bg-ink-950/60">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-base font-bold text-slate-50">{title}</span>
        {body && <span className="block truncate text-xs text-slate-400">{body}</span>}
      </span>
      {celebration.type === 'item' && <RarityTag rarity={celebration.item.rarity} />}
    </motion.button>
  )
}

function LevelUp({ celebration, onClose }: { celebration: Extract<Celebration, { type: 'level' }>; onClose: () => void }) {
  const reduce = useReducedMotion()
  const { navigate } = useRouter()
  const { snapshot, celebrations, dismissCelebration } = useGame()
  const rank = rankForLevel(celebration.level)
  // Items that arrived with this level-up are shown on it rather than as banners.
  const unlocks = useMemo(() => celebrations.filter((c): c is Extract<Celebration, { type: 'item' }> => c.type === 'item'), [celebrations])

  function close(to?: string) {
    for (const u of unlocks) dismissCelebration(u.id)
    onClose()
    if (to) navigate(to)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocks])

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Level up. You reached level ${celebration.level}`}
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-ink-950/95 px-5 py-10 backdrop-blur"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(226,166,52,0.22),transparent_60%)]" />
      <div className="relative flex w-full max-w-md flex-col items-center text-center">
        <motion.span
          initial={reduce ? false : { y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="rounded-md border border-reward-500/60 px-4 py-1 font-display text-sm font-bold uppercase tracking-[0.3em] text-reward-400"
        >
          ★ Level up ★
        </motion.span>

        <motion.div
          initial={reduce ? false : { scale: 0.5, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.1 }}
          className="relative mt-8 flex h-40 w-40 items-center justify-center rounded-full border-2 border-reward-500/70 bg-ink-900 shadow-glow-reward"
        >
          <span className="absolute inset-3 rounded-full border border-reward-500/30" />
          <Crown className="absolute -top-5 h-9 w-9 text-reward-400" />
          <HeroSprite look={snapshot?.look} height={112} label="Your character" />
        </motion.div>

        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 font-display text-4xl font-bold uppercase leading-tight text-slate-50"
        >
          You reached level {celebration.level}
        </motion.h1>
        <p className="mt-2 text-sm text-slate-400">{celebration.rankChanged ? `A new rank: ${rank.name}. ${rank.blurb}` : rank.blurb}</p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <span className="tag border-gold-500/50 bg-gold-500/10 text-gold-300">Rank · {rank.name}</span>
          {snapshot && <span className="tag border-reward-500/50 bg-reward-500/10 text-reward-300">{snapshot.progress.coins.toLocaleString()} coins</span>}
        </div>

        {unlocks.length > 0 && (
          <div className="panel mt-6 w-full p-4 text-left">
            <p className="eyebrow mb-3">New unlocks</p>
            <ul className="space-y-2.5">
              {unlocks.map((u) => (
                <li key={u.id} className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-ink-600 bg-ink-950">
                    <ItemIcon itemId={u.item.id} size={40} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-100">{u.item.name}</span>
                    <RarityTag rarity={u.item.rarity} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 grid w-full gap-2">
          {unlocks.length > 0 ? (
            <Button variant="gold" block onClick={() => close('/profile/wardrobe')}>
              Explore new unlocks
            </Button>
          ) : null}
          <Button variant={unlocks.length ? 'secondary' : 'gold'} block onClick={() => close()}>
            Continue
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
