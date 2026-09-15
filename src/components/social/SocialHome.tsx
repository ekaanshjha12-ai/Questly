import { useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import type { AppState } from '../../types'
import type { AuthUser } from '../../lib/api'
import type { Inbox } from '../../hooks/useMessages'
import { match, useRouter } from '../../app/router'
import FeedScreen from './FeedScreen'
import MessagesScreen from './MessagesScreen'
import PostDetail from './PostDetail'
import PlayerCardSheet from '../PlayerCardSheet'
import Tabs from '../ui/Tabs'

/**
 * The social side of Questly: the Adventure Log, messages, and your own posts.
 *
 * No followers and no following — everyone shares one log, and the way to
 * connect with a person is to open their card: challenge them, or message
 * them. Each tab has its own address, so a notification can open a
 * conversation directly and the back gesture moves between tabs.
 */

export type SocialTab = 'feed' | 'messages' | 'mine'

export default function SocialHome({ state, user, inbox }: { state: AppState; user: AuthUser; inbox: Inbox }) {
  const { path, search, navigate } = useRouter()
  const conversation = match('/social/messages/:id', path)
  const openPost = match('/social/post/:id', path)
  const player = match('/u/:username', path)
  const tab: SocialTab = path.startsWith('/social/messages') ? 'messages' : path === '/social/mine' ? 'mine' : 'feed'

  // "Share progress" from Focus Mode arrives as ?share=1. Read once, then the
  // address is tidied so a refresh does not open the composer again.
  const startSharing = useRef(search.get('share') === '1').current
  useEffect(() => {
    if (search.get('share') === '1') navigate('/social', { replace: true, keepScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tabs = [
    { id: 'feed' as const, label: 'Adventure Log' },
    { id: 'messages' as const, label: 'Messages', badge: inbox.unread + inbox.requests },
    ...(user.username ? [{ id: 'mine' as const, label: 'My posts' }] : []),
  ]

  return (
    <div className="space-y-4">
      <Tabs
        label="Social"
        tabs={tabs}
        value={tab}
        onChange={(id) => navigate(id === 'feed' ? '/social' : id === 'messages' ? '/social/messages' : '/social/mine', { keepScroll: false })}
      />

      {tab === 'feed' && openPost && <PostDetail id={openPost.id} myName={state.player.name} />}
      {tab === 'feed' && !openPost && <FeedScreen state={state} myName={state.player.name} startSharing={startSharing} />}

      {tab === 'messages' && (
        <MessagesScreen
          inbox={inbox}
          myName={state.player.name}
          conversationId={conversation?.id ?? null}
          onConversationClosed={() => {
            if (conversation) navigate('/social/messages', { replace: true })
          }}
        />
      )}

      {tab === 'mine' && user.username && <FeedScreen state={state} myName={state.player.name} username={user.username} />}

      <AnimatePresence>
        {player && <PlayerCardSheet username={player.username} myName={state.player.name} onClose={() => navigate('/social', { replace: true })} />}
      </AnimatePresence>
    </div>
  )
}
