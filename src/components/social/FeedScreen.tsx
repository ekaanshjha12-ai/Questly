import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Flag, ImagePlus, Loader2, Lock, MoreHorizontal, Sparkles, Trash2, X } from 'lucide-react'
import type { AppState } from '../../types'
import {
  ApiError,
  createPost,
  deletePost,
  fetchFeed,
  fetchUnlocks,
  reportPost,
  type Post,
  type PostKind,
} from '../../lib/api'
import { POST_KINDS, kindMeta, preparePostImage, shareMoments, timeAgo, type ShareMoment } from '../../lib/social'
import { PlayerAvatar } from '../ChallengeParts'
import PlayerCardSheet from '../PlayerCardSheet'

/**
 * The feed: what other ambitious people are doing and learning, and a place to
 * share your own.
 *
 * Today's finished work — quests, focus time, habits — is offered at the top as
 * posts ready to share. That is the bridge from Focus: the work happens there,
 * and it arrives here already written.
 */
export default function FeedScreen({
  state,
  myName,
  username,
  startSharing,
}: {
  state: AppState
  myName: string
  /** Only this player's posts, for their own card page. */
  username?: string
  /** Opened with the composer already up — coming straight from Focus. */
  startSharing?: boolean
}) {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [composing, setComposing] = useState<ShareMoment | 'blank' | null>(startSharing ? 'blank' : null)
  const [unlocks, setUnlocks] = useState<{ level: number; photo: number; imagesChecked: boolean } | null>(null)

  const moments = useMemo(() => (username ? [] : shareMoments(state)), [state, username])

  const load = useCallback(async () => {
    try {
      const res = await fetchFeed(undefined, username)
      setPosts(res.posts)
      setMore(res.more)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the feed.')
    }
  }, [username])

  useEffect(() => {
    void load()
    fetchUnlocks()
      .then((u) => setUnlocks({ level: u.level, photo: u.unlocks.photo, imagesChecked: u.imagesChecked }))
      .catch(() => setUnlocks(null))
  }, [load])

  async function loadMore() {
    if (!posts?.length) return
    setLoadingMore(true)
    try {
      const res = await fetchFeed(posts[posts.length - 1].createdAt, username)
      setPosts((p) => [...(p ?? []), ...res.posts])
      setMore(res.more)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="space-y-4">
      {!username && (
        <>
          {moments.length > 0 && !composing && (
            <div className="rounded-2xl border border-gold-500/40 bg-gold-500/10 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                <Sparkles className="h-3.5 w-3.5 text-gold-400" /> Share today's work
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {moments.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setComposing(m)}
                    className="rounded-full border border-ink-600 bg-ink-850 px-2.5 py-1 text-[11px] text-slate-200 hover:border-gold-500/50"
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {composing ? (
            <Composer
              key={typeof composing === 'string' ? 'blank' : composing.id}
              seed={typeof composing === 'string' ? null : composing}
              myName={myName}
              unlocks={unlocks}
              onCancel={() => setComposing(null)}
              onPosted={(post) => {
                setPosts((p) => [post, ...(p ?? [])])
                setComposing(null)
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setComposing('blank')}
              className="flex w-full items-center gap-3 rounded-2xl border border-ink-600 bg-ink-850 p-3 text-left text-sm text-slate-400 hover:border-ink-500"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-gold-500 to-ember-500 font-display font-bold text-onAccent">
                {myName.slice(0, 1).toUpperCase()}
              </span>
              Share a win, a lesson, your progress…
            </button>
          )}
        </>
      )}

      {error && !posts && <p className="rounded-xl border border-ink-600 bg-ink-850 px-3 py-4 text-center text-sm text-slate-400">{error}</p>}
      {!posts && !error && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-gold-400" />
        </div>
      )}

      {posts && posts.length === 0 && (
        <p className="rounded-2xl border border-dashed border-ink-600 px-4 py-8 text-center text-sm text-slate-500">
          {username ? 'No posts yet.' : 'Nothing here yet. Be the first to share what you are working on.'}
        </p>
      )}

      <AnimatePresence initial={false}>
        {posts?.map((post) => (
          <motion.div key={post.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
            <PostCard
              post={post}
              onOpenAuthor={(u) => setViewing(u)}
              onDeleted={() => setPosts((p) => (p ?? []).filter((x) => x.id !== post.id))}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {more && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-ink-600 py-2.5 text-xs text-slate-300 hover:border-ink-500"
        >
          {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Load more
        </button>
      )}

      <AnimatePresence>
        {viewing && <PlayerCardSheet username={viewing} myName={myName} onClose={() => setViewing(null)} />}
      </AnimatePresence>
    </div>
  )
}

/* --- composing ------------------------------------------------------------- */

function Composer({
  seed,
  myName,
  unlocks,
  onCancel,
  onPosted,
}: {
  seed: ShareMoment | null
  myName: string
  unlocks: { level: number; photo: number; imagesChecked: boolean } | null
  onCancel: () => void
  onPosted: (post: Post) => void
}) {
  const [kind, setKind] = useState<PostKind>(seed?.kind ?? 'update')
  const [body, setBody] = useState(seed?.text ?? '')
  const [image, setImage] = useState<{ base64: string; mediaType: string; dataUrl: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const photoLocked = unlocks ? unlocks.level < unlocks.photo : false
  const photoUnavailable = unlocks ? !unlocks.imagesChecked : false

  async function pick(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      setImage(await preparePostImage(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That picture could not be used.')
    }
  }

  async function post() {
    if (!body.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const { post: created } = await createPost({
        kind,
        body: body.trim(),
        ...(image ? { imageBase64: image.base64, mediaType: image.mediaType } : {}),
      })
      onPosted(created)
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Could not post that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-ink-600 bg-ink-850 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-100">Posting as {myName}</p>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="rounded-lg p-1 text-slate-500 hover:bg-ink-800 hover:text-slate-200">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {POST_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKind(k.id)}
            aria-pressed={kind === k.id}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              kind === k.id ? 'border-gold-500 bg-gold-500/15 text-slate-50' : 'border-ink-600 bg-ink-800 text-slate-300'
            }`}
          >
            {k.emoji} {k.label}
          </button>
        ))}
      </div>

      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 1000))}
        rows={4}
        placeholder={kindMeta(kind).prompt}
        className="mt-2 w-full resize-none rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-gold-500/50 focus:outline-none"
      />

      {image && (
        <div className="relative mt-2 overflow-hidden rounded-xl border border-ink-600">
          <img src={image.dataUrl} alt="Your photo" className="max-h-72 w-full object-cover" />
          <button
            type="button"
            onClick={() => setImage(null)}
            aria-label="Remove photo"
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {error && <p className="mt-2 rounded-lg border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-xs text-ember-400">{error}</p>}

      <div className="mt-2 flex items-center justify-between gap-2">
        {photoLocked ? (
          <span className="flex items-center gap-1 text-[11px] text-slate-500">
            <Lock className="h-3.5 w-3.5" /> Photos unlock at level {unlocks?.photo}
          </span>
        ) : photoUnavailable ? (
          <span className="text-[11px] text-slate-500">Photo posts are not available on this server.</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-300 hover:bg-ink-800"
            >
              <ImagePlus className="h-4 w-4" /> {image ? 'Change photo' : 'Add photo'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void pick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-slate-500">{body.length}/1000</span>
          <button
            type="button"
            onClick={() => void post()}
            disabled={!body.trim() || busy}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-onAccent disabled:opacity-40"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {busy && image ? 'Checking photo…' : 'Post'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

/* --- a post ---------------------------------------------------------------- */

function PostCard({ post, onOpenAuthor, onDeleted }: { post: Post; onOpenAuthor: (username: string) => void; onDeleted: () => void }) {
  const [menu, setMenu] = useState(false)
  const [reported, setReported] = useState(false)
  const meta = kindMeta(post.kind)
  const author = post.author

  return (
    <article className="rounded-2xl border border-ink-600 bg-ink-850 p-3.5">
      <header className="flex items-start gap-2.5">
        {author && (
          <button type="button" onClick={() => !post.mine && onOpenAuthor(author.username)} className="shrink-0" aria-label={`Open ${author.name}'s card`}>
            <PlayerAvatar player={author} size={38} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
            <button type="button" onClick={() => author && !post.mine && onOpenAuthor(author.username)} className="font-semibold text-slate-100 hover:underline">
              {author?.name ?? 'Someone'}
            </button>
            {author && <span className="text-[11px] text-slate-500">@{author.username}</span>}
          </p>
          <p className="text-[11px] text-slate-500">
            {author ? `${author.rank} · Level ${author.level} · ` : ''}
            {timeAgo(post.createdAt)}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-ink-600 bg-ink-800 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
          {meta.emoji} {meta.label}
        </span>
        <div className="relative">
          <button type="button" onClick={() => setMenu((v) => !v)} aria-label="Post options" className="rounded-lg p-1 text-slate-500 hover:bg-ink-800 hover:text-slate-200">
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menu && (
            <div className="absolute right-0 top-7 z-10 w-36 overflow-hidden rounded-xl border border-ink-600 bg-ink-900 shadow-xl">
              {post.mine ? (
                <button
                  type="button"
                  onClick={() => void deletePost(post.id).then(onDeleted)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ember-400 hover:bg-ink-800"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete post
                </button>
              ) : (
                <button
                  type="button"
                  disabled={reported}
                  onClick={() =>
                    void reportPost(post.id, 'Reported from the feed').then(() => {
                      setReported(true)
                      setMenu(false)
                    })
                  }
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-ink-800 disabled:opacity-50"
                >
                  <Flag className="h-3.5 w-3.5" /> {reported ? 'Reported' : 'Report post'}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <p className="mt-2.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-100">{post.body}</p>

      {post.image && (
        <img src={post.image} alt="" loading="lazy" className="mt-2.5 max-h-[28rem] w-full rounded-xl border border-ink-600 object-cover" />
      )}

      {reported && <p className="mt-2 text-[11px] text-slate-500">Thanks — this was sent to the admins.</p>}
    </article>
  )
}
