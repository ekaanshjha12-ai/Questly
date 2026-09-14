import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, MessageCircle, SquarePen, X } from 'lucide-react'
import type { Conversation, FoundPlayer } from '../../lib/api'
import type { Inbox } from '../../hooks/useMessages'
import { PHONE, useMediaQuery } from '../../hooks/useMediaQuery'
import { timeAgo } from '../../lib/social'
import { PlayerAvatar } from '../ChallengeParts'
import PlayerCardSheet from '../PlayerCardSheet'
import PlayerSearch from '../PlayerSearch'
import ConversationView, { type ConversationTarget } from './Conversation'

/**
 * Messages: requests waiting on you, then your conversations, most recent
 * first.
 *
 * With no follow list, anyone on Questly can write to you — of any age — so a
 * conversation from someone new waits under Requests rather than landing
 * among your chats, until you accept or reply.
 */
export default function MessagesScreen({ inbox, myName }: { inbox: Inbox; myName: string }) {
  const [open, setOpen] = useState<ConversationTarget | null>(null)
  const [finding, setFinding] = useState(false)
  const [card, setCard] = useState<string | null>(null)
  const phone = useMediaQuery(PHONE)

  // Fresh on arrival, rather than whatever the last poll saw.
  useEffect(() => {
    void inbox.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (open) {
    return (
      <>
        <div
          className="min-h-[24rem] overflow-hidden rounded-2xl border border-ink-600 bg-ink-900"
          // Sized to the screen so the message box sits in view; on a phone it
          // also clears the notch above and the Focus / Social dock below.
          style={{
            height: phone
              ? 'calc(100dvh - 17rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))'
              : 'calc(100dvh - 12.5rem)',
          }}
        >
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
          // The padding leaves room for the panel's raised bottom edge, which
          // the overflow clip needed for the open animation would cut off.
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pb-2">
            <FindPlayer
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
          {c.otherAge === 'adult' && (
            <span className="shrink-0 rounded-full border border-ink-500 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-400" title="This person is 18 or older">
              18+
            </span>
          )}
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

/** Pick who to write to: recently active players, or search. */
function FindPlayer({ onPick }: { onPick: (p: FoundPlayer) => void }) {
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-850 p-3">
      <PlayerSearch onPick={onPick} placeholder="Who do you want to message?" autoFocus maxHeight="18rem" />
    </div>
  )
}
