import { useCallback, useEffect, useState } from 'react'
import { Inbox, Loader2, Mail } from 'lucide-react'
import { adminCloseSupport, adminSupport, type AdminSupportRequest } from '../lib/api'

const KIND_LABEL: Record<string, string> = {
  problem: 'Problem',
  account: 'Account',
  safety: 'Safety',
  privacy: 'Privacy',
  feedback: 'Feedback',
  other: 'Other',
}

/**
 * Contact & support requests. A reply to a player arrives in their Chronicle
 * Log; someone without an account is answered by email, from your own mail app.
 */
export default function AdminSupport({ onOpenCount }: { onOpenCount?: (n: number) => void }) {
  const [status, setStatus] = useState<'open' | 'closed'>('open')
  const [requests, setRequests] = useState<AdminSupportRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await adminSupport(status)
      setRequests(res.requests)
      onOpenCount?.(res.open)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load requests.')
    }
  }, [status, onOpenCount])

  useEffect(() => {
    setRequests(null)
    void load()
  }, [load])

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl border border-ink-600 bg-ink-850/70 p-1">
        {(['open', 'closed'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium capitalize ${status === s ? 'bg-ink-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">{error}</p>}
      {!requests && !error && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
        </div>
      )}
      {requests?.length === 0 && (
        <p className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-ink-600 px-3 py-8 text-center text-xs text-slate-500">
          <Inbox className="h-5 w-5" /> {status === 'open' ? 'No open requests.' : 'Nothing closed yet.'}
        </p>
      )}
      {requests?.map((r) => <SupportRow key={r.id} request={r} onDone={() => void load()} />)}
    </div>
  )
}

function SupportRow({ request, onDone }: { request: AdminSupportRequest; onDone: () => void }) {
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const open = request.status === 'open'

  async function close(withReply: boolean) {
    setBusy(true)
    setProblem(null)
    try {
      await adminCloseSupport(request.id, withReply ? reply.trim() : undefined)
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
        <span className="rounded-full border border-ink-600 bg-ink-800 px-2 py-0.5 font-semibold uppercase tracking-wide text-slate-300">{KIND_LABEL[request.kind] ?? request.kind}</span>
        <span className="text-slate-500">{new Date(request.createdAt).toLocaleString()}</span>
        <span className="ml-auto text-slate-400">
          {request.from ? (
            <>
              from <span className="text-slate-200">@{request.from.username ?? 'no username'}</span> ({request.from.email})
            </>
          ) : (
            <>
              no account · reply to <span className="text-slate-200">{request.contact}</span>
            </>
          )}
        </span>
      </header>
      <p className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-ink-700 bg-ink-900/70 px-3 py-2 text-sm text-slate-200">{request.body}</p>
      {request.page && <p className="mt-1 text-[11px] text-slate-500">Sent from {request.page}</p>}

      {open ? (
        <div className="mt-3 space-y-2">
          {request.from ? (
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value.slice(0, 2000))}
              rows={3}
              placeholder="Reply — it arrives in their Chronicle Log (optional)"
              className="w-full resize-y rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60"
            />
          ) : (
            request.contact && (
              <a
                href={`mailto:${request.contact}?subject=${encodeURIComponent('Your message to Questly')}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs text-slate-300 hover:text-slate-100"
              >
                <Mail className="h-3.5 w-3.5" /> Reply by email
              </a>
            )
          )}
          <div className="flex flex-wrap gap-2">
            {request.from && (
              <button
                type="button"
                disabled={busy || !reply.trim()}
                onClick={() => void close(true)}
                className="rounded-lg bg-gradient-to-r from-gold-500 to-ember-500 px-3 py-1.5 text-xs font-semibold text-onAccent disabled:opacity-40"
              >
                Reply and close
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void close(false)} className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs text-slate-300 hover:text-slate-100 disabled:opacity-40">
              Close without reply
            </button>
            {busy && <Loader2 className="h-4 w-4 animate-spin self-center text-gold-400" />}
          </div>
          {problem && <p className="text-xs text-danger-400">{problem}</p>}
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-slate-500">
          Closed {request.closedAt ? new Date(request.closedAt).toLocaleString() : ''}
          {request.closedBy ? ` by ${request.closedBy}` : ''}
          {request.reply && <p className="mt-1 whitespace-pre-wrap rounded-lg border border-gold-500/30 bg-gold-500/5 px-2.5 py-1.5 text-xs text-slate-300">{request.reply}</p>}
        </div>
      )}
    </article>
  )
}
