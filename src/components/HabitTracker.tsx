import { useMemo, useState } from 'react'
import { Flame, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import type { AppState, MoodSlot } from '../types'
import HabitGrid from './HabitGrid'
import {
  dailySeries,
  heatLevel,
  heatmapWeeks,
  summarise,
  weekdayProfile,
  type DayPoint,
} from '../lib/habits'
import { formatFocusTotal } from '../lib/progress'

/**
 * The habit tracker.
 *
 * Four graphs, each answering a different question, all drawn from timestamps
 * already on state — no library, no API call, works offline. Plain SVG rather
 * than a charting package: these are four simple shapes, and a package would
 * cost more to theme than to draw, on top of ~100KB the app does not need.
 *
 * The window is whole weeks so the heatmap's columns stay aligned; a 30-day
 * range would put the same weekday in two different rows.
 */

const RANGES = [
  { id: '4w', label: '4 weeks', days: 28 },
  { id: '12w', label: '12 weeks', days: 84 },
  { id: '26w', label: '6 months', days: 182 },
] as const

/** Logical drawing space. The SVGs scale to their container; these are just the
 * coordinates the paths are written in. */
const W = 340
const H = 92

interface Props {
  state: AppState
  onAddHabit: (name: string, color: string) => void
  onRenameHabit: (habitId: string, name: string) => void
  onRecolorHabit: (habitId: string, color: string) => void
  onDeleteHabit: (habitId: string) => void
  onToggleMark: (habitId: string, date: string) => void
  onSetMood: (date: string, slot: MoodSlot, moodId: string | null) => void
}

export default function HabitTracker({ state, ...actions }: Props) {
  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]['id']>('12w')
  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[1]

  const { series, summary, weeks, weekdays, maxDay } = useMemo(() => {
    const s = dailySeries(state, range.days)
    return {
      series: s,
      summary: summarise(state, s),
      weeks: heatmapWeeks(s),
      weekdays: weekdayProfile(s),
      maxDay: s.reduce((m, d) => Math.max(m, d.total), 0),
    }
  }, [state, range.days])

  const focus = formatFocusTotal(summary.totalFocusMs)
  const empty = summary.totalCompletions === 0

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-slate-50">Habit tracker</h2>
        <div className="flex gap-1 rounded-xl border border-ink-600 bg-ink-850/70 p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRangeId(r.id)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                r.id === rangeId
                  ? 'bg-gradient-to-r from-gold-500 to-ember-500 text-onAccent'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* The grid comes first: it is the part you act on, and the graphs below
          are what it adds up to. */}
      <HabitGrid state={state} {...actions} />

      {empty ? (
        <p className="rounded-2xl border border-ink-600 bg-ink-850 p-4 text-xs leading-relaxed text-slate-400">
          Nothing tracked in this window yet. Tick a habit above, finish a quest, or run a focus
          session and it appears here the same day — the graphs fill themselves in.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="Consistency"
          value={`${summary.consistency}%`}
          sub={`${summary.activeDays} of ${summary.windowDays} days`}
        />
        <Tile
          label="Best run"
          value={`${summary.bestRun}`}
          sub={summary.bestRun === 1 ? 'day in a row' : 'days in a row'}
          icon={<Flame className="h-3.5 w-3.5 text-ember-400" />}
        />
        <Tile
          label="Finished"
          value={`${summary.totalCompletions}`}
          sub="tasks and sessions"
          icon={<TrendIcon pct={summary.trendPct} />}
        />
        <Tile label="Focused" value={focus.value} sub={focus.unit} />
      </div>

      {/* --- when you showed up -------------------------------------------- */}
      <Panel
        title="When you showed up"
        note={
          summary.bestDay
            ? `Busiest day: ${longDate(summary.bestDay.date)}, ${summary.bestDay.total} finished`
            : 'Each square is a day. Darker means more finished.'
        }
      >
        <Heatmap weeks={weeks} max={maxDay} />
      </Panel>

      {/* --- how much, day by day ------------------------------------------ */}
      <Panel title="Finished per day" note={trendNote(summary.trendPct, range.label)}>
        <CompletionChart series={series} />
        <Legend
          items={[
            { className: 'bg-gold-500/70', label: 'That day' },
            { className: 'bg-slate-50', label: '7-day average' },
          ]}
        />
      </Panel>

      {/* --- focused time --------------------------------------------------- */}
      <Panel title="Focused time" note="Minutes of timer and stopwatch work, by day.">
        <FocusChart series={series} />
      </Panel>

      {/* --- weekday profile ------------------------------------------------ */}
      <Panel title="Your week" note="How often you show up on each day, as a share of that weekday.">
        <div className="flex items-end justify-between gap-1.5 sm:gap-3">
          {weekdays.map((bucket) => {
            const rate = bucket.totalDays ? bucket.activeDays / bucket.totalDays : 0
            return (
              <div key={bucket.weekday} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] font-semibold tabular-nums text-slate-400">
                  {Math.round(rate * 100)}%
                </span>
                <div className="flex h-20 w-full items-end overflow-hidden rounded-lg bg-ink-800">
                  <div
                    className="w-full rounded-lg bg-gradient-to-t from-gold-600 to-gold-400"
                    // A zero-rate weekday still gets a hairline, so the column
                    // reads as "nothing here" rather than as a missing bar.
                    style={{ height: `${Math.max(rate * 100, 2)}%` }}
                    title={`${bucket.label}: active ${bucket.activeDays} of ${bucket.totalDays}`}
                  />
                </div>
                {/* Two letters, not one: a single letter gives two S columns
                    and two T columns and no way to tell them apart. */}
                <span className="truncate text-[10px] text-slate-500">{bucket.label.slice(0, 2)}</span>
              </div>
            )
          })}
        </div>
      </Panel>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

function Tile({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string
  sub: string
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-850 p-3">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold tabular-nums text-slate-50">{value}</p>
      <p className="truncate text-[10px] text-slate-500">{sub}</p>
    </div>
  )
}

function Panel({
  title,
  note,
  children,
}: {
  title: string
  note: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-850 p-4">
      <p className="font-display text-sm font-semibold text-slate-100">{title}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{note}</p>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Legend({ items }: { items: { className: string; label: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-3">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className={`h-2 w-2 rounded-sm ${item.className}`} />
          {item.label}
        </span>
      ))}
    </div>
  )
}

/** Five steps of one colour, so intensity reads as intensity rather than as
 * five unrelated categories. Level 0 is the empty-day well. */
const HEAT = [
  // ink-700 rather than ink-800: in the light theme ink-800 sits ten points off
  // the panel it is drawn on, so the empty days vanish and the grid loses its
  // shape — and an empty day disappearing is the one thing this chart must not
  // let happen.
  'fill-ink-700',
  'fill-gold-500/25',
  'fill-gold-500/50',
  'fill-gold-500/75',
  'fill-gold-500',
]

function Heatmap({ weeks, max }: { weeks: (DayPoint | null)[][]; max: number }) {
  const cell = 12
  const gap = 3
  const step = cell + gap
  const width = weeks.length * step - gap
  const height = 7 * step - gap

  return (
    <div className="flex gap-2">
      {/* One slot per row at the grid's own step, rather than four labels spread
          with justify-between — that lands them between rows, so each label
          names the wrong day. Only alternate rows are written; seven labels in
          90px collide. shrink-0 is load-bearing: a flex child with text will
          otherwise shrink below its content and clip the words. */}
      <div className="shrink-0 text-[9px] leading-none text-slate-500">
        {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((label, i) => (
          <div
            key={i}
            className="flex items-center"
            style={{ height: cell, marginBottom: i === 6 ? 0 : gap }}
          >
            {label}
          </div>
        ))}
      </div>
      {/* The grid keeps its cell size and scrolls rather than shrinking — a
          6-month heatmap squeezed into 300px is a smear, not a chart. */}
      <div className="min-w-0 flex-1 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label="Daily activity grid"
        >
          {weeks.map((week, x) =>
            week.map((day, y) =>
              day ? (
                <rect
                  key={day.date}
                  x={x * step}
                  y={y * step}
                  width={cell}
                  height={cell}
                  rx={3}
                  className={HEAT[heatLevel(day.total, max)]}
                >
                  <title>{`${longDate(day.date)} — ${day.total === 0 ? 'nothing finished' : `${day.total} finished`}`}</title>
                </rect>
              ) : null,
            ),
          )}
        </svg>
      </div>
    </div>
  )
}

/** Trailing 7-day mean. Trailing rather than centred so the last point is a
 * real number and not half-invented from days that have not happened. */
function rollingMean(values: number[], window: number): number[] {
  const out: number[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= window) sum -= values[i - window]
    out.push(sum / Math.min(i + 1, window))
  }
  return out
}

