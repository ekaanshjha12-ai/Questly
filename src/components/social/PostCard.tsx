import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { AnimatePresence, m as motion } from 'framer-motion'
import { Flag, HandHeart, Loader2, MessageSquare, MoreHorizontal, ScrollText, Send, Share2, ShieldCheck, Swords, Timer, Trash2, Trophy } from 'lucide-react'
import {
  addComment,
  appreciatePost,
  clubs as clubApi,
  deleteComment,
  deletePost,
  fetchComments,
  reportComment,
  reportPost,
  type Post,
  type PostComment,
  type PostRef,
  type Rarity,
} from '../../lib/api'
import { kindMeta, sharePostLink, timeAgo } from '../../lib/social'
import { PlayerAvatar } from '../ChallengeParts'
import { QUEST_TYPE_LABEL, RARITY_LABEL, rarityBorder } from '../ui/Tag'
import { useToast } from '../ui/Toast'

/** Mirrors COMMENT_MAX in server/engagement.js. */
const COMMENT_MAX = 500

/**
 * One entry in the Adventure Log: what someone shared, anything from their
 * record attached to it, and the ways to answer — appreciate it, comment,
 * challenge them to a duel, or pass the link on.
 */
export default function PostCard({
  post,
  club,
  commentsOpen = false,
  onOpenAuthor,
  onChallenge,
  onDeleted,
}: {
  post: Post
  club?: { slug: string; canModerate: boolean }
  /** Opens with the comments showing, as on the post's own page. */
  commentsOpen?: boolean
  onOpenAuthor: (username: string) => void
  onChallenge: (username: string) => void
  onDeleted: () => void
}) {
  const [menu, setMenu] = useState(false)
  const [reported, setReported] = useState(false)
  const [appreciations, setAppreciations] = useState(post.appreciations)
  const [appreciating, setAppreciating] = useState(false)
  const [commentCount, setCommentCount] = useState(post.comments)
  const [showComments, setShowComments] = useState(commentsOpen)
  const toast = useToast()
  const meta = kindMeta(post.kind)
  const author = post.author

  async function toggleAppreciation() {
    if (post.mine || !post.canRespond || appreciating) return
    const before = appreciations
    const on = !before.mine
    // Shown straight away, and put back if the server says no.
    setAppreciations({ count: Math.max(0, before.count + (on ? 1 : -1)), mine: on })
    setAppreciating(true)
    try {
      setAppreciations((await appreciatePost(post.id, on)).appreciations)
    } catch (err) {
      setAppreciations(before)
      toast.error('That did not go through', err instanceof Error ? err.message : undefined)
    } finally {
      setAppreciating(false)
    }
  }

  async function share() {
    try {
      if ((await sharePostLink(post.id)) === 'copied') toast.success('Link copied', 'Anyone signed in to Questly can open the post with it.')
    } catch {
      toast.error('Could not share', 'This browser would not copy the link.')
    }
  }

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
          <button type="button" onClick={() => setMenu((v) => !v)} aria-label="Post options" aria-expanded={menu} className="rounded-lg p-1 text-slate-500 hover:bg-ink-800 hover:text-slate-200">
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menu && (
            <div className="absolute right-0 top-7 z-10 w-40 overflow-hidden rounded-xl border border-ink-600 bg-ink-900 shadow-xl">
              {post.mine ? (
                <button
                  type="button"
                  onClick={() =>
                    void deletePost(post.id)
                      .then(onDeleted)
                      .catch((err) => toast.error('Could not delete', err instanceof Error ? err.message : undefined))
                  }
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ember-400 hover:bg-ink-800"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete post
                </button>
              ) : club?.canModerate ? (
                <button
                  type="button"
                  onClick={() =>
                    void clubApi
                      .removePost(club.slug, post.id)
                      .then(onDeleted)
                      .catch((err) => toast.error('Could not remove', err instanceof Error ? err.message : undefined))
                  }
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ember-400 hover:bg-ink-800"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove from club
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

      {post.ref && <RecordCard record={post.ref} />}

      {post.image && <img src={post.image} alt="" loading="lazy" className="mt-2.5 max-h-[28rem] w-full rounded-xl border border-ink-600 object-cover" />}

      {post.video && (
        <div className="mt-2.5 overflow-hidden rounded-xl border border-ink-600 bg-black">
          {/* Nothing downloads until play is pressed: the poster frame stands in. */}
          <video
            src={post.video.url}
            poster={post.video.poster}
            controls
            playsInline
            preload="none"
            className="mx-auto block max-h-[28rem] w-full object-contain"
            style={{ aspectRatio: `${post.video.width} / ${post.video.height}` }}
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-1 border-t border-ink-700/80 pt-2">
        <ActionButton
          icon={<HandHeart className="h-4 w-4" />}
          label={post.mine ? 'Appreciations' : appreciations.mine ? 'Appreciated' : 'Appreciate'}
          count={appreciations.count}
          pressed={post.mine ? undefined : appreciations.mine}
          highlight={appreciations.mine}
          inert={post.mine || !post.canRespond}
          onClick={() => void toggleAppreciation()}
        />
        <ActionButton
          icon={<MessageSquare className="h-4 w-4" />}
          label="Comment"
          count={commentCount}
          pressed={showComments}
          onClick={() => setShowComments((v) => !v)}
        />
        {!post.mine && author && <ActionButton icon={<Swords className="h-4 w-4" />} label="Challenge" onClick={() => onChallenge(author.username)} />}
        <ActionButton icon={<Share2 className="h-4 w-4" />} label="Share" onClick={() => void share()} className="ml-auto" />
      </div>

      <AnimatePresence initial={false}>
        {showComments && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <CommentThread post={post} onCount={setCommentCount} onOpenAuthor={onOpenAuthor} />
          </motion.div>
        )}
      </AnimatePresence>

      {reported && <p className="mt-2 text-[11px] text-slate-500">Thanks — this was sent to the admins.</p>}
    </article>
  )
}

function ActionButton({
  icon,
  label,
  count,
  pressed,
  highlight = false,
  inert = false,
  onClick,
  className = '',
}: {
  icon: ReactNode
  label: string
  count?: number
  pressed?: boolean
  /** Your own appreciation, in the reward colour. */
  highlight?: boolean
  /** Shows the count without being something to press. */
  inert?: boolean
  onClick: () => void
  className?: string
}) {
  const tone = highlight
    ? 'bg-reward-500/10 text-reward-300'
    : pressed
      ? 'bg-ink-800 text-slate-100'
      : inert
        ? 'text-slate-500'
        : 'text-slate-400 hover:bg-ink-800 hover:text-slate-100'
  return (
    <button
      type="button"
      onClick={inert ? undefined : onClick}
      aria-disabled={inert || undefined}
      aria-pressed={pressed}
      aria-label={count ? `${label}, ${count}` : label}
      title={label}
      className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors ${inert ? 'cursor-default' : ''} ${tone} ${className}`}
    >
      {icon}
      <span className="hidden min-[480px]:inline">{label}</span>
      {count ? <span className="tabular-nums">{count}</span> : null}
    </button>
  )
}

/* --- what a post can carry ---------------------------------------------------- */

const RARITY_TEXT: Record<Rarity, string> = {
  common: 'text-rarity-common',
  rare: 'text-rarity-rare',
  epic: 'text-rarity-epic',
  legendary: 'text-rarity-legendary',
}

function describeRecord(record: PostRef): { eyebrow: string; detail: string; frame: string; icon: ReactNode; stamp: string } {
  switch (record.kind) {
    case 'quest':
      return {
        eyebrow: 'Quest complete',
        detail: [QUEST_TYPE_LABEL[record.questType] ?? 'Quest', RARITY_LABEL[record.rarity], `+${record.xp} XP`].filter(Boolean).join(' · '),
        frame: rarityBorder(record.rarity) ?? 'border-ink-600',
        icon: <ScrollText className={`h-5 w-5 ${RARITY_TEXT[record.rarity] ?? 'text-slate-200'}`} />,
        stamp: record.verifiedBy ? 'Proof checked' : 'On record',
      }
    case 'duel':
      return {
        eyebrow: record.result === 'completed' ? 'Duel completed' : 'Duel over',
        detail: [record.opponent ? `vs ${record.opponent}` : null, `${record.days} days`, record.xp > 0 ? `+${record.xp} XP` : 'terms not met'].filter(Boolean).join(' · '),
        frame: 'border-danger-500/35',
        icon: <Swords className="h-5 w-5 text-danger-400" />,
        stamp: 'On record',
      }
    case 'achievement':
      return {
        eyebrow: 'Achievement unlocked',
        detail: record.description,
        frame: 'border-reward-500/40',
        icon: <Trophy className="h-5 w-5 text-reward-300" />,
        stamp: 'On record',
      }
    case 'focus':
      return {
        eyebrow: 'Focus session',
        detail: `${record.minutes} min of timed focus${record.completed ? ' · timer run to the end' : ''}`,
        frame: 'border-info-400/35',
        icon: <Timer className="h-5 w-5 text-info-400" />,
        stamp: 'Timed',
      }
  }
}

/** A quest, duel, achievement or focus session, as Questly recorded it. */
export function RecordCard({ record }: { record: PostRef }) {
  const view = describeRecord(record)
  return (
    <div className={`mt-2.5 flex items-start gap-3 rounded-xl border bg-ink-900/70 px-3 py-2.5 ${view.frame}`}>
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink-600 bg-ink-800">{view.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{view.eyebrow}</span>
          <span
            title="Attached from Questly's records, not typed in by the poster"
            className="flex items-center gap-1 whitespace-nowrap rounded-full border border-gold-500/40 bg-gold-500/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-gold-300"
          >
            <ShieldCheck className="h-3 w-3" aria-hidden /> {view.stamp}
          </span>
        </span>
        <span className="mt-0.5 block break-words text-sm font-semibold leading-snug text-slate-100">{record.title}</span>
        <span className="block text-[11px] text-slate-400">{view.detail}</span>
      </span>
    </div>
  )
}

/* --- comments ------------------------------------------------------------------ */

function CommentThread({
  post,
  onCount,
  onOpenAuthor,
}: {
  post: Post
  onCount: Dispatch<SetStateAction<number>>
  onOpenAuthor: (username: string) => void
}) {
  const [comments, setComments] = useState<PostComment[] | null>(null)
  /** Where the next page starts: the last comment the server sent, not one written here since. */
  const [cursor, setCursor] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  /** A remove or report waiting for its second tap. */
  const [armed, setArmed] = useState<string | null>(null)
  const [reported, setReported] = useState<Set<string>>(() => new Set())
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    fetchComments(post.id)
      .then((res) => {
        if (cancelled) return
        setComments(res.comments)
        setCursor(res.comments[res.comments.length - 1]?.createdAt ?? null)
        setMore(res.more)
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load the comments.'))
    return () => {
      cancelled = true
    }
  }, [post.id])

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(null), 4000)
    return () => clearTimeout(timer)
  }, [armed])

  async function loadMore() {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const res = await fetchComments(post.id, cursor)
      setComments((list) => {
        const have = new Set((list ?? []).map((c) => c.id))
        return [...(list ?? []), ...res.comments.filter((c) => !have.has(c.id))]
      })
      setCursor(res.comments[res.comments.length - 1]?.createdAt ?? cursor)
      setMore(res.more)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load more comments.')
    } finally {
      setLoadingMore(false)
    }
  }

  function fit(el: HTMLTextAreaElement | null) {
    if (!el) return
    el.style.height = 'auto'
    // scrollHeight leaves out the border, which would otherwise leave a scrollbar showing.
    el.style.height = `${Math.min(el.scrollHeight + el.offsetHeight - el.clientHeight, 112)}px`
  }

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await addComment(post.id, body)
      setComments((list) => [...(list ?? []), res.comment])
      onCount(res.comments)
      setDraft('')
      requestAnimationFrame(() => fit(inputRef.current))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post that comment.')
    } finally {
      setSending(false)
    }
  }

  async function act(comment: PostComment) {
    if (armed !== comment.id) {
      setArmed(comment.id)
      return
    }
    setArmed(null)
    setError(null)
    try {
      if (comment.canDelete) {
        await deleteComment(post.id, comment.id)
        setComments((list) => (list ?? []).filter((c) => c.id !== comment.id))
        onCount((n) => Math.max(0, n - 1))
      } else {
        await reportComment(comment.id, 'Reported from the Adventure Log')
        setReported((set) => new Set(set).add(comment.id))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.')
    }
  }

  return (
    <div className="mt-2 space-y-2 border-t border-ink-700/80 pt-2.5">
      {comments === null && !error && (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-gold-400" />
        </div>
      )}

      {comments?.length === 0 && (
        <p className="px-1 text-[11px] text-slate-500">{post.canRespond ? 'No comments yet. Say something encouraging.' : 'No comments yet.'}</p>
      )}

      {comments && comments.length > 0 && (
        <ul className="space-y-1.5">
          {comments.map((c) => {
            const canOpen = !c.mine && Boolean(c.author.username)
            return (
              <li key={c.id} className="flex gap-2">
                <button
                  type="button"
                  onClick={() => canOpen && onOpenAuthor(c.author.username as string)}
                  disabled={!canOpen}
                  aria-label={canOpen ? `Open ${c.author.name}'s card` : undefined}
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink-600 bg-ink-700 text-[11px] font-bold uppercase text-slate-200 disabled:cursor-default"
                >
                  {c.author.name.slice(0, 1)}
                </button>
                <div className="min-w-0 flex-1 rounded-xl bg-ink-800/80 px-2.5 py-1.5">
                  <p className="flex flex-wrap items-baseline gap-x-1.5 text-[11px]">
                    <span className="font-semibold text-slate-100">{c.mine ? 'You' : c.author.name}</span>
                    <span className="text-slate-500">{timeAgo(c.createdAt)}</span>
                  </p>
                  <p className="whitespace-pre-wrap break-words text-[13px] leading-snug text-slate-200">{c.body}</p>
                </div>
                {reported.has(c.id) ? (
                  <span className="self-center px-1 text-[10px] text-slate-500">Reported</span>
                ) : c.canDelete || !c.mine ? (
                  <button
                    type="button"
                    onClick={() => void act(c)}
                    aria-label={armed === c.id ? (c.canDelete ? 'Tap again to remove' : 'Tap again to report') : c.canDelete ? 'Remove comment' : 'Report comment'}
                    className={
                      armed === c.id
                        ? 'self-center whitespace-nowrap rounded-lg px-1.5 py-1 text-[10px] font-semibold text-danger-400 hover:bg-danger-500/10'
                        : 'self-center rounded-lg p-1.5 text-slate-600 hover:bg-ink-800 hover:text-slate-300'
                    }
                  >
                    {armed === c.id ? (c.canDelete ? 'Remove?' : 'Report?') : c.canDelete ? <Trash2 className="h-3.5 w-3.5" /> : <Flag className="h-3.5 w-3.5" />}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {more && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold text-slate-400 hover:bg-ink-800 hover:text-slate-200"
        >
          {loadingMore && <Loader2 className="h-3 w-3 animate-spin" />} Show more comments
        </button>
      )}

      {post.canRespond ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.slice(0, COMMENT_MAX))
              fit(e.target)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void send()
              }
            }}
            rows={1}
            placeholder="Add a comment…"
            aria-label="Add a comment"
            className="max-h-28 min-h-[38px] flex-1 resize-none rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-gold-500/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Post comment"
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 text-onAccent disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      ) : (
        <p className="px-1 text-[11px] text-slate-500">Only club members can comment on club posts.</p>
      )}
      {draft.length > COMMENT_MAX - 80 && (
        <p className="px-1 text-right text-[10px] tabular-nums text-slate-500">
          {draft.length}/{COMMENT_MAX}
        </p>
      )}
      {error && <p className="px-1 text-xs text-danger-400">{error}</p>}
    </div>
  )
}
