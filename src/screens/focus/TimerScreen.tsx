import { useEffect, useState } from 'react'
import { Check, Headphones, History, ListChecks, Play, Plus, Timer, Watch, X } from 'lucide-react'
import type { Goal, PlanItem } from '../../types'
import type { FocusSessionView, FocusTotals, GameQuest } from '../../lib/api'
import { game as gameApi } from '../../lib/api'
import { useGame } from '../../game/GameProvider'
import { useRouter } from '../../app/router'
import { PageHeader } from '../../app/AppShell'
import Button from '../../components/ui/Button'
import { Select, TextInput } from '../../components/ui/Field'
import { EmptyState, LoadingState } from '../../components/ui/States'
import { messageOf, useToast } from '../../components/ui/Toast'
import { focusXp, formatDurationMs, formatMinutes, isTimeable } from '../../lib/questFormat'
import { formatClock } from '../../lib/time'

const PRESETS = [5, 10, 15, 25, 45, 60, 90, 120]
/** Recent sessions shown before "Show more". */
const RECENT = 6

type StartInput = { kind: 'timer' | 'stopwatch'; targetMinutes?: number; label?: string; questId?: string | null; goalId?: string | null; plan?: PlanItem[] }

/**
 * The Timer: a countdown or a stopwatch for anything at all.
 *
 * It stands on its own — a quest never has to be timed, and a timer never has
 * to be for a quest — but one can be linked, and then its minutes count toward
 * that quest. Starting opens Focus Mode, where the session runs; the server
 * keeps the time.
 */
export default function TimerScreen({ goals, nowPlaying }: { goals: Goal[]; nowPlaying: string | null }) {
  const { snapshot, startFocus } = useGame()
  const { search, navigate } = useRouter()
  const toast = useToast()
  const session = snapshot?.focus ?? null
  const quests = (snapshot?.quests ?? []).filter(isTimeable)

  return (
    <div>
      <PageHeader title="Timer" subtitle="Time anything. Link a quest only if you want to." />

      {!snapshot ? (
        <LoadingState lines={3} label="Loading the timer" />
      ) : session ? (
        <RunningCard session={session} onOpen={() => navigate('/focus')} />
      ) : (
        <TimerSetup
          quests={quests}
          initialQuestId={search.get('quest')}
          goals={goals.filter((g) => !g.archived)}
          nowPlaying={nowPlaying}
          onOpenSounds={() => navigate('/sounds')}
          onStart={async (input) => {
            try {
              await startFocus(input)
              navigate('/focus')
            } catch (err) {
              toast.error('Could not start the timer', messageOf(err))
            }
          }}
        />
      )}

      {snapshot && <FocusRecord totals={snapshot.focusTotals} />}
      <RecentSessions refreshKey={snapshot?.focusTotals.sessions ?? 0} />
    </div>
  )
}

/* --- a session already running ------------------------------------------------ */

function RunningCard({ session, onOpen }: { session: FocusSessionView; onOpen: () => void }) {
  const paused = session.status === 'paused'
  return (
    <section className="panel border-gold-500/40 p-4" aria-label="Running session">
      <p className="eyebrow flex items-center gap-1.5 text-gold-300">
        {session.kind === 'timer' ? <Timer className="h-3.5 w-3.5" /> : <Watch className="h-3.5 w-3.5" />}
        {session.kind === 'timer' ? 'Timer' : 'Stopwatch'} {paused ? 'paused' : 'running'}
      </p>
      <p className="mt-1 font-display text-2xl font-bold text-slate-50">{session.label}</p>
      <p className="mt-0.5 text-sm text-slate-400">One session runs at a time. Finish or abandon it to start another.</p>
      <Button block icon={Play} className="mt-3 !min-h-[50px]" onClick={onOpen}>
        Back to your session
      </Button>
    </section>
  )
}

/* --- setting one up ----------------------------------------------------------- */

function suggestedMinutes(quest: GameQuest | null): number {
  if (!quest) return 25
  const left = quest.progress.kind === 'minutes' ? quest.progress.target - quest.progress.value : quest.durationMin
  return Math.min(240, Math.max(5, Math.round(left / 5) * 5))
}

