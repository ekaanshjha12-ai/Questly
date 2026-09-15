import { m as motion } from 'framer-motion'
import { Check, ChevronRight, Flame, Play, Plus, ScrollText, Swords, Timer, Trophy } from 'lucide-react'
import type { Challenge } from '../../lib/api'
import { useGame } from '../../game/GameProvider'
import { Link, useRouter } from '../../app/router'
import { PageHeader } from '../../app/AppShell'
import Button from '../../components/ui/Button'
import { XpBar } from '../../components/ui/Bars'
import { ErrorState, LoadingState } from '../../components/ui/States'
import { useTimeOfDay } from '../../hooks/useTimeOfDay'
import { formatDurationMs, formatMinutes, greeting, isFocusQuest, questIcon } from '../../lib/questFormat'
import worldBanner from '../../assets/world/questly-world-banner.webp'
import BaseBackdrop from './BaseBackdrop'

/*
 * The greeting is a step brighter than other pages' subtitles: it sits over the
 * room, where the usual quiet grey would not hold its contrast.
 */

/** The open stretch of the room between the title and the quest card. */
const STAGE = 'relative h-[13.5rem] sm:h-[17rem] lg:h-[clamp(20rem,26vw,27rem)]'

/**
 * Home: today's adventure.
 *
 * The first thing on screen is the player's base — a room that follows their
 * clock — and the one quest worth doing next, with the button that starts it.
 * Standing and progress sit below it — they explain the adventure, they are
 * not the point.
 */
