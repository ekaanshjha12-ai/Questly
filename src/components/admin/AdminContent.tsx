import { useCallback, useEffect, useState } from 'react'
import { Film, Flag, Image as ImageIcon, Loader2, MessageSquare, Paperclip } from 'lucide-react'
import { adminComments, adminPosts, adminRemoveComment, adminRemovePostById, type AdminComment, type AdminPost } from '../../lib/api'
import { kindMeta } from '../../lib/social'
import ActionWithNote from './ActionWithNote'

type View = 'live' | 'reported' | 'removed' | 'comments'

const VIEWS: { id: View; label: string }[] = [
  { id: 'live', label: 'Live posts' },
  { id: 'reported', label: 'Reported' },
  { id: 'removed', label: 'Removed' },
  { id: 'comments', label: 'Comments' },
]

/** Everything on the Adventure Log, newest first, with a takedown that tells the author why. */
export default function AdminContent() {
  const [view, setView] = useState<View>('live')
  const [posts, setPosts] = useState<AdminPost[] | null>(null)
  const [comments, setComments] = useState<AdminComment[] | null>(null)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      if (view === 'comments') {
        const res = await adminComments()
        setComments(res.comments)
        setMore(res.more)
      } else {
        const res = await adminPosts(view)
        setPosts(res.posts)
        setMore(res.more)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load content.')
    }
  }, [view])

  useEffect(() => {
    setPosts(null)
    setComments(null)
    void load()
  }, [load])

  async function loadMore() {
    setLoadingMore(true)
    try {
      if (view === 'comments' && comments?.length) {
        const res = await adminComments(comments[comments.length - 1].createdAt)
        setComments([...comments, ...res.comments])
        setMore(res.more)
      } else if (view !== 'comments' && posts?.length) {
        const res = await adminPosts(view, posts[posts.length - 1].createdAt)
        setPosts([...posts, ...res.posts])
        setMore(res.more)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  const loading = view === 'comments' ? !comments : !posts

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 rounded-xl border border-ink-600 bg-ink-850/70 p-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            aria-pressed={view === v.id}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${view === v.id ? 'bg-ink-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">{error}</p>}
      {loading && !error && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
        </div>
      )}

      {view !== 'comments' && posts?.length === 0 && <Empty text={view === 'reported' ? 'No reported posts are live.' : view === 'removed' ? 'Nothing has been removed.' : 'No posts yet.'} />}
      {view === 'comments' && comments?.length === 0 && <Empty text="No comments yet." />}

      {view !== 'comments' &&
        posts?.map((post) => (
          <article key={post.id} className={`rounded-xl border p-3 ${post.removedAt ? 'border-ink-700 bg-ink-900/40 opacity-80' : 'border-ink-600 bg-ink-850/60'}`}>
            <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span className="font-semibold text-slate-200">@{post.author.username ?? 'unknown'}</span>
              <span className="text-slate-500">{post.author.email}</span>
              <span className="text-slate-500">· {new Date(post.createdAt).toLocaleString()}</span>
              <span className="rounded-full border border-ink-600 bg-ink-800 px-2 py-0.5 text-slate-300">
                {kindMeta(post.kind).emoji} {kindMeta(post.kind).label}
              </span>
              {post.club && <span className="rounded-full border border-arcane-400/40 px-2 py-0.5 text-arcane-400">{post.club}</span>}
              {post.openReports > 0 && (
                <span className="flex items-center gap-1 rounded-full border border-danger-500/40 bg-danger-500/10 px-2 py-0.5 font-semibold text-danger-400">
                  <Flag className="h-3 w-3" aria-hidden /> {post.openReports} open report{post.openReports === 1 ? '' : 's'}
                </span>
              )}
            </header>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">{post.body}</p>
            {post.image && <img src={post.image} alt="" loading="lazy" className="mt-2 max-h-48 rounded-lg border border-ink-600 object-cover" />}
            <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              {post.hasImage && !post.image && (
                <span className="flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" aria-hidden /> had a picture
                </span>
              )}
              {post.hasVideo && (
                <span className="flex items-center gap-1">
                  <Film className="h-3 w-3" aria-hidden /> video
                </span>
              )}
              {post.attached && (
                <span className="flex items-center gap-1">
                  <Paperclip className="h-3 w-3" aria-hidden /> {post.attached} attached
                </span>
              )}
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" aria-hidden /> {post.comments}
              </span>
              <span>{post.appreciations} appreciation{post.appreciations === 1 ? '' : 's'}</span>
              {post.removedAt && <span className="text-danger-400">removed {new Date(post.removedAt).toLocaleString()}</span>}
            </p>
            {!post.removedAt && (
              <div className="mt-2.5">
                <ActionWithNote
                  label="Remove post"
                  confirmLabel="Remove"
                  placeholder="Why — the author is told this"
                  onConfirm={async (note) => {
                    await adminRemovePostById(post.id, note || undefined)
                    setPosts((list) => (list ?? []).filter((p) => p.id !== post.id))
                  }}
                />
              </div>
            )}
          </article>
        ))}

      {view === 'comments' &&
        comments?.map((comment) => (
          <article key={comment.id} className="rounded-xl border border-ink-600 bg-ink-850/60 p-3">
            <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span className="font-semibold text-slate-200">@{comment.author.username ?? 'unknown'}</span>
              <span className="text-slate-500">{comment.author.email}</span>
              <span className="text-slate-500">· {new Date(comment.createdAt).toLocaleString()}</span>
              <span className="text-slate-500">on post {comment.postId.slice(0, 8)}</span>
              {comment.openReports > 0 && (
                <span className="flex items-center gap-1 rounded-full border border-danger-500/40 bg-danger-500/10 px-2 py-0.5 font-semibold text-danger-400">
                  <Flag className="h-3 w-3" aria-hidden /> reported
                </span>
              )}
            </header>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">{comment.body}</p>
            <div className="mt-2.5">
              <ActionWithNote
                label="Remove comment"
                confirmLabel="Remove"
                placeholder="Why — the author is told this"
                onConfirm={async (note) => {
                  await adminRemoveComment(comment.id, note || undefined)
                  setComments((list) => (list ?? []).filter((c) => c.id !== comment.id))
                }}
              />
            </div>
          </article>
        ))}

      {more && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-ink-600 py-2 text-xs text-slate-300 hover:border-ink-500"
        >
          {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Load more
        </button>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-ink-600 px-3 py-8 text-center text-xs text-slate-500">{text}</p>
}
