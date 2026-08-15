import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Loader2, Trophy } from 'lucide-react'
import { fetchLeaderboard, setLeaderboardVisibility, type BoardRow } from '../lib/api'

/**
 * Standings by XP.
 *
 * Name, rank and total, and nothing else. Everywhere else in the app a person's
 * data is theirs alone, so the one screen that crosses that line shows the least
 * it can while still being a ranking — no streak, no goals, never an email. Rank
 * is computed from the XP already on the row, so it adds no new disclosure.
 */
function Row({ row, highlight }: { row: BoardRow; highlight?: boolean }) {
  const medal = row.position <= 3
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
        highlight ? 'border-gold-500/50 bg-gold-500/10' : 'border-ink-600 bg-ink-850/60'
      }`}
    >
      <span
        className={`w-7 shrink-0 text-center font-display text-sm font-bold tabular-nums ${
          medal ? 'text-gold-400' : 'text-slate-500'
        }`}
      >
        {row.position}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${highlight ? 'text-gold-200' : 'text-slate-200'}`}>
          {row.name}
          {highlight && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-gold-400">you</span>}
        </span>
        <span className="block truncate text-[11px] text-slate-500">{row.rank}</span>
      </span>
      <span className="shrink-0 text-sm tabular-nums text-slate-300">{row.xp.toLocaleString()}</span>
      <span className="shrink-0 text-[10px] text-slate-600">XP</span>
    </div>
  )
}

export default function Leaderboard() {
  const [data, setData] = useState<{ top: BoardRow[]; me: BoardRow | null; total: number; hidden: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      setData(await fetchLeaderboard())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the leaderboard.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function toggle() {
    if (!data) return
    setBusy(true)
    try {
      await setLeaderboardVisibility(!data.hidden)
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p className="rounded-xl border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-xs text-ember-400">{error}</p>
  if (!data) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
      </div>
    )
  }

  // Someone outside the visible top still gets their own standing, rather than
  // a wall of strangers with no sign of where they sit.
  const meInTop = data.top.some((r) => r.you)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Trophy className="h-4 w-4 text-gold-400" />
        <p className="font-display text-base font-semibold text-slate-50">Leaderboard</p>
        <span className="text-xs text-slate-500">{data.total} ranked</span>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1.5 text-[11px] text-slate-400 transition-colors hover:text-slate-100 disabled:opacity-40"
        >
          {data.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {data.hidden ? 'Hidden — show me' : 'Visible — hide me'}
        </button>
      </div>

      {data.hidden && (
        <p className="rounded-lg border border-ink-600 bg-ink-800/40 px-3 py-2 text-[11px] text-slate-400">
          You are not listed. Nobody sees your name or XP here.
        </p>
      )}

      <div className="space-y-1.5">
        {data.top.map((row) => (
          <motion.div key={row.position} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <Row row={row} highlight={row.you} />
          </motion.div>
        ))}
      </div>

      {!meInTop && data.me && (
        <>
          <p className="text-center text-xs text-slate-600">···</p>
          <Row row={data.me} highlight />
        </>
      )}

      {!data.top.length && (
        <p className="rounded-xl border border-dashed border-ink-600 px-3 py-6 text-center text-xs text-slate-500">
          Nobody on the board yet.
        </p>
      )}
    </div>
  )
}
