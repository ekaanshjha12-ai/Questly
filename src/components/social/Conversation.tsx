import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Ban, Check, Ellipsis, Flag, IdCard, Loader2, Lock, Send, ShieldCheck, X } from 'lucide-react'
import {
  ApiError,
  acceptConversation,
  blockPlayer,
  declineConversation,
  fetchConversation,
  lookupConversation,
  reportPlayer,
  sendDirectMessage,
  startConversation,
  type Conversation,
  type DirectMessage,
  type PlayerSummary,
} from '../../lib/api'
import { announceMessagesChanged } from '../../hooks/useMessages'
import { PlayerAvatar } from '../ChallengeParts'

/**
 * One conversation with another player.
 *
 * Opened either from the inbox, by id, or from someone's card, by username —
 * in which case there may be no conversation yet, and the first message sent
 * here creates it as a request. New messages are fetched every few seconds
 * while it is on screen, only those after the last one shown.
 */

export type ConversationTarget = { id: string; player?: PlayerSummary | null } | { username: string; player?: PlayerSummary | null }

const POLL_MS = 4000

export default function ConversationView({
  target,
  onBack,
  onOpenCard,
  closeIcon = false,
}: {
  target: ConversationTarget
  onBack: () => void
  /** Opens this player's card, where their profile, report and block live. */
  onOpenCard?: (username: string) => void
  /** Shows an X rather than a back arrow, for when this is a sheet of its own. */
  closeIcon?: boolean
}) {
  const [conversationId, setConversationId] = useState<string | null>('id' in target ? target.id : null)
  const [player, setPlayer] = useState<PlayerSummary | null>(target.player ?? null)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [canSend, setCanSend] = useState(true)
  const [start, setStart] = useState<{ canStart: boolean; unlockLevel: number }>({ canStart: true, unlockLevel: 2 })
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [reported, setReported] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const lastId = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // From a card: find out whether there is a conversation already.
  const username = 'username' in target ? target.username : null
  useEffect(() => {
    if (!username) return
    let cancelled = false
    lookupConversation(username)
      .then((res) => {
        if (cancelled) return
        setPlayer(res.player)
        setStart({ canStart: res.canStart, unlockLevel: res.unlockLevel })
        if (res.conversationId) setConversationId(res.conversationId)
        else setLoaded(true)
      })
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : 'That player is not available.'))
    return () => {
      cancelled = true
    }
  }, [username])

  const poll = useCallback(async () => {
    if (!conversationId) return
    try {
      const res = await fetchConversation(conversationId, lastId.current)
      setConversation(res.conversation)
      if (res.conversation.other) setPlayer(res.conversation.other)
      setCanSend(res.canSend)
      setLoaded(true)
      if (res.messages.length) {
        const fresh = res.messages.filter((m) => m.id > lastId.current)
        lastId.current = res.messages[res.messages.length - 1].id
        setMessages((current) => [...current, ...fresh])
        // They were marked read on the server; let the badges catch up.
        if (fresh.some((m) => !m.mine)) announceMessagesChanged()
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setLoadError(err.message)
      // Anything else: a missed poll is picked up by the next one.
    }
  }, [conversationId])

  useEffect(() => {
    if (!conversationId) return
    void poll()
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void poll(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [conversationId, poll])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: messages.length > 30 ? 'auto' : 'smooth' })
  }, [messages.length])

  const name = player?.name ?? 'them'
  const handle = player?.username ?? username ?? ''

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    try {
      if (!conversationId) {
        const res = await startConversation(handle, body)
        setConversation(res.conversation)
        // A new conversation is a request: one message, then wait. Writing to
        // someone who had already asked to talk opens it straight away.
        setCanSend(res.conversation.status === 'open')
        setConversationId(res.conversation.id)
      } else {
        const { message } = await sendDirectMessage(conversationId, body)
        if (message.id > lastId.current) {
          lastId.current = message.id
          setMessages((m) => [...m, message])
        }
        // Replying to a request is accepting it.
        setConversation((c) => (c && c.requestForMe ? { ...c, status: 'open', requestForMe: false } : c))
        if (conversation?.status === 'request' && !conversation.requestForMe) setCanSend(false)
      }
      setDraft('')
      announceMessagesChanged()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'awaiting_accept') setCanSend(false)
      if (err instanceof ApiError && err.code === 'locked') setStart((s) => ({ ...s, canStart: false }))
      setError(err instanceof Error ? err.message : 'Could not send.')
    } finally {
      setSending(false)
    }
  }

  async function accept() {
    if (!conversationId) return
    try {
      const res = await acceptConversation(conversationId)
      setConversation(res.conversation)
      setCanSend(true)
      announceMessagesChanged()
      inputRef.current?.focus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept.')
    }
  }

  async function decline() {
    if (!conversationId) return
    try {
      await declineConversation(conversationId)
      announceMessagesChanged()
      onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decline.')
    }
  }

  async function report() {
    setMenu(false)
    try {
      await reportPlayer(handle, 'Reported from messages')
      setReported(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not report.')
    }
  }

  async function block() {
    if (!confirmBlock) {
      setConfirmBlock(true)
      return
    }
    setMenu(false)
    try {
      await blockPlayer(handle)
      setBlocked(true)
      announceMessagesChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not block.')
    }
  }

  const waiting = Boolean(conversationId && conversation && conversation.status === 'request' && !conversation.requestForMe && !canSend)
  const fresh = loaded && !conversationId

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* --- header ---------------------------------------------------------- */}
      <div className="relative flex items-center gap-2 border-b border-ink-700 px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label={closeIcon ? 'Close' : 'Back to messages'}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-ink-800 hover:text-slate-100"
        >
          {closeIcon ? <X className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => handle && onOpenCard?.(handle)}
          disabled={!onOpenCard || !handle}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left disabled:cursor-default"
        >
          {player ? <PlayerAvatar player={player} size={36} /> : <span className="h-9 w-9 shrink-0 rounded-full bg-ink-800" />}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-100">{player?.name ?? (handle ? `@${handle}` : '…')}</span>
            <span className="block truncate text-[11px] text-slate-500">
              {handle && `@${handle}`}
              {player && ` · ${player.rank} · Level ${player.level}`}
            </span>
          </span>
        </button>
        {handle && !blocked && (
          <button
            type="button"
            onClick={() => {
              setMenu((v) => !v)
              setConfirmBlock(false)
            }}
            aria-label="More"
            aria-expanded={menu}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-ink-800 hover:text-slate-100"
          >
            <Ellipsis className="h-4 w-4" />
          </button>
        )}

        <AnimatePresence>
          {menu && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute right-3 top-full z-10 mt-1 w-48 overflow-hidden rounded-xl border border-ink-600 bg-ink-850 py-1 shadow-xl"
            >
              {onOpenCard && (
                <MenuItem
                  icon={IdCard}
                  label="View card"
                  onClick={() => {
                    setMenu(false)
                    onOpenCard(handle)
                  }}
                />
              )}
              <MenuItem icon={Flag} label={reported ? 'Reported' : `Report ${name}`} onClick={() => void report()} disabled={reported} />
              <MenuItem icon={Ban} label={confirmBlock ? 'Tap again to block' : `Block ${name}`} onClick={() => void block()} danger={confirmBlock} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* --- messages ------------------------------------------------------- */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {loadError ? (
          <p className="py-10 text-center text-sm text-slate-400">{loadError}</p>
        ) : blocked ? (
          <p className="py-10 text-center text-sm text-slate-300">Blocked. You won't see each other or be able to message.</p>
        ) : !loaded ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
          </div>
        ) : fresh ? (
          <div className="flex flex-col items-center px-4 py-8 text-center">
            {player && <PlayerAvatar player={player} size={64} />}
            <p className="mt-3 font-display text-base font-bold text-slate-50">{player?.name}</p>
            <p className="text-xs text-slate-500">@{handle}</p>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-slate-400">
              Say hello. Your first message arrives as a request, and {name} decides whether to chat.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m, i) => {
              const day = dayLabel(m.at)
              const newDay = i === 0 || dayLabel(messages[i - 1].at) !== day
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <p className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">{day}</p>
                  )}
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                        m.mine
                          ? 'rounded-br-md bg-gradient-to-r from-gold-500 to-ember-500 text-onAccent'
                          : 'rounded-bl-md border border-ink-600 bg-ink-850 text-slate-100'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`mt-0.5 text-[10px] ${m.mine ? 'text-onAccent/70' : 'text-slate-500'}`}>
                        {new Date(m.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                  </motion.div>
                </Fragment>
              )
            })}
          </AnimatePresence>
        )}
      </div>

      {/* --- composer --------------------------------------------------------- */}
      {!loadError && !blocked && loaded && (
        <div className="border-t border-ink-700 p-3">
          {conversation?.requestForMe && (
            <div className="mb-3 rounded-xl border border-gold-500/40 bg-gold-500/10 p-3">
              <p className="text-xs text-slate-200">
                <span className="font-semibold">{name}</span> wants to chat. Accept or reply to open the chat. Until then they can't send
                anything more.
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void accept()}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-gold-500 to-ember-500 py-2 text-xs font-bold text-onAccent"
                >
                  <Check className="h-3.5 w-3.5" /> Accept
                </button>
                <button
                  type="button"
                  onClick={() => void decline()}
                  className="rounded-lg border border-ink-600 bg-ink-800 py-2 text-xs font-semibold text-slate-200 hover:border-ink-500"
                >
                  Decline
                </button>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">If you decline, {name} isn't told.</p>
            </div>
          )}

          {fresh && !start.canStart ? (
            <p className="flex items-start gap-2 rounded-xl border border-ink-600 bg-ink-850 px-3 py-2.5 text-xs text-slate-400">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Starting a conversation unlocks at level {start.unlockLevel}. Earn XP in Focus mode. Anyone can still message you, and you can
                always reply.
              </span>
            </p>
          ) : waiting ? (
            <p className="rounded-xl border border-ink-600 bg-ink-850 px-3 py-2.5 text-center text-xs text-slate-400">
              Request sent. You can write again once {name} replies or accepts.
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
              className="flex gap-2"
            >
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 500))}
                placeholder={fresh ? `Say hello to ${name}…` : `Message ${name}…`}
                aria-label={`Message ${name}`}
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
          )}

          <div className="mt-2 flex items-center justify-between gap-2">
            {error ? (
              <p className="text-xs text-ember-400">{error}</p>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-slate-600">
                <ShieldCheck className="h-3 w-3" />
                Checked for abuse. Keep your address, school and passwords to yourself.
              </span>
            )}
            {draft.length > 400 && <span className="shrink-0 text-[10px] tabular-nums text-slate-500">{500 - draft.length}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  danger = false,
}: {
  icon: typeof Flag
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-ink-800 disabled:opacity-50 ${
        danger ? 'font-semibold text-ember-400' : 'text-slate-200'
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** A conversation as a sheet of its own, over whatever opened it — used from
 * a player's card, wherever that card was opened. */
export function ConversationSheet({
  username,
  player,
  onClose,
}: {
  username: string
  player?: PlayerSummary | null
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
        aria-label={`Messages with ${player?.name ?? username}`}
        className="flex h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-ink-600 bg-ink-900 shadow-2xl sm:h-[80vh] sm:rounded-2xl"
      >
        <ConversationView target={{ username, player }} onBack={onClose} closeIcon />
      </motion.div>
    </motion.div>
  )
}
