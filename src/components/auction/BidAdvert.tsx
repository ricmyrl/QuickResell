import { ArrowUpRight, Clock3, ShieldCheck } from 'lucide-react'
import type { Auction } from '../../types'
import { useCountdown } from '../../hooks/useCountdown'
import { useCurrency } from '../../lib/CurrencyContext'

interface BidAdvertProps {
  auction: Auction | null
  onOpen: (auction: Auction) => void
}

export function BidAdvert({ auction, onOpen }: BidAdvertProps) {
  const { formatUsd } = useCurrency()

  // Use a stable fallback date string to prevent creating a new ISO string on every re-render
  const countdown = useCountdown(auction?.endsAt ?? '1970-01-01T00:00:00.000Z')

  if (!auction) {
    return (
      <div className="px-5 py-6 text-sm text-[#7a8781]">
        No active auctions right now.
      </div>
    )
  }

  // Format remaining time string
  const clock = countdown.expired
    ? '00:00:00'
    : countdown.days > 0
    ? `${countdown.days}d ${countdown.hours}h left`
    : `${String(countdown.hours).padStart(2, '0')}:${String(countdown.minutes).padStart(2, '0')}:${String(countdown.seconds).padStart(2, '0')} left`

  // Urgency badge state
  const urgency = countdown.expired
    ? 'Auction ended'
    : countdown.remaining <= 60_000
    ? 'Ending now'
    : countdown.remaining <= 300_000
    ? 'Ending soon'
    : 'Live auction'

  // Seller trust score tier
  const standing =
    auction.seller.trustScore >= 80
      ? 'Highly trusted'
      : auction.seller.trustScore >= 60
      ? 'Established seller'
      : 'Building trust'

  const isUrgent = !countdown.expired && countdown.remaining <= 60_000

  return (
    <section aria-label="Featured bid opportunity" className="px-4 py-6">
      <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#6b8174]">
        <span className="grid size-7 place-items-center rounded-lg bg-[#e3eee4] text-[#4e775f]">
          <ArrowUpRight size={15} />
        </span>
        Bid opportunity
      </div>

      <article className="overflow-hidden rounded-[14px] border border-[#e1e9e2] bg-white shadow-[0_8px_24px_rgba(36,56,43,.05)]">
        {/* Image & Urgency Badge */}
        <div className="relative aspect-[1.4/1] bg-[#edf1ed]">
          {auction.image && (
            <img
              src={auction.image}
              alt={auction.title}
              className="size-full object-cover"
              loading="lazy"
              decoding="async"
            />
          )}
          <span
            className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold ${
              isUrgent
                ? 'bg-[#fff0ed] text-[#b54438]'
                : 'bg-white/95 text-[#42634f]'
            }`}
          >
            {urgency}
          </span>
        </div>

        {/* Card Content */}
        <div className="p-4">
          <h2 className="font-display line-clamp-2 text-base font-semibold leading-5 text-[#24382d]">
            {auction.title}
          </h2>

          {/* Seller Standing */}
          <div className="mt-3 flex items-center gap-2 border-b border-[#edf1ed] pb-3 text-[11px] text-[#607469]">
            <ShieldCheck size={14} className="shrink-0 text-[#59866c]" />
            <span className="min-w-0 flex-1 truncate">{standing}</span>
            <span className="font-bold tabular-nums">
              {Math.round(auction.seller.trustScore)}/100
            </span>
          </div>

          {/* Current Bid */}
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[.08em] text-[#89958e]">
            Current bid
          </p>
          <p className="font-display mt-0.5 text-[24px] font-bold leading-7 text-[#24382d]">
            {formatUsd(auction.currentHighestBid, 0)}
          </p>

          {/* Countdown & Completed Auctions */}
          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-[#75847b]">
            <Clock3 size={13} />
            {clock}{' '}
            <span className="font-normal">
              · {auction.seller.completedAuctions} completed{' '}
              {auction.seller.completedAuctions === 1 ? 'auction' : 'auctions'}
            </span>
          </p>

          {/* Action Button */}
          <button
            type="button"
            onClick={() => onOpen(auction)}
            className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#274b3b] px-3 text-xs font-semibold text-white transition hover:bg-[#1f3d30]"
          >
            View auction
            <ArrowUpRight size={14} />
          </button>
        </div>
      </article>
    </section>
  )
}