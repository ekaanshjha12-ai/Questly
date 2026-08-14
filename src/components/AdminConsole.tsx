import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, Ban, Bot, Coins, Copy, Flame, Gauge, Loader2, RefreshCw,
  Search, ShieldCheck, Star, Trash2, TrendingUp, Trophy, Users, Zap,
} from 'lucide-react'
import {
  ApiError, adminDeleteUser, adminGrantXp, adminResetLink, adminSetDisabled, adminSuspend,
  fetchAdminStats, type AdminStats, type AdminUserRow,
} from '../lib/api'

type Tab = 'overview' | 'users' | 'analytics' | 'ai'

/**
 * Single accent for every chart.
 *
 * Each series here answers one question — how many signups, how many active —
 * so there is no identity to encode and no second hue to justify. A palette
 * would be decoration, and decoration in a chart is noise that reads as meaning.
 */
const MARK = 'rgb(var(--gold-500))'

function nf(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString() + suffix
}

/** A headline number. Not a chart: one value has no shape to show. */
function Tile({
  icon: Icon, label, value, unit, hint,
}: {
  icon: typeof Users
  label: string
  value: string
  unit?: string
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-850/60 p-3.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <p className="min-w-0 truncate text-[11px] text-slate-400">{label}</p>
      </div>
      <p className="mt-1.5 font-display text-2xl font-bold leading-none text-slate-50">
        {value}
        {unit && <span className="ml-1 text-xs font-medium text-slate-500">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-[10px] text-slate-600">{hint}</p>}
    </div>
  )
}

/**
 * Counts over consecutive days.
 *
 * Bars rather than a line: these are discrete daily totals, not a continuous
 * quantity, and a line between them implies values in between that do not
 * exist. Only the extremes are labelled — a number on every bar is noise.
 */
function DayBars({ data, label }: { data: { day: string; n: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.n))
  const total = data.reduce((sum, d) => sum + d.n, 0)

  if (!data.length) {
    return (
      <div className="rounded-2xl border border-ink-600 bg-ink-850/60 p-4">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="mt-6 text-center text-xs text-slate-600">Nothing recorded yet.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-850/60 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-xs text-slate-500">{total.toLocaleString()} in 30 days</p>
      </div>

      <div className="mt-3 flex h-24 items-end gap-[2px]" role="img" aria-label={`${label}: ${total} over 30 days`}>
        {data.map((d) => (
          <div
            key={d.day}
            className="group relative min-w-0 flex-1 rounded-t-[3px]"
            style={{ height: `${Math.max(3, (d.n / max) * 100)}%`, background: MARK }}
            title={`${d.day}: ${d.n}`}
          >
            {/* Hover detail, since a bar alone cannot say which day it is. */}
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-[10px] text-slate-200 group-hover:block">
              {d.day.slice(5)} · {d.n}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex justify-between text-[10px] text-slate-600">
        <span>{data[0]?.day.slice(5)}</span>
        <span>{data[data.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  )
}

/** Ranked categories. Horizontal, because the labels are words. */
function RankedBars({ items, label, unit = '' }: { items: { name: string; count: number }[]; label: string; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.count))
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-850/60 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      {!items.length ? (
        <p className="mt-4 text-xs text-slate-600">Nothing yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div key={item.name}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-xs text-slate-300" title={item.name}>{item.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-slate-400">{item.count.toLocaleString()}{unit}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full rounded-full" style={{ width: `${(item.count / max) * 100}%`, background: MARK }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Unavailable({ what, why }: { what: string; why: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-600 bg-ink-850/30 p-3.5">
      <p className="text-[11px] text-slate-500">{what}</p>
      <p className="mt-1.5 font-display text-2xl font-bold leading-none text-slate-600">—</p>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-600">{why}</p>
    </div>
  )
}

function UserDetail({
  user, onAction, onClose,
}: {
  user: AdminUserRow
  onAction: (fn: () => Promise<unknown>, label: string) => void
  onClose: () => void
}) {
  const [xp, setXp] = useState('100')
  const [link, setLink] = useState<string | null>(null)

  return (
    <div className="rounded-2xl border border-gold-500/40 bg-ink-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold text-slate-50">{user.name ?? user.email}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-200">
          Close
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {[
          ['Level', String(user.level)], ['Rank', user.rank], ['XP', user.xp.toLocaleString()],
          ['Coins', user.coins.toLocaleString()], ['Streak', `${user.streak}d`],
          ['Focus', `${user.focusHours}h`], ['Verified', String(user.questsVerified)],
          ['Success', user.successProbability === null ? '—' : `${user.successProbability}%`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5">
            <p className="text-[10px] text-slate-500">{k}</p>
            <p className="text-slate-200">{v}</p>
          </div>
        ))}
      </div>

      {user.goals.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">Goals: {user.goals.join(' · ')}</p>
      )}
      <p className="mt-1 text-[11px] text-slate-600">
        Joined {new Date(user.joinedAt).toLocaleDateString()}
        {user.lastLogin && ` · last sign-in ${new Date(user.lastLogin).toLocaleDateString()}`}
        {user.mfaEnabled && ' · 2FA on'}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={xp}
          onChange={(e) => setXp(e.target.value.replace(/[^\d-]/g, ''))}
          className="w-24 rounded-lg border border-ink-600 bg-ink-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-gold-500/60"
          aria-label="XP amount"
        />
        <button
          type="button"
          onClick={() => onAction(() => adminGrantXp(user.id, Number(xp)), `XP adjusted for ${user.email}`)}
          className="rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs text-slate-300 hover:border-gold-500/50 hover:text-gold-300"
        >
          Apply XP
        </button>

        <button
          type="button"
          onClick={() => onAction(() => adminSetDisabled(user.id, !user.disabled), user.disabled ? 'Unbanned' : 'Banned')}
          className="flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs text-slate-300 hover:border-ember-500/50 hover:text-ember-400"
        >
          <Ban className="h-3 w-3" />
          {user.disabled ? 'Unban' : 'Ban'}
        </button>

        <button
          type="button"
          onClick={() => onAction(() => adminSuspend(user.id, 7), 'Suspended for 7 days')}
          className="rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs text-slate-300 hover:border-ember-500/50 hover:text-ember-400"
        >
          Suspend 7d
        </button>
        <button
          type="button"
          onClick={() => onAction(() => adminSuspend(user.id, null), 'Suspension lifted')}
          className="rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs text-slate-300 hover:text-slate-100"
        >
          Lift
        </button>

        <button
          type="button"
          onClick={() =>
            onAction(async () => {
              const r = await adminResetLink(user.id)
              setLink(window.location.origin + r.path)
            }, 'Reset link issued')
          }
          className="rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs text-slate-300 hover:text-slate-100"
        >
          Password reset link
        </button>

        <button
          type="button"
          onClick={() => {
            if (confirm(`Permanently delete ${user.email} and all their data? This cannot be undone.`)) {
              onAction(() => adminDeleteUser(user.id), `Deleted ${user.email}`)
            }
          }}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-ember-500/40 px-2.5 py-1.5 text-xs text-ember-400 hover:bg-ember-500/10"
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </button>
      </div>

      {link && (
        <div className="mt-3 rounded-lg border border-gold-500/40 bg-gold-500/5 p-2.5">
          <p className="text-[11px] text-slate-400">
            Give this to them directly. It works once, expires in 30 minutes, and anyone holding it can claim
            the account.
          </p>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(link)}
            className="mt-1.5 flex w-full items-center gap-2 rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-left font-mono text-[10px] text-slate-200"
          >
            <span className="min-w-0 flex-1 break-all">{link}</span>
            <Copy className="h-3 w-3 shrink-0 text-slate-500" />
          </button>
        </div>
      )}
    </div>
  )
}

export default function AdminConsole() {
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [openUser, setOpenUser] = useState<string | null>(null)

  async function load(force = false) {
    setBusy(true)
    try {
      setStats(await fetchAdminStats(force))
      setError(null)
    } catch (err) {
      setError(
        err instanceof ApiError && (err.status === 404 || err.status === 401)
          ? 'This account cannot see the console. Sign in as an admin.'
          : err instanceof Error
            ? err.message
            : 'Could not load the console.',
      )
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function run(fn: () => Promise<unknown>, label: string) {
    setNotice(null)
    try {
      await fn()
      setNotice(label)
      await load(true)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'That did not work.')
    }
  }

  const filtered = useMemo(() => {
    if (!stats) return []
    const q = query.trim().toLowerCase()
    if (!q) return stats.users
    return stats.users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name ?? '').toLowerCase().includes(q) ||
        u.goals.some((g) => g.toLowerCase().includes(q)),
    )
  }, [stats, query])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-ember-500/40 bg-ink-900 p-6 text-center">
          <AlertTriangle className="mx-auto h-7 w-7 text-ember-400" />
          <p className="mt-3 text-sm text-slate-300">{error}</p>
          <a href="/" className="mt-4 inline-block text-xs text-gold-400 hover:underline">Back to the app</a>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
      </div>
    )
  }

  const { live, gamification, study, goals, ai, analytics } = stats

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-gold-400" />
        <h1 className="font-display text-lg font-bold text-slate-50">Admin</h1>
        <span className="text-[11px] text-slate-600">
          as of {new Date(stats.generatedAt).toLocaleTimeString()}
        </span>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={busy}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-100 disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <a href="/" className="rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-100">
          App
        </a>
      </header>

      {notice && (
        <p className="mb-4 rounded-lg border border-gold-500/40 bg-gold-500/5 px-3 py-2 text-xs text-gold-300">{notice}</p>
      )}

      <div className="mb-5 flex gap-1 rounded-xl border border-ink-600 bg-ink-850/70 p-1">
        {(['overview', 'users', 'analytics', 'ai'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              tab === t ? 'bg-gradient-to-r from-gold-500 to-ember-500 text-onAccent' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            <Tile icon={Users} label="Total users" value={nf(live.totalUsers)} />
            <Tile icon={Activity} label="Active today" value={nf(live.activeToday)} />
            <Tile icon={TrendingUp} label="Monthly active" value={nf(live.mau)} />
            <Tile icon={Star} label="New today" value={nf(live.newToday)} />
            <Tile icon={Bot} label="AI requests today" value={nf(live.aiRequestsToday)} />
            <Tile icon={ShieldCheck} label="Photos today" value={nf(live.photosToday)} />
            <Tile icon={Activity} label="Voice checks today" value={nf(live.voiceToday)} />
            <Unavailable what="Monthly revenue" why="No billing system yet." />
            <Unavailable what="Active subscribers" why="No billing system yet." />
          </div>

          <div>
            <h2 className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
              <Trophy className="h-3.5 w-3.5" /> Gamification
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Tile icon={Zap} label="Total XP generated" value={nf(gamification.totalXp)} />
              <Tile icon={Star} label="Highest level" value={nf(gamification.highestLevel)} />
              <Tile icon={Flame} label="Average streak" value={nf(gamification.averageStreak)} unit="days" />
              <Tile icon={Coins} label="Quest completion" value={`${goals.questCompletionRate}`} unit="%" />
            </div>
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              <RankedBars items={gamification.mostUsedHero} label="Most used hero" />
              <RankedBars items={goals.commonGoals.slice(0, 8)} label="Most common goals" />
            </div>
          </div>

          <div>
            <h2 className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
              <Gauge className="h-3.5 w-3.5" /> Study
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Tile icon={Gauge} label="Avg study hours" value={nf(study.averageStudyHours)} unit="h" hint="per account" />
              <Tile icon={Activity} label="Avg sessions" value={nf(study.averageSessions)} hint="per account" />
              <Tile icon={Gauge} label="Total study time" value={nf(study.totalStudyHours)} unit="h" />
              <Tile icon={Star} label="Flashcards" value={nf(study.totalCards)} hint={`${study.totalDecks} decks`} />
            </div>
            <div className="mt-2.5">
              <RankedBars items={study.popularSubjects.slice(0, 8)} label="Most popular subjects" />
            </div>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-850/60 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by email, name or goal…"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none"
            />
            <span className="shrink-0 text-xs text-slate-500">{filtered.length}</span>
          </div>

          {filtered.map((u) => (
            <div key={u.id}>
              <button
                type="button"
                onClick={() => setOpenUser(openUser === u.id ? null : u.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  u.disabled ? 'border-ember-500/40 bg-ember-500/5' : 'border-ink-600 bg-ink-850/60 hover:border-ink-500'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-100">{u.name ?? u.email}</span>
                  <span className="block truncate text-[11px] text-slate-500">{u.email}</span>
                </span>
                {u.role !== 'user' && (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gold-400">{u.role}</span>
                )}
                {u.disabled && <span className="shrink-0 text-[10px] font-semibold text-ember-400">BANNED</span>}
                <span className="shrink-0 text-xs tabular-nums text-slate-400">L{u.level}</span>
                <span className="hidden shrink-0 text-xs tabular-nums text-slate-500 sm:inline">{u.xp.toLocaleString()} XP</span>
              </button>
              {openUser === u.id && (
                <div className="mt-2">
                  <UserDetail user={u} onAction={run} onClose={() => setOpenUser(null)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'analytics' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Tile icon={ShieldCheck} label="Verification rate" value={analytics.verificationRate === null ? '—' : String(analytics.verificationRate)} unit="%" hint="accepted of attempted" />
            <Tile icon={TrendingUp} label="7-day retention" value={analytics.retention7d === null ? '—' : String(analytics.retention7d)} unit="%" />
            <Unavailable what="Subscription conversion" why="Needs a billing system." />
            <Unavailable what="Churn rate" why="Needs a billing system." />
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <DayBars data={analytics.signups} label="Daily signups" />
            <DayBars data={analytics.activeUsers} label="Daily active users" />
            <DayBars data={analytics.aiUsage.map((d) => ({ day: d.day, n: d.n }))} label="AI requests per day" />
            <DayBars data={analytics.verifications} label="Verifications per day" />
          </div>
        </div>
      )}

      {tab === 'ai' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Tile icon={Bot} label="Total requests" value={nf(ai.totalRequests)} />
            <Tile icon={Activity} label="Avg response" value={nf(Math.round(ai.averageResponseMs / 100) / 10)} unit="s" />
            <Tile icon={AlertTriangle} label="Failed requests" value={nf(ai.failedRequests)} hint={`${ai.failedToday} today`} />
            <Tile icon={Coins} label="Cost today" value={`$${ai.costToday.toFixed(4)}`} />
            <Tile icon={Coins} label="Cost this month" value={`$${ai.costThisMonth.toFixed(2)}`} hint={`${ai.requestsThisMonth} requests`} />
          </div>
          <RankedBars items={ai.byEndpoint.map((e) => ({ name: e.endpoint, count: e.count }))} label="Requests by feature" />
          <RankedBars
            items={ai.byEndpoint.map((e) => ({ name: e.endpoint, count: Math.round(e.cost * 10000) / 10000 }))}
            label="Cost by feature (USD)"
          />
        </div>
      )}
    </div>
  )
}
