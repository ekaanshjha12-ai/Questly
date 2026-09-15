import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Loader2, Minus, RefreshCw } from 'lucide-react'
import { adminSystem, type SystemHealth } from '../../lib/api'
import { ColumnBars, StatTile, formatBytes, formatDuration } from './charts'

const RECORD_LABELS: Record<string, string> = {
  users: 'Accounts',
  activeSessions: 'Active sessions',
  posts: 'Live posts',
  comments: 'Live comments',
  directMessages: 'Direct messages',
  quests: 'Quests',
  focusSessions: 'Focus sessions',
  clubs: 'Clubs',
  duels: 'Duels',
  openReports: 'Open reports',
  openSupport: 'Open support requests',
  auditEntries: 'Security log entries',
  blockedLastDay: 'Blocked by filters, last 24 hours',
}

/** How the running service is doing: the last hour of requests, memory, storage and records. */
export default function AdminSystem() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setBusy(true)
    try {
      setHealth(await adminSystem())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the system.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void load(), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  if (error && !health) return <p className="rounded-lg border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">{error}</p>
  if (!health) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
      </div>
    )
  }

  const { requests, process: proc, storage, records, features, retention } = health
  const peak = Math.max(0, ...requests.perMinute.map((m) => m.count))

  return (
    <div className={`space-y-5 transition-opacity ${busy ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        Updated {new Date(health.generatedAt).toLocaleTimeString()} · refreshes every 30 seconds
        <button type="button" onClick={() => void load()} className="ml-auto flex items-center gap-1 rounded-lg border border-ink-600 px-2 py-1 text-slate-400 hover:text-slate-100">
          <RefreshCw className="h-3 w-3" aria-hidden /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Uptime" value={formatDuration(proc.uptimeSeconds)} hint={`since ${new Date(proc.startedAt).toLocaleString()}`} />
        <StatTile label="Requests, last hour" value={requests.lastHour.toLocaleString()} hint={`${requests.clientErrors.toLocaleString()} refused (4xx)`} />
        <StatTile
          label="Server errors, last hour"
          value={requests.serverErrors.toLocaleString()}
          icon={requests.serverErrors ? <AlertTriangle className="h-3.5 w-3.5 text-danger-400" aria-hidden /> : <Check className="h-3.5 w-3.5 text-gold-400" aria-hidden />}
          hint={requests.serverErrors ? 'See the list below' : 'None'}
        />
        <StatTile label="Response time" value={requests.averageMs === null ? '—' : `${requests.averageMs} ms`} hint={requests.p95Ms === null ? 'average' : `average · 95% under ${requests.p95Ms} ms`} />
        <StatTile label="Memory in use" value={formatBytes(proc.rssBytes)} hint={`heap ${formatBytes(proc.heapUsedBytes)} · Node ${proc.node}`} />
        <StatTile label="Database" value={formatBytes(storage.databaseBytes)} />
        <StatTile label="Uploaded video" value={formatBytes(storage.mediaBytes)} hint={`${storage.mediaFiles.toLocaleString()} files`} />
        <StatTile label="Active sessions" value={(records.activeSessions ?? 0).toLocaleString()} />
      </div>

      <section className="rounded-2xl border border-ink-600 bg-ink-850/60 p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-xs text-slate-300">API requests per minute</h3>
          <span className="text-[11px] text-slate-500">peak {peak.toLocaleString()} a minute</span>
        </div>
        <ColumnBars
          data={requests.perMinute.map((m) => ({ key: m.at, n: m.count }))}
          label="API requests per minute over the last hour"
          describe={(d) => `${new Date(d.key).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${d.n} request${d.n === 1 ? '' : 's'}`}
          axis={['an hour ago', 'now']}
        />
      </section>

      <section>
        <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-500">Recent server errors</h3>
        {requests.recentErrors.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-600 px-3 py-4 text-xs text-slate-500">No server errors since the last restart.</p>
        ) : (
          <ul className="divide-y divide-ink-700 rounded-xl border border-ink-600">
            {requests.recentErrors.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
                <span className="flex items-center gap-1 font-semibold text-danger-400">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {e.status}
                </span>
                <span className="font-mono text-slate-200">
                  {e.method} {e.route}
                </span>
                <span className="ml-auto tabular-nums text-slate-500">{new Date(e.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-2.5 lg:grid-cols-2">
        <section className="rounded-2xl border border-ink-600 bg-ink-850/60 p-4">
          <h3 className="mb-2 text-xs text-slate-300">Records</h3>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-xs">
            {Object.entries(RECORD_LABELS).map(([key, label]) => (
              <div key={key} className="contents">
                <dt className="text-slate-400">{label}</dt>
                <dd className="text-right tabular-nums text-slate-100">{records[key] === null || records[key] === undefined ? '—' : records[key]!.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="space-y-2.5">
          <div className="rounded-2xl border border-ink-600 bg-ink-850/60 p-4">
            <h3 className="mb-2 text-xs text-slate-300">Features</h3>
            <ul className="space-y-1.5 text-xs">
              {[
                ['AI features and photo checks', features.ai],
                ['Video posts', features.video],
                ['Sign-up needs an invite code', features.inviteOnly],
              ].map(([label, on]) => (
                <li key={String(label)} className="flex items-center gap-2">
                  {on ? <Check className="h-3.5 w-3.5 text-gold-400" aria-hidden /> : <Minus className="h-3.5 w-3.5 text-slate-500" aria-hidden />}
                  <span className="text-slate-300">{label}</span>
                  <span className="ml-auto text-slate-500">{on ? 'on' : 'off'}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-ink-600 bg-ink-850/60 p-4 text-xs">
            <h3 className="mb-2 text-slate-300">Retention</h3>
            <p className="text-slate-400">
              Deleted posts and comments erased after {retention.deletedContentDays} days · security log kept {retention.auditLogDays} days · closed reports{' '}
              {retention.reportDays} days · closed support requests {retention.supportDays} days.
            </p>
            <p className="mt-2 text-slate-500">
              {retention.lastSweep
                ? `Last sweep ${new Date(retention.lastSweep.at).toLocaleString()}: ${
                    Object.entries(retention.lastSweep.removed)
                      .filter(([, n]) => n)
                      .map(([k, n]) => `${n} ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`)
                      .join(', ') || 'nothing was due'
                  }.`
                : 'No sweep has run since the last restart.'}
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
