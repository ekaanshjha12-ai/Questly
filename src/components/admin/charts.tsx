import type { ReactNode } from 'react'

/**
 * The console's chart pieces. One accent for every mark: each chart answers a
 * single question, so there is no identity for a second colour to encode.
 * Thin bars rounded at the data end, square at the baseline, a 2px gap between
 * neighbours, and a hover label on every bar — with the numbers always
 * reachable without hovering too.
 */

export const MARK = 'rgb(var(--gold-500))'

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`
}

export function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86_400)
  const h = Math.floor((seconds % 86_400) / 3_600)
  const m = Math.floor((seconds % 3_600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}

export function StatTile({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-850/60 p-3.5">
      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold leading-none text-slate-50">{value}</p>
      {hint && <p className="mt-1 text-[10px] text-slate-500">{hint}</p>}
    </div>
  )
}

/**
 * Columns over consecutive periods — discrete counts, so bars rather than a
 * line. Only the first and last periods are labelled on the axis.
 */
export function ColumnBars({
  data,
  label,
  height = 96,
  describe,
  axis,
}: {
  data: { key: string; n: number }[]
  label: string
  height?: number
  /** The hover text for one bar. */
  describe: (d: { key: string; n: number }) => string
  axis: [string, string]
}) {
  const max = Math.max(1, ...data.map((d) => d.n))
  const total = data.reduce((sum, d) => sum + d.n, 0)
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height }} role="img" aria-label={`${label}: ${total.toLocaleString()} in total, highest ${max.toLocaleString()}`}>
        {data.map((d) => (
          <div key={d.key} className="group relative flex h-full min-w-0 flex-1 items-end" title={describe(d)}>
            <div
              className="w-full max-w-[24px] rounded-t-[3px] transition-opacity group-hover:opacity-80"
              style={{ height: d.n ? `${Math.max(3, (d.n / max) * 100)}%` : '0%', background: MARK }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-[10px] text-slate-200 group-hover:block">
              {describe(d)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between border-t border-ink-700 pt-1 text-[10px] text-slate-500">
        <span>{axis[0]}</span>
        <span>{axis[1]}</span>
      </div>
    </div>
  )
}
