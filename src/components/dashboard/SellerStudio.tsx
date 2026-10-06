import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Activity, ArrowDownRight, ArrowRight, BadgeCheck, Boxes, Check, ChevronRight, CircleDollarSign, Clock3, ImagePlus, LayoutGrid, ListFilter, MapPin, Package, PackageCheck, Search, ShieldCheck, ShieldHalf, ShieldAlert, Sparkles, Store, Truck } from 'lucide-react'
import type { Auction, FulfillmentMethod, MarketplaceListing, SellerOrderItem, Verdict } from '../../types'
import { Button } from '../common/Button'
import { CreateListingPage } from './CreateListingModal'
import { SellerVerdictModal } from './SellerVerdictModal'
import { useCurrency } from '../../lib/CurrencyContext'
import { getCurrentLocation } from '../../lib/geolocation'
import { getSellerVerification } from '../../services/api'
import { updateListingLocation } from '../../services/listingApi'
import { CartApiError, getSellerOrders, updateOrderFulfillment } from '../../services/cartApi'
import { SellerVerificationPage } from './SellerVerificationPage'

type StudioSection = 'overview' | 'inventory' | 'auctions' | 'orders'
type StudioProps = {
  auctions: Auction[]
  userId?: string
  trustScore: number | null
  completedAuctions: number | null
  session: Session | null
  emailConfirmed: boolean
  ownListings: MarketplaceListing[]
  onRequestSignIn: () => void
  onListingCreated: (listing: MarketplaceListing) => void
  onListingUpdated: (listing: MarketplaceListing) => void
  onAuctionCreated: (auction: Auction) => void
  onVerdict: (auction: Auction, decision: Verdict) => Promise<void>
  onNotice: (message: string, kind?: 'success' | 'error') => void
}

const sections: Array<{ id: StudioSection; label: string; icon: typeof LayoutGrid }> = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'auctions', label: 'Auctions', icon: Activity },
  { id: 'orders', label: 'Sales', icon: PackageCheck },
]