function TimerSetup({
  quests,
  initialQuestId,
  goals,
  nowPlaying,
  onOpenSounds,
  onStart,
}: {
  quests: GameQuest[]
  initialQuestId: string | null
  goals: Goal[]
  nowPlaying: string | null
  onOpenSounds: () => void
  onStart: (input: StartInput) => Promise<void>
}) {
  const [questId, setQuestId] = useState<string | null>(() => (initialQuestId && quests.some((q) => q.id === initialQuestId) ? initialQuestId : null))
  const selected = quests.find((q) => q.id === questId) ?? null
  const [kind, setKind] = useState<'timer' | 'stopwatch'>('timer')
  const [minutes, setMinutes] = useState(() => suggestedMinutes(selected))
  const [label, setLabel] = useState('')
  const [goalId, setGoalId] = useState('')
  const [plan, setPlan] = useState<PlanItem[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  // A linked quest suggests the time it still needs.
  useEffect(() => {
    if (selected) setMinutes(suggestedMinutes(selected))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questId])

  const reward = kind === 'timer' ? focusXp(minutes * 60_000) : 0
  const completesQuest =
    selected !== null &&
    kind === 'timer' &&
    (selected.progress.kind === 'minutes' ? minutes >= selected.progress.target - selected.progress.value : minutes >= Math.floor(selected.durationMin * 0.9))

  async function start() {
    setBusy(true)
    await onStart({
      kind,
      targetMinutes: kind === 'timer' ? minutes : undefined,
      label: selected ? undefined : label.trim() || undefined,
      questId,
      goalId: selected ? null : goalId || null,
      plan,
    })
    setBusy(false)
  }

  return (
    <>
      <section className="panel p-4 sm:p-5" aria-label="Clock">
        <div role="radiogroup" aria-label="Clock" className="grid grid-cols-2 gap-1 rounded-xl border border-ink-700 bg-ink-950/60 p-1">
          {(['timer', 'stopwatch'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] transition-colors ${
                kind === k ? 'bg-gold-500/15 text-gold-300 ring-1 ring-gold-500/50' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {k === 'timer' ? <Timer className="h-4 w-4" aria-hidden /> : <Watch className="h-4 w-4" aria-hidden />}
              {k === 'timer' ? 'Timer' : 'Stopwatch'}
            </button>
          ))}
        </div>

        <p className="mt-5 text-center font-display text-6xl font-bold tabular-nums tracking-tight text-slate-50">
          {kind === 'timer' ? formatClock(minutes * 60_000) : formatClock(0)}
        </p>
        <p className="mt-1 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
          {kind === 'timer' ? 'Counts down' : 'Counts up, for up to four hours'}
        </p>

        {kind === 'timer' && (
          <>
            <div className="mt-4 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Length">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={minutes === m}
                  onClick={() => setMinutes(m)}
                  className={`min-h-[40px] rounded-xl border text-sm font-semibold ${
                    minutes === m ? 'border-gold-500/60 bg-gold-500/15 text-gold-300' : 'border-ink-700 bg-ink-900 text-slate-300 hover:border-ink-500'
                  }`}
                >
                  {formatMinutes(m)}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={5}
              max={240}
              step={5}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="mt-4 h-2 w-full accent-[rgb(var(--gold-500))]"
              aria-label="Minutes"
              aria-valuetext={formatMinutes(minutes)}
            />
          </>
        )}

        <Button block icon={Play} loading={busy} className="mt-5 !min-h-[52px] text-[15px]" onClick={() => void start()}>
          {kind === 'timer' ? `Start ${formatMinutes(minutes)} timer` : 'Start stopwatch'}
        </Button>
        <p className="mt-2 text-center text-xs text-slate-400">
          {kind === 'timer' ? `+${reward} XP when it runs out` : '+1 XP a minute, from five minutes'}
          {selected ? (completesQuest ? ` · completes “${selected.title}”` : ` · counts toward “${selected.title}”`) : ''}
        </p>
      </section>

      <section className="mt-6" aria-label="Options">
        <h2 className="eyebrow mb-2.5">
          Details <span className="normal-case tracking-normal text-slate-500">(all optional)</span>
        </h2>
        <div className="space-y-2.5">
          <Select value={questId ?? ''} onChange={(e) => setQuestId(e.target.value || null)} aria-label="Count it toward a quest">
            <option value="">Not for a quest</option>
            {quests.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title}
                {q.progress.kind === 'minutes' ? ` (${q.progress.value}/${q.progress.target} min)` : ''}
              </option>
            ))}
          </Select>
          {!selected && (
            <div className="grid gap-2.5 sm:grid-cols-2">
              <TextInput placeholder="What are you working on?" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Session label" />
              {goals.length > 0 && (
                <Select value={goalId} onChange={(e) => setGoalId(e.target.value)} aria-label="Toward goal">
                  <option value="">No goal</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}
        </div>

        <h3 className="eyebrow mb-2 mt-5 flex items-center gap-2">
          <ListChecks className="h-3.5 w-3.5" /> Steps for this session
        </h3>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const text = draft.trim()
            if (!text || plan.length >= 12) return
            setPlan((p) => [...p, { id: crypto.randomUUID(), text: text.slice(0, 120), done: false }])
            setDraft('')
          }}
        >
          <TextInput placeholder="First, outline the chapter…" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Add a step" />
          <Button type="submit" variant="secondary" icon={Plus} aria-label="Add step" />
        </form>
        {plan.length > 0 && (
          <ul className="mt-2 space-y-1">
            {plan.map((item) => (
              <li key={item.id} className="flex items-center gap-2 rounded-lg bg-ink-900 px-3 py-2 text-sm text-slate-300">
                <span className="flex-1">{item.text}</span>
                <button type="button" onClick={() => setPlan((p) => p.filter((x) => x.id !== item.id))} aria-label={`Remove ${item.text}`} className="text-slate-500 hover:text-slate-200">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onOpenSounds}
          className="mt-4 flex w-full items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 px-3.5 py-3 text-left hover:border-ink-500"
        >
          <Headphones className="h-5 w-5 text-gold-400" aria-hidden />
          <span className="min-w-0 flex-1 text-sm text-slate-300">{nowPlaying ? `Playing: ${nowPlaying}` : 'Add ambient sound or music'}</span>
        </button>
      </section>
    </>
  )
}

/* --- the record ------------------------------------------------------------------ */

function FocusRecord({ totals }: { totals: FocusTotals }) {
  const cells = [
    { label: 'Today', value: formatDurationMs(totals.todayMs) },
    { label: 'Last 7 days', value: formatDurationMs(totals.weekMs) },
    { label: 'All time', value: formatDurationMs(totals.totalMs) },
  ]
  return (
    <section className="mt-6" aria-label="Time on the clock">
      <h2 className="eyebrow mb-2.5">Time on the clock</h2>
      <div className="grid grid-cols-3 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="panel px-3 py-2.5">
            <p className="eyebrow">{c.label}</p>
            <p className="mt-0.5 font-display text-xl font-bold tabular-nums text-slate-50">{c.value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function RecentSessions({ refreshKey }: { refreshKey: number }) {
  const [sessions, setSessions] = useState<FocusSessionView[] | null>(null)
  const [more, setMore] = useState(false)
  const [all, setAll] = useState(false)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let live = true
    gameApi
      .focusHistory()
      .then((page) => {
        if (!live) return
        setSessions(page.sessions)
        setMore(page.more)
        setFailed(false)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [refreshKey])

  const shown = sessions ? (all ? sessions : sessions.slice(0, RECENT)) : []

  async function loadMore() {
    const last = sessions?.[sessions.length - 1]
    if (!last) return
    setLoading(true)
    try {
      const page = await gameApi.focusHistory(last.startedAt)
      setSessions((list) => [...(list ?? []), ...page.sessions])
      setMore(page.more)
    } catch {
      setMore(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mt-6" aria-label="Recent sessions">
      <h2 className="eyebrow mb-2.5">Recent sessions</h2>
      {failed && !sessions ? (
        <p className="text-sm text-slate-500">Your sessions could not be loaded just now.</p>
      ) : !sessions ? (
        <LoadingState lines={2} label="Loading sessions" />
      ) : sessions.length === 0 ? (
        <EmptyState icon={History} title="Nothing timed yet" body="Sessions you finish show here, with the XP they paid." />
      ) : (
        <>
          <ul className="space-y-2">
            {shown.map((s) => (
              <li key={s.id} className="panel flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-600 bg-ink-850 text-gold-400">
                  {s.status === 'completed' ? <Check className="h-4 w-4" aria-hidden /> : s.kind === 'timer' ? <Timer className="h-4 w-4" aria-hidden /> : <Watch className="h-4 w-4" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">{s.label}</span>
                  <span className="block text-[11px] text-slate-500">
                    {formatDurationMs(s.activeMs)} · {s.status === 'completed' ? 'ran to the end' : 'finished early'} ·{' '}
                    {new Date(s.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </span>
                {s.xp > 0 && <span className="text-sm font-bold text-reward-400">+{s.xp}</span>}
              </li>
            ))}
          </ul>
          {!all && sessions.length > RECENT ? (
            <Button variant="ghost" size="sm" block className="mt-2" onClick={() => setAll(true)}>
              Show more
            </Button>
          ) : more ? (
            <Button variant="ghost" size="sm" block className="mt-2" loading={loading} onClick={() => void loadMore()}>
              Load older sessions
            </Button>
          ) : null}
        </>
      )}
    </section>
  )
}
