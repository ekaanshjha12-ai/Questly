import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Ban, Check, Flag, Loader2, MessageCircle, Swords, UserRound, X } from 'lucide-react'
import { blockPlayer, fetchPlayer, reportPlayer, type Challenge, type PublicPlayer } from '../lib/api'
import { publicCardData, publicDefaultCard } from '../lib/card'
import ProfileCard from './ProfileCard'
import ChallengeComposer from './ChallengeComposer'
import { StatusPill } from './ChallengeParts'
import { ConversationSheet } from './social/Conversation'

/**
 * Someone else's card, with the two things you can do about it right there:
 * view their profile, or challenge them.
 *
 * Challenge is the primary action and needs nothing first — no follow, no
 * friend request. Message sits just under the two. The server still decides
 * whether the two of you can interact at all, and this sheet just shows what
 * it says.
 */
export default function PlayerCardSheet({
  username,
  myName,
  onClose,
  onChallengeSent,
  onMessage,
}: {
  username: string
  myName: string
  onClose: () => void
  onChallengeSent?: (challenge: Challenge) => void
  /** Where Message goes when the caller already has the conversation open.
   * Without it, the conversation opens as a sheet over this one. */
  onMessage?: () => void
}) {
  const [player, setPlayer] = useState<PublicPlayer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showProfile, setShowProfile] = useState(false)
  const [composing, setComposing] = useState(false)
  const [sent, setSent] = useState<Challenge | null>(null)
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('')
  const [reported, setReported] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [messaging, setMessaging] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchPlayer(username)
      .then(({ player: p }) => !cancelled && setPlayer(p))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'That player is not available.'))
    return () => {
      cancelled = true
    }
  }, [username])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !composing && !messaging && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [composing, messaging, onClose])

  const data = useMemo(() => (player ? publicCardData(player) : null), [player])
  const design = useMemo(() => player?.card ?? publicDefaultCard(), [player])

  async function doBlock() {
    await blockPlayer(username)
    setBlocked(true)
  }

  async function doReport() {
    await reportPlayer(username, reason.trim())
    setReported(true)
    setReporting(false)
  }

  return (
    <>
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
          aria-label={player ? `${player.name}'s card` : 'Player card'}
          className="max-h-[94vh] w-full max-w-sm overflow-y-auto rounded-t-2xl border border-ink-600 bg-ink-900 p-4 shadow-2xl sm:rounded-2xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Questly card</p>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-ink-800 hover:text-slate-200">
              <X className="h-4 w-4" />
            </button>
          </div>

          {error && <p className="rounded-xl border border-ink-600 bg-ink-850 px-3 py-6 text-center text-sm text-slate-400">{error}</p>}

          {!error && !player && (
            <div className="flex justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
            </div>
          )}

          {blocked && (
            <p className="rounded-xl border border-ink-600 bg-ink-850 px-3 py-6 text-center text-sm text-slate-300">
              Blocked. You won't see each other, and anything you had going together has ended.
            </p>
          )}

          {player && data && !blocked && (
            <>
              <motion.div initial={{ rotateY: -30, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} style={{ perspective: 800 }} className="mx-auto w-full max-w-[17rem]">
                <ProfileCard design={design} data={data} />
              </motion.div>

              {/* The two actions, directly under the card. */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowProfile((v) => !v)}
                  aria-expanded={showProfile}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-ink-600 bg-ink-800 py-3 text-xs font-bold uppercase tracking-wider text-slate-100 hover:border-ink-500"
                >
                  <UserRound className="h-4 w-4" />
                  View profile
                </button>
                <button
                  type="button"
                  onClick={() => setComposing(true)}
                  disabled={!player.canChallenge || Boolean(sent)}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-3 text-xs font-bold uppercase tracking-wider text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Swords className="h-4 w-4" />
                  Challenge
                </button>
              </div>

              <button
                type="button"
                onClick={() => (onMessage ? onMessage() : setMessaging(true))}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-ink-600 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-ink-500 hover:text-slate-100"
              >
                <MessageCircle className="h-4 w-4" />
                Message
              </button>

              {sent ? (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-ink-600 bg-ink-850 px-3 py-2.5">
                  <span className="flex items-center gap-1.5 text-xs text-slate-200">
                    <Check className="h-4 w-4 text-gold-400" />
                    {sent.name} sent
                  </span>
                  <StatusPill status={sent.status} />
                </div>
              ) : (
                !player.canChallenge &&
                player.challengeNote && <p className="mt-2 text-center text-[11px] text-slate-500">{player.challengeNote}</p>
              )}

              <AnimatePresence>
                {showProfile && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 space-y-3 rounded-xl border border-ink-600 bg-ink-850 p-3">
                      <div>
                        <p className="font-display text-base font-bold text-slate-50">{player.name}</p>
                        <p className="text-xs text-slate-500">@{player.username}</p>
                      </div>
                      {player.bio && <p className="text-xs leading-relaxed text-slate-300">{player.bio}</p>}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <Stat label="Rank" value={data.rankName} />
                        <Stat label="Level" value={String(player.level)} />
                        <Stat label="XP" value={player.xp.toLocaleString()} />
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {player.record.finished
                          ? `Completed ${player.record.completed} of ${player.record.finished} challenge${player.record.finished === 1 ? '' : 's'}`
                          : 'No challenges finished yet'}{' '}
                        · Joined {data.joined}
                      </p>

                      <div className="flex flex-wrap gap-2 border-t border-ink-700 pt-2.5">
                        {reported ? (
                          <span className="text-[11px] text-slate-400">Reported. Thank you — it goes to the admins.</span>
                        ) : reporting ? (
                          <div className="w-full space-y-2">
                            <textarea
                              value={reason}
                              onChange={(e) => setReason(e.target.value.slice(0, 300))}
                              rows={2}
                              placeholder="What happened?"
                              className="w-full resize-none rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-2 text-xs text-slate-100 placeholder:text-slate-500"
                            />
                            <div className="flex gap-2">
                              <button type="button" onClick={() => void doReport()} className="rounded-lg bg-ember-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-ember-400">
                                Send report
                              </button>
                              <button type="button" onClick={() => setReporting(false)} className="px-2 text-[11px] text-slate-400">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setReporting(true)} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-ember-400">
                            <Flag className="h-3.5 w-3.5" /> Report
                          </button>
                        )}
                        {!reporting && (
                          <button
                            type="button"
                            onClick={() => (confirmBlock ? void doBlock() : setConfirmBlock(true))}
                            className={`ml-auto flex items-center gap-1 text-[11px] ${confirmBlock ? 'font-semibold text-ember-400' : 'text-slate-400 hover:text-ember-400'}`}
                          >
                            <Ban className="h-3.5 w-3.5" /> {confirmBlock ? 'Tap again to block' : 'Block'}
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {composing && player && (
          <ChallengeComposer
            opponent={player}
            myName={myName}
            onClose={() => setComposing(false)}
            onSent={(challenge) => {
              setComposing(false)
              setSent(challenge)
              onChallengeSent?.(challenge)
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {messaging && player && <ConversationSheet username={player.username} player={player} onClose={() => setMessaging(false)} />}
      </AnimatePresence>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ink-800 px-1.5 py-2">
      <p className="truncate text-xs font-semibold text-slate-100">{value}</p>
      <p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  )
}
