import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Loader2, Lock, MessageCircle, Search, SquarePen, X } from 'lucide-react'
import { searchPlayers, type Conversation, type PlayerSummary } from '../../lib/api'
import type { Inbox } from '../../hooks/useMessages'
import { UNLOCKS, timeAgo } from '../../lib/social'
import { PlayerAvatar } from '../ChallengeParts'
import PlayerCardSheet from '../PlayerCardSheet'
import ConversationView, { type ConversationTarget } from './Conversation'

/**
 * Messages: requests waiting on you, then your conversations, most recent
 * first.
 *
 * With no follow list, anyone in your age band can write to you, so a first
 * message from someone new waits under Requests rather than landing among
 * your chats, and they cannot send another until you answer.
 */
export default function MessagesScreen({ inbox, level, myName }: { inbox: Inbox; level: number; myName: string }) {
  const [open, setOpen] = useState<ConversationTarget | null>(null)
  const [finding, setFinding] = useState(false)
  const [card, setCard] = useState<string | null>(null)

  // Fresh on arrival, rather than whatever the last poll saw.
  useEffect(() => {
    void inbox.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (open) {
    return (
      <>
        <div className="h-[calc(100dvh-12.5rem)] min-h-[24rem] overflow-hidden rounded-2xl border border-ink-600 bg-ink-900">
          <ConversationView
            key={'id' in open ? open.id : open.username}
            target={open}
            onBack={() => {
              setOpen(null)
              void inbox.refresh()
            }}
            onOpenCard={setCard}
          />
        </div>
        <AnimatePresence>
          {card && (
            // Already in the conversation, so the card's Message button just
            // brings you back to it.
            <PlayerCardSheet username={card} myName={myName} onClose={() => setCard(null)} onMessage={() => setCard(null)} />
          )}
        </AnimatePresence>
      </>
    )
  }

  const list = inbox.conversations ?? []
  const requests = list.filter((c) => c.requestForMe)
  const chats = list.filter((c) => !c.requestForMe)
  const canStart = level >= UNLOCKS.message

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-50">
            <MessageCircle className="h-5 w-5 text-gold-400" /> Messages
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">Talk to anyone in Questly. A first message arrives as a request.</p>
        </div>
        <button
          type="button"
          onClick={() => setFinding((v) => !v)}
          aria-expanded={finding}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 px-3 py-2 text-xs font-bold text-onAccent"
        >
          {finding ? <X className="h-4 w-4" /> : <SquarePen className="h-4 w-4" />}
          {finding ? 'Close' : 'New'}
        </button>
      </div>

      <AnimatePresence>
        {finding && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <FindPlayer
              canStart={canStart}
              onPick={(p) => {
                setFinding(false)
                setOpen({ username: p.username, player: p })
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {inbox.error && !inbox.conversations && <p className="text-xs text-ember-400">{inbox.error}</p>}
      {!inbox.conversations && !inbox.error && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
        </div>
      )}

      {inbox.conversations && (
        <>
          {requests.length > 0 && (
            <section>
              <p className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
                Message requests
                <span className="rounded-full bg-ember-500 px-1.5 text-[10px] font-bold text-onAccent">{requests.length}</span>
              </p>
              <ul className="space-y-2">
                {requests.map((c) => (
                  <li key={c.id}>
                    <Row c={c} onOpen={() => setOpen({ id: c.id, player: c.other })} highlight />
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 px-1 text-[10px] text-slate-500">Accept or reply to start chatting. If you decline, they aren't told.</p>
            </section>
          )}

          <section>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Chats</p>
            {chats.length === 0 ? (
              <p className="rounded-xl border border-dashed border-ink-600 px-3 py-4 text-center text-xs text-slate-500">
                No conversations yet. Tap New, or open someone's card in the feed.
              </p>
            ) : (
              <ul className="space-y-2">
                {chats.map((c) => (
                  <li key={c.id}>
                    <Row c={c} onOpen={() => setOpen({ id: c.id, player: c.other })} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Row({ c, onOpen, highlight = false }: { c: Conversation; onOpen: () => void; highlight?: boolean }) {
  const them = c.other
  const waiting = c.status === 'request' && !c.requestForMe
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
        highlight ? 'border-gold-500/50 bg-gold-500/10' : 'border-ink-600 bg-ink-850 hover:border-ink-500'
      }`}
    >
      {them ? <PlayerAvatar player={them} size={42} /> : <span className="h-[42px] w-[42px] shrink-0 rounded-full bg-ink-800" />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={`truncate text-sm text-slate-100 ${c.unread > 0 ? 'font-bold' : 'font-semibold'}`}>{them?.name ?? 'Player'}</span>
          <span className="ml-auto shrink-0 text-[10px] text-slate-500">{timeAgo(c.lastMessageAt)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[12px] ${c.unread > 0 ? 'text-slate-200' : 'text-slate-500'}`}>
            {c.lastMessage ? `${c.lastMessage.mine ? 'You: ' : ''}${c.lastMessage.body}` : `@${them?.username ?? ''}`}
          </span>
          {waiting && <span className="shrink-0 rounded-full border border-ink-500 px-1.5 py-px text-[9px] uppercase tracking-wide text-slate-400">Request sent</span>}
          {c.unread > 0 && !c.requestForMe && (
            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-gold-500 px-1 text-[9px] font-bold text-onAccent">
              {c.unread > 9 ? '9+' : c.unread}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

/** Search by username and pick who to write to. */
function FindPlayer({ canStart, onPick }: { canStart: boolean; onPick: (p: PlayerSummary) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerSummary[] | null>(null)
  const [searching, setSearching] = useState(false)

  // Search a beat after typing stops; ignore any answer that is no longer the
  // latest question.
  const latest = useRef('')
  useEffect(() => {
    const q = query.trim().replace(/^@+/, '')
    latest.current = q
    if (q.length < 2) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const t = setTimeout(() => {
      searchPlayers(q)
        .then((r) => latest.current === q && setResults(r.results))
        .catch(() => latest.current === q && setResults([]))
        .finally(() => latest.current === q && setSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-850 p-3">
      {!canStart && (
        <p className="mb-2.5 flex items-start gap-2 rounded-xl bg-ink-800 px-3 py-2 text-[11px] text-slate-400">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Starting a conversation unlocks at level {UNLOCKS.message}. You can still open chats people have started with you.
        </p>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 21))}
          placeholder="Who do you want to message? @username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          className="w-full rounded-xl border border-ink-600 bg-ink-800 py-2.5 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-gold-500/50 focus:outline-none"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" />}
      </div>
      {results && (
        <ul className="mt-2 space-y-1">
          {results.length === 0 && !searching && <li className="px-1 py-2 text-xs text-slate-500">Nobody found with that username.</li>}
          {results.map((p) => (
            <li key={p.username}>
              <button type="button" onClick={() => onPick(p)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-ink-800">
                <PlayerAvatar player={p} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">{p.name}</span>
                  <span className="block truncate text-[11px] text-slate-500">
                    @{p.username} · {p.rank} · Level {p.level}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
