import { useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { adminAnalytics, type ProductAnalytics } from '../../lib/api'
import { ColumnBars, MARK, StatTile } from './charts'

const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * How Questly is used, from events and daily activity: who is active, how far
 * new accounts get, who comes back, and what people do day by day. Counts and
 * shares only — never what a named person did.
 */
export default function AdminProductAnalytics() {
  const [data, setData] = useState<ProductAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [table, setTable] = useState(false)

  async function load(force = false) {
    setBusy(true)
    try {
      setData(await adminAnalytics(force))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load analytics.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (error && !data) return <p className="rounded-lg border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">{error}</p>
  if (!data) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
      </div>
    )
  }

  const cohortSize = data.funnel[0]?.count ?? 0
  const funnelMax = Math.max(1, ...data.funnel.map((s) => s.count))

  return (
    <div className={`space-y-5 transition-opacity ${busy ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        Calculated {new Date(data.generatedAt).toLocaleTimeString()}
        <button type="button" onClick={() => void load(true)} className="ml-auto flex items-center gap-1 rounded-lg border border-ink-600 px-2 py-1 text-slate-400 hover:text-slate-100">
          <RefreshCw className="h-3 w-3" aria-hidden /> Recalculate
        </button>
      </div>

      <section>
        <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-500">Active players</h3>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile label="Today" value={data.active.dau.toLocaleString()} hint="opened Questly today (UTC)" />
          <StatTile label="Last 7 days" value={data.active.wau.toLocaleString()} />
          <StatTile label="Last 30 days" value={data.active.mau.toLocaleString()} />
          <StatTile label="Stickiness" value={data.active.stickiness === null ? '—' : `${data.active.stickiness}%`} hint="average day this week ÷ last 30 days" />
        </div>
      </section>

      <section className="rounded-2xl border border-ink-600 bg-ink-850/60 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xs text-slate-300">How far new accounts get</h3>
          <span className="text-[11px] text-slate-500">
            {cohortSize.toLocaleString()} account{cohortSize === 1 ? '' : 's'} made in the last {data.cohortDays} days
          </span>
        </div>
        <ul className="space-y-2.5">
          {data.funnel.map((step) => {
            const share = cohortSize ? Math.round((step.count / cohortSize) * 100) : 0
            return (
              <li key={step.key} className="grid grid-cols-[minmax(7rem,14rem)_minmax(0,1fr)_5.5rem] items-center gap-3">
                <span className="text-xs text-slate-300">{step.label}</span>
                <span className="block h-4" aria-hidden>
                  <span className="block h-4 min-w-[2px] rounded-r-[4px]" style={{ width: `${(step.count / funnelMax) * 100}%`, background: MARK }} />
                </span>
                <span className="whitespace-nowrap text-right text-xs tabular-nums text-slate-200">
                  {step.count.toLocaleString()} <span className="text-slate-500">· {share}%</span>
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-ink-600 bg-ink-850/60 p-4">
        <div className="mb-3">
          <h3 className="text-xs text-slate-300">Who comes back, by the week their account was made</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">Share of accounts active again in each window. Only accounts old enough for the whole window count.</p>
        </div>
        {data.retention.cohorts.length === 0 ? (
          <p className="text-xs text-slate-500">No accounts in the last eight weeks.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-slate-500">
                  <th scope="col" className="py-1.5 pr-3 text-left font-semibold">Week of</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-semibold">Accounts</th>
                  {data.retention.windows.map((w) => (
                    <th key={w.key} scope="col" className="px-2 py-1.5 text-center font-semibold">
                      {w.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.retention.cohorts.map((cohort) => (
                  <tr key={cohort.week} className="border-t border-ink-700">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-slate-300">
                      {shortDay(cohort.week)}
                    </th>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{cohort.size}</td>
                    {cohort.windows.map((w) => (
                      <td key={w.key} className="p-0.5">
                        <div
                          className="rounded-md px-2 py-1.5 text-center tabular-nums text-slate-100"
                          style={{ background: w.rate === null ? 'transparent' : `rgb(var(--gold-500) / ${0.06 + (w.rate / 100) * 0.34})` }}
                          title={w.rate === null ? 'Not enough time has passed' : `${w.retained} of ${w.eligible} came back`}
                        >
                          {w.rate === null ? <span className="text-slate-600">—</span> : `${w.rate}%`}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-xs uppercase tracking-wide text-slate-500">What people did, last 30 days</h3>
          <button type="button" onClick={() => setTable((v) => !v)} className="text-[11px] font-semibold text-gold-400 hover:text-gold-300" aria-pressed={table}>
            {table ? 'Show charts' : 'Show as a table'}
          </button>
        </div>
        {table ? (
          <div className="overflow-x-auto rounded-xl border border-ink-600">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-ink-850 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">Day</th>
                  {data.trends.map((t) => (
                    <th key={t.event} scope="col" className="px-2 py-2 text-right font-semibold">
                      {t.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700">
                {data.trends[0]?.series.map((point, i) => (
                  <tr key={point.day}>
                    <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-normal text-slate-300">
                      {shortDay(point.day)}
                    </th>
                    {data.trends.map((t) => (
                      <td key={t.event} className="px-2 py-1.5 text-right tabular-nums text-slate-200">
                        {t.series[i].n}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {data.trends.map((t) => (
              <div key={t.event} className="rounded-2xl border border-ink-600 bg-ink-850/60 p-4">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <p className="text-xs text-slate-300">{t.label}</p>
                  <p className="text-xs tabular-nums text-slate-400">{t.total.toLocaleString()}</p>
                </div>
                <ColumnBars
                  data={t.series.map((d) => ({ key: d.day, n: d.n }))}
                  label={t.label}
                  height={64}
                  describe={(d) => `${shortDay(d.key)} · ${d.n}`}
                  axis={[shortDay(t.series[0].day), shortDay(t.series[t.series.length - 1].day)]}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
