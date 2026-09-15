import { useCallback, useEffect, useState } from 'react'
import { CheckSquare, Loader2, Swords, Timer } from 'lucide-react'
import { adminCancelDuel, adminDuels, type AdminDuel } from '../../lib/api'
import ActionWithNote from './ActionWithNote'

const STATUS_TONE: Record<string, string> = {
  pending: 'border-info-400/40 bg-info-400/10 text-info-400',
  accepted: 'border-info-400/40 bg-info-400/10 text-info-400',
  active: 'border-gold-500/40 bg-gold-500/10 text-gold-300',
  due: 'border-reward-500/40 bg-reward-500/10 text-reward-300',
  completed: 'border-ink-600 bg-ink-800 text-slate-300',
  expired: 'border-ink-600 bg-ink-800 text-slate-400',
  declined: 'border-ink-600 bg-ink-800 text-slate-400',
  cancelled: 'border-danger-500/40 bg-danger-500/10 text-danger-400',
}

/** Duels between players. One still waiting or running can be called off; nobody is paid for it. */
export default function AdminDuels() {
  const [view, setView] = useState<'open' | 'recent'>('open')
  const [duels, setDuels] = useState<AdminDuel[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await adminDuels(view)
      setDuels(res.duels)
      setMore(res.more)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load duels.')
    }
  }, [view])

  useEffect(() => {
    setDuels(null)
    void load()
  }, [load])

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl border border-ink-600 bg-ink-850/70 p-1">
        {(['open', 'recent'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ${view === v ? 'bg-ink-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {v === 'open' ? 'Waiting or running' : 'All recent'}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">{error}</p>}
      {!duels && !error && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
        </div>
      )}
      {duels?.length === 0 && (
        <p className="rounded-xl border border-dashed border-ink-600 px-3 py-8 text-center text-xs text-slate-500">{view === 'open' ? 'No duels are waiting or running.' : 'No duels yet.'}</p>
      )}

      {duels?.map((duel) => (
        <article key={duel.id} className="rounded-xl border border-ink-600 bg-ink-850/60 p-3">
          <header className="flex flex-wrap items-center gap-2">
            <Swords className="h-4 w-4 text-reward-400" aria-hidden />
            <span className="text-sm font-semibold text-slate-100">{duel.name}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TONE[duel.status] ?? STATUS_TONE.completed}`}>{duel.status}</span>
            <span className="ml-auto text-[11px] text-slate-400">
              @{duel.creator.username ?? 'unknown'} vs @{duel.opponent.username ?? 'unknown'}
            </span>
          </header>
          <p className="mt-1.5 text-xs text-slate-300">{duel.objective}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              {duel.mode === 'focus' ? <Timer className="h-3 w-3" aria-hidden /> : <CheckSquare className="h-3 w-3" aria-hidden />}
              {duel.mode === 'focus' ? 'Focus duel' : 'Check-in duel'}
            </span>
            <span>{duel.durationDays} days</span>
            <span>{duel.rewardXp} XP each</span>
            <span>offered {new Date(duel.createdAt).toLocaleDateString()}</span>
            {duel.endsAt && <span>ends {new Date(duel.endsAt).toLocaleDateString()}</span>}
          </p>
          {duel.cancellable && (
            <div className="mt-2.5">
              <ActionWithNote
                label="Cancel duel"
                confirmLabel="Cancel it"
                placeholder="Why — both players are told this"
                onConfirm={async (note) => {
                  await adminCancelDuel(duel.id, note || undefined)
                  await load()
                }}
              />
            </div>
          )}
        </article>
      ))}

      {more && <p className="text-center text-[11px] text-slate-500">Showing the 40 newest.</p>}
    </div>
  )
}
