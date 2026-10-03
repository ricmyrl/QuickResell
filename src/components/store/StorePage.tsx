import { useCallback, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowDownUp, Check, MapPin, MessageCircle, PackageCheck, Search, ShoppingCart, Star, Bookmark, BookmarkCheck } from 'lucide-react'
import { motion } from 'framer-motion'
import type { MarketplaceListing } from '../../types'
import { Button } from '../common/Button'
import { ImageLightbox } from '../common/ImageLightbox'
import { useCurrency } from '../../lib/CurrencyContext'
import { distanceInKm, getCurrentLocation, type Coordinates } from '../../lib/geolocation'
import { ProductCommentsSheet } from './ProductCommentsSheet'
import { ItemReactionControl } from '../common/ItemReactionControl'

function ListingCard({ listing, onAdd, inCart, busy, saved, onToggleSaved, distanceKm, commentsCount, onOpenComments, session, emailConfirmed, onRequestSignIn }: { listing: MarketplaceListing; onAdd: (listing: MarketplaceListing) => void; inCart: boolean; busy: boolean; saved: boolean; onToggleSaved: (postId: string) => void; distanceKm: number | null; commentsCount: number; onOpenComments: (listing: MarketplaceListing) => void; session: Session | null; emailConfirmed: boolean; onRequestSignIn: () => void }) {
  const { formatUsd } = useCurrency()
  const [imageOpen, setImageOpen] = useState(false)
  const closeImage = useCallback(() => setImageOpen(false), [])
  const currency = { format: formatUsd }
  const discount = listing.originalPrice && listing.originalPrice > listing.price ? Math.round((1 - listing.price / listing.originalPrice) * 100) : 0
  const isVerifiedSeller = listing.seller.isCampusVerified || listing.seller.trustScore >= 80
  return <div className="min-w-0">
    <ItemReactionControl listingId={listing.id} reactionCount={listing.reactionCount ?? 0} reactionCounts={listing.reactionCounts} myReaction={listing.myReaction ?? null} session={session} emailConfirmed={emailConfirmed} onRequestSignIn={onRequestSignIn} trailingAction={<button type="button" onClick={() => onOpenComments(listing)} aria-label={`Open ${commentsCount} comments for ${listing.title}`} title="Comments" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-[#52685d] transition hover:bg-[#f2f6f2] hover:text-[#315f49]"><MessageCircle size={18} /><span className="tabular-nums">{commentsCount}</span></button>}>
    <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }} className="overflow-hidden rounded-[16px] border border-[#e5eae6] bg-white transition-shadow hover:shadow-[0_14px_34px_rgba(30,55,43,.09)]">
    <div className="relative aspect-[1.38/1] overflow-hidden bg-[#edf1ed]">{listing.image && <button type="button" onClick={() => setImageOpen(true)} aria-label={`View ${listing.title} photo`} className="size-full"><img src={listing.image} alt={listing.title} className="size-full bg-white object-contain" loading="lazy" /></button>}{discount > 0 && <span className="absolute left-3 top-3 rounded-full bg-[#d94b3d] px-2.5 py-1 text-[10px] font-bold text-white">{discount}% below retail</span>}<button type="button" onClick={() => onToggleSaved(listing.id)} className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1.5 text-[10px] font-semibold text-[#243b31] shadow-sm transition hover:bg-white"><span>{saved ? <BookmarkCheck size={12} className="text-[#2f6d57]" /> : <Bookmark size={12} />}</span>{saved ? 'Saved' : 'Save'}</button><span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-[10px] font-semibold text-[#68776e]"><MapPin size={11} />{listing.location}</span></div>
    <div className="p-4"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-[.12em] text-[#809087]">{listing.category}</span><span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#68806f]"><Star size={11} className="fill-[#c4d75d] text-[#a3b842]" />{Math.round(listing.seller.trustScore)} trust</span></div><div className="mb-1 flex items-center gap-2"><h2 className="font-display truncate text-base font-semibold text-[#263a31]">{listing.title}</h2>{isVerifiedSeller && <span className="rounded-full bg-[#eaf7ef] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.08em] text-[#2f6d57]">Verified</span>}</div><p className="mt-1.5 line-clamp-2 min-h-9 text-xs leading-[18px] text-[#7b8880]">{listing.description}</p><div className="mt-4 flex items-end justify-between gap-3"><div><p className="font-display text-[22px] font-bold leading-6 text-[#20382d]">{currency.format(listing.price)}</p>{listing.originalPrice && listing.originalPrice > listing.price && <p className="mt-1 text-[11px] text-[#95a099]"><span className="line-through">{currency.format(listing.originalPrice)}</span><span className="ml-1.5">retail</span></p>}</div><Button disabled={busy || listing.quantityAvailable < 1} onClick={() => onAdd(listing)} icon={inCart ? <Check size={15} /> : <ShoppingCart size={15} />} className="min-h-9 rounded-lg px-3 text-xs">{inCart ? 'Add another' : 'Add to cart'}</Button></div><div className="mt-3 flex items-center justify-between border-t border-[#eff2ef] pt-3 text-[10px] text-[#849189]"><span className="inline-flex items-center gap-1"><PackageCheck size={12} />{listing.quantityAvailable} available</span><span>{isVerifiedSeller ? 'Verified seller' : 'Seller'} · {listing.seller.displayName}</span></div>{distanceKm !== null && <p className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-[#4f735f]"><MapPin size={11} />{distanceKm < 1 ? `${Math.max(10, Math.round(distanceKm * 100) * 10)} m away` : `${distanceKm.toFixed(1)} km away`}</p>}</div>
    </motion.article>
    </ItemReactionControl>
    {imageOpen && listing.image && <ImageLightbox src={listing.image} alt={listing.title} onClose={closeImage} />}
  </div>
}

export function StorePage({ listings, categories, error, cartHas, watchlistIds, onToggleSaved, onAdd, onOpenCart, session, emailConfirmed, onRequestSignIn }: { listings: MarketplaceListing[]; categories: string[]; error: string; cartHas: (postId: string) => boolean; watchlistIds: string[]; onToggleSaved: (postId: string) => void; onAdd: (listing: MarketplaceListing) => void; onOpenCart: () => void; session: Session | null; emailConfirmed: boolean; onRequestSignIn: () => void }) {
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState(() => {
    try {
      const target = localStorage.getItem('quickresell:store:search') ?? ''
      localStorage.removeItem('quickresell:store:search')
      return target
    } catch {
      return ''
    }
  })
  const [sort, setSort] = useState<'featured' | 'price'>('featured')
  const [buyerLocation, setBuyerLocation] = useState<Coordinates | null>(null)
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [nearbySort, setNearbySort] = useState(false)
  const [savedOnly, setSavedOnly] = useState(false)
  const [commentsListing, setCommentsListing] = useState<MarketplaceListing | null>(null)
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const closeComments = useCallback(() => setCommentsListing(null), [])
  const updateCommentCount = useCallback((listingId: string, count: number) => {
    setCommentCounts((current) => current[listingId] === count ? current : { ...current, [listingId]: count })
  }, [])
  const categoryOptions = ['All', ...categories]
  const visible = useMemo(() => listings.filter((item) => (!savedOnly || watchlistIds.includes(item.id)) && (category === 'All' || item.category === category) && item.title.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => {
    if (nearbySort && buyerLocation) {
      const distanceFor = (listing: MarketplaceListing) => typeof listing.latitude === 'number' && typeof listing.longitude === 'number'
        ? distanceInKm(buyerLocation, { latitude: listing.latitude, longitude: listing.longitude })
        : null
      const distanceA = distanceFor(a)
      const distanceB = distanceFor(b)
      if (distanceA === null && distanceB !== null) return 1
      if (distanceA !== null && distanceB === null) return -1
      if (distanceA !== null && distanceB !== null && distanceA !== distanceB) return distanceA - distanceB
    }
    return sort === 'price' ? a.price - b.price : 0
  }), [listings, category, search, sort, nearbySort, buyerLocation, savedOnly, watchlistIds])

  const handleNearby = async () => {
    if (nearbySort) {
      setNearbySort(false)
      setBuyerLocation(null)
      setSort('featured')
      setLocationError('')
      return
    }
    setLocationBusy(true)
    setLocationError('')
    try {
      setBuyerLocation(await getCurrentLocation())
      setNearbySort(true)
    } catch (caught) {
      setLocationError(caught instanceof Error ? caught.message : 'Could not get your location.')
    } finally {
      setLocationBusy(false)
    }
  }

  return <section className="min-w-0"><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-display text-[32px] font-semibold leading-tight tracking-[-.03em] text-[#1c2b26]">Shop</h1><p className="mt-1.5 text-sm text-[#7a8781]">Fixed-price finds, ready for a local handoff.</p></div><Button variant="secondary" onClick={onOpenCart} icon={<ShoppingCart size={16} />}>View cart</Button></div>
    <div className="mb-5 flex flex-col gap-3 sm:flex-row"><label className="relative min-w-0 flex-1"><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8d9992]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search fixed-price listings" className="h-10 w-full rounded-xl border border-[#e4eae5] bg-white pl-10 pr-3 text-sm outline-none focus:border-[#9ab4a2]" /></label><button type="button" onClick={() => { setNearbySort(false); setBuyerLocation(null); setSort((value) => value === 'featured' ? 'price' : 'featured') }} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#e4eae5] bg-white px-3 text-xs font-semibold text-[#66766e]"><ArrowDownUp size={14} />{sort === 'price' ? 'Price: low to high' : 'Featured'}</button><Button variant={nearbySort ? 'primary' : 'secondary'} disabled={locationBusy} onClick={() => void handleNearby()} icon={<MapPin size={14} />}>{locationBusy ? 'Getting location…' : nearbySort ? 'Nearby (on)' : 'Nearby'}</Button><button type="button" onClick={() => setSavedOnly((value) => !value)} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold ${savedOnly ? 'bg-[#263b33] text-white' : 'border border-[#e4eae5] bg-white text-[#66766e]'}`}><Bookmark size={14} />{savedOnly ? 'Saved only' : 'Saved items'}</button></div>
    {locationError && <div role="alert" className="mb-4 rounded-xl border border-[#f0d7d2] bg-white px-4 py-3 text-sm text-[#a34237]">{locationError}</div>}
    {nearbySort && <p role="status" className="mb-4 text-xs text-[#66766e]">Products with location details are sorted by distance. Other products remain below them.</p>}
    <div className="scrollbar-hidden mb-5 flex gap-2 overflow-x-auto pb-1">{categoryOptions.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`inline-flex w-max flex-none whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-semibold ${category === item ? 'border-[#263b33] bg-[#263b33] text-white' : 'border-[#e3e9e4] bg-white text-[#73817a] hover:border-[#b9c8bd] hover:text-[#263b33]'}`}>{item}</button>)}</div>
    {error && <div role="alert" className="mb-4 rounded-xl border border-[#f0d7d2] bg-white px-4 py-3 text-sm text-[#a34237]">{error}</div>}
    {visible.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">{visible.map((listing) => <ListingCard key={listing.id} listing={listing} onAdd={onAdd} inCart={cartHas(listing.id)} busy={listing.quantityAvailable < 1} saved={watchlistIds.includes(listing.id)} onToggleSaved={onToggleSaved} distanceKm={nearbySort && buyerLocation && typeof listing.latitude === 'number' && typeof listing.longitude === 'number' ? distanceInKm(buyerLocation, { latitude: listing.latitude, longitude: listing.longitude }) : null} commentsCount={commentCounts[listing.id] ?? listing.commentsCount ?? 0} onOpenComments={setCommentsListing} session={session} emailConfirmed={emailConfirmed} onRequestSignIn={onRequestSignIn} />)}</div> : <div className="rounded-[18px] border border-dashed border-[#dce5de] bg-white px-6 py-16 text-center text-sm text-[#7a8781]">{error ? 'Shop items are temporarily unavailable.' : 'No fixed-price listings match this search.'}</div>}
    {commentsListing && <ProductCommentsSheet listing={commentsListing} open session={session} emailConfirmed={emailConfirmed} onClose={closeComments} onRequestSignIn={onRequestSignIn} onCountChange={updateCommentCount} />}
  </section>
}
