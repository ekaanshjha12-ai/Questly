import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Target,
  Timer,
  Zap,
  Flame,
  Trophy,
  Star,
  Sparkles,
  Loader2,
  TrendingUp,
  TriangleAlert,
  Quote,
  RefreshCw,
} from 'lucide-react'
import type { AppState, SuccessOutlook } from '../types'
import { ApiError, analyseOutlook } from '../lib/api'
import { computeStats, evidenceFor, formatFocusTotal, goalProgress } from '../lib/progress'
import Achievements from './Achievements'

interface AchievementView {
  id: string
  title: string
  description: string
  icon: string
  unlockedAt: string | null
}

interface Props {
  state: AppState
  achievements: AchievementView[]
  onSetOutlook: (outlook: Omit<SuccessOutlook, 'createdAt'>) => void
}

/** Green through amber to red. Deliberately not green-for-everything — an
 * honest low score should look like one. */
function scoreColor(pct: number): string {
  if (pct >= 75) return '#6ee7a8'
  if (pct >= 55) return '#e0c56b'
  if (pct >= 35) return '#e8934a'
  return '#e8685a'
}

function StatTile({
  icon: Icon,
  label,
  value,
  unit,
  accent,
}: {
  icon: typeof Target
  label: string
  value: string
  unit?: string
  accent: string
}) {
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-850/60 p-3.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
        <p className="min-w-0 truncate text-[11px] text-slate-400">{label}</p>
      </div>
      <p className="mt-1.5 font-display text-2xl font-bold leading-none text-slate-50">
        {value}
        {unit && <span className="ml-1 text-xs font-medium text-slate-500">{unit}</span>}
      </p>
    </div>
  )
}

/** SVG ring rather than a bar — the number is the headline here, and a ring
 * puts it dead centre. */
function ScoreRing({ pct }: { pct: number }) {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const colour = scoreColor(pct)

  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="#1e2536" strokeWidth="10" />
        <motion.circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - pct / 100) }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-bold" style={{ color: colour }}>
          {pct}%
        </span>
        <span className="text-[10px] uppercase tracking-wide text-slate-500">likely</span>
      </div>
    </div>
  )
}

