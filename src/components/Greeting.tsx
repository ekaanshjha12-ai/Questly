import { useMemo } from 'react'
import { Flame, Sunrise, Target } from 'lucide-react'
import type { AppState } from '../types'
import { periodKey } from '../lib/period'

/**
 * The line at the top of the day.
 *
 * Everything here is derived from what the person has actually done, because a
 * greeting that says the same thing every morning stops being read by the third
 * day. The mission names a real quest they have not finished, so it is a
 * pointer rather than a slogan — and when there is nothing left it says so
 * instead of inventing urgency.
 */
function timeOfDay(hour: number): string {
  if (hour < 5) return 'Still up'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 22) return 'Good evening'
  return 'Late one'
}

/** First name only — "Good morning, Ekaansh" reads like a person talking;
 * the full name reads like a bank. */
function firstName(name: string): string {
  const first = String(name ?? '').trim().split(/\s+/)[0]
  return first || 'there'
}

export default function Greeting({ state }: { state: AppState }) {
  const { greeting, mission, tone } = useMemo(() => {
    const hour = new Date().getHours()
    const name = firstName(state.player.name)
    const hello = `${timeOfDay(hour)}, ${name}`

    const todayKey = periodKey('daily')
    const today = state.quests.filter((q) => q.period === 'daily' && q.periodKey === todayKey)
    const open = today.filter((q) => !q.completed)
    const done = today.length - open.length

    if (!state.goals.some((g) => !g.archived)) {
      return { greeting: hello, mission: 'Set a goal and I will turn it into quests.', tone: 'quiet' as const }
    }

    if (today.length && !open.length) {
      return {
        greeting: hello,
        mission: `Every quest done today. That is the whole job — rest is part of it.`,
        tone: 'done' as const,
      }
    }

    if (!open.length) {
      return { greeting: hello, mission: 'Nothing due right now. Come back tomorrow.', tone: 'quiet' as const }
    }

    // Name one thing, not a list. A single next action is actionable; five is a
    // decision to avoid.
    const next = open[0]
    const rest = open.length - 1
    return {
      greeting: hello,
      mission:
        done > 0
          ? `${done} down. Next: ${next.title}`
          : rest > 0
            ? `${next.title} — and ${rest} more after that.`
            : next.title,
      tone: 'active' as const,
    }
  }, [state])

  const streak = state.streak.current
  const Icon = tone === 'done' ? Flame : tone === 'active' ? Target : Sunrise

  return (
    <section className="rounded-2xl border border-ink-600 bg-ink-850/60 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <Icon
          className={`mt-0.5 h-4 w-4 shrink-0 ${tone === 'done' ? 'text-ember-400' : 'text-gold-400'}`}
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold text-slate-50">
            {greeting}
            {streak > 2 && (
              <span className="ml-2 align-middle text-xs font-medium text-ember-400">
                {streak} day streak
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-slate-400">
            {tone === 'active' && <span className="text-slate-500">Today&apos;s mission — </span>}
            {mission}
          </p>
        </div>
      </div>
    </section>
  )
}
