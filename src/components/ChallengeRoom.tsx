import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Flag, Loader2, MessageCircle, ScrollText, Send, Swords, TrendingUp, X, XCircle } from 'lucide-react'
import {
  ApiError,
  checkInChallenge,
  fetchChallenge,
  fetchChallengeMessages,
  reportPlayer,
  respondToChallenge,
  sendChallengeMessage,
  withdrawChallenge,
  type Challenge,
  type ChallengeMessage,
  type PlayerSummary,
} from '../lib/api'
import { PlayerAvatar, StatusPill, TermsSheet, formatWhen, statusInfo, timeLeft } from './ChallengeParts'

/**
 * One challenge, from offer to result.
 *
 * What it shows follows the state: an offer to answer, an offer waiting on the
 * other person, a closed offer, or — once both have agreed — the challenge
 * itself with its progress, its terms, and its own chat.
 */

type Tab = 'progress' | 'terms' | 'chat'

export default function ChallengeRoom({
  challengeId,
  onClose,
  onChanged,
}: {
  challengeId: string
  onClose: () => void
  onChanged: (challenge: Challenge) => void
}) {
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('progress')
  /** The moment straight after answering, before the room itself. */
  const [answered, setAnswered] = useState<'accepted' | 'declined' | null>(null)

  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  const apply = useCallback((c: Challenge) => {
    setChallenge(c)
    onChangedRef.current(c)
  }, [])

  const load = useCallback(async () => {
    try {
      apply((await fetchChallenge(challengeId)).challenge)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this challenge.')
    }
  }, [apply, challengeId])

  // Progress changes when the other person checks in, so a running challenge is
  // re-read every so often while it is open.
  useEffect(() => {
    void load()
    const t = window.setInterval(() => document.visibilityState === 'visible' && void load(), 20_000)
    return () => window.clearInterval(t)
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const me = challenge ? (challenge.role === 'creator' ? challenge.creator : challenge.opponent) : null
  const them = challenge ? (challenge.role === 'creator' ? challenge.opponent : challenge.creator) : null
  const running = challenge && ['accepted', 'active', 'due', 'completed'].includes(challenge.status)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={challenge?.name ?? 'Challenge'}
        className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-ink-600 bg-ink-900 shadow-2xl sm:rounded-2xl"
      >
        {/* --- header --------------------------------------------------------- */}
        <div className="border-b border-ink-700 p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-bold uppercase tracking-wide text-slate-50">
                {challenge?.name ?? 'Challenge'}
              </p>
              {challenge && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <StatusPill status={challenge.status} size="md" />
                  <span className="text-[11px] text-slate-500">{statusInfo(challenge.status).hint}</span>
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-ink-800 hover:text-slate-200">
              <X className="h-4 w-4" />
            </button>
          </div>

          {challenge && me && them && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-300">
              <PlayerAvatar player={me} size={24} />
              <span className="truncate">You</span>
              <Swords className="h-3.5 w-3.5 shrink-0 text-gold-400" />
              <PlayerAvatar player={them} size={24} />
              <span className="truncate">{them.name}</span>
            </div>
          )}

          {running && !answered && (
            <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-ink-600 bg-ink-850 p-1">
              {([
                ['progress', 'Progress', TrendingUp],
                ['terms', 'Terms', ScrollText],
                ['chat', 'Chat', MessageCircle],
              ] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-pressed={tab === id}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold ${
                    tab === id ? 'bg-gradient-to-r from-gold-500 to-ember-500 text-onAccent' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* --- body ----------------------------------------------------------- */}
        <div className={`min-h-0 flex-1 ${tab === 'chat' && running && !answered ? 'flex flex-col' : 'overflow-y-auto p-4'}`}>
          {error && !challenge && <p className="text-center text-sm text-slate-400">{error}</p>}
          {!challenge && !error && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
            </div>
          )}

          {challenge && me && them && (
            <>
              {answered === 'accepted' && (
                <Confirmation
                  tone="accepted"
                  title="Challenge Accepted"
                  body={
                    challenge.status === 'active'
                      ? `It has started. You and ${them.name} have ${challenge.durationDays} days — check in each day you do it.`
                      : `It starts ${formatWhen(challenge.startsAt)}. You can already chat with ${them.name}.`
                  }
                  action="Open the challenge"
                  onAction={() => {
                    setAnswered(null)
                    setTab('progress')
                  }}
                />
              )}

              {answered === 'declined' && (
                <Confirmation tone="declined" title="Challenge Declined" body={`${them.name} will see that you declined. Nothing starts.`} action="Close" onAction={onClose} />
              )}

              {!answered && challenge.status === 'pending' && challenge.role === 'opponent' && (
                <OfferView challenge={challenge} them={them} me={me} onAnswered={(c, accepted) => {
                  apply(c)
                  setAnswered(accepted ? 'accepted' : 'declined')
                }} />
              )}

              {!answered && challenge.status === 'pending' && challenge.role === 'creator' && (
                <WaitingView challenge={challenge} them={them} me={me} onChanged={apply} />
              )}

              {!answered && ['rejected', 'expired', 'cancelled'].includes(challenge.status) && (
                <div className="space-y-4">
                  <p className="rounded-xl border border-ink-600 bg-ink-850 px-3 py-3 text-sm text-slate-300">
                    {challenge.status === 'rejected'
                      ? challenge.role === 'creator'
                        ? `${them.name} declined this offer. The challenge did not begin.`
                        : 'You declined this offer. The challenge did not begin.'
                      : challenge.status === 'expired'
                        ? 'This offer was not answered before it expired, so it never began.'
                        : 'This challenge was withdrawn or ended early. Nothing was awarded.'}
                  </p>
                  <TermsSheet t={termsFor(challenge, me, them)} />
                </div>
              )}

              {!answered && running && tab === 'progress' && <ProgressView challenge={challenge} me={me} them={them} onChanged={apply} />}
              {!answered && running && tab === 'terms' && (
                <div className="space-y-3">
                  <p className="text-[11px] text-slate-500">
                    Agreed {formatWhen(challenge.respondedAt)}. These terms are fixed for the whole challenge.
                  </p>
                  <TermsSheet t={termsFor(challenge, me, them)} />
                </div>
              )}
              {!answered && running && tab === 'chat' && <ChatView challenge={challenge} them={them} />}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

function termsFor(c: Challenge, me: PlayerSummary, them: PlayerSummary) {
  const creator = c.role === 'creator' ? me : them
  const opponent = c.role === 'creator' ? them : me
  return {
    name: c.name,
    objective: c.objective,
    rules: c.rules,
    terms: c.terms,
    durationDays: c.durationDays,
    rewardXp: c.rewardXp,
    proof: c.proof,
    minCheckins: c.minCheckins,
    startMode: c.startMode,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    expiresAt: c.status === 'pending' ? c.expiresAt : null,
    creatorName: `${creator.name} (@${creator.username})${c.role === 'creator' ? ' — you' : ''}`,
    opponentName: `${opponent.name} (@${opponent.username})${c.role === 'opponent' ? ' — you' : ''}`,
  }
}

/* --- offer --------------------------------------------------------------------- */

function OfferView({
  challenge,
  me,
  them,
  onAnswered,
}: {
  challenge: Challenge
  me: PlayerSummary
  them: PlayerSummary
  onAnswered: (c: Challenge, accepted: boolean) => void
}) {
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function answer(accept: boolean) {
    setBusy(accept ? 'accept' : 'reject')
    setError(null)
    try {
      onAnswered((await respondToChallenge(challenge.id, accept)).challenge, accept)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not answer the offer.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gold-500/40 bg-gold-500/10 p-3 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-gold-400">⚔️ Challenge offer</p>
        <p className="mt-2 text-sm text-slate-100">
          <span className="font-semibold">{them.name}</span> has challenged you.
        </p>
        <p className="mt-1 font-display text-xl font-bold uppercase tracking-wide text-slate-50">{challenge.name}</p>
        <p className="mt-1 text-[11px] text-slate-400">Answer within {timeLeft(challenge.expiresAt)}.</p>
      </div>

      <TermsSheet t={termsFor(challenge, me, them)} />

      <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-ink-600 bg-ink-850 px-3 py-2.5 text-xs text-slate-200">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 accent-[rgb(var(--gold-500))]" />
        I've read the terms above and know what I'm agreeing to.
      </label>

      {error && <p className="rounded-lg border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-xs text-ember-400">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void answer(true)}
          disabled={!understood || busy !== null}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-3 text-sm font-bold uppercase tracking-wider text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === 'accept' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Accept
        </button>
        <button
          type="button"
          onClick={() => void answer(false)}
          disabled={busy !== null}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-ink-600 bg-ink-800 py-3 text-sm font-bold uppercase tracking-wider text-slate-200 hover:border-ember-500/50 hover:text-ember-400 disabled:opacity-40"
        >
          {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          Reject
        </button>
      </div>
    </div>
  )
}

function WaitingView({
  challenge,
  me,
  them,
  onChanged,
}: {
  challenge: Challenge
  me: PlayerSummary
  them: PlayerSummary
  onChanged: (c: Challenge) => void
}) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  async function withdraw() {
    setBusy(true)
    try {
      onChanged((await withdrawChallenge(challenge.id)).challenge)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-ink-600 bg-ink-850 px-3 py-3 text-sm text-slate-300">
        Waiting for <span className="font-semibold text-slate-100">{them.name}</span> to accept or reject. The offer
        expires in {timeLeft(challenge.expiresAt)}.
      </p>
      <TermsSheet t={termsFor(challenge, me, them)} />
      <button
        type="button"
        onClick={() => (confirm ? void withdraw() : setConfirm(true))}
        disabled={busy}
        className={`w-full rounded-xl border py-2.5 text-xs font-semibold ${
          confirm ? 'border-ember-500/60 bg-ember-500/10 text-ember-400' : 'border-ink-600 text-slate-400 hover:text-slate-200'
        }`}
      >
        {confirm ? 'Tap again to withdraw the offer' : 'Withdraw offer'}
      </button>
    </div>
  )
}

function Confirmation({
  tone,
  title,
  body,
  action,
  onAction,
}: {
  tone: 'accepted' | 'declined'
  title: string
  body: string
  action: string
  onAction: () => void
}) {
  return (
    <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="py-6 text-center">
      <span
        className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
          tone === 'accepted' ? 'bg-gradient-to-br from-gold-500 to-ember-500 text-onAccent' : 'border border-ink-600 bg-ink-800 text-slate-300'
        }`}
      >
        {tone === 'accepted' ? <Check className="h-8 w-8" strokeWidth={3} /> : <XCircle className="h-8 w-8" />}
      </span>
      <p className="mt-4 font-display text-2xl font-bold uppercase tracking-wide text-slate-50">{title}</p>
      <p className="mx-auto mt-2 max-w-xs text-sm text-slate-400">{body}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 px-5 py-2.5 text-sm font-semibold text-onAccent"
      >
        {action}
      </button>
    </motion.div>
  )
}

/* --- progress ---------------------------------------------------------------- */

function ProgressView({
  challenge,
  me,
  them,
  onChanged,
}: {
  challenge: Challenge
  me: PlayerSummary
  them: PlayerSummary
  onChanged: (c: Challenge) => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mySide = challenge.role
  const theirSide = mySide === 'creator' ? 'opponent' : 'creator'
  const checkins = challenge.checkins ?? []
  const mine = new Set(checkins.filter((c) => c.side === mySide).map((c) => c.day))
  const theirs = new Set(checkins.filter((c) => c.side === theirSide).map((c) => c.day))
  const today = challenge.today
  const doneToday = today !== null && mine.has(today)
  const needsNote = challenge.proof === 'required'

  async function checkIn() {
    setBusy(true)
    setError(null)
    try {
      onChanged((await checkInChallenge(challenge.id, note.trim())).challenge)
      setNote('')
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Could not check in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {challenge.status === 'accepted' && (
        <p className="rounded-xl border border-ink-600 bg-ink-850 px-3 py-3 text-sm text-slate-300">
          Both of you have agreed. It starts {formatWhen(challenge.startsAt)} — in {timeLeft(challenge.startsAt ?? '')}.
        </p>
      )}

      {challenge.status === 'active' && today !== null && (
        <div className="rounded-xl border border-gold-500/40 bg-gold-500/10 p-3">
          <p className="text-xs font-semibold text-slate-100">
            Day {today + 1} of {challenge.durationDays} · ends {formatWhen(challenge.endsAt)}
          </p>
          {doneToday ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-200">
              <Check className="h-4 w-4 text-gold-400" /> You've checked in for today.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 280))}
                rows={2}
                placeholder={needsNote ? 'Proof required — what did you do today?' : 'Add a note (optional)'}
                className="w-full resize-none rounded-lg border border-ink-600 bg-ink-850 px-2.5 py-2 text-xs text-slate-100 placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => void checkIn()}
                disabled={busy || (needsNote && note.trim().length < 10)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-gold-500 to-ember-500 py-2 text-xs font-bold uppercase tracking-wider text-onAccent disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Check in for day {today + 1}
              </button>
              {error && <p className="text-xs text-ember-400">{error}</p>}
            </div>
          )}
        </div>
      )}

      {challenge.status === 'completed' && challenge.rewards && (
        <div className="grid grid-cols-2 gap-2">
          <Result name="You" xp={mySide === 'creator' ? challenge.rewards.creator : challenge.rewards.opponent} count={mine.size} need={challenge.minCheckins} />
          <Result name={them.name} xp={theirSide === 'creator' ? challenge.rewards.creator : challenge.rewards.opponent} count={theirs.size} need={challenge.minCheckins} />
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-ink-600 bg-ink-850 p-3">
        <DayRow label="You" player={me} days={challenge.durationDays} done={mine} today={today} need={challenge.minCheckins} />
        <DayRow label={them.name} player={them} days={challenge.durationDays} done={theirs} today={today} need={challenge.minCheckins} />
      </div>

      {checkins.some((c) => c.note) && (
        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">Check-in notes</p>
          <ul className="space-y-1.5">
            {[...checkins].reverse().filter((c) => c.note).slice(0, 20).map((c) => (
              <li key={`${c.side}-${c.day}`} className="rounded-lg border border-ink-600 bg-ink-850 px-2.5 py-2 text-xs text-slate-200">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">
                  {c.side === mySide ? 'You' : them.name} · day {c.day + 1}
                </span>
                <p className="mt-0.5 break-words">{c.note}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function DayRow({
  label,
  player,
  days,
  done,
  today,
  need,
}: {
  label: string
  player: PlayerSummary
  days: number
  done: Set<number>
  today: number | null
  need: number
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <PlayerAvatar player={player} size={22} />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-100">{label}</span>
        <span className={`text-[11px] tabular-nums ${done.size >= need ? 'text-gold-400' : 'text-slate-400'}`}>
          {done.size}/{need} needed
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: days }).map((_, d) => (
          <span
            key={d}
            title={`Day ${d + 1}${done.has(d) ? ' — checked in' : ''}`}
            className={`h-5 w-5 rounded-[5px] ${done.has(d) ? 'bg-gold-500' : 'bg-ink-700'} ${
              today === d ? 'ring-2 ring-gold-400/80 ring-offset-1 ring-offset-ink-850' : ''
            }`}
          />
        ))}
      </div>
    </div>
  )
}

function Result({ name, xp, count, need }: { name: string; xp: number; count: number; need: number }) {
  const made = xp > 0
  return (
    <div className={`rounded-xl border p-3 text-center ${made ? 'border-gold-500/50 bg-gold-500/10' : 'border-ink-600 bg-ink-850'}`}>
      <p className="truncate text-xs font-semibold text-slate-100">{name}</p>
      <p className={`mt-1 font-display text-lg font-bold ${made ? 'text-gold-300' : 'text-slate-500'}`}>
        {made ? `+${xp.toLocaleString()} XP` : 'No reward'}
      </p>
      <p className="text-[11px] text-slate-500">
        {count}/{need} check-ins
      </p>
    </div>
  )
}

/* --- chat ---------------------------------------------------------------------- */

/**
 * The challenge's own chat. New messages are fetched every few seconds while it
 * is on screen — only the ones after the last id already shown, so each poll is
 * a few bytes when nothing has been said.
 */
function ChatView({ challenge, them }: { challenge: Challenge; them: PlayerSummary }) {
  const [messages, setMessages] = useState<ChallengeMessage[]>([])
  const [open, setOpen] = useState(true)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [reported, setReported] = useState(false)
  const lastId = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)

  const poll = useCallback(async () => {
    try {
      const res = await fetchChallengeMessages(challenge.id, lastId.current)
      setOpen(res.open)
      if (res.messages.length) {
        lastId.current = res.messages[res.messages.length - 1].id
        setMessages((m) => [...m, ...res.messages])
      }
    } catch {
      // A missed poll is picked up by the next one.
    }
  }, [challenge.id])

  useEffect(() => {
    void poll()
    const t = window.setInterval(() => document.visibilityState === 'visible' && void poll(), 4000)
    return () => window.clearInterval(t)
  }, [poll])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    try {
      const { message } = await sendChallengeMessage(challenge.id, body)
      if (message.id > lastId.current) {
        lastId.current = message.id
        setMessages((m) => [...m, message])
      }
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div ref={listRef} className="min-h-[16rem] flex-1 space-y-2 overflow-y-auto p-4">
        {!messages.length && (
          <p className="py-8 text-center text-xs text-slate-500">
            This chat belongs to {challenge.name}. Say hi, cheer each other on, share how it's going.
          </p>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  m.mine ? 'rounded-br-md bg-gradient-to-r from-gold-500 to-ember-500 text-onAccent' : 'rounded-bl-md border border-ink-600 bg-ink-850 text-slate-100'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-0.5 text-[10px] ${m.mine ? 'text-onAccent/70' : 'text-slate-500'}`}>
                  {new Date(m.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="border-t border-ink-700 p-3">
        {open ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
            className="flex gap-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 500))}
              placeholder={`Message ${them.name}…`}
              className="min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-gold-500/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="Send"
              className="flex items-center justify-center rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 px-3 text-onAccent disabled:opacity-40"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        ) : (
          <p className="text-center text-xs text-slate-500">This chat is closed — you can still read it.</p>
        )}
        <div className="mt-2 flex items-center justify-between">
          {error ? <p className="text-xs text-ember-400">{error}</p> : <span className="text-[10px] text-slate-600">Messages are checked for abuse.</span>}
          {reported ? (
            <span className="text-[10px] text-slate-500">Reported</span>
          ) : (
            <button
              type="button"
              onClick={() => void reportPlayer(them.username, 'Reported from challenge chat', challenge.id).then(() => setReported(true))}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-ember-400"
            >
              <Flag className="h-3 w-3" /> Report {them.name}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
