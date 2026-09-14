import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  BarChart3,
  ChevronRight,
  Crown,
  History,
  IdCard,
  ScrollText,
  Settings,
  Shirt,
  Swords,
  Target,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import type { Goal } from '../../types'
import type { AuthUser, Challenge, Slot } from '../../lib/api'
import { useGame } from '../../game/GameProvider'
import { Link, useRouter } from '../../app/router'
import { PageHeader } from '../../app/AppShell'
import Button from '../../components/ui/Button'
import { XpBar } from '../../components/ui/Bars'
import { LoadingState } from '../../components/ui/States'
import HeroSprite from '../../components/art/HeroSprite'
import ItemIcon from '../../components/art/ItemIcon'
import { rankForLevel } from '../../data/ranks'
import { findPath } from '../../data/paths'

const LEFT: { slot: Slot; label: string }[] = [
  { slot: 'head', label: 'Head' },
  { slot: 'clothing', label: 'Clothing' },
  { slot: 'back', label: 'Back' },
]
const RIGHT: { slot: Slot; label: string }[] = [
  { slot: 'tool', label: 'Tool' },
  { slot: 'pet', label: 'Pet' },
  { slot: 'badge', label: 'Badge' },
]

/**
 * Digital Identity: the character, what they wear, where they stand, and the
 * record behind it — the profile a player is proud to show.
 */
