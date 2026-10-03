import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Heart, MessageCircle, Reply, Send, X } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import type { MarketplaceListing, ProductComment } from '../../types'
import { addProductComment, getProductComments, setProductCommentReaction } from '../../services/listingApi'
import { useCurrency } from '../../lib/CurrencyContext'
import { IconButton } from '../common/Button'

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'
}

function commentTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function CommentBubble({ comment, onReply, onToggleLike, busy, canReply = true }: {
  comment: ProductComment
  onReply: (comment: ProductComment) => void
  onToggleLike: (comment: ProductComment) => void
  busy: boolean
  canReply?: boolean
}) {
  const name = comment.user.displayName?.trim() || 'QuickResell member'
  return <article className="flex items-start gap-2.5">
    {comment.user.avatarUrl
      ? <img src={comment.user.avatarUrl} alt="" className="mt-0.5 size-9 shrink-0 rounded-full bg-[#edf1ed] object-cover" />
      : <span aria-hidden="true" className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-[#e8f0e9] text-[11px] font-bold text-[#456555]">{initials(name)}</span>}
    <div className="min-w-0">
      <div className="max-w-full rounded-2xl bg-[#f0f2f5] px-3.5 py-2.5">
        <p className="text-xs font-semibold text-[#263238]">{name}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-[#27313a]">{comment.content}</p>
      </div>
      <div className="ml-3 mt-1 flex items-center gap-3 text-[10px]">
        <time dateTime={comment.createdAt} className="text-[#8a939b]">{commentTime(comment.createdAt)}</time>
        <button type="button" disabled={busy} onClick={() => onToggleLike(comment)} aria-pressed={comment.likedByMe} className={`inline-flex min-h-7 items-center gap-1 font-semibold transition disabled:opacity-50 ${comment.likedByMe ? 'text-[#315f9b]' : 'text-[#77838a] hover:text-[#315f9b]'}`}><Heart size={12} className={comment.likedByMe ? 'fill-current' : ''} />{comment.likedByMe ? 'Liked' : 'Like'}</button>
        {canReply && <button type="button" onClick={() => onReply(comment)} className="inline-flex min-h-7 items-center gap-1 font-semibold text-[#77838a] transition hover:text-[#315f9b]"><Reply size={12} />Reply</button>}
        {comment.likeCount > 0 && <span className="text-[#77838a]">{comment.likeCount} {comment.likeCount === 1 ? 'like' : 'likes'}</span>}
      </div>
    </div>
  </article>
}

export function ProductCommentsSheet({ listing, open, session, emailConfirmed, onClose, onRequestSignIn, onCountChange }: {
  listing: MarketplaceListing
  open: boolean
  session: Session | null
  emailConfirmed: boolean
  onClose: () => void
  onRequestSignIn: () => void
  onCountChange: (listingId: string, count: number) => void
}) {
  const { formatUsd } = useCurrency()
  const [comments, setComments] = useState<ProductComment[]>([])
  const [commentsCount, setCommentsCount] = useState(listing.commentsCount ?? 0)
  const [content, setContent] = useState('')
  const [replyingTo, setReplyingTo] = useState<ProductComment | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [reactionSavingId, setReactionSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const commentsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    let cancelled = false
    void getProductComments(listing.id, session).then((result) => {
      if (cancelled) return
      setComments(result.items)
      setCommentsCount(result.commentsCount)
      onCountChange(listing.id, result.commentsCount)
    }).catch((caught: unknown) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load product comments.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, listing.id, onClose, onCountChange, session])

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [comments.length])

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session) {
      onRequestSignIn()
      return
    }
    if (!emailConfirmed) {
      setError('Confirm your email before commenting.')
      return
    }
    const message = content.trim()
    if (!message || submitting) return

    setSubmitting(true)
    setError('')
    try {
      const result = await addProductComment(listing.id, message, session, replyingTo?.id)
      if (replyingTo) {
        setComments((current) => current.map((comment) => comment.id === replyingTo.id
          ? { ...comment, replies: [...comment.replies, result.comment] }
          : comment))
      } else {
        setComments((current) => [...current, result.comment])
      }
      setCommentsCount(result.commentsCount)
      onCountChange(listing.id, result.commentsCount)
      setContent('')
      setReplyingTo(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your comment could not be posted.')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleLike = async (comment: ProductComment) => {
    if (!session) {
      onRequestSignIn()
      return
    }
    if (!emailConfirmed) {
      setError('Confirm your email before reacting.')
      return
    }
    if (reactionSavingId) return

    setReactionSavingId(comment.id)
    setError('')
    try {
      const result = await setProductCommentReaction(listing.id, comment.id, !comment.likedByMe, session)
      const updateComment = (item: ProductComment): ProductComment => item.id === comment.id
        ? { ...item, likedByMe: result.liked, likeCount: result.likeCount }
        : { ...item, replies: item.replies.map(updateComment) }
      setComments((current) => current.map(updateComment))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your reaction could not be saved.')
    } finally {
      setReactionSavingId(null)
    }
  }

  const displayName = session?.user.user_metadata.full_name
    ?? session?.user.user_metadata.name
    ?? session?.user.email
    ?? 'Your account'

  return createPortal(<AnimatePresence>{open && <motion.div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#101a17]/55 sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <motion.section role="dialog" aria-modal="true" aria-label={`Comments for ${listing.title}`} className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[22px] bg-white shadow-[0_30px_100px_rgba(10,26,20,.25)] sm:max-h-[min(720px,88dvh)] sm:max-w-[560px] sm:rounded-[22px]" initial={{ y: '12%', opacity: .8 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '12%', opacity: .8 }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
      <div className="flex items-center justify-between border-b border-[#edf0ed] px-5 py-4 sm:px-6">
        <div className="min-w-0"><h2 className="font-display text-lg font-semibold text-[#192724]">Comments</h2><p className="mt-0.5 truncate text-xs text-[#818d86]">{listing.title} · {formatUsd(listing.price)}</p></div>
        <IconButton label="Close comments" onClick={onClose}><X size={18} /></IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mb-4 flex items-center justify-between border-b border-[#edf0ed] pb-3 text-xs">
          <span className="font-semibold text-[#44544b]">{commentsCount} {commentsCount === 1 ? 'comment' : 'comments'}</span>
          <span className="text-[#89948d]">Product discussion</span>
        </div>
        {loading && <p role="status" className="py-8 text-center text-sm text-[#7f8c84]">Loading comments…</p>}
        {!loading && error && comments.length === 0 && <p role="alert" className="rounded-xl bg-[#fff5f3] px-4 py-3 text-sm text-[#a34237]">{error}</p>}
        {!loading && !error && comments.length === 0 && <div className="flex flex-col items-center py-10 text-center"><span className="mb-3 grid size-12 place-items-center rounded-full bg-[#eef3ef] text-[#628174]"><MessageCircle size={21} /></span><p className="text-sm font-semibold text-[#34483c]">Start the conversation</p><p className="mt-1 max-w-xs text-xs leading-5 text-[#859189]">Ask a question or share what you think about this product.</p></div>}
        {comments.length > 0 && <div className="space-y-5">{comments.map((comment) => <div key={comment.id} className="space-y-3"><CommentBubble comment={comment} onReply={setReplyingTo} onToggleLike={toggleLike} busy={reactionSavingId === comment.id} />{comment.replies.length > 0 && <div className="ml-7 space-y-3 border-l-2 border-[#edf0ed] pl-3 sm:ml-11 sm:pl-4">{comment.replies.map((reply) => <CommentBubble key={reply.id} comment={reply} onReply={setReplyingTo} onToggleLike={toggleLike} busy={reactionSavingId === reply.id} canReply={false} />)}</div>}</div>)}<div ref={commentsEndRef} /></div>}
      </div>
      <form onSubmit={(event) => void submitComment(event)} className="border-t border-[#edf0ed] bg-white px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6">
        {error && comments.length > 0 && <p role="alert" className="mb-2 text-xs text-[#a34237]">{error}</p>}
        {replyingTo && <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-[#f7f9f7] px-3 py-2"><p className="truncate text-xs text-[#66766e]">Replying to <span className="font-semibold">{replyingTo.user.displayName?.trim() || 'QuickResell member'}</span></p><button type="button" onClick={() => setReplyingTo(null)} className="shrink-0 text-[11px] font-semibold text-[#60786a] hover:text-[#315f49]">Cancel</button></div>}
        {!session ? <div className="flex items-center justify-between gap-3"><p className="text-xs text-[#7f8c84]">Sign in to join the discussion.</p><button type="button" onClick={onRequestSignIn} className="min-h-9 rounded-full bg-[#e7f0e8] px-4 text-xs font-semibold text-[#385a46] transition hover:bg-[#dceade]">Sign in</button></div>
          : !emailConfirmed ? <p role="status" className="text-xs text-[#84672c]">Confirm your email before commenting.</p>
            : <div className="flex items-end gap-2.5">
              {session.user.user_metadata.avatar_url
                ? <img src={session.user.user_metadata.avatar_url} alt="" className="mb-1 size-9 shrink-0 rounded-full bg-[#edf1ed] object-cover" />
                : <span aria-hidden="true" className="mb-1 grid size-9 shrink-0 place-items-center rounded-full bg-[#e8f0e9] text-[11px] font-bold text-[#456555]">{initials(displayName)}</span>}
              <label className="min-w-0 flex-1">
                <span className="sr-only">Write a comment</span>
                <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={1000} rows={1} placeholder={replyingTo ? 'Write a reply…' : 'Write a comment…'} className="max-h-28 min-h-10 w-full resize-y rounded-[20px] bg-[#f0f2f5] px-4 py-2.5 text-sm leading-5 text-[#27313a] outline-none placeholder:text-[#89939b] focus:ring-2 focus:ring-[#dbe8de]" />
              </label>
              <button type="submit" disabled={submitting || !content.trim()} aria-label="Post comment" className="mb-1 grid size-9 shrink-0 place-items-center rounded-full bg-[#315f49] text-white transition hover:bg-[#264c39] disabled:cursor-not-allowed disabled:opacity-45">{submitting ? <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send size={15} />}</button>
            </div>}
      </form>
    </motion.section>
  </motion.div>}</AnimatePresence>, document.body)
}
