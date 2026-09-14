import { useCallback, useEffect, useState } from 'react'
import { Ban, Check, Flag, Loader2, Trash2 } from 'lucide-react'
import { adminReports, adminResolveReport, type AdminReport, type ReportStatus } from '../lib/api'

/**
 * The moderation queue in the admin console.
 *
 * Open reports come oldest first. Each shows what was reported as it looked
 * when it was reported, who reported it and how many reports the account has
 * against it, so a pattern is visible before anything is decided. Every
 * decision is made — and checked — by the server.
 */

const STATUSES: { id: ReportStatus; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'actioned', label: 'Actioned' },
  { id: 'dismissed', label: 'Dismissed' },
]

export default function AdminReports({ onOpenCount }: { onOpenCount?: (n: number) => void }) {
  const [status, setStatus] = useState<ReportStatus>('open')
  const [reports, setReports] = useState<AdminReport[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const page = await adminReports(status)
      setReports(page.reports)
      onOpenCount?.(page.open)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reports.')
    }
  }, [status, onOpenCount])

  useEffect(() => {
    setReports(null)
    void load()
  }, [load])

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl border border-ink-600 bg-ink-850/70 p-1">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStatus(s.id)}
            aria-pressed={status === s.id}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ${status === s.id ? 'bg-ink-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">{error}</p>}
      {!reports && !error && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
        </div>
      )}
      {reports && reports.length === 0 && (
        <p className="rounded-xl border border-dashed border-ink-600 px-3 py-6 text-center text-xs text-slate-500">
          {status === 'open' ? 'Nothing waiting. New reports from players land here.' : 'Nothing here yet.'}
        </p>
      )}
      {reports?.map((report) => (
        <ReportRow key={report.id} report={report} onDone={() => void load()} />
      ))}
    </div>
  )
}

function ReportRow({ report, onDone }: { report: AdminReport; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const snap = report.snapshot ?? {}
  const open = report.status === 'open'

  async function resolve(body: Parameters<typeof adminResolveReport>[1]) {
    setBusy(true)
    setProblem(null)
    try {
      await adminResolveReport(report.id, { ...body, note: note.trim() || undefined })
      onDone()
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="rounded-xl border border-ink-600 bg-ink-850/60 p-3">
      <header className="flex flex-wrap items-center gap-2 text-[11px]">
        <Flag className="h-3.5 w-3.5 text-danger-400" aria-hidden />
        <span className="font-semibold uppercase tracking-wide text-slate-300">{report.kind}</span>
        <span className="text-slate-500">{new Date(report.createdAt).toLocaleString()}</span>
        {report.target && (
          <span className="ml-auto text-slate-400">
            against <span className="text-slate-200">@{report.target.username ?? 'unknown'}</span> · {report.target.reportsAgainst} report
            {report.target.reportsAgainst === 1 ? '' : 's'}
            {report.target.suspendedUntil && new Date(report.target.suspendedUntil) > new Date() ? ' · suspended' : ''}
          </span>
        )}
      </header>

      <div className="mt-2 rounded-lg border border-ink-700 bg-ink-900/70 px-3 py-2 text-sm text-slate-200">
        {report.kind === 'post' ? (
          <>
            <p className="whitespace-pre-wrap break-words">{String(snap.body ?? '') || <span className="text-slate-500">(no text)</span>}</p>
            {snap.imageId ? <p className="mt-1 text-[11px] text-slate-500">Had a picture.</p> : null}
          </>
        ) : (
          <>
            <p>
              {String(snap.displayName ?? '')} <span className="text-slate-500">@{String(snap.username ?? '')}</span>
            </p>
            {snap.bio ? <p className="mt-1 text-xs text-slate-400">Bio: {String(snap.bio)}</p> : null}
            {snap.challengeId ? <p className="mt-1 text-[11px] text-slate-500">Reported from challenge {String(snap.challengeId)}</p> : null}
          </>
        )}
      </div>

      <p className="mt-2 text-xs text-slate-400">
        <span className="text-slate-500">Reason:</span> {report.reason ?? 'none given'}
        {report.reporter && <span className="text-slate-500"> — from @{report.reporter.username ?? report.reporter.email}</span>}
      </p>

      {open ? (
        <div className="mt-3 space-y-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Note for the record (optional)"
            className="w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void resolve({ outcome: 'dismissed' })} className="flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs text-slate-300 hover:text-slate-100 disabled:opacity-40">
              <Check className="h-3.5 w-3.5" /> Dismiss
            </button>
            {report.kind === 'post' && (
              <button type="button" disabled={busy} onClick={() => void resolve({ outcome: 'actioned', removePost: true })} className="flex items-center gap-1.5 rounded-lg border border-danger-500/40 px-2.5 py-1.5 text-xs text-danger-400 hover:bg-danger-500/10 disabled:opacity-40">
                <Trash2 className="h-3.5 w-3.5" /> Take post down
              </button>
            )}
            {report.target && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void resolve({ outcome: 'actioned', removePost: report.kind === 'post', suspendDays: 7 })}
                className="flex items-center gap-1.5 rounded-lg border border-danger-500/40 px-2.5 py-1.5 text-xs text-danger-400 hover:bg-danger-500/10 disabled:opacity-40"
              >
                <Ban className="h-3.5 w-3.5" /> {report.kind === 'post' ? 'Take down + suspend 7 days' : 'Suspend 7 days'}
              </button>
            )}
            {busy && <Loader2 className="h-4 w-4 animate-spin self-center text-gold-400" />}
          </div>
          {problem && <p className="text-xs text-danger-400">{problem}</p>}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500">
          {report.status === 'actioned' ? `Actioned: ${report.action ?? '—'}` : 'Dismissed'}
          {report.resolvedBy ? ` by ${report.resolvedBy.email}` : ''}
          {report.resolvedAt ? ` on ${new Date(report.resolvedAt).toLocaleString()}` : ''}
          {report.note ? ` — ${report.note}` : ''}
        </p>
      )}
    </article>
  )
}
