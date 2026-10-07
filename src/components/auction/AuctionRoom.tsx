import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, ArrowUpRight, Clock3, Gavel, MapPin, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Auction, Bid } from '../../types'
import { useCountdown } from '../../hooks/useCountdown'
import { useAuctionRealtime } from '../../hooks/useAuctionRealtime'
import { LiveBadge, Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { ImageLightbox } from '../common/ImageLightbox'
import { TrustScoreBadge } from '../common/TrustScoreBadge'
import { SellerVerdictModal } from '../dashboard/SellerVerdictModal'
import type { Verdict } from '../../types'
import { useCurrency } from '../../lib/CurrencyContext'

const maxAllowedBid = 10_000_000

function sanitizeCustomBidInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const [whole, ...parts] = cleaned.split('.')

  if (!whole && parts.length === 0) return ''
  const decimalPart = parts.length > 0 ? `.${parts.join('')}` : ''
  return `${whole || '0'}${decimalPart}`
}

export function AuctionRoom({ auction, userId, onBack, onBid, onExpire, onNotice, onRoomUpdate, onVerdict }: {
  auction: Auction; userId?: string; session: Session | null; emailConfirmed: boolean; onRequestSignIn: () => void; onBack: () => void; onBid: (amount: number) => Promise<void>; onExpire: () => Promise<void>
  onNotice: (message: string, kind?: 'success' | 'error') => void; onRoomUpdate: (patch: Partial<Auction>) => void
  onVerdict: (decision: Verdict) => Promise<void>
}) {
  const { formatUsd } = useCurrency()
  const currency = { format: (amount: number) => formatUsd(amount) }
  const countdown = useCountdown(auction.endsAt)
  const [bidding, setBidding] = useState(false)
  const [bids, setBids] = useState(auction.bids)
  const [hasClosed, setHasClosed] = useState(false)
  const [verdictOpen, setVerdictOpen] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)

  // Custom Bid state
  const [customBid, setCustomBid] = useState<string>('')

  const closeImage = useCallback(() => setImageOpen(false), [])
  const lastBidIds = useRef(new Set(auction.bids.map((bid) => bid.id)))
  const prevHighestBidRef = useRef(auction.currentHighestBid)

  const isSeller = userId === auction.sellerId
  const isActive = auction.status === 'ACTIVE' && !countdown.expired
  
  const isFirstBid = auction.currentHighestBid === 0
  const minRequiredBid = isFirstBid ? auction.startingPrice : auction.currentHighestBid + 1

  const remainingBidAmount = Math.max(0, maxAllowedBid - auction.currentHighestBid)
  const standardIncrements = [5, 10, 20].filter((increment) => increment <= remainingBidAmount)
  const bidIncrements = standardIncrements.length > 0 ? standardIncrements : remainingBidAmount > 0 ? [remainingBidAmount] : []
  const primaryBidIncrement = [20, 10, 5].find((increment) => increment <= remainingBidAmount) ?? remainingBidAmount

  // Default target bid when custom input is empty
  const defaultNextBid = isFirstBid ? auction.startingPrice : auction.currentHighestBid + primaryBidIncrement

  // Parse and sanitize custom bid input
  const cleanCustomBid = sanitizeCustomBidInput(customBid)
  const parsedCustomBid = cleanCustomBid === '' ? Number.NaN : Number(cleanCustomBid)
  const hasCustomInput = customBid.trim() !== '' && cleanCustomBid !== '' && Number.isFinite(parsedCustomBid)

  // Use custom bid value if present, otherwise fall back to default increment
  const targetBidAmount = hasCustomInput ? parsedCustomBid : defaultNextBid

  // Validation rules
  const isTooLow = hasCustomInput && parsedCustomBid < minRequiredBid
  const isTooHigh = hasCustomInput && parsedCustomBid > maxAllowedBid
  const isValidBid = Number.isFinite(targetBidAmount) && targetBidAmount >= minRequiredBid && targetBidAmount <= maxAllowedBid && !(hasCustomInput && isTooLow) && !(hasCustomInput && isTooHigh)

  // Reset custom bid input when highest bid updates live
  useEffect(() => {
    if (auction.currentHighestBid !== prevHighestBidRef.current) {
      prevHighestBidRef.current = auction.currentHighestBid
      setCustomBid('')
    }
  }, [auction.currentHighestBid])

  // Sync bids state when auction prop updates
  useEffect(() => { 
    setBids(auction.bids)
    lastBidIds.current = new Set(auction.bids.map((bid) => bid.id)) 
  }, [auction.id, auction.bids])

  const addLiveBid = (bid: Bid) => {
    if (lastBidIds.current.has(bid.id)) return
    lastBidIds.current.add(bid.id)
    setBids((current) => [bid, ...current].slice(0, 50))
  }
  useAuctionRealtime(auction.id, onRoomUpdate, addLiveBid)

  useEffect(() => {
    if (!countdown.expired || auction.status !== 'ACTIVE' || hasClosed) return
    setHasClosed(true)
    void onExpire().then(() => {
      if (isSeller && auction.highestBidderId) setVerdictOpen(true)
    }).catch((error: unknown) => { setHasClosed(false); onNotice(error instanceof Error ? error.message : 'Could not finalize this auction.', 'error') })
  }, [countdown.expired, auction.status, hasClosed, onExpire, onNotice, isSeller, auction.highestBidderId])

  const handlePlaceBid = async (amount: number) => {
    if (amount < minRequiredBid) {
      onNotice(`Bid must be at least ${currency.format(minRequiredBid)}`, 'error')
      return
    }
    if (amount > maxAllowedBid) {
      onNotice(`Bid cannot exceed ${currency.format(maxAllowedBid)}`, 'error')
      return
    }

    setBidding(true)
    try { 
      await onBid(amount)
      setCustomBid('')
      onNotice('Your bid is in. The room is updated live.', 'success') 
    } catch (error) { 
      onNotice(error instanceof Error ? error.message : 'Bid could not be placed.', 'error') 
    } finally { 
      setBidding(false) 
    }
  }

  const getButtonText = () => {
    if (isSeller) return 'Sellers can’t bid here'
    if (bidding) return 'Placing bid…'
    if (!isActive) return 'Auction ended'
    if (hasCustomInput) {
      return `Bid ${currency.format(parsedCustomBid)}`
    }
    return `Bid ${currency.format(defaultNextBid)}`
  }

  const clock = countdown.days > 0 ? `${countdown.days}d ${String(countdown.hours).padStart(2, '0')}h` : `${String(countdown.hours).padStart(2, '0')}:${String(countdown.minutes).padStart(2, '0')}:${String(countdown.seconds).padStart(2, '0')}`

  return (
    <motion.section className="min-w-0" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
      <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#6f8078] hover:text-[#263b33]">
        <ArrowLeft size={16} />Back to the feed
      </button>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.85fr)]">
        <div className="overflow-hidden rounded-[20px] border border-[#e4eae5] bg-white">
          <div className="relative aspect-[1.34/1] max-h-[530px] bg-[#e8eeea]">
            {auction.image && (
              <button type="button" onClick={() => setImageOpen(true)} aria-label={`View ${auction.title} photo`} className="size-full">
                <img src={auction.image} alt={auction.title} className="h-full w-full bg-white object-contain" decoding="async" fetchPriority="high" />
              </button>
            )}
            <div className="pointer-events-none absolute left-4 top-4 flex gap-2">
              <LiveBadge />
              {auction.noReserve && <Badge className="bg-white text-[#536522]">No reserve</Badge>}
            </div>
          </div>
          <div className="p-5 sm:p-7">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[#819087]">
              <span className="font-semibold uppercase tracking-[.1em]">{auction.category}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1"><MapPin size={12} />{auction.location}</span>
            </div>
            <h1 className="font-display text-[27px] font-semibold leading-tight text-[#1c2b26]">{auction.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#718078]">{auction.description}</p>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#edf0ed] pt-5">
              <div className="flex items-center gap-3">
                {auction.seller.avatarUrl && <img src={auction.seller.avatarUrl} alt="" className="size-10 rounded-full object-cover" loading="lazy" decoding="async" />}
                <div>
                  <p className="text-sm font-semibold text-[#263b33]">{auction.seller.displayName}</p>
                  <TrustScoreBadge score={auction.seller.trustScore} completedAuctions={auction.seller.completedAuctions} compact />
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#6d7c74]">
                <ShieldCheck size={15} className="text-[#5b8a71]" />Public room · seller accountability
              </div>
            </div>
          </div>
        </div>

        <aside className="flex min-h-[600px] flex-col overflow-hidden rounded-[20px] border border-[#e4eae5] bg-white">
          <div className="flex items-start justify-between border-b border-[#edf0ed] px-5 py-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.13em] text-[#819087]">Live room</p>
              <h2 className="font-display mt-1 text-lg font-semibold text-[#263b33]">Bidding floor</h2>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f7f5] px-2.5 py-1.5 text-xs font-semibold text-[#62726a]">
              <Users size={13} />{bids.length} bids
            </span>
          </div>

          <div className="px-5 py-5">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1 flex-col gap-1 overflow-hidden">
                <p className="text-xs font-medium text-[#829089]">Highest bid</p>
                <p 
                  className="font-display truncate text-2xl font-bold leading-none tracking-tight text-[#20352d] sm:text-3xl xl:text-[34px]"
                  title={currency.format(auction.currentHighestBid)}
                >
                  {currency.format(auction.currentHighestBid)}
                </p>
              </div>
              <div className={`mb-0.5 flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-bold tabular-nums ${countdown.remaining < 60_000 ? 'bg-[#fff0ed] text-[#c7473c]' : 'bg-[#f0f4ee] text-[#425b4d]'}`}>
                <Clock3 size={15} />{clock}
              </div>
            </div>

            <p className="mt-2 text-xs text-[#85918a] truncate">{bids.length} bids · starts at {currency.format(auction.startingPrice)}</p>

            {/* Quick Increment Buttons */}
            <div className="mt-4 grid grid-cols-3 gap-1.5 sm:gap-2">
              {bidIncrements.map((increment) => {
                const targetAmount = auction.currentHighestBid + increment
                return (
                  <Button 
                    key={increment} 
                    variant="secondary" 
                    disabled={!isActive || bidding || isSeller} 
                    onClick={() => setCustomBid(String(targetAmount))} 
                    className="min-h-11 w-full min-w-0 flex-col justify-center gap-0.5 overflow-hidden rounded-xl px-1 py-1 text-center"
                  >
                    <span className="w-full truncate text-xs font-bold tracking-tight sm:text-sm">
                      +{currency.format(increment)}
                    </span>
                    <span className="w-full truncate text-[9px] font-medium tracking-tight text-[#8a9690] sm:text-[10px]">
                      {currency.format(targetAmount)}
                    </span>
                  </Button>
                )
              })}
            </div>

            {/* Custom Bid Input Field */}
            <div className="mt-3">
              <label htmlFor="custom-bid-input" className="sr-only">Custom Bid Amount</label>
              <div className="relative flex items-center">
                <span className="pointer-events-none absolute left-3 text-sm font-semibold text-[#829089]">$</span>
                <input
                  id="custom-bid-input"
                  type="text"
                  inputMode="decimal"
                  placeholder={`Custom amount (min ${currency.format(minRequiredBid)})`}
                  value={customBid}
                  disabled={!isActive || bidding || isSeller}
                  onChange={(e) => setCustomBid(sanitizeCustomBidInput(e.target.value))}
                  className="w-full rounded-xl border border-[#dce3de] bg-[#f9faf9] py-2.5 pl-7 pr-3 text-sm font-semibold text-[#1c2b26] placeholder-[#909c95] outline-none transition focus:border-[#5b8a71] focus:bg-white focus:ring-1 focus:ring-[#5b8a71] disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              {hasCustomInput && isTooLow && (
                <p className="mt-1 text-[11px] font-medium text-[#c7473c]">
                  Minimum bid is {currency.format(minRequiredBid)}
                </p>
              )}
              {hasCustomInput && isTooHigh && (
                <p className="mt-1 text-[11px] font-medium text-[#c7473c]">
                  Maximum allowed bid is {currency.format(maxAllowedBid)}
                </p>
              )}
            </div>

            {/* Main Action Button */}
            <Button 
              disabled={!isActive || bidding || isSeller || !isValidBid} 
              onClick={() => void handlePlaceBid(targetBidAmount)} 
              icon={<Gavel size={15} />} 
              className="mt-2.5 w-full truncate rounded-xl py-3 text-sm font-bold"
            >
              {getButtonText()}
            </Button>

            {remainingBidAmount <= 0 && <p className="mt-2 text-center text-[11px] font-medium text-[#87938d]">This auction has reached the maximum bid.</p>}
            {countdown.remaining > 0 && countdown.remaining <= 10_000 && <p className="mt-2 text-center text-[11px] font-medium text-[#c7473c]">A bid in the final 10 seconds extends the clock by 30 seconds.</p>}
          </div>

          <div className="flex items-center justify-between border-y border-[#edf0ed] bg-[#fafbfa] px-5 py-3">
            <span className="text-xs font-bold uppercase tracking-[.1em] text-[#819087]">Bid activity</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-[#839089]">
              <span className="size-1.5 rounded-full bg-[#78a17e]" />Live updates
            </span>
          </div>

          <div className="scrollbar-hidden flex-1 overflow-y-auto px-5 py-1">
            {bids.length ? (
              bids.map((bid, index) => (
                <div key={bid.id} className="flex items-center gap-3 border-b border-[#f0f2f0] py-3 last:border-0">
                  {bid.bidder.avatarUrl && <img src={bid.bidder.avatarUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" loading="lazy" decoding="async" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[#35473f]">
                      {bid.bidder.displayName}
                      {index === 0 && bid.bidder.id === auction.highestBidderId && (
                        <span className="ml-1.5 rounded bg-[#eff5e8] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#5f7b50]">Leading</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#909b95]">{new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(bid.createdAt))}</p>
                  </div>
                  <span className="font-display shrink-0 whitespace-nowrap text-sm font-bold text-[#2b4539]">{currency.format(bid.amount)}</span>
                  <ArrowUpRight size={13} className="shrink-0 text-[#92a098]" />
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-xs text-[#8a9690]">Be the first to make a move.</p>
            )}
          </div>

          <div className="border-t border-[#edf0ed] px-5 py-3 text-[10px] leading-4 text-[#87938d]">
            <Sparkles size={12} className="mr-1 inline text-[#91a743]" />Every bid is public. The seller must confirm the winning bid when time runs out.
          </div>
        </aside>
      </div>

      <SellerVerdictModal auction={auction} open={verdictOpen && auction.status === 'PENDING_APPROVAL'} onClose={() => setVerdictOpen(false)} onSubmit={async (decision) => { await onVerdict(decision); setVerdictOpen(false) }} />
      {imageOpen && auction.image && <ImageLightbox src={auction.image} alt={auction.title} onClose={closeImage} />}
    </motion.section>
  )
}