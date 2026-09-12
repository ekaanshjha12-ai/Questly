import {
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  Handshake,
  Hourglass,
  PencilLine,
  Trophy,
  XCircle,
} from 'lucide-react'
import type { ChallengeStatus, PlayerSummary } from '../lib/api'
import { playerAvatarUrl } from '../lib/api'

/**
 * The pieces every challenge screen shares: the status badge, the terms sheet,
 * and a small player chip.
 */

/* --- status ----------------------------------------------------------------- */

/**
 * One look per state, told apart three ways at once — colour, icon and word —
 * so no state depends on colour alone to be recognised. The label text stays in
 * the theme's own ink so it reads on both themes; the colour lives in the icon,
 * the tint and the border.
 */
const STATUS: Record<ChallengeStatus, { label: string; color: string; icon: typeof Clock; hint: string }> = {
  draft: { label: 'Draft', color: '#a3a3a3', icon: PencilLine, hint: 'Being written. Nothing has been sent.' },
  pending: { label: 'Pending', color: '#f59e0b', icon: Clock, hint: 'Sent, waiting for an answer.' },
  accepted: { label: 'Accepted', color: '#38bdf8', icon: Handshake, hint: 'Both agreed. Starts soon.' },
  active: { label: 'Active', color: '#22c55e', icon: CalendarClock, hint: 'Running now.' },
  due: { label: 'Finishing', color: '#22c55e', icon: Hourglass, hint: 'Just ended. Results are being counted.' },
  completed: { label: 'Completed', color: '#eab308', icon: Trophy, hint: 'Finished. Results are in.' },
  rejected: { label: 'Rejected', color: '#ef4444', icon: XCircle, hint: 'The offer was declined.' },
  expired: { label: 'Expired', color: '#737373', icon: Hourglass, hint: 'Nobody answered in time.' },
  cancelled: { label: 'Cancelled', color: '#737373', icon: Ban, hint: 'Withdrawn or ended early.' },
}

export function statusInfo(status: ChallengeStatus) {
  return STATUS[status]
}

export function StatusPill({ status, size = 'sm' }: { status: ChallengeStatus; size?: 'sm' | 'md' }) {
  const s = STATUS[status]
  const Icon = s.icon
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-semibold text-slate-100 ${
        size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
      } ${status === 'draft' ? 'border-dashed' : ''}`}
      style={{ borderColor: `${s.color}88`, background: `${s.color}1f` }}
      title={s.hint}
    >
      {status === 'active' ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: s.color }} />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: s.color }} />
        </span>
      ) : (
        <Icon className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} style={{ color: s.color }} />
      )}
      {s.label.toUpperCase()}
    </span>
  )
}

/* --- players ---------------------------------------------------------------- */

export function PlayerAvatar({ player, size = 32 }: { player: Pick<PlayerSummary, 'username' | 'name' | 'avatarVersion'>; size?: number }) {
  const src = playerAvatarUrl(player.username, player.avatarVersion)
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-ink-600 bg-ink-800 font-display font-bold text-slate-300"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : player.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

/* --- dates ------------------------------------------------------------------ */

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function timeLeft(iso: string): string {
  const ms = Date.parse(iso) - Date.now()
  if (ms <= 0) return 'now'
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 48) return `${Math.floor(hours / 24)} days`
  if (hours >= 1) return `${hours}h`
  return `${Math.max(1, Math.floor(ms / 60_000))} min`
}

/* --- terms ------------------------------------------------------------------ */

export interface TermsView {
  name: string
  objective: string
  rules: string
  terms: string
  durationDays: number
  rewardXp: number
  proof: 'required' | 'optional'
  minCheckins: number
  startMode: 'accept' | 'date'
  startsAt: string | null
  endsAt: string | null
  expiresAt?: string | null
  creatorName: string
  opponentName: string
}

/**
 * Every term of a challenge, in one place, the same way everywhere: while it is
 * being written, in the offer, and inside the challenge once it is running.
 *
 * Written out in full rather than summarised — the point of this sheet is that
 * nobody can later say they did not know what they agreed to.
 */
export function TermsSheet({ t }: { t: TermsView }) {
  const start =
    t.startsAt ? formatWhen(t.startsAt) : t.startMode === 'accept' ? 'As soon as it is accepted' : 'Not set'
  const end = t.endsAt ? formatWhen(t.endsAt) : `${t.durationDays} days after it starts`
  const completion =
    t.minCheckins >= t.durationDays
      ? `Check in on all ${t.durationDays} days.`
      : `Check in on at least ${t.minCheckins} of the ${t.durationDays} days.`

  const rows: [string, React.ReactNode][] = [
    ['Created by', t.creatorName],
    ['Challenged', t.opponentName],
    ['Objective', t.objective],
    ['Duration', `${t.durationDays} days`],
    ['Start date', start],
    ['End date', end],
    ['Reward', `${t.rewardXp.toLocaleString()} XP to each person who completes it`],
    [
      'Proof',
      t.proof === 'required'
        ? 'Required — every check-in needs a short note saying what you did'
        : 'Optional — a check-in can be a single tap',
    ],
    ['Completion', completion],
  ]
  if (t.expiresAt) rows.push(['Offer expires', formatWhen(t.expiresAt)])

  return (
    <div className="space-y-3">
      <dl className="divide-y divide-ink-700 overflow-hidden rounded-xl border border-ink-600">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[6.5rem_1fr] gap-3 bg-ink-850 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="min-w-0 break-words text-xs text-slate-100">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="rounded-xl border border-ink-600 bg-ink-850 px-3 py-2.5">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Rules</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-100">{t.rules}</p>
      </div>
      <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
        <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-gold-400" />
        {t.terms}
      </p>
    </div>
  )
}
