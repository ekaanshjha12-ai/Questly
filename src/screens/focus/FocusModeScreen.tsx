import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Check, Headphones, ListChecks, Pause, Play, Plus, Square, Timer, Watch, X } from 'lucide-react'
import type { Goal, PlanItem } from '../../types'
import type { FocusSessionView, GameQuest, Look } from '../../lib/api'
import { useGame, type FinishedFocus } from '../../game/GameProvider'
import { useRouter } from '../../app/router'
import Button from '../../components/ui/Button'
import { ProgressBar } from '../../components/ui/Bars'
import { ConfirmDialog } from '../../components/ui/Sheet'
import { messageOf, useToast } from '../../components/ui/Toast'
import { Parchment } from '../../components/ui/Panel'
import HeroSprite from '../../components/art/HeroSprite'
import { formatClock } from '../../lib/time'
import { formatMinutes, isFocusQuest } from '../../lib/questFormat'
import { putShareDraft } from '../../lib/social'
import VictoryScreen from './VictoryScreen'

const PRESETS = [15, 25, 45, 60, 90, 120]
/** Quests listed before "Show more". */
const SHORT_LIST = 4
/** Server grace for "completed" is two seconds; finish a little after zero. */
const AUTO_FINISH_MS = 2500

/** Mirrors the server: a minute of focus is an XP, from five minutes, to 120. */
function focusXp(ms: number) {
  if (ms < 5 * 60_000) return 0
  return Math.min(120, Math.floor(ms / 60_000))
}

/**
 * Focus Mode.
 *
 * The clock on screen is only a display: the session is started, paused and
 * finished on the server, and what it pays is worked out there from the
 * server's own timestamps. The display follows the server's clock too, so a
 * device clock that is off does not make the timer lie.
 */
export default function FocusModeScreen({ goals, nowPlaying }: { goals: Goal[]; nowPlaying: string | null }) {
  const { snapshot, startFocus, pauseFocus, resumeFocus, finishFocus, abandonFocus, updateFocusPlan, celebrate } = useGame()
  const { search, navigate, back } = useRouter()
  const toast = useToast()
  const session = snapshot?.focus ?? null
  const [finished, setFinished] = useState<FinishedFocus | null>(null)

  const quests = snapshot?.quests ?? []
  const questId = session?.questId ?? search.get('quest')
  const quest = quests.find((q) => q.id === questId) ?? null

  if (finished) {
    return (
      <VictoryScreen
        result={finished}
        onContinue={() => {
          celebrate(finished.rewards, { includeXp: false })
          setFinished(null)
          navigate('/', { replace: true })
        }}
        onShare={() => {
          celebrate(finished.rewards, { includeXp: false })
          const minutes = Math.round(finished.session.activeMs / 60_000)
          const quest = finished.quest?.status === 'completed' ? finished.quest : null
          putShareDraft({
            kind: quest ? 'achievement' : 'progress',
            label: 'From Focus Mode',
            text: quest
              ? `Quest complete: ${quest.title}. ${minutes} minutes of deep focus (+${finished.rewards.xp} XP).`
              : `Put in ${minutes} minutes of deep focus${finished.session.label ? ` on ${finished.session.label}` : ''} (+${finished.rewards.xp} XP).`,
            // The server attaches a session only from five minutes up.
            ref: quest
              ? { kind: 'quest', id: quest.id, title: quest.title, detail: `+${quest.xp} XP` }
              : finished.session.activeMs >= 5 * 60_000
                ? { kind: 'focus', id: finished.session.id, title: finished.session.label || 'Focus session', detail: `${minutes} min of timed focus` }
                : undefined,
          })
          setFinished(null)
          navigate('/social?share=1', { replace: true })
        }}
      />
    )
  }

  if (session) {
    return (
      <RunningFocus
        session={session}
        quest={quest}
        look={snapshot?.look ?? null}
        nowPlaying={nowPlaying}
        onPause={() => pauseFocus().catch((err) => toast.error('Could not pause', messageOf(err)))}
        onResume={() => resumeFocus().catch((err) => toast.error('Could not resume', messageOf(err)))}
        onPlan={(plan) => updateFocusPlan(plan).catch((err) => toast.error('Could not update the plan', messageOf(err)))}
        onFinish={async () => {
          try {
            setFinished(await finishFocus())
          } catch (err) {
            toast.error('Could not finish the session', messageOf(err))
          }
        }}
        onAbandon={async () => {
          try {
            await abandonFocus()
            toast.show({ title: 'Session abandoned', body: 'No XP was recorded for it.' })
            back('/')
          } catch (err) {
            toast.error('Could not abandon the session', messageOf(err))
          }
        }}
      />
    )
  }

  return (
    <FocusSetup
      quests={quests.filter(isFocusQuest)}
      initialQuest={quest && isFocusQuest(quest) ? quest : null}
      goals={goals.filter((g) => !g.archived)}
      nowPlaying={nowPlaying}
      onBack={() => back('/')}
      onStart={async (input) => {
        try {
          await startFocus(input)
        } catch (err) {
          toast.error('Could not start focusing', messageOf(err))
        }
      }}
    />
  )
}

