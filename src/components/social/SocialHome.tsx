import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { IdCard, Lock, MessageCircle, Newspaper, Swords, Unlock } from 'lucide-react'
import type { AppState, CardDesign } from '../../types'
import type { AuthUser, Challenge } from '../../lib/api'
import { cardData } from '../../lib/card'
import { UNLOCKS, UNLOCK_LIST } from '../../lib/social'
import type { Inbox } from '../../hooks/useMessages'
import FeedScreen from './FeedScreen'
import MessagesScreen from './MessagesScreen'
import ChallengesScreen from '../ChallengesScreen'
import CardEditor from '../CardEditor'

/**
 * The social side of Questly: the feed, challenges, messages, and your own
 * card.
 *
 * No followers and no following — everyone in your age band shares one feed,
 * and the way to connect with a person is to open their card: challenge them,
 * or message them.
 */

export type SocialTab = 'feed' | 'challenges' | 'messages' | 'card'

const TABS: { id: SocialTab; label: string; icon: typeof Newspaper }[] = [
  { id: 'feed', label: 'Feed', icon: Newspaper },
  { id: 'challenges', label: 'Challenges', icon: Swords },
  { id: 'messages', label: 'Messages', icon: MessageCircle },
  { id: 'card', label: 'My card', icon: IdCard },
]

export default function SocialHome({
  state,
  user,
  challenges,
  inbox,
  onSetCard,
  startSharing,
}: {
  state: AppState
  user: AuthUser
  inbox: Inbox
  challenges: {
    challenges: Challenge[] | null
    error: string | null
    refresh: () => Promise<void>
    upsert: (c: Challenge) => void
    incomingCount: number
  }
  onSetCard: (card: CardDesign | null) => void
  startSharing?: boolean
}) {
  const [tab, setTab] = useState<SocialTab>('feed')
  const data = useMemo(() => cardData(state, user), [state, user])
  const level = state.progression.level

  return (
    <div className="space-y-4">
      {/* Four tabs: on a phone, icon over label so each fits its quarter. */}
      <div className="grid grid-cols-4 gap-1 rounded-2xl border border-ink-600 bg-ink-850 p-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const badge = id === 'challenges' ? challenges.incomingCount : id === 'messages' ? inbox.unread + inbox.requests : 0
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              aria-label={badge > 0 ? `${label}, ${badge} new` : label}
              className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[10px] font-semibold transition-colors sm:flex-row sm:gap-1.5 sm:py-2.5 sm:text-xs ${
                tab === id ? 'text-onAccent' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab === id && (
                <motion.span
                  layoutId="social-tab"
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500"
                  transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                />
              )}
              <span className="relative">
                <Icon className="h-4 w-4" />
                {badge > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-ember-500 px-1 text-[8px] font-bold leading-none text-onAccent ring-2 ring-ink-850">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              <span className="relative">{label}</span>
            </button>
          )
        })}
      </div>

      {tab === 'feed' && <FeedScreen state={state} myName={state.player.name} startSharing={startSharing} />}

      {tab === 'challenges' && (
        <ChallengesScreen
          myName={state.player.name}
          challenges={challenges.challenges}
          error={challenges.error}
          onRefresh={challenges.refresh}
          onUpsert={challenges.upsert}
        />
      )}

      {tab === 'messages' && <MessagesScreen inbox={inbox} level={level} myName={state.player.name} />}

      {tab === 'card' && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-ink-600 bg-ink-850 p-4">
            <p className="font-display text-sm font-semibold text-slate-100">Your Questly card</p>
            <p className="text-[11px] text-slate-500">This is what other players see when they open you. Make it yours.</p>
            <div className="mt-3">
              <CardEditor design={state.card} data={data} onChange={onSetCard} />
            </div>
          </section>

          <section className="rounded-2xl border border-ink-600 bg-ink-850 p-4">
            <p className="font-display text-sm font-semibold text-slate-100">What your level unlocks</p>
            <p className="text-[11px] text-slate-500">You are level {level}. Earn XP in Focus mode to open more.</p>
            <ul className="mt-3 space-y-1.5">
              {UNLOCK_LIST.map((u) => {
                const need = UNLOCKS[u.key]
                const open = level >= need
                return (
                  <li key={u.key} className="flex items-center gap-2.5 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2">
                    {open ? <Unlock className="h-4 w-4 text-gold-400" /> : <Lock className="h-4 w-4 text-slate-500" />}
                    <span className={`flex-1 text-xs ${open ? 'text-slate-100' : 'text-slate-400'}`}>{u.label}</span>
                    <span className={`text-[11px] ${open ? 'text-gold-400' : 'text-slate-500'}`}>{open ? 'Unlocked' : `Level ${need}`}</span>
                  </li>
                )
              })}
            </ul>
          </section>

          {user.username && (
            <section>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Your posts</p>
              <FeedScreen state={state} myName={state.player.name} username={user.username} />
            </section>
          )}
        </div>
      )}
    </div>
  )
}
