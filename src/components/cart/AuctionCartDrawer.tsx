import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Clock3, ShoppingCart, Trash2, X } from 'lucide-react'
import type { Auction } from '../../types'
import { IconButton } from '../common/Button'
import { LiveBadge } from '../common/Badge'
import { useCurrency } from '../../lib/CurrencyContext'
import { useCountdown } from '../../hooks/useCountdown'

function RemainingTime({ endsAt }: { endsAt: string }) {
  const countdown = useCountdown(endsAt)
  const seconds = Math.floor(countdown.remaining / 1000)
  const text = seconds <= 0 ? 'Ended' : seconds >= 86_400 ? `${Math.floor(seconds / 86_400)}d left` : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m left`
  return <span className="inline-flex items-center gap-1 text-[11px] text-[#7f8c85]"><Clock3 size={12} />{text}</span>
}

export function AuctionCartDrawer({ open, items, onClose, onOpenAuction, onRemove }: {
  open: boolean
  items: Auction[]
  onClose: () => void
  onOpenAuction: (auction: Auction) => void
  onRemove: (auctionId: string) => void
}) {
  const { formatUsd } = useCurrency()
  const currency = { format: (amount: number) => formatUsd(amount, 0) }
  return <AnimatePresence>
    {open && <motion.div className="fixed inset-0 z-50 bg-[#13211b]/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <motion.aside role="dialog" aria-modal="true" aria-label="Your auction cart" className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col bg-[#fbfcfb] shadow-[-20px_0_60px_rgba(20,40,30,.16)]" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
        <header className="flex items-center justify-between border-b border-[#e7ece8] bg-white px-5 py-4"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#edf4ed] text-[#3d6c55]"><ShoppingCart size={18} /></span><div><h2 className="font-display text-lg font-semibold text-[#20352d]">Auction cart</h2><p className="text-xs text-[#829087]">{items.length} {items.length === 1 ? 'room saved' : 'rooms saved'}</p></div></div><IconButton label="Close cart" onClick={onClose}><X size={18} /></IconButton></header>

        {items.length ? <div className="scrollbar-hidden flex-1 space-y-3 overflow-y-auto p-4">{items.map((auction) => <article key={auction.id} className="overflow-hidden rounded-[16px] border border-[#e4eae5] bg-white"><div className="flex gap-3 p-3"><img src={auction.image} alt="" className="size-[76px] shrink-0 rounded-xl object-cover" loading="lazy" decoding="async" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="line-clamp-2 text-sm font-semibold leading-5 text-[#2b4036]">{auction.title}</h3><IconButton label={`Remove ${auction.title} from cart`} className="-mr-1 -mt-1 size-8 shrink-0" onClick={() => onRemove(auction.id)}><Trash2 size={15} /></IconButton></div><div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">{auction.status === 'ACTIVE' ? <LiveBadge /> : <span className="rounded-full bg-[#f0f2ef] px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-[#758179]">{auction.status === 'PENDING_APPROVAL' ? 'Awaiting seller' : 'Auction ended'}</span>}<RemainingTime endsAt={auction.endsAt} /></div><p className="mt-2 text-[11px] text-[#85928a]">Current bid <span className="font-semibold text-[#41584b]">{currency.format(auction.currentHighestBid)}</span></p></div></div><button type="button" onClick={() => onOpenAuction(auction)} className="flex w-full items-center justify-between border-t border-[#edf0ed] bg-[#fafbfa] px-4 py-3 text-xs font-semibold text-[#41654e] transition hover:bg-[#f0f5f0]"><span>{auction.status === 'ACTIVE' ? 'Open bidding room' : 'View auction'}</span><ArrowRight size={14} /></button></article>)}</div> : <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><span className="grid size-14 place-items-center rounded-2xl bg-[#edf4ed] text-[#63846d]"><ShoppingCart size={23} /></span><h3 className="font-display mt-4 text-lg font-semibold text-[#2a4035]">Your cart is waiting</h3><p className="mt-1 max-w-xs text-sm leading-5 text-[#849189]">Save auction rooms here to keep them close while you browse.</p><button type="button" onClick={onClose} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#486e54] hover:text-[#2d5038]">Explore auctions <ArrowRight size={15} /></button></div>}

        <footer className="border-t border-[#e7ece8] bg-white px-5 py-4"><p className="text-[11px] leading-5 text-[#88948d]">Saved rooms are tied to this account on this device. The current bid can change; adding a room does not place a bid or reserve an item.</p></footer>
      </motion.aside>
    </motion.div>}
  </AnimatePresence>
}
