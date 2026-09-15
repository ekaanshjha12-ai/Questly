import { useCallback, useEffect, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { adminAudit, type AuditEntry } from '../../lib/api'

const PRESETS: { label: string; prefix?: string; event?: string }[] = [
  { label: 'Everything' },
  { label: 'Sign-ins', prefix: 'auth' },
  { label: 'Admin actions', prefix: 'admin' },
  { label: 'Blocked content', prefix: 'moderation' },
  { label: 'Reports & blocks', prefix: 'social' },
  { label: 'Account changes', prefix: 'account' },
  { label: 'Access denied', event: 'authz.denied' },
]

/**
 * The security log: sign-ins, admin and moderation actions, blocked content
 * and account changes, newest first. Kept for as long as the retention setting
 * says, then erased.
 */
export default function AdminAudit() {
  const [preset, setPreset] = useState(0)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filters = useCallback(() => ({ prefix: PRESETS[preset].prefix, event: PRESETS[preset].event, q: search || undefined }), [preset, search])

  useEffect(() => {
    let cancelled = false
    setEntries(null)
    setError(null)
    adminAudit({ ...filters(), limit: 100 })
      .then((res) => {
        if (cancelled) return
        setEntries(res.entries)
        setMore(res.more)
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load the log.'))
    return () => {
      cancelled = true
    }
  }, [filters])

  async function loadMore() {
    if (!entries?.length) return
    setLoadingMore(true)
    try {
      const res = await adminAudit({ ...filters(), limit: 100, before: entries[entries.length - 1].id })
      setEntries([...entries, ...res.entries])
      setMore(res.more)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p, i) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setPreset(i)}
            aria-pressed={preset === i}
            className={`rounded-full border px-2.5 py-1 text-xs ${preset === i ? 'border-gold-500/60 bg-gold-500/10 text-gold-300' : 'border-ink-600 text-slate-400 hover:text-slate-200'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSearch(query.trim())
        }}
        className="flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-850/60 px-3 py-2"
      >
        <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search email, IP address or detail, then press Enter"
          aria-label="Search the log"
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setSearch('')
            }}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Clear
          </button>
        )}
      </form>

      {error && <p className="rounded-lg border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">{error}</p>}
      {!entries && !error && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
        </div>
      )}
      {entries?.length === 0 && <p className="rounded-xl border border-dashed border-ink-600 px-3 py-8 text-center text-xs text-slate-500">Nothing in the log matches.</p>}

      {entries && entries.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-ink-600">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-ink-850 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">When</th>
                <th scope="col" className="px-3 py-2 font-semibold">Event</th>
                <th scope="col" className="px-3 py-2 font-semibold">Outcome</th>
                <th scope="col" className="px-3 py-2 font-semibold">Account</th>
                <th scope="col" className="px-3 py-2 font-semibold">IP</th>
                <th scope="col" className="px-3 py-2 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700">
              {entries.map((e) => (
                <tr key={e.id} className="align-top hover:bg-ink-850/60">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-400">{new Date(e.at).toLocaleString()}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-slate-200">{e.event}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${outcomeTone(e.outcome)}`}>{e.outcome}</span>
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-2 text-slate-300" title={e.email ?? ''}>{e.email ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-slate-500">{e.ip ?? '—'}</td>
                  <td className="max-w-[20rem] break-words px-3 py-2 text-slate-400">{e.detail ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {more && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-ink-600 py-2 text-xs text-slate-300 hover:border-ink-500"
        >
          {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Older entries
        </button>
      )}
    </div>
  )
}

function outcomeTone(outcome: string): string {
  if (['success', 'filed', 'replied', 'closed'].includes(outcome)) return 'bg-gold-500/10 text-gold-300'
  if (['blocked', 'bad_password', 'denied', 'underage', 'bad_invite', 'locked'].includes(outcome)) return 'bg-danger-500/10 text-danger-400'
  return 'bg-ink-800 text-slate-300'
}
