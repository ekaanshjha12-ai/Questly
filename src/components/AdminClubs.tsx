import { useCallback, useEffect, useState } from 'react'
import { Castle, Loader2 } from 'lucide-react'
import { adminClubs, adminSetClubArchived, type AdminClub } from '../lib/api'

/**
 * Every club on the platform, for the admin console: who leads it, how big it
 * is, and a takedown that hides it from everyone until restored. The server
 * checks the admin role on every call.
 */
export default function AdminClubs() {
  const [clubs, setClubs] = useState<AdminClub[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setClubs((await adminClubs()).clubs)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load clubs.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(club: AdminClub) {
    setBusy(club.id)
    try {
      setClubs((await adminSetClubArchived(club.id, !club.archivedAt)).clubs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.')
    } finally {
      setBusy(null)
    }
  }

  if (error && !clubs) return <p className="rounded-lg border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">{error}</p>
  if (!clubs) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
      </div>
    )
  }
  if (!clubs.length) return <p className="rounded-xl border border-dashed border-ink-600 px-3 py-6 text-center text-xs text-slate-500">No clubs have been founded yet.</p>

  return (
    <ul className="space-y-2">
      {clubs.map((club) => (
        <li key={club.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${club.archivedAt ? 'border-danger-500/30 bg-danger-500/5' : 'border-ink-600 bg-ink-850/60'}`}>
          <Castle className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-slate-100">
              {club.name} <span className="text-slate-500">/{club.slug}</span>
            </span>
            <span className="block truncate text-[11px] text-slate-500">
              {club.owner.username ? `@${club.owner.username}` : club.owner.email} · {club.members} members · level {club.level} · {club.xp.toLocaleString()} Club XP
              {club.archivedAt ? ` · taken down ${new Date(club.archivedAt).toLocaleDateString()}` : ''}
            </span>
          </span>
          <button
            type="button"
            disabled={busy === club.id}
            onClick={() => void toggle(club)}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-40 ${club.archivedAt ? 'border-ink-600 text-slate-300 hover:text-white' : 'border-danger-500/40 text-danger-400 hover:bg-danger-500/10'}`}
          >
            {club.archivedAt ? 'Restore' : 'Take down'}
          </button>
        </li>
      ))}
    </ul>
  )
}