function Bullets({
  title,
  items,
  icon: Icon,
  accent,
}: {
  title: string
  items: string[]
  icon: typeof TrendingUp
  accent: string
}) {
  if (!items.length) return null
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide" style={{ color: accent }}>
        <Icon className="h-3 w-3" />
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-300">
            <span style={{ color: accent }}>·</span>
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const CONFIDENCE_NOTE: Record<SuccessOutlook['confidence'], string> = {
  low: 'Early days — this will get sharper as you build history.',
  medium: 'Based on a decent run of activity.',
  high: 'Based on a long, consistent record.',
}

export default function ProgressScreen({ state, achievements, onSetOutlook }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stats = useMemo(() => computeStats(state), [state])
  const goals = useMemo(() => goalProgress(state), [state])
  const evidence = useMemo(() => evidenceFor(stats), [stats])
  const focus = formatFocusTotal(stats.totalFocusMs)
  const outlook = state.outlook

  async function analyse() {
    setError(null)
    setBusy(true)
    try {
      const { outlook: result } = await analyseOutlook(
        { ...stats },
        goals.map(({ id: _id, ...rest }) => rest),
      )
      onSetOutlook(result)
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setError('Progress analysis needs an API key on the server.')
      } else if (err instanceof ApiError && err.status === 422) {
        setError('Not enough activity yet to judge this fairly.')
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="font-display text-lg font-semibold text-slate-100">Progress</h2>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <StatTile
          icon={Target}
          label="Success Probability"
          value={outlook ? `${outlook.probability}` : '—'}
          unit={outlook ? '%' : undefined}
          accent={outlook ? scoreColor(outlook.probability) : '#7b8ba8'}
        />
        <StatTile icon={Timer} label="Focus Time" value={focus.value} unit={focus.unit} accent="#7fd3f0" />
        <StatTile icon={Zap} label="Focus Sessions" value={String(stats.focusSessions)} accent="#b06bd6" />
        <StatTile
          icon={Flame}
          label="Current Streak"
          value={String(stats.currentStreak)}
          unit={stats.currentStreak === 1 ? 'day' : 'days'}
          accent="#e8934a"
        />
        <StatTile icon={Trophy} label="Verified Quests" value={String(stats.questsVerified)} accent="#e0c56b" />
        <StatTile icon={Star} label="Level" value={String(stats.level)} accent="#ffe27a" />
      </div>

      <section className="rounded-2xl border border-ink-600 bg-ink-850/60 p-4 sm:p-5">
        {!outlook ? (
          <div className="text-center">
            <Target className="mx-auto h-7 w-7 text-slate-600" />
            <p className="mt-2 font-display text-base font-semibold text-slate-100">
              How likely are you to get there?
            </p>

            {evidence.enough ? (
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">
                Read your actual activity — consistency, recency and proof — and give you an honest number.
              </p>
            ) : (
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">
                Not enough to go on yet. Come back after {evidence.shortfall} — a number now would be guesswork
                rather than a read on how you actually work.
              </p>
            )}

            {error && (
              <p className="mx-auto mt-3 max-w-sm rounded-lg border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-xs text-ember-400">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void analyse()}
              disabled={busy || !evidence.enough || goals.length === 0}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 px-4 py-2.5 text-sm font-semibold text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? 'Reading your history…' : 'Analyse my progress'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <ScoreRing pct={outlook.probability} />

              <div className="min-w-0 flex-1 text-center sm:text-left">
                <p className="text-sm leading-relaxed text-slate-200">{outlook.verdict}</p>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {CONFIDENCE_NOTE[outlook.confidence]}{' '}
                  <span className="text-slate-600">
                    Read on {new Date(outlook.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.
                  </span>
                </p>

                {outlook.quotes.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {outlook.quotes.map((q, i) => (
                      <blockquote
                        key={i}
                        className="rounded-xl border border-ink-700 bg-ink-900/60 px-3 py-2 text-left"
                      >
                        <p className="flex gap-1.5 text-xs italic leading-relaxed text-slate-300">
                          <Quote className="mt-0.5 h-3 w-3 shrink-0 text-gold-500/60" />
                          <span className="min-w-0">{q.text}</span>
                        </p>
                        {q.author && <p className="mt-1 pl-4.5 text-[10px] text-slate-500">— {q.author}</p>}
                      </blockquote>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {(outlook.drivers.length > 0 || outlook.risks.length > 0) && (
              <div className="grid gap-4 border-t border-ink-700/60 pt-4 sm:grid-cols-2">
                <Bullets title="Working for you" items={outlook.drivers} icon={TrendingUp} accent="#6ee7a8" />
                <Bullets title="Working against you" items={outlook.risks} icon={TriangleAlert} accent="#e8934a" />
              </div>
            )}

            {outlook.perGoal.length > 0 && (
              <div className="border-t border-ink-700/60 pt-4">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Goal by goal</p>
                <div className="space-y-2">
                  {outlook.perGoal.map((goal, i) => (
                    <div key={i} className="rounded-xl border border-ink-700 bg-ink-900/50 px-3 py-2.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 truncate text-xs font-medium text-slate-200">{goal.title}</p>
                        <span
                          className="shrink-0 font-display text-sm font-bold"
                          style={{ color: scoreColor(goal.probability) }}
                        >
                          {goal.probability}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-700">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: scoreColor(goal.probability) }}
                          initial={{ width: 0 }}
                          animate={{ width: `${goal.probability}%` }}
                          transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.06 }}
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{goal.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-lg border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-xs text-ember-400">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void analyse()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-ink-600 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-gold-500/50 hover:text-gold-300 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {busy ? 'Re-reading your history…' : 'Update this'}
            </button>
          </div>
        )}
      </section>

      <div className="border-t border-ink-700/60 pt-5">
        <Achievements achievements={achievements} />
      </div>
    </div>
  )
}
