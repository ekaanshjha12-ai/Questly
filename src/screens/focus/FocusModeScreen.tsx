import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { m as motion, useReducedMotion } from 'framer-motion'
import { Check, Headphones, Pause, Play, Square } from 'lucide-react'
import type { PlanItem } from '../../types'
import type { FocusSessionView, GameQuest, Look } from '../../lib/api'
import { useGame, type FinishedFocus } from '../../game/GameProvider'
import { useRouter } from '../../app/router'
import Button from '../../components/ui/Button'
import { ProgressBar } from '../../components/ui/Bars'
import { ConfirmDialog } from '../../components/ui/Sheet'
import { LoadingState } from '../../components/ui/States'
import { messageOf, useToast } from '../../components/ui/Toast'
import HeroSprite from '../../components/art/HeroSprite'
import { formatClock } from '../../lib/time'
import { focusXp } from '../../lib/questFormat'
import { putShareDraft } from '../../lib/social'
import VictoryScreen from './VictoryScreen'

/** Server grace for "completed" is two seconds; finish a little after zero. */
const AUTO_FINISH_MS = 2500

/**
 * Focus Mode: a running timer or stopwatch, full screen.
 *
 * Sessions are set up in the Timer; this screen only runs them. The clock on
 * screen is only a display: the session is started, paused and finished on the
 * server, and what it pays is worked out there from the server's own
 * timestamps. The display follows the server's clock too, so a device clock
 * that is off does not make the timer lie.
 */
export default function FocusModeScreen({ nowPlaying }: { nowPlaying: string | null }) {
  const { snapshot, pauseFocus, resumeFocus, finishFocus, abandonFocus, updateFocusPlan, celebrate } = useGame()
  const { search, navigate, back } = useRouter()
  const toast = useToast()
  const session = snapshot?.focus ?? null
  const [finished, setFinished] = useState<FinishedFocus | null>(null)
  // Set while this screen ends the session itself, so the result is shown
  // rather than the Timer the moment the session closes.
  const leaving = useRef(false)

  const quests = snapshot?.quests ?? []
  const questId = session?.questId ?? search.get('quest')
  const quest = quests.find((q) => q.id === questId) ?? null

  // Nothing running: sessions are set up in the Timer.
  const idle = Boolean(snapshot) && !session && !finished
  useEffect(() => {
    if (idle && !leaving.current) navigate(`/timer${questId ? `?quest=${encodeURIComponent(questId)}` : ''}`, { replace: true })
  }, [idle, questId, navigate])

  if (finished) {
    return (
      <VictoryScreen
        result={finished}
        onContinue={() => {
          celebrate(finished.rewards, { includeXp: false })
          setFinished(null)
          back('/timer')
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

  if (!session) return idle ? null : <div className="mx-auto max-w-xl px-5 safe-header"><LoadingState lines={2} label="Opening Focus Mode" /></div>

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
        leaving.current = true
        try {
          setFinished(await finishFocus())
        } catch (err) {
          leaving.current = false
          toast.error('Could not finish the session', messageOf(err))
        }
      }}
      onAbandon={async () => {
        leaving.current = true
        try {
          await abandonFocus()
          toast.show({ title: 'Session abandoned', body: 'No XP was recorded for it.' })
          back('/timer')
        } catch (err) {
          leaving.current = false
          toast.error('Could not abandon the session', messageOf(err))
        }
      }}
    />
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
