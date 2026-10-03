import type { Session } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ListingReactionType } from '../../types'
import { setListingReaction } from '../../services/listingApi'

const reactionOptions: Array<{ type: ListingReactionType; emoji: string; label: string }> = [
  { type: 'LIKE', emoji: '👍', label: 'Like' },
  { type: 'LOVE', emoji: '❤️', label: 'Love' },
  { type: 'HAHA', emoji: '😂', label: 'Haha' },
  { type: 'WOW', emoji: '😮', label: 'Wow' },
  { type: 'SAD', emoji: '😢', label: 'Sad' },
  { type: 'ANGRY', emoji: '😡', label: 'Angry' },
]

type ItemReactionControlProps = {
  listingId: string
  reactionCount: number
  myReaction: ListingReactionType | null
  session: Session | null
  emailConfirmed: boolean
  onRequestSignIn: () => void
  children: ReactNode
}

export function ItemReactionControl({ listingId, reactionCount: initialCount, myReaction: initialReaction, session, emailConfirmed, onRequestSignIn, children }: ItemReactionControlProps) {
  const [open, setOpen] = useState(false)
  const [localResult, setLocalResult] = useState<{
    userId: string | undefined
    initialCount: number
    initialReaction: ListingReactionType | null
    reactionCount: number
    reaction: ListingReactionType | null
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClick = useRef(false)
  const viewerId = session?.user.id
  const activeLocalResult = localResult && localResult.userId === viewerId &&
    localResult.initialCount === initialCount &&
    localResult.initialReaction === initialReaction
      ? localResult
      : null
  const reactionCount = activeLocalResult?.reactionCount ?? initialCount
  const myReaction = activeLocalResult ? activeLocalResult.reaction : initialReaction
  const activeReaction = reactionOptions.find((option) => option.type === myReaction)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const chooseReaction = async (type: ListingReactionType) => {
    if (!session) {
      setOpen(false)
      onRequestSignIn()
      return
    }
    if (!emailConfirmed) {
      setError('Confirm your email before reacting.')
      return
    }
    const nextReaction = myReaction === type ? null : type
    setSaving(true)
    setError('')
    try {
      const result = await setListingReaction(listingId, nextReaction, session)
      setLocalResult({
        userId: viewerId,
        initialCount,
        initialReaction,
        reaction: result.reaction,
        reactionCount: result.reactionCount,
      })
      setOpen(false)
    } catch (reactionError) {
      setError(reactionError instanceof Error ? reactionError.message : 'Could not save your reaction.')
    } finally {
      setSaving(false)
    }
  }

  return <div
    className="relative min-w-0"
    onPointerDown={() => {
      suppressClick.current = false
      timer.current = setTimeout(() => { suppressClick.current = true; setOpen(true) }, 500)
    }}
    onPointerUp={() => { if (timer.current) clearTimeout(timer.current) }}
    onPointerLeave={() => { if (timer.current) clearTimeout(timer.current) }}
    onPointerCancel={() => { if (timer.current) clearTimeout(timer.current) }}
    onClickCapture={(event) => {
      if (suppressClick.current) {
        event.preventDefault()
        event.stopPropagation()
        suppressClick.current = false
      }
    }}
    onContextMenu={(event) => { event.preventDefault(); setOpen(true) }}
  >
    {children}
    <div className="mt-2 rounded-lg border border-[#e5eae6] bg-white px-3 py-1.5">
    <div className="relative flex min-w-0 items-center gap-2">
    <button
      type="button"
      aria-label={activeReaction ? `Your reaction: ${activeReaction.label}. Change reaction` : 'React to this item'}
      aria-expanded={open}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false
          return
        }
        setOpen((value) => !value)
      }}
      disabled={saving}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#e5ebe6] bg-white px-3 text-xs font-semibold text-[#52685d] transition hover:border-[#bfd0c3] hover:text-[#315f49] disabled:opacity-60"
    >
      <span aria-hidden="true">{activeReaction?.emoji ?? '＋'}</span>
      <span>{activeReaction?.label ?? 'React'}</span>
      {reactionCount > 0 && <span className="tabular-nums text-[#849189]">{reactionCount}</span>}
    </button>
    {open && <div role="group" aria-label="Choose a reaction" className="absolute bottom-full left-0 z-30 mb-2 flex gap-1 rounded-full border border-[#e5ebe6] bg-white p-1.5 shadow-[0_8px_28px_rgba(30,55,43,.16)]">
      {reactionOptions.map((option) => <button key={option.type} type="button" aria-label={option.label} title={option.label} disabled={saving} onClick={() => void chooseReaction(option.type)} className={`grid size-9 place-items-center rounded-full text-xl transition hover:-translate-y-1 hover:bg-[#f1f6f1] disabled:opacity-50 ${myReaction === option.type ? 'bg-[#eaf4ed]' : ''}`}>{option.emoji}</button>)}
      <button type="button" aria-label="Close reactions" onClick={() => setOpen(false)} className="ml-1 grid size-9 place-items-center rounded-full text-sm text-[#73817a] hover:bg-[#f1f6f1]">×</button>
    </div>}
    {error && <span role="alert" className="text-[10px] text-[#b44538]">{error}</span>}
    </div>
    </div>
  </div>
}