function CompletionChart({ series }: { series: DayPoint[] }) {
  const values = series.map((d) => d.total)
  const mean = rollingMean(values, 7)
  const max = Math.max(1, ...values)
  const barW = W / series.length
  const inner = Math.max(1, barW - Math.min(2, barW * 0.25))

  const line = mean
    .map((v, i) => `${(i + 0.5) * barW},${H - (v / max) * H}`)
    .join(' ')

  return (
    // preserveAspectRatio="none" so the drawing stretches to the panel instead
    // of being letterboxed in the middle at its own 340:92 ratio. Safe here:
    // the bars are meant to widen with the container, and every stroke is
    // non-scaling so nothing comes out oval.
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-24 w-full"
      role="img"
      aria-label="Tasks finished per day"
    >
      {series.map((day, i) => {
        const h = (day.total / max) * H
        return (
          <rect
            key={day.date}
            x={i * barW + (barW - inner) / 2}
            y={H - h}
            width={inner}
            height={Math.max(h, day.total > 0 ? 1.5 : 0)}
            className="fill-gold-500/70"
          >
            <title>{`${longDate(day.date)} — ${day.total} finished`}</title>
          </rect>
        )
      })}
      {/* Drawn in the headline text colour rather than another green: the
          palette is a single hue, so the average has to separate itself from
          the bars by lightness. */}
      <polyline
        points={line}
        fill="none"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="stroke-slate-50"
      />
    </svg>
  )
}