function SellerStudio({ auctions, userId, trustScore, completedAuctions, session, emailConfirmed, ownListings, onRequestSignIn, onListingCreated, onListingUpdated, onAuctionCreated, onVerdict, onNotice }: StudioProps) {
  const { formatUsd } = useCurrency()
  const currency = { format: formatUsd }
  const location = useLocation()
  const navigate = useNavigate()
  const [section, setSection] = useState<StudioSection>('overview')
  const [query, setQuery] = useState('')
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null)
  const [locationSavingId, setLocationSavingId] = useState<string | null>(null)
  const [orderItems, setOrderItems] = useState<SellerOrderItem[]>([])
  const [ordersLoading, setOrdersLoading] = useState(Boolean(session))
  const [ordersError, setOrdersError] = useState('')
  const [ordersErrorRequestId, setOrdersErrorRequestId] = useState('')
  const [ordersReloadKey, setOrdersReloadKey] = useState(0)
  const [fulfillmentBusyId, setFulfillmentBusyId] = useState<string | null>(null)
  const [sellerVerificationComplete, setSellerVerificationComplete] = useState(false)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    void getSellerOrders(session).then((items) => {
      if (!cancelled) setOrderItems(items)
    }).catch((caught: unknown) => {
      if (!cancelled) {
        setOrdersError(caught instanceof Error ? caught.message : 'Sales could not be loaded.')
        setOrdersErrorRequestId(caught instanceof CartApiError ? caught.requestId ?? '' : '')
      }
    }).finally(() => {
      if (!cancelled) setOrdersLoading(false)
    })
    return () => { cancelled = true }
  }, [session, ordersReloadKey])

  useEffect(() => {
    if (!session || !emailConfirmed) {
      setSellerVerificationComplete(false)
      return
    }
    let cancelled = false
    void getSellerVerification(session).then((verification) => {
      if (!cancelled) setSellerVerificationComplete(verification?.identityStatus === 'VERIFIED' && verification.payoutStatus === 'VERIFIED')
    }).catch(() => {
      if (!cancelled) setSellerVerificationComplete(false)
    })
    return () => { cancelled = true }
  }, [session, emailConfirmed])

  const pending = auctions.filter((auction) => auction.status === 'PENDING_APPROVAL' && (!userId || auction.sellerId === userId))
  const active = auctions.filter((auction) => auction.status === 'ACTIVE' && (!userId || auction.sellerId === userId))
  const closed = auctions.filter((auction) => ['SOLD', 'REJECTED', 'CLOSED'].includes(auction.status) && (!userId || auction.sellerId === userId))
  const unitsAvailable = ownListings.reduce((total, listing) => total + listing.quantityAvailable, 0)
  const lowStock = ownListings.filter((listing) => listing.quantityAvailable > 0 && listing.quantityAvailable <= 2)
  const liveBidTotal = active.reduce((total, auction) => total + auction.currentHighestBid, 0)
  const sellerName = session?.user.user_metadata.full_name?.split(' ')[0] || session?.user.email?.split('@')[0] || 'Seller'

  const filteredListings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return ownListings
    return ownListings.filter((listing) => `${listing.title} ${listing.category} ${listing.location}`.toLowerCase().includes(normalizedQuery))
  }, [ownListings, query])

  const startListing = () => {
    if (!session) {
      onRequestSignIn()
      return
    }
    if (!emailConfirmed) {
      onNotice('Confirm your email before adding products.', 'error')
      return
    }
    navigate(sellerVerificationComplete ? '/seller/products/new' : '/seller/verification', { state: { returnTo: location.pathname } })
  }

  const reviewVerdict = async (decision: Verdict) => {
    if (!selectedAuction) return
    await onVerdict(selectedAuction, decision)
    onNotice(decision === 'ACCEPT' ? 'Sale confirmed. Your seller trust improved.' : 'Bid rejected. The listing is frozen and your trust score changed.')
    setSelectedAuction(null)
  }

  const saveListingLocation = async (listing: MarketplaceListing) => {
    if (!session) return
    setLocationSavingId(listing.id)
    try {
      const coordinates = await getCurrentLocation()
      const updatedListing = await updateListingLocation(listing.id, coordinates, session)
      onListingUpdated(updatedListing)
      onNotice(`Nearby location saved for ${listing.title}.`)
    } catch (caught) {
      onNotice(caught instanceof Error ? caught.message : 'Could not save this product location.', 'error')
    } finally {
      setLocationSavingId(null)
    }
  }

  const setFulfillment = async (item: SellerOrderItem, method: FulfillmentMethod) => {
    if (!session) return
    setFulfillmentBusyId(item.id)
    setOrdersError('')
    setOrdersErrorRequestId('')
    try {
      const updated = await updateOrderFulfillment(item.id, method, session)
      setOrderItems((current) => current.map((orderItem) => orderItem.id === item.id ? updated : orderItem))
      onNotice(method === 'PICKUP' ? `${item.title} is ready for pickup.` : `${item.title} marked as shipped.`)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The sale could not be updated.'
      setOrdersError(message)
      setOrdersErrorRequestId(caught instanceof CartApiError ? caught.requestId ?? '' : '')
      onNotice(message, 'error')
    } finally {
      setFulfillmentBusyId(null)
    }
  }

  if (location.pathname === '/seller/products/new') {
    return <CreateListingPage onClose={() => navigate('/seller')} session={session} onCreated={onListingCreated} onAuctionCreated={onAuctionCreated} />
  }
  if (location.pathname === '/seller/verification') {
    return <SellerVerificationPage session={session} emailConfirmed={emailConfirmed} onRequestSignIn={onRequestSignIn} onVerified={() => navigate('/seller/products/new')} />
  }

  return <section className="min-w-0 pb-2 enter-up">
    <div className="relative mb-6 overflow-hidden rounded-[18px] border border-[#dfe8dc] bg-[#edf4e9] px-5 py-6 sm:px-7 sm:py-7">
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#55705a]"><Store size={13} /> Seller workspace <span className="h-px w-7 bg-[#a9baa2]" /> Campus commerce</div>
          <h1 className="font-display text-[30px] font-semibold leading-tight text-[#203b2d] sm:text-[36px]">Good morning, {sellerName}.</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#657968]">Your shop, auctions, and seller standing. Everything that needs your attention is gathered here.</p>
        </div>
        <Button onClick={startListing} icon={<ImagePlus size={16} />} className="shrink-0">Add a product</Button>
      </div>
      <div className="pointer-events-none absolute -right-5 -top-12 size-52 rounded-full border-[28px] border-white/35" />
      <div className="pointer-events-none absolute -bottom-20 right-32 size-40 rounded-full border-[18px] border-[#d9e7d2]/60" />
    </div>

    <div className="mb-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
      <Metric icon={<Package size={16} />} label="Products listed" value={ownListings.length.toLocaleString()} note={ownListings.length === 1 ? 'One item in your shop' : 'Across your shop'} tone="green" />
      <Metric icon={<Boxes size={16} />} label="Units available" value={unitsAvailable.toLocaleString()} note={lowStock.length ? `${lowStock.length} ${lowStock.length === 1 ? 'item' : 'items'} running low` : 'Stock is looking good'} tone={lowStock.length ? 'amber' : 'lime'} />
      <Metric icon={<Activity size={16} />} label="Live auctions" value={active.length.toLocaleString()} note={active.length ? `${currency.format(liveBidTotal)} current bid total` : 'No rooms running'} tone="blue" />
      <Metric icon={<ShieldCheck size={16} />} label="Seller trust" value={trustScore === null ? '—' : `${Math.round(trustScore)}`} note={completedAuctions === null ? 'Complete sales to build trust' : `${completedAuctions} completed ${completedAuctions === 1 ? 'sale' : 'sales'}`} tone="dark" />
    </div>

    <div className="mb-5 flex items-center justify-between gap-3 border-b border-[#e0e7e1]">
      <div className="flex min-w-0 gap-1 overflow-x-auto scrollbar-hidden" role="tablist" aria-label="Seller studio sections">
        {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={section === id} onClick={() => setSection(id)} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${section === id ? 'border-[#315f49] text-[#315f49]' : 'border-transparent text-[#839087] hover:text-[#425c4d]'}`}><Icon size={15} />{label}{id === 'auctions' && pending.length > 0 && <span className="grid size-[18px] place-items-center rounded-full bg-[#d9523e] text-[10px] font-bold text-white">{pending.length}</span>}{id === 'orders' && orderItems.some((item) => item.fulfillmentStatus === 'PENDING_HANDOFF') && <span className="grid size-[18px] place-items-center rounded-full bg-[#d9523e] text-[10px] font-bold text-white">{orderItems.filter((item) => item.fulfillmentStatus === 'PENDING_HANDOFF').length}</span>}</button>)}
      </div>
      {section === 'inventory' && <span className="hidden shrink-0 text-xs text-[#8b9690] sm:block">{ownListings.length} total</span>}
    </div>

    {section === 'overview' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,.8fr)]">
      <div className="space-y-5">
        <section className="overflow-hidden rounded-[14px] border border-[#e2e9e3] bg-white">
          <div className="flex items-center justify-between border-b border-[#edf1ed] px-4 py-4 sm:px-5"><div><div className="flex items-center gap-2"><h2 className="font-display text-base font-semibold text-[#263c31]">Needs your attention</h2>{pending.length > 0 && <span className="rounded-full bg-[#fff0dc] px-2 py-0.5 text-[10px] font-bold text-[#9a6631]">{pending.length} pending</span>}</div><p className="mt-1 text-xs text-[#849087]">Keep sales moving with a quick check-in.</p></div><button type="button" onClick={() => setSection('auctions')} className="inline-flex items-center gap-1 text-xs font-semibold text-[#456b54] hover:text-[#263c31]">View queue <ArrowRight size={14} /></button></div>
          {pending.length > 0 || lowStock.length > 0 ? <div className="divide-y divide-[#f0f3f0]">
            {pending.slice(0, 3).map((auction) => <div key={auction.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff1dd] text-[#a36d32]"><Clock3 size={17} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#33453a]">Confirm the winning bid</p><p className="mt-0.5 truncate text-xs text-[#8a958e]">{auction.title} · {currency.format(auction.currentHighestBid)}</p></div><button type="button" onClick={() => setSelectedAuction(auction)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#e3e9e2] px-3 text-xs font-semibold text-[#425f4b] hover:bg-[#f6f8f5]">Review <ChevronRight size={14} /></button></div>)}
            {lowStock.slice(0, 2).map((listing) => <div key={listing.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff4df] text-[#aa7936]"><ArrowDownRight size={17} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#33453a]">Stock running low</p><p className="mt-0.5 truncate text-xs text-[#8a958e]">{listing.title} · {listing.quantityAvailable} left</p></div><button type="button" onClick={() => setSection('inventory')} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-[#66786b] hover:bg-[#f6f8f5]">View item</button></div>)}
          </div> : <div className="flex items-center gap-3 px-4 py-5 sm:px-5"><div className="grid size-10 place-items-center rounded-xl bg-[#eaf4eb] text-[#568164]"><Check size={17} /></div><div><p className="text-sm font-semibold text-[#3c5544]">All caught up</p><p className="mt-0.5 text-xs text-[#89948d]">No pending decisions or low-stock items.</p></div></div>}
        </section>

        <section className="overflow-hidden rounded-[14px] border border-[#e2e9e3] bg-white">
          <div className="flex items-center justify-between border-b border-[#edf1ed] px-4 py-4 sm:px-5"><div><h2 className="font-display text-base font-semibold text-[#263c31]">Your inventory</h2><p className="mt-1 text-xs text-[#849087]">The latest products in your campus shop.</p></div><button type="button" onClick={() => setSection('inventory')} className="inline-flex items-center gap-1 text-xs font-semibold text-[#456b54] hover:text-[#263c31]">See all <ArrowRight size={14} /></button></div>
          {ownListings.length ? <div className="divide-y divide-[#f0f3f0]">{ownListings.slice(0, 4).map((listing) => <ListingRow key={listing.id} listing={listing} />)}</div> : <EmptyState icon={<Package size={18} />} title="Your shop is ready" description="Add a product to put your first campus find up for sale." action="Add a product" onAction={startListing} />}
        </section>
      </div>

      <aside className="space-y-5">
        <section className="rounded-[14px] border border-[#dfe7de] bg-[#f1f5ed] p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><div className="grid size-9 place-items-center rounded-xl bg-white text-[#56745a]"><ShieldHalf size={18} /></div><span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-[#607966]"><BadgeCheck size={12} /> Seller standing</span></div><p className="font-display text-[34px] font-semibold leading-none text-[#2b4937]">{trustScore === null ? '—' : Math.round(trustScore)}<span className="ml-1 text-sm font-medium text-[#819282]">/100</span></p><div className="mt-4 h-2 overflow-hidden rounded-full bg-[#dce6d9]"><div className="h-full rounded-full bg-[#638a64] transition-[width]" style={{ width: `${trustScore === null ? 0 : Math.max(0, Math.min(100, trustScore))}%` }} /></div><p className="mt-3 text-xs leading-5 text-[#6f806e]">{completedAuctions ? `You've completed ${completedAuctions} ${completedAuctions === 1 ? 'sale' : 'sales'}.` : 'Complete your first sale to start building a visible track record.'} Reliable follow-through helps buyers choose you.</p></section>

        <section className="overflow-hidden rounded-[14px] border border-[#e2e9e3] bg-white"><div className="flex items-center justify-between border-b border-[#edf1ed] px-4 py-4"><div><h2 className="font-display text-base font-semibold text-[#263c31]">Live rooms</h2><p className="mt-1 text-xs text-[#849087]">Your auctions accepting bids.</p></div><span className="grid min-w-7 place-items-center rounded-full bg-[#edf5eb] px-2 py-1 text-xs font-bold text-[#527354]">{active.length}</span></div>{active.length ? <div className="divide-y divide-[#f0f3f0]">{active.slice(0, 3).map((auction) => <AuctionRow key={auction.id} auction={auction} />)}</div> : <p className="px-4 py-5 text-sm text-[#89948d]">No live auctions right now.</p>}</section>

        <button type="button" onClick={startListing} className="group flex w-full items-center gap-3 rounded-[14px] border border-dashed border-[#cdd9cb] bg-white p-4 text-left transition hover:border-[#819d7d] hover:bg-[#fbfcfa]"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e8f1df] text-[#53724e]"><Sparkles size={17} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#354b3a]">Grow your shop</span><span className="mt-0.5 block text-xs text-[#869287]">Add another campus find</span></span><ChevronRight size={16} className="text-[#88978a] transition-transform group-hover:translate-x-0.5" /></button>
      </aside>
    </div>}

    {section === 'inventory' && <section className="overflow-hidden rounded-[14px] border border-[#e2e9e3] bg-white">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#edf1ed] px-4 py-4 sm:px-5"><div><div className="flex items-center gap-2"><h2 className="font-display text-lg font-semibold text-[#263c31]">Inventory</h2><span className="rounded-full bg-[#edf3eb] px-2 py-0.5 text-[10px] font-bold text-[#5c765d]">{ownListings.length}</span></div><p className="mt-1 text-xs text-[#849087]">Products listed by your seller account.</p></div><Button onClick={startListing} icon={<ImagePlus size={15} />}>Add a product</Button></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ed] bg-[#fbfcfa] px-4 py-3 sm:px-5"><label className="relative min-w-0 flex-1 sm:max-w-sm"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa59d]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your products" aria-label="Search your products" className="h-10 w-full rounded-lg border border-[#e2e8e2] bg-white pl-9 pr-3 text-sm outline-none placeholder:text-[#a2aca5] focus:border-[#91aa92]" /></label><span className="inline-flex items-center gap-1.5 text-xs text-[#849087]"><ListFilter size={14} />{filteredListings.length} shown</span></div>
      {filteredListings.length ? <div className="divide-y divide-[#eef2ee]">{filteredListings.map((listing) => <ListingRow key={listing.id} listing={listing} detailed locationBusy={locationSavingId === listing.id} onSetLocation={(item) => void saveListingLocation(item)} />)}</div> : <EmptyState icon={<Package size={18} />} title={query ? 'No matching products' : 'No products yet'} description={query ? 'Try another title, category, or campus location.' : 'Add a product and it will appear here for buyers.'} action={query ? undefined : 'Add a product'} onAction={query ? undefined : startListing} />}
    </section>}

    {section === 'auctions' && <div className="space-y-5">
      {pending.length > 0 && <section className="overflow-hidden rounded-[14px] border border-[#eadfc8] bg-[#fffaf1]"><div className="flex items-center gap-2 border-b border-[#f1e8d7] px-4 py-4 sm:px-5"><Clock3 size={16} className="text-[#a87637]" /><div><h2 className="font-display text-base font-semibold text-[#4b3d2b]">Decision queue</h2><p className="mt-0.5 text-xs text-[#97866b]">Choose whether to accept each winning bid.</p></div><span className="ml-auto rounded-full bg-[#f5e9d1] px-2 py-1 text-[10px] font-bold text-[#916937]">{pending.length}</span></div><div className="divide-y divide-[#f2eadc]">{pending.map((auction) => <AuctionRow key={auction.id} auction={auction} decision onReview={() => setSelectedAuction(auction)} />)}</div></section>}
      <section className="overflow-hidden rounded-[14px] border border-[#e2e9e3] bg-white"><div className="flex items-center justify-between border-b border-[#edf1ed] px-4 py-4 sm:px-5"><div><h2 className="font-display text-base font-semibold text-[#263c31]">Active auctions</h2><p className="mt-1 text-xs text-[#849087]">Live bids and closing times.</p></div><span className="rounded-full bg-[#edf5eb] px-2 py-1 text-xs font-bold text-[#527354]">{active.length}</span></div>{active.length ? <div className="divide-y divide-[#eef2ee]">{active.map((auction) => <AuctionRow key={auction.id} auction={auction} detailed />)}</div> : <EmptyState icon={<Activity size={18} />} title="No auctions in progress" description="Create a product listing first, then launch an auction when it is ready." action="Add a product" onAction={startListing} />}</section>
      <section className="overflow-hidden rounded-[14px] border border-[#e2e9e3] bg-white"><div className="flex items-center justify-between border-b border-[#edf1ed] px-4 py-4 sm:px-5"><div><h2 className="font-display text-base font-semibold text-[#263c31]">Past rooms</h2><p className="mt-1 text-xs text-[#849087]">Recently closed, sold, or rejected.</p></div><span className="text-xs font-semibold text-[#87948b]">{closed.length}</span></div>{closed.length ? <div className="divide-y divide-[#eef2ee]">{closed.slice(0, 8).map((auction) => <AuctionRow key={auction.id} auction={auction} detailed />)}</div> : <p className="px-4 py-5 text-sm text-[#89948d] sm:px-5">Finished auctions will appear here.</p>}</section>
    </div>}

    {section === 'orders' && <section className="overflow-hidden rounded-[14px] border border-[#e2e9e3] bg-white">
      <div className="border-b border-[#edf1ed] px-4 py-4 sm:px-5"><h2 className="font-display text-base font-semibold text-[#263c31]">Paid sales</h2><p className="mt-1 text-xs text-[#849087]">Choose pickup or shipping for each paid item. Buyers can track the update and confirm receipt.</p></div>
      {ordersError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0d7d2] bg-[#fff5f2] px-4 py-3 text-sm text-[#a34237]"><div><p>{ordersError}</p>{ordersErrorRequestId && <p className="mt-1 text-xs">Support reference: {ordersErrorRequestId}</p>}</div><Button variant="secondary" onClick={() => { setOrdersLoading(true); setOrdersError(''); setOrdersErrorRequestId(''); setOrdersReloadKey((value) => value + 1) }} className="min-h-8 px-3 text-xs">Try again</Button></div>}
      {ordersLoading ? <p className="px-4 py-8 text-center text-sm text-[#849087]">Loading sales…</p> : orderItems.length === 0 ? <p className="px-4 py-8 text-center text-sm text-[#849087]">Paid orders will appear here after a buyer checks out.</p> : <div className="divide-y divide-[#eef2ee]">{orderItems.map((item) => <article key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf4ed] text-[#587b62]">{item.fulfillmentStatus === 'SHIPPED' ? <Truck size={18} /> : <PackageCheck size={18} />}</span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#34483b]">{item.quantity} × {item.title}</p><p className="mt-1 text-xs text-[#829087]">Buyer: {item.order.buyer.displayName || 'QuickResell buyer'} · {item.paymentStatus === 'PAID' ? 'Paid' : 'Payment not confirmed'} · {item.fulfillmentStatus === 'PENDING_HANDOFF' ? 'Awaiting fulfillment' : item.fulfillmentStatus === 'READY_FOR_PICKUP' ? 'Ready for pickup' : item.fulfillmentStatus === 'SHIPPED' ? 'Shipped' : 'Received'}</p><p className="mt-0.5 text-[11px] text-[#929d96]">Order {item.order.id} · {new Date(item.order.createdAt).toLocaleDateString()}</p></div>
        <span className="text-sm font-semibold text-[#405549]">{currency.format(item.unitPriceCents * item.quantity / 100)}</span>
        {item.paymentStatus === 'PAID' && item.fulfillmentStatus === 'PENDING_HANDOFF' && <div className="flex w-full gap-2 sm:w-auto"><Button disabled={!emailConfirmed || fulfillmentBusyId === item.id} onClick={() => void setFulfillment(item, 'PICKUP')} icon={<MapPin size={14} />} className="min-h-9 px-3 text-xs">Pickup ready</Button><Button disabled={!emailConfirmed || fulfillmentBusyId === item.id} onClick={() => void setFulfillment(item, 'SHIPPING')} icon={<Truck size={14} />} className="min-h-9 px-3 text-xs">Mark shipped</Button></div>}
      </article>)}</div>}
      {!emailConfirmed && session && <p className="border-t border-[#edf1ed] px-4 py-3 text-xs text-[#89958e]">Confirm your email before updating order fulfillment.</p>}
    </section>}

    <div className="mt-5 flex items-start gap-2 border-t border-[#e4eae4] pt-4 text-[11px] leading-5 text-[#869188]"><ShieldAlert size={14} className="mt-0.5 shrink-0" />Rejecting a winning bid affects your trust score and freezes the listing. Only reject when you cannot complete the sale.</div>
    <SellerVerdictModal auction={selectedAuction} open={Boolean(selectedAuction)} onClose={() => setSelectedAuction(null)} onSubmit={reviewVerdict} />
  </section>
}

