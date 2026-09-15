import { useEffect, useState } from 'react'
import { m as motion, useReducedMotion } from 'framer-motion'
import {
  BookOpen,
  Brain,
  Camera,
  Crown,
  DoorOpen,
  Flag,
  Flame,
  Footprints,
  FlaskConical,
  Hourglass,
  IdCard,
  Lamp,
  Lock,
  Map,
  Megaphone,
  Search,
  Shield,
  Sparkles,
  Star,
  Swords,
  Target,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { game, type AchievementView } from '../../lib/api'
import { PageHeader } from '../../app/AppShell'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { XpBar } from '../../components/ui/Bars'

export const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  boot: Footprints,
  map: Map,
  trophy: Trophy,
  crown: Crown,
  dragon: Flame,
  elixir: FlaskConical,
  flame: Flame,
  owl: BookOpen,
  comet: Sparkles,
  star: Star,
  scroll: BookOpen,
  target: Target,
  hourglass: Hourglass,
  brain: Brain,
  lantern: Lamp,
  camera: Camera,
  magnifier: Search,
  shield: Shield,
  swords: Swords,
  banner: Flag,
  gate: DoorOpen,
  horn: Megaphone,
  card: IdCard,
}

/** Every achievement: the ones earned, lit; the rest, with what they take. */
export default function AchievementsScreen() {
  const reduce = useReducedMotion()
  const [list, setList] = useState<AchievementView[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    game
      .achievements()
      .then(({ achievements }) => setList(achievements))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load achievements.'))
  }, [])

  const unlocked = list?.filter((a) => a.unlockedAt) ?? []

  return (
    <div>
      <PageHeader title="Achievements" subtitle="Deeds worth remembering" />
      {error && !list && <ErrorState message={error} />}
      {!list && !error && <LoadingState lines={4} label="Loading achievements" />}
      {list && (
        <>
          <div className="panel mb-5 px-4 py-3">
            <div className="flex items-baseline justify-between">
              <p className="eyebrow">Unlocked</p>
              <p className="font-display text-xl font-bold text-slate-50">
                {unlocked.length} <span className="text-sm text-slate-500">/ {list.length}</span>
              </p>
            </div>
            <XpBar value={unlocked.length} max={list.length} tone="gold" className="mt-2" label="Achievements unlocked" />
          </div>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {[...list]
              .sort((a, b) => Number(Boolean(b.unlockedAt)) - Number(Boolean(a.unlockedAt)))
              .map((a, i) => {
                const Icon = ACHIEVEMENT_ICONS[a.icon] ?? Trophy
                const earned = Boolean(a.unlockedAt)
                return (
                  <motion.li
                    key={a.id}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 12) * 0.025 }}
                    className={`panel flex items-center gap-3 px-3.5 py-3 ${earned ? 'border-reward-500/35' : 'opacity-70'}`}
                  >
                    <span
                      className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 ${
                        earned ? 'border-reward-500/60 bg-reward-500/10 text-reward-400 shadow-glow-reward' : 'border-ink-600 bg-ink-950 text-slate-600'
                      }`}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                      {!earned && <Lock className="absolute -bottom-1 -right-1 h-4 w-4 rounded bg-ink-900 p-0.5 text-slate-500" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-semibold ${earned ? 'text-slate-100' : 'text-slate-400'}`}>{a.title}</span>
                      <span className="block text-xs text-slate-500">{a.description}</span>
                      <span className="mt-0.5 block text-[10.5px] font-semibold text-slate-500">
                        {earned ? `Unlocked ${new Date(a.unlockedAt as string).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Not yet'}
                        {a.xp ? ` · +${a.xp} XP` : ''}
                      </span>
                    </span>
                  </motion.li>
                )
              })}
          </ul>
        </>
      )}
    </div>
  )
}
