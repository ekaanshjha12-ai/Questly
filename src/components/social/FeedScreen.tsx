import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Film, ImagePlus, Loader2, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react'
import type { AppState } from '../../types'
import {
  ApiError,
  createPost,
  fetchFeed,
  fetchMediaAvailability,
  uploadPostVideo,
  type Post,
  type PostKind,
  type PostVideo,
  type RewardSummary,
} from '../../lib/api'
import {
  POST_KINDS,
  formatDuration,
  kindMeta,
  preparePostImage,
  readVideoFile,
  refKey,
  clearShareDraft,
  readShareDraft,
  shareMoments,
  type ShareMoment,
  type ShareRef,
} from '../../lib/social'
import PlayerCardSheet from '../PlayerCardSheet'
import PostCard from './PostCard'
import { useGame } from '../../game/GameProvider'

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
  club,
}: {
  state: AppState
  myName: string
  /** Only this player's posts, for their own card page. */
  username?: string
  /** Opened with the composer already up — coming straight from Focus. */
  startSharing?: boolean
  /** A club's own feed: who may post, announce and remove posts is the server's call; this only shapes the controls. */
  club?: { slug: string; canPost: boolean; canAnnounce: boolean; canModerate: boolean }
}) {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<{ username: string; challenge: boolean } | null>(null)
  /** Records this player has already posted about, so they are not offered again. */
  const [shared, setShared] = useState<Set<string>>(() => new Set())
  const [composing, setComposing] = useState<ShareMoment | 'blank' | null>(() => (startSharing ? readShareDraft() ?? 'blank' : null))
  // The draft is spent once the composer has actually opened with it.
  useEffect(() => {
    if (startSharing) clearShareDraft()
  }, [startSharing])
  const [media, setMedia] = useState<MediaAvailability | null>(null)
  const { snapshot, applyRewards } = useGame()

  const moments = useMemo(
    () => (username || club ? [] : shareMoments(state, snapshot).filter((m) => !m.ref || !shared.has(refKey(m.ref)))),
    [state, snapshot, username, club, shared],
  )

  const load = useCallback(async () => {
    try {
      const res = await fetchFeed(undefined, username, club?.slug)
      setPosts(res.posts)
      setMore(res.more)
      if (res.shared) setShared(new Set(res.shared))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the feed.')
    }
  }, [username, club?.slug])

  useEffect(() => {
    void load()
    fetchMediaAvailability()
      .then((u) => setMedia({ photos: u.imagesChecked, videos: u.videosAvailable }))
      .catch(() => setMedia(null))
  }, [load])

  async function loadMore() {
    if (!posts?.length) return
    setLoadingMore(true)
    try {
      const res = await fetchFeed(posts[posts.length - 1].createdAt, username, club?.slug)
      setPosts((p) => [...(p ?? []), ...res.posts])
      setMore(res.more)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="space-y-4">
      {!username && (!club || club.canPost) && (
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
              media={media}
              club={club}
              onCancel={() => setComposing(null)}
              onPosted={(post, rewards) => {
                setPosts((p) => [post, ...(p ?? [])])
                setComposing(null)
                if (post.ref) setShared((s) => new Set(s).add(refKey(post.ref as { kind: string; id: string })))
                applyRewards(rewards)
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
              {club ? 'Share with the club…' : 'Share a win, a lesson, your progress…'}
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
          {username ? 'No posts yet.' : club ? 'The club feed is quiet. Members’ posts and announcements appear here.' : 'Nothing here yet. Be the first to share what you are working on.'}
        </p>
      )}

      <AnimatePresence initial={false}>
        {posts?.map((post) => (
          <motion.div key={post.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
            <PostCard
              post={post}
              club={club}
              onOpenAuthor={(u) => setViewing({ username: u, challenge: false })}
              onChallenge={(u) => setViewing({ username: u, challenge: true })}
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
        {viewing && <PlayerCardSheet username={viewing.username} myName={myName} startChallenge={viewing.challenge} onClose={() => setViewing(null)} />}
      </AnimatePresence>
    </div>
  )
}

/* --- composing ------------------------------------------------------------- */

/** Whether this server can check, and so accept, pictures and videos. */
interface MediaAvailability {
  photos: boolean
  videos: boolean
}

type Attachment =
  | { type: 'photo'; base64: string; mediaType: string; dataUrl: string }
  | {
      type: 'video'
      file: File
      previewUrl: string
      durationMs: number | null
      stage: 'uploading' | 'checking' | 'ready' | 'failed'
      progress: number
      video: PostVideo | null
      error: string | null
    }

function Composer({
  seed,
  myName,
  media,
  club,
  onCancel,
  onPosted,
}: {
  seed: ShareMoment | null
  myName: string
  media: MediaAvailability | null
  club?: { slug: string; canAnnounce: boolean }
  onCancel: () => void
  onPosted: (post: Post, rewards: RewardSummary | null) => void
}) {
  const [kind, setKind] = useState<PostKind>(seed?.kind ?? 'update')
  const [body, setBody] = useState(seed?.text ?? '')
  const [record, setRecord] = useState<ShareRef | null>(seed?.ref ?? null)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<AbortController | null>(null)
  const previewRef = useRef<string | null>(null)

  // Whatever is still uploading when the composer closes is abandoned, and the
  // local preview's memory handed back.
  useEffect(
    () => () => {
      uploadRef.current?.abort()
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [],
  )

  function clearAttachment() {
    uploadRef.current?.abort()
    uploadRef.current = null
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = null
    setAttachment(null)
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const image = await preparePostImage(file)
      clearAttachment()
      setAttachment({ type: 'photo', ...image })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That picture could not be used.')
    }
  }

  /** Uploads straight away, so the video is checked while the words are still
   * being written and Post is ready the moment they are. */
  function startUpload(file: File, previewUrl: string, durationMs: number | null) {
    uploadRef.current?.abort()
    const controller = new AbortController()
    uploadRef.current = controller
    const update = (patch: Partial<Extract<Attachment, { type: 'video' }>>) =>
      setAttachment((a) => (a?.type === 'video' && a.previewUrl === previewUrl ? { ...a, ...patch } : a))
    setAttachment({ type: 'video', file, previewUrl, durationMs, stage: 'uploading', progress: 0, video: null, error: null })
    uploadPostVideo(file, {
      signal: controller.signal,
      onProgress: (progress) => update({ progress }),
      onUploaded: () => update({ stage: 'checking', progress: 1 }),
    })
      .then(({ video }) => update({ stage: 'ready', video, durationMs: video.durationMs }))
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'aborted') return
        update({ stage: 'failed', error: err instanceof Error ? err.message : 'That video could not be added.' })
      })
  }

  async function pickVideo(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const { previewUrl, durationMs } = await readVideoFile(file)
      clearAttachment()
      previewRef.current = previewUrl
      startUpload(file, previewUrl, durationMs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That video could not be used.')
    }
  }

  const video = attachment?.type === 'video' ? attachment : null
  const videoPending = Boolean(video && video.stage !== 'ready')

  async function post() {
    if (!body.trim() || busy || videoPending) return
    setBusy(true)
    setError(null)
    try {
      const { post: created, rewards } = await createPost({
        kind,
        body: body.trim(),
        ...(club ? { club: club.slug } : {}),
        ...(attachment?.type === 'photo' ? { imageBase64: attachment.base64, mediaType: attachment.mediaType } : {}),
        ...(attachment?.type === 'video' && attachment.video ? { videoId: attachment.video.id } : {}),
        ...(record ? { ref: { kind: record.kind, id: record.id } } : {}),
      })
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
      previewRef.current = null
      onPosted(created, rewards ?? null)
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'already_shared'
          ? 'You have already posted about this. Remove the attachment to post anyway.'
          : err instanceof Error
            ? err.message
            : 'Could not post that.',
      )
    } finally {
      setBusy(false)
    }
  }

  const postLabel =
    busy && attachment?.type === 'photo'
      ? 'Checking photo…'
      : video?.stage === 'uploading'
        ? `${Math.round(video.progress * 100)}%`
        : video?.stage === 'checking'
          ? 'Checking…'
          : 'Post'

  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-ink-600 bg-ink-850 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-100">Posting as {myName}</p>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="rounded-lg p-1 text-slate-500 hover:bg-ink-800 hover:text-slate-200">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {[...POST_KINDS, ...(club?.canAnnounce ? [kindMeta('announcement')] : [])].map((k) => (
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

      {record && (
        <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-gold-500/35 bg-gold-500/5 px-3 py-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-gold-400" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-slate-100">{record.title}</span>
            <span className="block truncate text-[11px] text-slate-400">
              {record.detail ? `${record.detail} · ` : ''}attached from your record
            </span>
          </span>
          <button type="button" onClick={() => setRecord(null)} aria-label="Remove attachment" className="rounded-lg p-1 text-slate-500 hover:bg-ink-800 hover:text-slate-200">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 1000))}
        rows={4}
        placeholder={kindMeta(kind).prompt}
        className="mt-2 w-full resize-none rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-gold-500/50 focus:outline-none"
      />

      {attachment?.type === 'photo' && (
        <div className="relative mt-2 overflow-hidden rounded-xl border border-ink-600">
          <img src={attachment.dataUrl} alt="Your photo" className="max-h-72 w-full object-cover" />
          <RemoveButton label="Remove photo" onClick={clearAttachment} />
        </div>
      )}

      {video && (
        <div className="relative mt-2 overflow-hidden rounded-xl border border-ink-600 bg-black">
          <video
            src={video.previewUrl}
            poster={video.video?.poster}
            controls
            muted
            playsInline
            preload="metadata"
            className="max-h-72 w-full object-contain"
          />
          <RemoveButton label="Remove video" onClick={clearAttachment} />
          <div className="border-t border-ink-600 bg-ink-850 px-3 py-2">
            {video.stage === 'uploading' && (
              <>
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading
                  </span>
                  <span className="tabular-nums">{Math.round(video.progress * 100)}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-gold-500 to-ember-500 transition-[width] duration-200"
                    style={{ width: `${Math.round(video.progress * 100)}%` }}
                  />
                </div>
              </>
            )}
            {video.stage === 'checking' && (
              <p className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <ShieldCheck className="h-3.5 w-3.5 animate-pulse text-gold-400" /> Checking it's OK to share and preparing it to play everywhere…
              </p>
            )}
            {video.stage === 'ready' && (
              <p className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <Check className="h-3.5 w-3.5 text-gold-400" /> Ready to post
                {video.durationMs !== null && <span className="text-slate-500">· {formatDuration(video.durationMs)}</span>}
              </p>
            )}
            {video.stage === 'failed' && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-ember-400">{video.error}</p>
                {!/cannot be posted|at most|not a video/i.test(video.error ?? '') && (
                  <button
                    type="button"
                    onClick={() => startUpload(video.file, video.previewUrl, video.durationMs)}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-ink-600 px-2 py-1 text-[11px] text-slate-200 hover:border-ink-500"
                  >
                    <RotateCcw className="h-3 w-3" /> Try again
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-2 rounded-lg border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-xs text-ember-400">{error}</p>}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            disabled={media?.photos === false}
            title={media?.photos === false ? 'Photo posts are not available on this server.' : undefined}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-300 hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ImagePlus className="h-4 w-4" /> Photo
          </button>
          <button
            type="button"
            onClick={() => videoRef.current?.click()}
            disabled={media?.videos === false}
            title={media?.videos === false ? 'Video posts are not available on this server.' : 'Up to 60 seconds'}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-300 hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Film className="h-4 w-4" /> Video
          </button>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void pickPhoto(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <input
            ref={videoRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              void pickVideo(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[10px] tabular-nums text-slate-500 min-[420px]:inline">{body.length}/1000</span>
          <button
            type="button"
            onClick={() => void post()}
            disabled={!body.trim() || busy || videoPending}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-onAccent disabled:opacity-40"
          >
            {(busy || (videoPending && video?.stage !== 'failed')) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {postLabel}
          </button>
        </div>
      </div>
      {(media?.photos === false || media?.videos === false) && (
        <p className="mt-1 text-[10px] text-slate-500">
          {media.photos === false ? 'Photos and videos are' : 'Videos are'} not available on this server: there is no safety check set up to look
          at them.
        </p>
      )}
    </motion.div>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white">
      <X className="h-3.5 w-3.5" />
    </button>
  )
}