function Metric({ icon, label, value, note, tone }: { icon: ReactNode; label: string; value: string; note: string; tone: 'green' | 'amber' | 'lime' | 'blue' | 'dark' }) {
  const styles = {
    green: 'bg-[#eef4ed] text-[#567358]',
    amber: 'bg-[#fff3df] text-[#9b7135]',
    lime: 'bg-[#f0f4d9] text-[#75833e]',
    blue: 'bg-[#eaf2f3] text-[#55767c]',
    dark: 'bg-[#e9efea] text-[#354d3e]',
  }
  return <div className="min-w-0 rounded-[12px] border border-[#e3eae3] bg-white p-3.5 sm:p-4"><div className="flex items-center gap-2"><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${styles[tone]}`}>{icon}</span><span className="truncate text-xs font-medium text-[#7d8981]">{label}</span></div><p className="font-display mt-3 text-[26px] font-semibold leading-none text-[#2a3e31]">{value}</p><p className="mt-2 truncate text-[10px] text-[#929c95] sm:text-[11px]">{note}</p></div>
}

function ListingRow({ listing, detailed = false, locationBusy = false, onSetLocation }: { listing: MarketplaceListing; detailed?: boolean; locationBusy?: boolean; onSetLocation?: (listing: MarketplaceListing) => void }) {
  const { formatUsd } = useCurrency()
  const low = listing.quantityAvailable > 0 && listing.quantityAvailable <= 2
  return <article className="flex min-w-0 items-center gap-3 px-4 py-3.5 sm:px-5"><div className="grid size-[52px] shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[#f1f4ef]">{listing.image ? <img src={listing.image} alt={listing.title} className="size-full object-cover" loading="lazy" decoding="async" /> : <Package size={19} className="text-[#94a095]" />}</div><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-semibold text-[#35473c]">{listing.title}</h3>{low && <span className="hidden shrink-0 rounded-full bg-[#fff3df] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#9a7137] sm:inline">Low stock</span>}</div><p className="mt-1 truncate text-xs text-[#87938b]">{listing.category}{detailed ? ` · ${listing.location}` : ''}</p>{detailed && <div className="mt-2 flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${listing.quantityAvailable > 0 ? 'text-[#57805c]' : 'text-[#a45145]'}`}><span className={`size-1.5 rounded-full ${listing.quantityAvailable > 0 ? 'bg-[#6e9d70]' : 'bg-[#bd5d4d]'}`} />{listing.quantityAvailable > 0 ? 'Available' : 'Out of stock'}</span><span className="text-[10px] text-[#9aa39c]">{listing.quantityAvailable} {listing.quantityAvailable === 1 ? 'unit' : 'units'}</span>{onSetLocation && <button type="button" disabled={locationBusy} onClick={() => onSetLocation(listing)} className="inline-flex min-h-7 items-center gap-1 rounded-lg border border-[#e1e8e2] px-2 text-[10px] font-semibold text-[#557261] transition hover:bg-[#f5f8f4] disabled:opacity-50"><MapPin size={11} />{locationBusy ? 'Saving…' : listing.latitude == null ? 'Set nearby location' : 'Refresh location'}</button>}</div>}</div><div className="shrink-0 text-right"><p className="font-display text-sm font-semibold text-[#304738]">{formatUsd(listing.price)}</p><p className="mt-1 text-[10px] text-[#98a19b]">{listing.quantityAvailable} {detailed ? 'items' : 'left'}</p></div></article>
}