function FocusChart({ series }: { series: DayPoint[] }) {
  const minutes = series.map((d) => Math.round(d.focusMs / 60000))
  const max = Math.max(1, ...minutes)
  const stepX = series.length > 1 ? W / (series.length - 1) : W

  const points = minutes.map((v, i) => [i * stepX, H - (v / max) * H] as const)
  const line = points.map(([x, y]) => `${x},${y}`).join(' ')
  const area = `${line} ${W},${H} 0,${H}`
  const best = Math.max(...minutes)

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-24 w-full"
        role="img"
        aria-label="Minutes focused per day"
      >
        <defs>
          {/* Straight at the token rather than through a Tailwind utility —
              `stop-color` is one of the few properties Tailwind has no class
              for, and currentColor here would inherit the panel's text colour. */}
          <linearGradient id="focus-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--gold-500))" stopOpacity="0.6" />
            <stop offset="100%" stopColor="rgb(var(--gold-500))" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#focus-fill)" />
        <polyline
          points={line}
          fill="none"
          strokeWidth={1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-gold-400"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{longDate(series[0].date)}</span>
        <span>{best > 0 ? `Best day ${best} min` : 'No focus time yet'}</span>
        <span>Today</span>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function longDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function trendNote(pct: number | null, rangeLabel: string): string {
  if (pct === null) return `Bars are each day; the line is the 7-day average.`
  const window = rangeLabel.toLowerCase()
  if (pct === 0) return `Level with the previous ${window}.`
  const dir = pct > 0 ? 'up' : 'down'
  return `${Math.abs(pct)}% ${dir} on the previous ${window}.`
}

function TrendIcon({ pct }: { pct: number | null }) {
  if (pct === null || pct === 0) return <Minus className="h-3.5 w-3.5 text-slate-500" />
  return pct > 0 ? (
    <TrendingUp className="h-3.5 w-3.5 text-gold-400" />
  ) : (
    <TrendingDown className="h-3.5 w-3.5 text-ember-400" />
  )
}