export default function HomeScreen({ name, challenges }: { name: string; challenges: Challenge[] | null }) {
  const { snapshot, status, error, refresh } = useGame()
  const { navigate } = useRouter()
  const time = useTimeOfDay()

  if (!snapshot) {
    return (
      <div className="relative isolate">
        <BaseBackdrop time={time} />
        <PageHeader title="Questly" subtitle={<span className="text-slate-200">{`${greeting()}, ${name}`}</span>} />
        <div className={STAGE} />
        {status === 'error' ? <ErrorState message={error ?? 'Could not load your quest hub.'} onRetry={() => void refresh()} /> : <LoadingState lines={3} label="Loading your quest hub" />}
      </div>
    )
  }

  const { progress, quests, focusTotals, achievements, onboarding } = snapshot
  const featured = quests.find((q) => q.id === snapshot.featuredQuestId) ?? null
  const focus = snapshot.focus
  const duel = (challenges ?? []).find((c) => c.status === 'active' || c.status === 'accepted') ?? null
  const offers = (challenges ?? []).filter((c) => c.role === 'opponent' && c.status === 'sent').length
  const openCount = quests.filter((q) => q.status === 'active' || q.status === 'in_progress').length
  const doneToday = quests.filter((q) => q.status === 'completed').length
  const recent = achievements.recent[0] ?? null
  const FeaturedIcon = featured ? questIcon(featured) : ScrollText

  return (
    <div className="relative isolate">
      <BaseBackdrop time={time} />
      <PageHeader title="Questly" subtitle={<span className="text-slate-200">{`${greeting()}, ${name}`}</span>} />

      {/* --- the base and today's quest --------------------------------------------- */}
      <section aria-label="Today's quest">
        <div className={STAGE}>
          <span className="tag absolute left-0 top-0 border-reward-500/40 bg-ink-950/75 text-reward-300 backdrop-blur-sm">
            {progress.rank.name}&apos;s base
          </span>
          <span className="tag absolute right-0 top-0 border-ink-600 bg-ink-950/75 text-slate-300 backdrop-blur-sm">
            <Flame className="h-3 w-3 text-[#f08a3c]" /> {progress.streak.current} day streak
          </span>
        </div>

        <div className="relative -mt-5">
          {focus ? (
            <div className="rounded-2xl border border-gold-500/40 bg-ink-900/95 p-4 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.8)] backdrop-blur-md">
              <p className="eyebrow flex items-center gap-1.5 text-gold-300">
                <Timer className="h-3.5 w-3.5" /> Focus session {focus.status === 'paused' ? 'paused' : 'running'}
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-slate-50">{focus.label}</p>
              <Button block icon={Play} className="mt-3 !min-h-[50px]" onClick={() => navigate('/focus')}>
                Return to Focus Mode
              </Button>
            </div>
          ) : featured ? (
            <div className="rounded-2xl border border-ink-600 bg-ink-900/95 p-4 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.8)] backdrop-blur-md">
              <p className="eyebrow flex items-center gap-1.5 text-reward-300">
                <span className="h-1.5 w-1.5 rounded-full bg-reward-400" /> Your next quest
              </p>
              <div className="mt-2 flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-ink-600 bg-ink-850 text-gold-400">
                  <FeaturedIcon className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className={`font-display font-bold leading-tight text-slate-50 ${featured.title.length > 42 ? 'text-lg' : 'text-2xl'}`}>{featured.title}</h2>
                  <p className="mt-0.5 text-sm text-slate-400">{featured.description ?? `${formatMinutes(featured.durationMin)} · ${featured.progress.kind === 'minutes' ? `${featured.progress.value}/${featured.progress.target} min focused` : 'ready to begin'}`}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-400">{formatMinutes(featured.durationMin)}</span>
                <span className="font-display text-base font-bold text-reward-400">Reward: +{featured.xp} XP</span>
              </div>
              <Button
                block
                icon={Play}
                className="mt-3 !min-h-[52px] text-[14px]"
                onClick={() => navigate(isFocusQuest(featured) ? `/focus?quest=${encodeURIComponent(featured.id)}` : `/quests/${encodeURIComponent(featured.id)}`)}
              >
                {isFocusQuest(featured) ? 'Enter Focus Mode' : 'Open quest'}
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl border border-ink-600 bg-ink-900/95 p-4 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.8)] backdrop-blur-md">
              <p className="eyebrow text-reward-300">Your next quest</p>
              <h2 className="mt-1 font-display text-2xl font-bold text-slate-50">Write today&apos;s adventure</h2>
              <p className="mt-1 text-sm text-slate-400">Your board is clear. Add a quest, or start a focus block and earn XP for the time.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button icon={Plus} onClick={() => navigate('/quests/new')}>
                  New quest
                </Button>
                <Button variant="secondary" icon={Timer} onClick={() => navigate('/focus')}>
                  Focus
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* --- first quests -------------------------------------------------------------- */}
      {!onboarding.complete && (
        <section className="mt-6" aria-label="Your first quests">
          <h2 className="eyebrow mb-2.5">Your first quests</h2>
          <ol className="panel divide-y divide-ink-700/60">
            {onboarding.steps.map((step, i) => (
              <li key={step.id}>
                <Link to={step.link} className="flex items-center gap-3 px-4 py-3 hover:bg-ink-850/60">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border font-pixel text-[11px] ${
                      step.done ? 'border-gold-500/60 bg-gold-500/15 text-gold-300' : 'border-ink-600 bg-ink-850 text-slate-400'
                    }`}
                  >
                    {step.done ? <Check className="h-4 w-4" strokeWidth={3} /> : String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-semibold ${step.done ? 'text-slate-500 line-through' : 'text-slate-100'}`}>{step.title}</span>
                    <span className="block text-xs text-slate-500">{step.body}</span>
                  </span>
                  {!step.done && <ChevronRight className="h-4 w-4 text-slate-500" />}
                </Link>
              </li>
            ))}
          </ol>
          <p className="mt-2 px-1 text-[11px] text-slate-500">Finish all four to earn the Drafting Quill.</p>
        </section>
      )}

      {/* --- standing ------------------------------------------------------------------ */}
      <section className="mt-6" aria-label="Performance">
        <h2 className="eyebrow mb-2.5">Performance</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/profile" className="panel block px-4 py-3 hover:border-ink-500">
            <p className="eyebrow">Level {progress.level}</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-50">{progress.xp.toLocaleString()}</p>
            <XpBar value={progress.xpIntoLevel} max={progress.xpForNext} className="mt-2 !h-2" label={`XP toward level ${progress.level + 1}`} />
            <p className="mt-1 text-[11px] text-slate-500">{Math.round((progress.xpIntoLevel / progress.xpForNext) * 100)}% to level {progress.level + 1}</p>
          </Link>
          <Link to="/focus" className="panel block px-4 py-3 hover:border-ink-500">
            <p className="eyebrow">Today&apos;s work</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-50">{formatDurationMs(focusTotals.todayMs)}</p>
            <p className="mt-2 text-[11px] font-semibold text-gold-400">+{snapshot.todayXp} XP gained today</p>
            <p className="text-[11px] text-slate-500">
              {doneToday} done · {openCount} open
            </p>
          </Link>
        </div>
      </section>

      {/* --- world -------------------------------------------------------------------------- */}
      <Link to="/world" className="panel group relative mt-6 block overflow-hidden hover:border-ink-500">
        <img src={worldBanner} alt="" loading="lazy" decoding="async" className="h-28 w-full object-cover transition-transform duration-700 group-hover:scale-105" />
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-950/95 via-ink-950/35 to-transparent" />
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-bold text-slate-50">World Map</span>
            <span className="block truncate text-xs text-slate-300">Explore regions, take their weekly quests and join world events.</span>
          </span>
          <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden />
        </span>
      </Link>

      {/* --- duel -------------------------------------------------------------------------- */}
      <section className="mt-6" aria-label="Challenges">
        <h2 className="eyebrow mb-2.5">Current duel</h2>
        {duel ? (
          <Link to={`/challenges/${duel.id}`} className="panel flex items-center gap-3 px-4 py-3 hover:border-ink-500">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-reward-500/40 bg-reward-500/10 text-reward-400">
              <Swords className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-100">
                {duel.name} <span className="text-slate-500">(vs {duel.role === 'creator' ? duel.opponent?.name : duel.creator?.name})</span>
              </span>
              <span className="block truncate text-xs text-slate-500">
                {duel.status === 'accepted' ? 'Starts soon' : `Day ${(duel.today ?? 0) + 1} of ${duel.durationDays}`} · {duel.objective}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-slate-500" />
          </Link>
        ) : (
          <Link to="/challenges" className="panel flex items-center gap-3 px-4 py-3 hover:border-ink-500">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink-600 bg-ink-850 text-slate-400">
              <Swords className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-100">{offers ? `${offers} challenge${offers === 1 ? '' : 's'} waiting for you` : 'No active duel'}</span>
              <span className="block text-xs text-slate-500">{offers ? 'Accept or decline from Challenges.' : 'Challenge another player from their card.'}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-slate-500" />
          </Link>
        )}
      </section>

      {/* --- recent achievement ----------------------------------------------------------- */}
      <section className="mt-6" aria-label="Recent achievement">
        <h2 className="eyebrow mb-2.5">Recent achievement</h2>
        <Link to="/profile/achievements" className="panel flex items-center gap-3 px-4 py-3 hover:border-ink-500">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gold-500/40 bg-gold-500/10 text-gold-400">
            <Trophy className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            {recent ? (
              <>
                <span className="block text-sm font-semibold text-slate-100">{recent.title}</span>
                <span className="block text-xs text-slate-500">{recent.description}</span>
              </>
            ) : (
              <>
                <span className="block text-sm font-semibold text-slate-100">Your trophy wall is empty</span>
                <span className="block text-xs text-slate-500">Complete a quest to earn your first achievement.</span>
              </>
            )}
          </span>
          <span className="text-xs font-semibold text-slate-400">
            {achievements.unlocked}/{achievements.total}
          </span>
        </Link>
      </section>

      {status === 'offline' && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 text-center text-xs text-slate-500">
          Offline — showing your last saved progress.
        </motion.p>
      )}
    </div>
  )
}