function AuctionRow({ auction, decision = false, detailed = false, onReview }: { auction: Auction; decision?: boolean; detailed?: boolean; onReview?: () => void }) {
  const { formatUsd } = useCurrency()
  const currency = { format: (amount: number) => formatUsd(amount, 0) }
  const statusTone = auction.status === 'ACTIVE' ? 'bg-[#edf5eb] text-[#557454]' : auction.status === 'SOLD' ? 'bg-[#eaf2ed] text-[#4b735a]' : auction.status === 'REJECTED' ? 'bg-[#faeeeb] text-[#a35347]' : 'bg-[#f0f2ef] text-[#77837a]'
  return <div className="flex min-w-0 flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5"><div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-[#f1f4ef]">{auction.image ? <img src={auction.image} alt="" className="size-full object-cover" loading="lazy" decoding="async" /> : <CircleDollarSign size={18} className="text-[#91a094]" />}</div><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-semibold text-[#35473c]">{auction.title}</h3>{detailed && <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide sm:inline ${statusTone}`}>{auction.status.replace('_', ' ')}</span>}</div><p className="mt-1 truncate text-xs text-[#87938b]">{decision ? `High bidder: ${auction.bids[0]?.bidder.displayName ?? 'Bidder details unavailable'}` : `${auction.bids.length} ${auction.bids.length === 1 ? 'bid' : 'bids'} · ${detailed ? auction.category : 'Current bid'}`}</p>{detailed && <p className="mt-1 text-[10px] text-[#9aa39c]">{auction.status === 'ACTIVE' ? `Ends ${new Date(auction.endsAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : `Updated ${new Date(auction.endsAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`}</p>}</div><div className="ml-auto flex items-center gap-3"><div className="text-right"><p className="font-display text-sm font-semibold text-[#304738]">{currency.format(auction.currentHighestBid)}</p><p className="mt-1 text-[10px] text-[#98a19b]">{decision ? 'Winning bid' : 'Current bid'}</p></div>{decision && onReview && <Button onClick={onReview} icon={<ChevronRight size={14} />} className="min-h-9 rounded-lg px-3 text-xs">Review</Button>}</div></div>
}

function EmptyState({ icon, title, description, action, onAction }: { icon: ReactNode; title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="flex flex-col items-center px-5 py-10 text-center"><span className="mb-3 grid size-10 place-items-center rounded-xl bg-[#eef3ed] text-[#69806b]">{icon}</span><h3 className="text-sm font-semibold text-[#3a4e40]">{title}</h3><p className="mt-1 max-w-sm text-xs leading-5 text-[#8a958d]">{description}</p>{action && onAction && <Button variant="secondary" onClick={onAction} icon={<ImagePlus size={14} />} className="mt-4 min-h-9 text-xs">{action}</Button>}</div>
}

export { SellerStudio }