export default function ProfileScreen({ user, goals, challenges }: { user: AuthUser; goals: Goal[]; challenges: Challenge[] | null }) {
  const reduce = useReducedMotion()
  const { snapshot } = useGame()
  const { navigate } = useRouter()

  const record = useMemo(() => {
    const finished = (challenges ?? []).filter((c) => c.status === 'completed' || c.status === 'failed')
    const met = finished.filter((c) => c.status === 'completed')
    return { met: met.length, finished: finished.length }
  }, [challenges])

  if (!snapshot) return <LoadingState lines={4} label="Loading your profile" />

  const { progress, look, achievements } = snapshot
  const rank = rankForLevel(progress.level)
  const path = findPath(progress.flags.path)
  const goal = goals.find((g) => !g.archived)
  const pct = Math.round((progress.xpIntoLevel / progress.xpForNext) * 100)

  const Slot = ({ slot, label }: { slot: Slot; label: string }) => {
    const itemId = look.equipment[slot]
    return (
      <Link
        to={`/profile/wardrobe?slot=${slot}`}
        aria-label={itemId ? `${label}: equipped, change` : `${label}: empty, choose`}
        className="flex h-14 w-14 items-center justify-center rounded-xl border border-ink-600 bg-ink-950/70 transition-colors hover:border-gold-500/50 sm:h-16 sm:w-16"
      >
        {itemId ? <ItemIcon itemId={itemId} size={44} /> : <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600">{label}</span>}
      </Link>
    )
  }

  return (
    <div>
      <PageHeader title="Digital Identity" subtitle="Verified Questly profile" />

      <section className="panel-raised overflow-hidden" aria-label="Your character">
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-2xl font-bold text-slate-50">{user.displayName ?? 'Adventurer'}</h2>
            <p className="text-sm text-slate-500">
              {user.username && <>@{user.username}</>}
              {path && (
                <span className="ml-1.5 inline-flex items-center gap-1 align-middle text-xs font-semibold" style={{ color: path.accent }}>
                  <path.icon className="h-3.5 w-3.5" aria-hidden /> {path.name}
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="tag border-gold-500/50 bg-gold-500/10 text-gold-300">Level {progress.level}</span>
            <span className="text-xs font-semibold tabular-nums text-slate-400">{progress.xp.toLocaleString()} XP</span>
          </div>
        </div>

        <div className="relative mt-2 flex items-center justify-center gap-3 px-4 pb-5 sm:gap-8">
          <div className="pointer-events-none absolute inset-x-8 bottom-4 top-6 rounded-[40%] bg-[radial-gradient(ellipse_at_50%_55%,rgba(16,185,129,0.14),transparent_70%)]" />
          <div className="relative grid gap-2">
            {LEFT.map((s) => (
              <Slot key={s.slot} {...s} />
            ))}
          </div>
          <motion.div initial={reduce ? false : { opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative flex flex-col items-center">
            <HeroSprite look={look} height={196} still={Boolean(reduce)} label="Your character" />
            <span className="tag -mt-1 border-reward-500/50 bg-ink-950 text-reward-300" style={{ borderColor: `${rank.color}88`, color: rank.color }}>
              <Crown className="h-3 w-3" /> {rank.name}
            </span>
          </motion.div>
          <div className="relative grid gap-2">
            {RIGHT.map((s) => (
              <Slot key={s.slot} {...s} />
            ))}
          </div>
        </div>

        {user.bio && <p className="border-t border-ink-700/60 px-4 py-3 text-center text-sm italic text-slate-300">“{user.bio}”</p>}
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link to="/profile/wardrobe" className="panel block px-4 py-3 hover:border-ink-500">
          <p className="eyebrow flex items-center gap-1.5">
            <Shirt className="h-3.5 w-3.5 text-gold-400" /> Equipped
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-100">{Object.keys(look.equipment).length} slots worn</p>
          <p className="text-[11px] text-slate-500">{look.equipment.special ? 'Legendary form ready' : 'Change your loadout'}</p>
        </Link>
        <Link to="/profile/achievements" className="panel block px-4 py-3 hover:border-ink-500">
          <p className="eyebrow flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-reward-400" /> Trophies
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-100">
            {achievements.unlocked} of {achievements.total}
          </p>
          <p className="truncate text-[11px] text-slate-500">{achievements.recent.map((a) => a.title).join(', ') || 'None yet'}</p>
        </Link>
        <Link to="/profile/history" className="panel block px-4 py-3 hover:border-ink-500">
          <p className="eyebrow">XP progress</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-100">
            {progress.xpIntoLevel.toLocaleString()} / {progress.xpForNext.toLocaleString()}
          </p>
          <XpBar value={progress.xpIntoLevel} max={progress.xpForNext} className="mt-2 !h-1.5" label={`XP toward level ${progress.level + 1}`} />
          <p className="mt-1 text-[11px] text-slate-500">
            {pct}% to level {progress.level + 1}
          </p>
        </Link>
        <Link to="/challenges" className="panel block px-4 py-3 hover:border-ink-500">
          <p className="eyebrow flex items-center gap-1.5">
            <Swords className="h-3.5 w-3.5 text-danger-400" /> Challenge record
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-100">
            {record.met} / {record.finished} met
          </p>
          <p className="text-[11px] text-slate-500">{record.finished ? `${Math.round((record.met / record.finished) * 100)}% completion rate` : 'No duels finished yet'}</p>
        </Link>
      </div>

      <Link to="/goals" className="panel mt-3 flex items-center gap-3 px-4 py-3 hover:border-ink-500">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink-600 bg-ink-850 text-gold-400">
          <Target className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow block">Current goal</span>
          <span className="block truncate text-sm font-semibold text-slate-100">{goal?.title ?? 'Set a goal to guide your quests'}</span>
        </span>
        <ChevronRight className="h-4 w-4 text-slate-500" />
      </Link>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button icon={Shirt} onClick={() => navigate('/profile/wardrobe')}>
          Customise
        </Button>
        <Button variant="secondary" icon={IdCard} onClick={() => navigate('/profile/card')}>
          Design card
        </Button>
      </div>

      <nav aria-label="Profile" className="panel mt-4 divide-y divide-ink-700/60">
        <Row to="/profile/achievements" icon={Trophy} label="Achievements" />
        <Row to="/profile/history" icon={History} label="XP history" />
        <Row to="/profile/progress" icon={BarChart3} label="Progress and outlook" />
        <Row to="/leaderboard" icon={Crown} label="Leaderboard" />
        <Row to="/notifications" icon={ScrollText} label="Chronicle Log" />
        <Row to="/profile/settings" icon={Settings} label="Settings and account" />
      </nav>
    </div>
  )
}

function Row({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link to={to} className="flex min-h-[52px] items-center gap-3 px-4 text-sm font-semibold text-slate-200 hover:bg-ink-850/60">
      <Icon className="h-4.5 w-4.5 text-slate-400" aria-hidden />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-slate-500" />
    </Link>
  )
}
