import { useEffect, useState } from 'react'
import { Coins, Crown, Gift, ScrollText, ShieldCheck, ShoppingBag, Swords, Timer, Trophy, UserCog, History, type LucideIcon } from 'lucide-react'
import { game, type LedgerEntry } from '../../lib/api'
import { PageHeader } from '../../app/AppShell'
import Button from '../../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'

const SOURCE: Record<string, { icon: LucideIcon; label: string }> = {
  quest: { icon: ScrollText, label: 'Quest' },
  quest_step: { icon: ScrollText, label: 'Quest progress' },
  quest_verify: { icon: ShieldCheck, label: 'Proof' },
  focus: { icon: Timer, label: 'Focus' },
  challenge: { icon: Swords, label: 'Duel' },
  club_challenge: { icon: Swords, label: 'Club' },
  achievement: { icon: Trophy, label: 'Achievement' },
  level_reward: { icon: Crown, label: 'Level reward' },
  purchase: { icon: ShoppingBag, label: 'Purchase' },
  admin: { icon: UserCog, label: 'Adjustment' },
  legacy: { icon: Gift, label: 'Carried over' },
}

/**
 * The XP ledger, as the player sees it: every reward, where it came from and
 * when. It adds up to the total on their profile, because it is the total.
 */
export default function XpHistoryScreen() {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load(before?: number) {
    setLoading(true)
    try {
      const page = await game.history(before)
      setEntries((list) => (before ? [...(list ?? []), ...page.entries] : page.entries))
      setMore(page.more)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your history.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  let lastDay = ''
  return (
    <div>
      <PageHeader title="XP History" subtitle="Every reward and where it came from" />
      {error && !entries && <ErrorState message={error} onRetry={() => void load()} />}
      {!entries && !error && <LoadingState lines={5} label="Loading history" />}
      {entries && entries.length === 0 && <EmptyState icon={History} title="No rewards yet" body="Finish a quest or a focus session and it will be recorded here." />}
      {entries && entries.length > 0 && (
        <div className="panel divide-y divide-ink-700/60">
          {entries.map((e) => {
            const meta = SOURCE[e.source] ?? { icon: Gift, label: e.source }
            const Icon = meta.icon
            const showDay = e.day !== lastDay
            lastDay = e.day
            return (
              <div key={e.id}>
                {showDay && (
                  <p className="eyebrow bg-ink-950/40 px-4 py-2">
                    {new Date(`${e.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                  </p>
                )}
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-600 bg-ink-850 text-gold-400">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-100">{e.label ?? meta.label}</p>
                    <p className="text-[11px] text-slate-500">
                      {meta.label}
                      {!e.verified ? ' · self-reported' : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    {e.xp !== 0 && <p className={`text-sm font-bold ${e.xp > 0 ? 'text-reward-400' : 'text-danger-400'}`}>{e.xp > 0 ? '+' : ''}{e.xp} XP</p>}
                    {e.coins !== 0 && (
                      <p className="flex items-center justify-end gap-1 text-[11px] font-semibold text-slate-400">
                        <Coins className="h-3 w-3" />
                        {e.coins > 0 ? '+' : ''}
                        {e.coins}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {more && entries && (
        <Button variant="secondary" block className="mt-4" loading={loading} onClick={() => void load(entries[entries.length - 1]?.id)}>
          Older rewards
        </Button>
      )}
    </div>
  )
}
