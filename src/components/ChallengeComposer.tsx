import { useEffect, useMemo, useState } from 'react'
import { m as motion } from 'framer-motion'
import { CheckSquare, Loader2, Swords, Timer, X } from 'lucide-react'
import { ApiError, sendChallenge, type Challenge, type ChallengeTermsInput, type DuelMode, type PlayerSummary } from '../lib/api'
import { StatusPill, TermsSheet } from './ChallengeParts'
import { formatMinutes } from '../lib/questFormat'

/**
 * Writing a challenge offer.
 *
 * The preview underneath is the exact sheet the other person will see before
 * they accept, updated as each field changes — so what is sent is never a
 * surprise to either side.
 *
 * Durations, rewards and the completion floor mirror server/challenges.js,
 * which checks them again; the lists here only keep the form from offering
 * something the server will refuse.
 */

const DURATIONS = [3, 5, 7, 14, 21, 30]
const REWARD_TIERS = [50, 100, 250, 500, 750, 1000, 1500, 2000]
const DAILY_MINUTES = [15, 30, 45, 60, 90, 120, 180]
const XP_PER_DAY_CAP = 75
const TERMS_TEXT = 'Both participants must follow the agreed rules.'

const TEMPLATES: { label: string; name: string; objective: string; rules: string; days: number; mode: DuelMode; minutes?: number }[] = [
  {
    label: '📚 Study battle',
    name: '7 Day Study Battle',
    objective: 'Study 2 hours every day',
    rules: 'Complete 2 hours of focused study each day, timed in Focus Mode.',
    days: 7,
    mode: 'focus',
    minutes: 120,
  },
  {
    label: '🧠 Deep work duel',
    name: 'Deep Work Duel',
    objective: 'An hour of deep work a day',
    rules: 'One hour of distraction-free work each day, timed in Focus Mode.',
    days: 5,
    mode: 'focus',
    minutes: 60,
  },
  {
    label: '💪 Workout streak',
    name: 'Workout Streak',
    objective: 'Work out every day',
    rules: 'At least 30 minutes of exercise each day. Walks count if they are brisk.',
    days: 14,
    mode: 'checkin',
  },
  {
    label: '🌅 Early riser',
    name: 'Early Riser',
    objective: 'Be up before 7am',
    rules: 'Out of bed before 7:00 local time. Check in when you are up.',
    days: 7,
    mode: 'checkin',
  },
  {
    label: '📖 Reading race',
    name: 'Reading Race',
    objective: 'Read 20 pages a day',
    rules: 'Read at least 20 pages each day. Any book counts.',
    days: 21,
    mode: 'checkin',
  },
]

/** Where an unsent offer waits, per opponent, on this device only. */
const draftKey = (username: string) => `questly:duel-draft:${username}`

interface Draft {
  name: string
  objective: string
  rules: string
  days: number
  reward: number
  mode: DuelMode
  minutes: number
  proof: 'required' | 'optional'
  minCheckins: number
  startMode: 'accept' | 'date'
  startDate: string
}

function readDraft(username: string): Partial<Draft> | null {
  try {
    const raw = localStorage.getItem(draftKey(username))
    return raw ? (JSON.parse(raw) as Partial<Draft>) : null
  } catch {
    return null
  }
}

const INPUT =
  'w-full rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-gold-500/50 focus:outline-none'

function maxReward(days: number) {
  const cap = days * XP_PER_DAY_CAP
  return [...REWARD_TIERS].reverse().find((t) => t <= cap) ?? REWARD_TIERS[0]
}

function tomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ChallengeComposer({
  opponent,
  myName,
  onClose,
  onSent,
}: {
  opponent: PlayerSummary
  myName: string
  onClose: () => void
  onSent: (challenge: Challenge) => void
}) {
  // A half-written offer comes back when the composer is opened again.
  const [saved] = useState(() => readDraft(opponent.username))
  const [name, setName] = useState(saved?.name ?? '')
  const [objective, setObjective] = useState(saved?.objective ?? '')
  const [rules, setRules] = useState(saved?.rules ?? '')
  const [days, setDays] = useState(DURATIONS.includes(saved?.days ?? 0) ? (saved?.days as number) : 7)
  const [reward, setReward] = useState(REWARD_TIERS.includes(saved?.reward ?? 0) ? (saved?.reward as number) : maxReward(7))
  const [mode, setMode] = useState<DuelMode>(saved?.mode === 'checkin' ? 'checkin' : 'focus')
  const [minutes, setMinutes] = useState(DAILY_MINUTES.includes(saved?.minutes ?? 0) ? (saved?.minutes as number) : 60)
  const [proof, setProof] = useState<'required' | 'optional'>(saved?.proof === 'required' ? 'required' : 'optional')
  const [minCheckins, setMinCheckins] = useState(saved?.minCheckins ?? 7)
  const [startMode, setStartMode] = useState<'accept' | 'date'>(saved?.startMode === 'date' ? 'date' : 'accept')
  const [startDate, setStartDate] = useState(saved?.startDate && saved.startDate >= tomorrow() ? saved.startDate : tomorrow())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; field?: string } | null>(null)

  useEffect(() => {
    const draft: Draft = { name, objective, rules, days, reward, mode, minutes, proof, minCheckins, startMode, startDate }
    try {
      if (name || objective || rules) localStorage.setItem(draftKey(opponent.username), JSON.stringify(draft))
    } catch {
      // Private mode: the draft lasts as long as the sheet is open.
    }
  }, [name, objective, rules, days, reward, mode, minutes, proof, minCheckins, startMode, startDate, opponent.username])

  const floor = Math.ceil(days / 2)
  const cap = days * XP_PER_DAY_CAP

  function pickDuration(next: number) {
    setDays(next)
    // Keep the other numbers valid for the new length rather than refusing later.
    setReward((r) => (r > next * XP_PER_DAY_CAP ? maxReward(next) : r))
    setMinCheckins((m) => Math.min(next, Math.max(Math.ceil(next / 2), m === days ? next : m)))
  }

  function applyTemplate(t: (typeof TEMPLATES)[number]) {
    setName(t.name)
    setObjective(t.objective)
    setRules(t.rules)
    setDays(t.days)
    setReward(maxReward(t.days) >= 500 ? Math.min(500, maxReward(t.days)) : maxReward(t.days))
    setMinCheckins(t.days)
    setMode(t.mode)
    if (t.minutes) setMinutes(t.minutes)
  }

  // Midnight at the start of the chosen day, on this device's clock.
  const startsAt = useMemo(() => {
    if (startMode !== 'date' || !startDate) return null
    const [y, m, d] = startDate.split('-').map(Number)
    return new Date(y, m - 1, d, 0, 0, 0).toISOString()
  }, [startMode, startDate])

  const endsAt = startsAt ? new Date(Date.parse(startsAt) + days * 86_400_000).toISOString() : null

  const ready = name.trim().length >= 3 && objective.trim().length >= 3 && rules.trim().length >= 3

  async function send() {
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    const terms: ChallengeTermsInput = {
      name: name.trim(),
      objective: objective.trim(),
      rules: rules.trim(),
      durationDays: days,
      rewardXp: reward,
      mode,
      ...(mode === 'focus' ? { dailyMinutes: minutes } : {}),
      proof: mode === 'focus' ? 'optional' : proof,
      minCheckins,
      startMode,
      ...(startsAt ? { startsAt } : {}),
    }
    try {
      const { challenge } = await sendChallenge(opponent.username, terms)
      try {
        localStorage.removeItem(draftKey(opponent.username))
      } catch {
        // Nothing to clear.
      }
      onSent(challenge)
    } catch (err) {
      const field = err instanceof ApiError ? (err.field ?? undefined) : undefined
      setError({ message: err instanceof Error ? err.message : 'Could not send the challenge.', field })
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Challenge ${opponent.name}`}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-ink-600 bg-ink-900 p-4 shadow-2xl sm:rounded-2xl sm:p-5"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gold-500 to-ember-500">
            <Swords className="h-5 w-5 text-onAccent" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold uppercase tracking-wide text-slate-50">
              Challenge {opponent.name}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <StatusPill status="draft" />
              <span className="text-[11px] text-slate-500">@{opponent.username}{name || objective || rules ? ' · draft kept on this device' : ''}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-ink-800 hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => applyTemplate(t)}
              className="rounded-full border border-ink-600 bg-ink-850 px-2.5 py-1 text-[11px] text-slate-300 hover:border-gold-500/50"
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <Field label="Challenge name" error={error?.field === 'name' ? error.message : null}>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="7 Day Study Battle" className={INPUT} />
          </Field>
          <Field label="Objective" error={error?.field === 'objective' ? error.message : null}>
            <input value={objective} onChange={(e) => setObjective(e.target.value.slice(0, 140))} placeholder="Study 2 hours every day" className={INPUT} />
          </Field>

          <Field label="How it is measured">
            <div className="grid grid-cols-2 gap-1.5">
              <ModeChoice active={mode === 'focus'} onClick={() => setMode('focus')} icon={Timer} title="Focus time" body="Timed by Questly. Nothing to claim." />
              <ModeChoice active={mode === 'checkin'} onClick={() => setMode('checkin')} icon={CheckSquare} title="Daily check-in" body="For things a timer cannot see." />
            </div>
          </Field>

          {mode === 'focus' && (
            <Field label="Focus minutes a day" error={error?.field === 'dailyMinutes' ? error.message : null}>
              <div className="flex flex-wrap gap-1.5">
                {DAILY_MINUTES.map((m) => (
                  <Choice key={m} active={minutes === m} onClick={() => setMinutes(m)}>
                    {formatMinutes(m)}
                  </Choice>
                ))}
              </div>
            </Field>
          )}

          <Field label="Duration">
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => (
                <Choice key={d} active={days === d} onClick={() => pickDuration(d)}>
                  {d} days
                </Choice>
              ))}
            </div>
          </Field>

          <Field label="Starts">
            <div className="flex flex-wrap items-center gap-1.5">
              <Choice active={startMode === 'accept'} onClick={() => setStartMode('accept')}>
                When they accept
              </Choice>
              <Choice active={startMode === 'date'} onClick={() => setStartMode('date')}>
                On a date
              </Choice>
              {startMode === 'date' && (
                <input
                  type="date"
                  value={startDate}
                  min={tomorrow()}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-lg border border-ink-600 bg-ink-800 px-2 py-1.5 text-xs text-slate-100"
                />
              )}
            </div>
          </Field>

          <Field label={`Reward — up to ${cap.toLocaleString()} XP for ${days} days`} error={error?.field === 'rewardXp' ? error.message : null}>
            <div className="flex flex-wrap gap-1.5">
              {REWARD_TIERS.filter((t) => t <= cap).map((t) => (
                <Choice key={t} active={reward === t} onClick={() => setReward(t)}>
                  {t.toLocaleString()} XP
                </Choice>
              ))}
            </div>
          </Field>

          <Field label="Rules" error={error?.field === 'rules' ? error.message : null}>
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value.slice(0, 600))}
              rows={3}
              placeholder="Complete 2 hours of focused study each day."
              className={`${INPUT} resize-none`}
            />
          </Field>

          {mode === 'checkin' && (
            <Field label="Proof">
              <div className="flex flex-wrap gap-1.5">
                <Choice active={proof === 'required'} onClick={() => setProof('required')}>
                  Required
                </Choice>
                <Choice active={proof === 'optional'} onClick={() => setProof('optional')}>
                  Optional
                </Choice>
              </div>
            </Field>
          )}

          <Field
            label={`Completion — ${mode === 'focus' ? `reach ${minutes} min` : 'check in'} on at least ${minCheckins} of ${days} days`}
            error={error?.field === 'minCheckins' ? error.message : null}
          >
            <input
              type="range"
              min={floor}
              max={days}
              step={1}
              value={minCheckins}
              onChange={(e) => setMinCheckins(Number(e.target.value))}
              className="w-full accent-[rgb(var(--gold-500))]"
              aria-label="Check-ins needed to complete"
            />
          </Field>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">What {opponent.name} will see</p>
          <TermsSheet
            t={{
              name: name || 'Untitled challenge',
              objective: objective || '—',
              rules: rules || '—',
              terms: TERMS_TEXT,
              durationDays: days,
              rewardXp: reward,
              mode,
              dailyMinutes: mode === 'focus' ? minutes : null,
              proof,
              minCheckins,
              startMode,
              startsAt,
              endsAt,
              creatorName: myName,
              opponentName: opponent.name,
            }}
          />
        </div>

        {error && !error.field && (
          <p className="mt-3 rounded-lg border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-xs text-ember-400">{error.message}</p>
        )}

        <button
          type="button"
          onClick={() => void send()}
          disabled={!ready || busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-3 font-display font-bold uppercase tracking-wider text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
          Send challenge
        </button>
      </motion.div>
    </motion.div>
  )
}

function Field({ label, error, children }: { label: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      {children}
      {error && <p className="mt-1 text-xs text-ember-400">{error}</p>}
    </div>
  )
}

function ModeChoice({ active, onClick, icon: Icon, title, body }: { active: boolean; onClick: () => void; icon: typeof Timer; title: string; body: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        active ? 'border-gold-500 bg-gold-500/15' : 'border-ink-600 bg-ink-850 hover:border-ink-500'
      }`}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-50">
        <Icon className="h-3.5 w-3.5 text-gold-400" aria-hidden /> {title}
      </span>
      <span className="text-[11px] leading-snug text-slate-400">{body}</span>
    </button>
  )
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active ? 'border-gold-500 bg-gold-500/15 text-slate-50' : 'border-ink-600 bg-ink-850 text-slate-300 hover:border-ink-500'
      }`}
    >
      {children}
    </button>
  )
}