/* --- setting up ------------------------------------------------------------ */

function FocusSetup({
  quests,
  initialQuest,
  goals,
  nowPlaying,
  onBack,
  onStart,
}: {
  quests: GameQuest[]
  initialQuest: GameQuest | null
  goals: Goal[]
  nowPlaying: string | null
  onBack: () => void
  onStart: (input: { kind: 'timer' | 'stopwatch'; targetMinutes?: number; label?: string; questId?: string | null; goalId?: string | null; plan?: PlanItem[] }) => Promise<void>
}) {
  const { navigate } = useRouter()
  const [questId, setQuestId] = useState<string | null>(initialQuest?.id ?? null)
  const selected = quests.find((q) => q.id === questId) ?? null
  const suggested = (q: GameQuest | null) => {
    if (!q) return 25
    if (q.progress.kind === 'minutes') return Math.min(240, Math.max(5, q.progress.target - q.progress.value))
    return Math.min(240, Math.max(5, q.durationMin))
  }
  const [minutes, setMinutes] = useState(() => suggested(initialQuest))
  const [kind, setKind] = useState<'timer' | 'stopwatch'>('timer')
  const [label, setLabel] = useState('')
  const [goalId, setGoalId] = useState('')
  const [plan, setPlan] = useState<PlanItem[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  // A long board would push the rest of the setup off the screen; the first
  // few are shown, plus the chosen one wherever it sits.
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? quests : quests.filter((q, i) => i < SHORT_LIST || q.id === questId)
  const hidden = quests.length - shown.length

  useEffect(() => {
    setMinutes(suggested(selected))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questId])

  const focusReward = kind === 'timer' ? focusXp(minutes * 60_000) : 0
  const completesQuest =
    selected && kind === 'timer' && (selected.progress.kind === 'minutes' ? minutes >= selected.progress.target - selected.progress.value : minutes >= Math.floor(selected.durationMin * 0.9))

  return (
    <div className="mx-auto max-w-2xl px-4 safe-header">
      <div className="mb-5 flex items-center gap-3 lg:pt-8">
        <button type="button" onClick={onBack} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-700 bg-ink-900 text-slate-300 hover:text-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="page-title">Focus Mode</h1>
          <p className="text-[13px] text-slate-400">Choose your quest, set the block, begin.</p>
        </div>
      </div>

      <section className="mb-6">
        <h2 className="eyebrow mb-2.5">Quest</h2>
        <div className="space-y-2">
          {shown.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setQuestId(q.id)}
              aria-pressed={q.id === questId}
              className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                q.id === questId ? 'border-gold-500/60 bg-gold-500/10' : 'border-ink-700 bg-ink-900 hover:border-ink-500'
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${q.id === questId ? 'border-gold-400 bg-gold-500 text-onAccent' : 'border-ink-500'}`}>
                {q.id === questId && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-100">{q.title}</span>
                <span className="text-[11px] text-slate-500">
                  {q.progress.kind === 'minutes' ? `${q.progress.value} / ${q.progress.target} min focused` : formatMinutes(q.durationMin)} · +{q.xp} XP
                </span>
              </span>
            </button>
          ))}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-dashed border-ink-600 text-xs font-semibold text-slate-400 hover:border-ink-500 hover:text-slate-200"
            >
              Show {hidden} more quest{hidden === 1 ? '' : 's'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setQuestId(null)}
            aria-pressed={questId === null}
            className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
              questId === null ? 'border-gold-500/60 bg-gold-500/10' : 'border-ink-700 bg-ink-900 hover:border-ink-500'
            }`}
          >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${questId === null ? 'border-gold-400 bg-gold-500 text-onAccent' : 'border-ink-500'}`}>
              {questId === null && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span className="text-sm font-semibold text-slate-100">Free focus — no quest</span>
          </button>
        </div>
        {questId === null && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input className="field" placeholder="What are you working on?" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Session label" />
            {goals.length > 0 && (
              <select className="field" value={goalId} onChange={(e) => setGoalId(e.target.value)} aria-label="Toward goal">
                <option value="">No goal</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </section>

      <section className="mb-6">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="eyebrow">Focus block</h2>
          <div role="radiogroup" aria-label="Clock" className="flex gap-1 rounded-lg border border-ink-700 bg-ink-900 p-0.5">
            {(['timer', 'stopwatch'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`flex min-h-[32px] items-center gap-1.5 rounded-md px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] ${kind === k ? 'bg-gold-500/15 text-gold-300' : 'text-slate-400'}`}
              >
                {k === 'timer' ? <Timer className="h-3.5 w-3.5" /> : <Watch className="h-3.5 w-3.5" />}
                {k}
              </button>
            ))}
          </div>
        </div>
        {kind === 'timer' ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinutes(m)}
                  className={`min-h-[40px] min-w-[60px] rounded-xl border px-3 text-sm font-semibold ${minutes === m ? 'border-gold-500/60 bg-gold-500/15 text-gold-300' : 'border-ink-700 bg-ink-900 text-slate-300'}`}
                >
                  {formatMinutes(m)}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input
                type="range"
                min={5}
                max={240}
                step={5}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="h-2 flex-1 accent-[rgb(var(--gold-500))]"
                aria-label="Minutes"
              />
              <span className="w-16 text-right font-display text-lg font-bold tabular-nums text-slate-100">{minutes}m</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">Counts up until you finish — up to four hours. One XP a focused minute, from five minutes.</p>
        )}
      </section>

      <section className="mb-6">
        <h2 className="eyebrow mb-2.5 flex items-center gap-2">
          <ListChecks className="h-3.5 w-3.5" /> Plan <span className="normal-case tracking-normal text-slate-500">(optional)</span>
        </h2>
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
          <input className="field" placeholder="First, outline the chapter…" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Add a plan step" />
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
      </section>

      <button
        type="button"
        onClick={() => navigate('/sounds')}
        className="mb-6 flex w-full items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 px-3.5 py-3 text-left hover:border-ink-500"
      >
        <Headphones className="h-5 w-5 text-gold-400" />
        <span className="min-w-0 flex-1 text-sm text-slate-300">{nowPlaying ? `Ambient: ${nowPlaying}` : 'Add ambient sound or music'}</span>
      </button>

      {/* The reward and the start stay in reach however long the setup gets. */}
      <div className="sticky bottom-0 -mx-4 border-t border-ink-800 bg-ink-950/95 px-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <Parchment className="mb-2.5 flex items-center justify-between gap-2 px-3.5 py-2">
          <p className="min-w-0 font-display text-base font-bold text-parch-ink">
            <span className="mr-1.5 align-middle text-[10px] font-bold uppercase tracking-[0.14em] text-parch-soft">On completion</span>
            {kind === 'timer' ? `+${focusReward} XP` : '+1 XP a minute'}
            {completesQuest && selected ? <span className="text-[#a8741a]"> · +{selected.xp - selected.xpPaid} quest</span> : null}
          </p>
          {completesQuest && <span className="tag shrink-0 border-[#1f7a52]/40 bg-[#1f7a52]/10 text-[#1c6a47]">Completes quest</span>}
        </Parchment>

        <Button
          block
          icon={Play}
          loading={busy}
          className="!min-h-[52px] text-[15px]"
          onClick={async () => {
            setBusy(true)
            await onStart({
              kind,
              targetMinutes: kind === 'timer' ? minutes : undefined,
              label: questId ? undefined : label.trim() || undefined,
              questId,
              goalId: questId ? null : goalId || null,
              plan,
            })
            setBusy(false)
          }}
        >
          Begin focus
        </Button>
      </div>
    </div>
  )
}

/* --- running ------------------------------------------------------------------ */

function RunningFocus({
  session,
  quest,
  look,
  nowPlaying,
  onPause,
  onResume,
  onFinish,
  onAbandon,
  onPlan,
}: {
  session: FocusSessionView
  quest: GameQuest | null
  look: Look | null
  nowPlaying: string | null
  onPause: () => void
  onResume: () => void
  onFinish: () => Promise<void>
  onAbandon: () => void
  onPlan: (plan: PlanItem[]) => void
}) {
  const reduce = useReducedMotion()
  const [, tick] = useState(0)
  const [confirm, setConfirm] = useState<'finish' | 'abandon' | null>(null)
  const [finishing, setFinishing] = useState(false)
  const autoFinished = useRef(false)

  // Follow the server's clock, not the device's.
  const offset = useMemo(() => Date.parse(session.serverNow) - Date.now(), [session.serverNow])
  const paused = session.status === 'paused'
  useEffect(() => {
    if (paused) return
    const id = window.setInterval(() => tick((n) => n + 1), 250)
    return () => window.clearInterval(id)
  }, [paused])

  const activeMs = paused ? session.activeMs : session.activeMs + (Date.now() + offset - Date.parse(session.serverNow))
  const target = session.kind === 'timer' ? session.targetMs ?? 0 : null
  const display = target ? Math.max(0, target - activeMs) : activeMs
  const fraction = target ? Math.min(1, activeMs / target) : (activeMs % 3_600_000) / 3_600_000
  const done = target !== null && activeMs >= target
  const earned = focusXp(target ? Math.min(activeMs, target) : activeMs)
  const questReward = quest && quest.status !== 'completed' ? quest.xp - quest.xpPaid : 0

  const finish = useCallback(async () => {
    if (finishing) return
    setFinishing(true)
    await onFinish()
    setFinishing(false)
  }, [finishing, onFinish])

  // A timer that reaches zero with the app open finishes itself.
  useEffect(() => {
    if (!target || paused || autoFinished.current) return
    if (activeMs >= target + AUTO_FINISH_MS) {
      autoFinished.current = true
      void finish()
    }
  })

  // The tab title shows the clock, so it can be seen from another tab.
  useEffect(() => {
    const previous = document.title
    document.title = `${formatClock(display)} · Focus`
    return () => {
      document.title = previous
    }
  })

  // Keep the screen awake while focusing, where the browser allows it.
  useEffect(() => {
    if (paused || !('wakeLock' in navigator)) return
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => undefined)
    return () => {
      void lock?.release().catch(() => undefined)
    }
  }, [paused])

  // Space pauses and resumes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement)?.closest('input, textarea, button')) return
      e.preventDefault()
      if (paused) onResume()
      else onPause()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paused, onPause, onResume])

  const R = 120
  const C = 2 * Math.PI * R

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-xl flex-col px-5 pb-8 safe-header">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_35%,rgba(16,185,129,0.10),transparent_60%)]" />
      <div className="flex items-center justify-center pt-2 lg:pt-8">
        <span className="tag border-gold-500/40 bg-ink-900 text-gold-300">
          <Headphones className="h-3 w-3" />
          {nowPlaying ? `Ambient: ${nowPlaying}` : 'Silence'}
        </span>
      </div>

      <div className="mt-6 text-center">
        <p className="eyebrow">{quest ? 'Current quest' : 'Focus session'}</p>
        <h1 className="mt-1 font-display text-[1.7rem] font-bold uppercase leading-tight tracking-wide text-slate-50">{quest?.title ?? session.label}</h1>
      </div>

      <div className="relative mx-auto mt-6 aspect-square w-full max-w-[300px]">
        <svg viewBox="0 0 280 280" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="140" cy="140" r={R} fill="none" stroke="rgb(var(--ink-800))" strokeWidth="10" />
          <circle cx="140" cy="140" r={R - 16} fill="none" stroke="rgb(var(--ink-700))" strokeWidth="1" strokeDasharray="2 6" />
          <motion.circle
            cx="140"
            cy="140"
            r={R}
            fill="none"
            stroke={done ? 'rgb(var(--reward-400))' : 'rgb(var(--gold-400))'}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={C}
            animate={{ strokeDashoffset: C * (1 - fraction) }}
            transition={{ duration: reduce ? 0 : 0.3, ease: 'linear' }}
            style={{ filter: `drop-shadow(0 0 10px ${done ? 'rgba(226,166,52,0.6)' : 'rgba(52,211,153,0.55)'})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-6xl font-bold tabular-nums tracking-tight text-slate-50" role="timer" aria-live="off">
            {formatClock(display)}
          </span>
          <span className={`mt-1 text-[11px] font-bold uppercase tracking-[0.2em] ${paused ? 'text-reward-400' : done ? 'text-reward-300' : 'text-slate-400'}`}>
            {paused ? 'Paused' : done ? 'Block complete' : target ? 'Focus block' : 'Stopwatch'}
          </span>
        </div>
        <div className="absolute -bottom-3 -right-2 sm:-right-10">
          <HeroSprite look={look} height={84} still={Boolean(reduce)} label="Your character, focusing" />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <div className="panel px-4 py-3">
          <p className="eyebrow">XP</p>
          <p className="mt-1 font-display text-2xl font-bold text-reward-400">+{earned + (done && questReward ? questReward : 0)}</p>
          {questReward > 0 && !done && <p className="text-[11px] text-slate-500">+{questReward} more on completion</p>}
        </div>
        <div className="panel px-4 py-3">
          <p className="eyebrow">Progress</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-200">
            {formatClock(Math.min(activeMs, target ?? activeMs))}
            {target ? <span className="text-slate-500"> / {formatClock(target)}</span> : null}
          </p>
          <ProgressBar percent={fraction * 100} className="mt-2" tone={done ? 'gold' : 'green'} />
        </div>
      </div>

      {session.plan.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {session.plan.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onPlan(session.plan.map((p) => (p.id === item.id ? { ...p, done: !p.done } : p)))}
                aria-pressed={item.done}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 px-3 text-left text-sm text-slate-300"
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${item.done ? 'border-gold-500 bg-gold-500 text-onAccent' : 'border-ink-500'}`}>
                  {item.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <span className={item.done ? 'text-slate-500 line-through' : ''}>{item.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-8">
        <div className="grid grid-cols-2 gap-3">
          {paused ? (
            <Button variant="secondary" icon={Play} onClick={onResume} className="!min-h-[52px]">
              Resume
            </Button>
          ) : (
            <Button variant="secondary" icon={Pause} onClick={onPause} disabled={done} className="!min-h-[52px]">
              Pause
            </Button>
          )}
          <Button
            variant={done ? 'gold' : 'danger'}
            icon={Square}
            loading={finishing}
            className="!min-h-[52px]"
            onClick={() => (done || !target ? void finish() : setConfirm('finish'))}
          >
            Finish
          </Button>
        </div>
        <button type="button" onClick={() => setConfirm('abandon')} className="mx-auto mt-4 block text-xs font-semibold text-slate-500 underline-offset-4 hover:text-slate-300 hover:underline">
          Abandon session
        </button>
      </div>

      <ConfirmDialog
        open={confirm === 'finish'}
        title="Finish early?"
        tone="primary"
        body={
          <>
            You have focused for <strong>{formatClock(activeMs)}</strong>, which is worth <strong>+{earned} XP</strong>.
            {questReward > 0 ? ' The quest will not be complete until the full block is done.' : ''}
            {earned === 0 ? ' Sessions under five minutes do not earn XP.' : ''}
          </>
        }
        confirmLabel="Finish now"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null)
          void finish()
        }}
      />
      <ConfirmDialog
        open={confirm === 'abandon'}
        title="Abandon this session?"
        body="The session ends without recording any XP or quest progress."
        confirmLabel="Abandon"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null)
          onAbandon()
        }}
      />
    </div>
  )
}
