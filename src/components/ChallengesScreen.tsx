import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import type { Challenge } from '../lib/api'
import { PlayerAvatar, StatusPill, formatWhen, timeLeft } from './ChallengeParts'
import PlayerCardSheet from './PlayerCardSheet'
import PlayerSearch from './PlayerSearch'
import ChallengeRoom from './ChallengeRoom'

/**
 * Where challenges live: find someone, and every offer and challenge you have,
 * sorted by what it needs from you.
 *
 * Offers waiting on you come first, because they are the only things here that
 * expire if you do nothing.
 */
export default function ChallengesScreen({
  myName,
  challenges,
  error,
  onRefresh,
  onUpsert,
  openId: routeOpenId,
  onOpenChange,
}: {
  myName: string
  challenges: Challenge[] | null
  error: string | null
  onRefresh: () => Promise<void>
  onUpsert: (challenge: Challenge) => void
  /** The challenge in the address bar, when the page is routed. */
  openId?: string | null
  onOpenChange?: (id: string | null) => void
}) {
  const [viewing, setViewing] = useState<string | null>(null)
  const [localOpenId, setLocalOpenId] = useState<string | null>(null)
  const routed = onOpenChange !== undefined
  const openId = routed ? (routeOpenId ?? null) : localOpenId
  const setOpenId = routed ? onOpenChange : setLocalOpenId

  useEffect(() => {
    void onRefresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const list = challenges ?? []
  const offers = list.filter((c) => c.role === 'opponent' && c.status === 'pending')
  const running = list.filter((c) => ['accepted', 'active', 'due'].includes(c.status))
  const sent = list.filter((c) => c.role === 'creator' && c.status === 'pending')
  const history = list.filter((c) => ['completed', 'rejected', 'expired', 'cancelled'].includes(c.status))

  return (
    <div className="space-y-5">
      {/* --- find people ---------------------------------------------------- */}
      <div className="panel p-3">
        <PlayerSearch onPick={(p) => setViewing(p.username)} placeholder="Find someone to challenge" maxHeight="16rem" />
        <p className="mt-2 px-1 text-[11px] text-slate-500">You can also tap a name on the leaderboard.</p>
      </div>

      {error && !challenges && <p className="text-xs text-ember-400">{error}</p>}
      {!challenges && !error && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
        </div>
      )}

      {challenges && (
        <>
          <Group title="Offers for you" empty="No offers waiting." items={offers} onOpen={setOpenId} highlight />
          <Group title="Active" empty="Nothing running yet." items={running} onOpen={setOpenId} />
          <Group title="Sent — waiting for an answer" empty="No offers out." items={sent} onOpen={setOpenId} />
          <Group title="History" empty="Finished, declined and expired challenges show up here." items={history} onOpen={setOpenId} />
        </>
      )}

      <AnimatePresence>
        {viewing && (
          <PlayerCardSheet
            username={viewing}
            myName={myName}
            onClose={() => setViewing(null)}
            onChallengeSent={(c) => onUpsert(c)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {openId && <ChallengeRoom challengeId={openId} onClose={() => setOpenId(null)} onChanged={onUpsert} />}
      </AnimatePresence>
    </div>
  )
}

function Group({
  title,
  empty,
  items,
  onOpen,
  highlight = false,
}: {
  title: string
  empty: string
  items: Challenge[]
  onOpen: (id: string) => void
  highlight?: boolean
}) {
  return (
    <section>
      <p className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
        {title}
        {items.length > 0 && <span className="rounded-full bg-ink-700 px-1.5 text-[10px] text-slate-300">{items.length}</span>}
      </p>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink-600 px-3 py-3 text-xs text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id}>
              <ChallengeRow c={c} onOpen={() => onOpen(c.id)} highlight={highlight} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ChallengeRow({ c, onOpen, highlight }: { c: Challenge; onOpen: () => void; highlight: boolean }) {
  const them = c.role === 'creator' ? c.opponent : c.creator
  const line =
    c.status === 'pending'
      ? `${c.role === 'opponent' ? 'Answer' : 'Expires'} within ${timeLeft(c.expiresAt)}`
      : c.status === 'active'
        ? `Day ${(c.today ?? 0) + 1} of ${c.durationDays} · ends ${formatWhen(c.endsAt)}`
        : c.status === 'accepted'
          ? `Starts ${formatWhen(c.startsAt)}`
          : c.status === 'completed' && c.rewards
            ? (c.role === 'creator' ? c.rewards.creator : c.rewards.opponent) > 0
              ? `You earned ${(c.role === 'creator' ? c.rewards.creator : c.rewards.opponent).toLocaleString()} XP`
              : 'Finished — no reward this time'
            : `${c.durationDays} days · ${c.rewardXp.toLocaleString()} XP`

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
        highlight ? 'border-gold-500/50 bg-gold-500/10' : 'border-ink-600 bg-ink-850 hover:border-ink-500'
      }`}
    >
      {them && <PlayerAvatar player={them} size={40} />}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-100">{c.name}</span>
        </span>
        <span className="block truncate text-[11px] text-slate-400">
          {c.role === 'opponent' ? 'From' : 'vs'} {them?.name ?? 'someone'} · {c.rewardXp.toLocaleString()} XP
        </span>
        <span className="block truncate text-[11px] text-slate-500">{line}</span>
      </span>
      <StatusPill status={c.status} />
    </button>
  )
}
