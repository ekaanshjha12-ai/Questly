import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { fetchPost, type Post } from '../../lib/api'
import { useRouter } from '../../app/router'
import { BackLink } from '../../app/AppShell'
import PlayerCardSheet from '../PlayerCardSheet'
import PostCard from './PostCard'

/**
 * A post's own page, with its comments open: where a shared link, or a
 * notification about an appreciation or a comment, lands.
 */
export default function PostDetail({ id, myName }: { id: string; myName: string }) {
  const [post, setPost] = useState<Post | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<{ username: string; challenge: boolean } | null>(null)
  const { navigate } = useRouter()

  useEffect(() => {
    let cancelled = false
    setPost(null)
    setError(null)
    fetchPost(id)
      .then((res) => !cancelled && setPost(res.post))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'That post is not available.'))
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <div className="space-y-3">
      <BackLink to="/social" label="Adventure Log" />

      {error && <p className="rounded-2xl border border-dashed border-ink-600 px-4 py-8 text-center text-sm text-slate-400">{error}</p>}

      {!post && !error && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
        </div>
      )}

      {post && (
        <PostCard
          key={post.id}
          post={post}
          commentsOpen
          onOpenAuthor={(username) => setViewing({ username, challenge: false })}
          onChallenge={(username) => setViewing({ username, challenge: true })}
          onDeleted={() => navigate('/social', { replace: true })}
        />
      )}

      <AnimatePresence>
        {viewing && (
          <PlayerCardSheet username={viewing.username} myName={myName} startChallenge={viewing.challenge} onClose={() => setViewing(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
