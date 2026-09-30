import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Compass, GraduationCap, LayoutDashboard, Search, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Store, X } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { AuctionRoom } from './components/auction/AuctionRoom'
import { GlobalFeed } from './components/feed/GlobalFeed'
import { SellerDashboard } from './components/dashboard/SellerDashboard'
import { Button, IconButton } from './components/common/Button'
import { AuthPage } from './components/auth/AuthPage'
import { ShoppingCartPage } from './components/cart/ShoppingCartPage'
import { StorePage } from './components/store/StorePage'
import { TrustScoreBadge } from './components/common/TrustScoreBadge'
import { mockAuctions, mockSellerAuctions } from './data/mockAuctions'
import { mockListings } from './data/mockListings'
import { supabase } from './lib/supabase'
import { useAuctionFeedRealtime } from './hooks/useAuctionFeedRealtime'
import { useShoppingCart } from './hooks/useShoppingCart'
import { closeAuction, getPublicAuctions, getSellerAuctions, placeBid, submitVerdict } from './services/api'
import { getStoreListings } from './services/cartApi'
import type { Auction, Bid, MarketplaceListing, Verdict } from './types'

type View = 'feed' | 'shop' | 'cart' | 'dashboard'
type AuthMode = 'signin' | 'register'
type ToastMessage = { message: string; kind: 'success' | 'error' }

export default function MarketplaceApp() {
  const [auctions, setAuctions] = useState(mockAuctions)
  const [listings, setListings] = useState(mockListings)
  const [sellerAuctions, setSellerAuctions] = useState(mockSellerAuctions)
  const [view, setView] = useState<View>('feed')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [trustScore, setTrustScore] = useState(96)
  const [completedAuctions, setCompletedAuctions] = useState(12)
  const emailConfirmed = Boolean(session?.user.email_confirmed_at)
  const currentUserId = session?.user.id ?? 'demo-seller'
  const userCart = useShoppingCart(currentUserId, Boolean(session))
  const selectedAuction = auctions.find((auction) => auction.id === selectedId) ?? sellerAuctions.find((auction) => auction.id === selectedId) ?? null
  const demoMode = !session || !supabase

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user.email_confirmed_at) setAuthMode(null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session) return
    let cancelled = false
    void Promise.all([getPublicAuctions(session), getSellerAuctions(session), getStoreListings(session)]).then(([rooms, sellerData, storeItems]) => {
      if (!cancelled) {
        setAuctions(rooms)
        setListings(storeItems)
        setSellerAuctions(sellerData.auctions)
        setTrustScore(sellerData.trustScore)
        setCompletedAuctions(sellerData.completedAuctions)
      }
    }).catch(() => {
      if (!cancelled) showToast('Showing preview listings. Check the API and campus account configuration.', 'error')
    })
    return () => { cancelled = true }
  }, [session])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  function showToast(message: string, kind: ToastMessage['kind'] = 'success') { setToast({ message, kind }) }

  const resendConfirmation = async () => {
    if (!supabase || !session?.user.email) return
    const { error } = await supabase.auth.resend({ type: 'signup', email: session.user.email, options: { emailRedirectTo: window.location.origin } })
    showToast(error?.message ?? 'A new confirmation link has been sent.', error ? 'error' : 'success')
  }

  const updateRoom = (roomId: string, patch: Partial<Auction>) => {
    setAuctions((items) => items.map((item) => item.id === roomId ? { ...item, ...patch } : item))
    setSellerAuctions((items) => items.map((item) => item.id === roomId ? { ...item, ...patch } : item))
  }

  useAuctionFeedRealtime({
    onRoomUpdate: (patch) => updateRoom(patch.id, patch),
    onBid: (roomId, bid) => setAuctions((items) => items.map((item) => item.id === roomId
      ? { ...item, currentHighestBid: Math.max(item.currentHighestBid, bid.amount), highestBidderId: bid.bidder.id, bids: [bid, ...item.bids.filter((existing) => existing.id !== bid.id)] }
      : item)),
  })

  const handleBid = async (room: Auction, amount: number) => {
    if (session && !emailConfirmed) throw new Error('Confirm your email before placing bids.')
    if (demoMode) {
      if (amount <= room.currentHighestBid) throw new Error('Your bid must be higher than the current bid.')
      const bidder: Bid = { id: `demo-${Date.now()}`, amount, createdAt: new Date().toISOString(), bidder: { id: currentUserId, displayName: session?.user.user_metadata.full_name ?? 'You' } }
      const endsAt = new Date(room.endsAt).getTime() - Date.now() <= 10_000 ? new Date(new Date(room.endsAt).getTime() + 30_000).toISOString() : room.endsAt
      updateRoom(room.id, { currentHighestBid: amount, highestBidderId: currentUserId, endsAt, bids: [bidder, ...room.bids] })
      return
    }
    const result = await placeBid(room.id, amount, session)
    updateRoom(room.id, { ...result.auction, bids: [result.bid, ...room.bids.filter((bid) => bid.id !== result.bid.id)] })
  }

  const handleExpire = async (room: Auction) => {
    if (session && !emailConfirmed) throw new Error('Confirm your email before managing auctions.')
    if (demoMode) {
      updateRoom(room.id, { status: room.highestBidderId ? 'PENDING_APPROVAL' : 'CLOSED' })
      return
    }
    updateRoom(room.id, await closeAuction(room.id, session))
  }

  const handleVerdict = async (room: Auction, decision: Verdict) => {
    if (session && !emailConfirmed) throw new Error('Confirm your email before managing auctions.')
    if (demoMode) {
      const nextStatus = decision === 'ACCEPT' ? 'SOLD' : 'REJECTED'
      updateRoom(room.id, { status: nextStatus })
      setSellerAuctions((items) => items.map((item) => item.id === room.id ? { ...item, status: nextStatus } : item))
      setTrustScore((score) => Math.max(0, Math.min(100, score + (decision === 'ACCEPT' ? 5 : -20))))
      if (decision === 'ACCEPT') setCompletedAuctions((count) => count + 1)
      return
    }
    const result = await submitVerdict(room.id, decision, session)
    updateRoom(room.id, result.auction)
    setTrustScore(result.trustScore)
    if (decision === 'ACCEPT') setCompletedAuctions((count) => count + 1)
    setSellerAuctions((items) => items.map((item) => item.id === room.id ? result.auction : item))
  }

  const handleAddToCart = async (listing: MarketplaceListing) => {
    if (session && !emailConfirmed) {
      showToast('Confirm your email before using the cart.', 'error')
      return
    }
    try {
      await userCart.add(listing)
      showToast(`${listing.title} added to your cart.`)
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'This listing could not be added.', 'error')
    }
  }

  const handlePlaceOrder = async () => {
    if (session && !emailConfirmed) throw new Error('Confirm your email before checking out.')
    const order = await userCart.checkout()
    setListings((current) => current.map((listing) => {
      const purchased = order.items.find((item) => item.postId === listing.id)
      if (!purchased) return listing
      const quantityAvailable = Math.max(0, listing.quantityAvailable - purchased.quantity)
      return { ...listing, quantityAvailable }
    }).filter((listing) => listing.quantityAvailable > 0))
    return order
  }

  const searchResults = useMemo(() => search.trim() ? auctions.filter((auction) => auction.status === 'ACTIVE' && auction.title.toLowerCase().includes(search.toLowerCase())) : [], [auctions, search])
  const sellerRows = sellerAuctions

  const nav = <>
    <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.15em] text-[#98a39d]">Marketplace</p>
    <button type="button" onClick={() => { setView('feed'); setSelectedId(null) }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === 'feed' && !selectedId ? 'bg-[#edf4ed] text-[#2d5d4c]' : 'text-[#78867e] hover:bg-[#f1f4f1] hover:text-[#263b33]'}`}><Compass size={17} />Live auctions<span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] text-[#74847a]">{auctions.filter((item) => item.status === 'ACTIVE').length}</span></button>
    <button type="button" onClick={() => { setView('shop'); setSelectedId(null) }} className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === 'shop' ? 'bg-[#edf4ed] text-[#2d5d4c]' : 'text-[#78867e] hover:bg-[#f1f4f1] hover:text-[#263b33]'}`}><Store size={17} />Shop</button>
    <button type="button" onClick={() => { setView('cart'); setSelectedId(null) }} className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === 'cart' ? 'bg-[#edf4ed] text-[#2d5d4c]' : 'text-[#78867e] hover:bg-[#f1f4f1] hover:text-[#263b33]'}`}><ShoppingCart size={17} />Cart<span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] text-[#74847a]">{userCart.items.reduce((sum, item) => sum + item.quantity, 0)}</span></button>
    <button type="button" onClick={() => { setView('dashboard'); setSelectedId(null) }} className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === 'dashboard' ? 'bg-[#edf4ed] text-[#2d5d4c]' : 'text-[#78867e] hover:bg-[#f1f4f1] hover:text-[#263b33]'}`}><LayoutDashboard size={17} />Seller studio{sellerRows.some((item) => item.status === 'PENDING_APPROVAL') && <span className="ml-auto size-2 rounded-full bg-[#df704a]" />}</button>
  </>

  return authMode ? <AuthPage initialMode={authMode} onBack={() => setAuthMode(null)} onAuthenticated={() => { setAuthMode(null); showToast('You’re signed in. Welcome to Quick Resell.') }} /> : <div className="min-h-screen bg-[#f5f7f5] text-[#192724]">
    <header className="sticky top-0 z-30 flex h-[68px] items-center gap-4 border-b border-[#e6ebe7] bg-white/95 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <button type="button" onClick={() => { setView('feed'); setSelectedId(null) }} className="flex shrink-0 items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-[#d4f06b] text-[#243a33]"><ShoppingBag size={19} strokeWidth={2.5} /></span><span className="font-display text-[17px] font-bold tracking-[-.03em]">quick<span className="text-[#70917c]">resell</span></span></button>
      <div className={`relative mx-auto w-full max-w-[540px] ${searchOpen ? 'block' : 'hidden'} md:block`}><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#96a19b]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search finds around campus" className="h-10 w-full rounded-xl border border-[#e7ece8] bg-[#f7f9f7] pl-10 pr-4 text-sm outline-none transition focus:border-[#9ab4a2] focus:bg-white" />{search && <div className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-xl border border-[#e6ebe7] bg-white shadow-lg">{searchResults.map((auction) => <button key={auction.id} type="button" onClick={() => { setSelectedId(auction.id); setSearch(''); setSearchOpen(false) }} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#f5f8f5]"><img src={auction.image} alt="" className="size-10 rounded-lg object-cover" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{auction.title}</span><span className="text-xs text-[#74847a]">${auction.currentHighestBid}</span></button>)}{!searchResults.length && <p className="p-4 text-sm text-[#849189]">No matching live listings.</p>}</div>}</div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5"><span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[.08em] sm:inline-flex ${demoMode ? 'bg-[#f1f2e7] text-[#687145]' : 'bg-[#ebf5ee] text-[#477358]'}`}><span className={`size-1.5 rounded-full ${demoMode ? 'bg-[#aab365]' : 'bg-[#66a178]'}`} />{demoMode ? 'Preview mode' : 'Live connected'}</span><span className="relative"><IconButton label={`Open cart, ${userCart.items.reduce((sum, item) => sum + item.quantity, 0)} items`} onClick={() => { setSelectedId(null); setView('cart') }}><ShoppingCart size={18} /></IconButton>{userCart.items.length > 0 && <span className="pointer-events-none absolute right-0 top-0 grid min-h-4 min-w-4 place-items-center rounded-full bg-[#d94b3d] px-1 text-[9px] font-bold text-white">{userCart.items.reduce((sum, item) => sum + item.quantity, 0)}</span>}</span><IconButton label="Notifications"><Bell size={17} /></IconButton>{session ? <button type="button" onClick={() => void supabase?.auth.signOut()} className="ml-1 flex items-center gap-2 rounded-full border border-[#e7ece8] p-1 pr-3"><img src={session.user.user_metadata.avatar_url ?? 'https://i.pravatar.cc/96?img=32'} alt="" className="size-8 rounded-full object-cover" /><span className="hidden max-w-24 truncate text-xs font-semibold sm:block">{session.user.user_metadata.full_name ?? session.user.email}</span></button> : <Button variant="secondary" onClick={() => setAuthMode('signin')} className="ml-1 min-h-9 rounded-lg px-3 text-xs">Sign in</Button>}</div>
    </header>

    <div className="mx-auto grid max-w-[1640px] grid-cols-1 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_270px]">
      <aside className="sticky top-[68px] hidden h-[calc(100vh-68px)] flex-col border-r border-[#e6ebe7] bg-[#f9faf9] px-4 py-6 lg:flex"><nav className="space-y-1">{nav}</nav><div className="mt-auto rounded-[16px] bg-[#e9f0e8] p-4"><div className="mb-3 grid size-8 place-items-center rounded-lg bg-white text-[#537666]"><GraduationCap size={18} /></div><p className="font-display text-sm font-semibold text-[#2f4a3d]">Campus verified</p><p className="mt-1 text-[11px] leading-4 text-[#72867a]">Trade with people who are right around the corner.</p><div className="mt-3 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#63816f]"><ShieldCheck size={12} />Trust matters here</div></div></aside>

      <main className="min-w-0 px-4 pb-24 pt-6 sm:px-6 lg:px-7 lg:pb-8 lg:pt-7">
        {session && !emailConfirmed && <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ead9b0] bg-[#fff9e9] px-4 py-3 text-sm text-[#765b22]"><span>Confirm your email to bid, sell, message sellers, or place orders.</span><Button variant="secondary" onClick={() => void resendConfirmation()} className="min-h-8 rounded-lg px-3 text-xs">Resend confirmation</Button></div>}
        {selectedAuction ? <AuctionRoom auction={selectedAuction} userId={currentUserId} onBack={() => setSelectedId(null)} onBid={(amount) => handleBid(selectedAuction, amount)} onExpire={() => handleExpire(selectedAuction)} onNotice={showToast} onRoomUpdate={(patch) => updateRoom(selectedAuction.id, patch)} onVerdict={(decision) => handleVerdict(selectedAuction, decision)} /> : view === 'dashboard' ? <SellerDashboard auctions={sellerRows} userId={currentUserId} trustScore={trustScore} completedAuctions={completedAuctions} onVerdict={handleVerdict} onNotice={showToast} /> : view === 'shop' ? <StorePage listings={listings} cartHas={(postId) => userCart.items.some((item) => item.postId === postId)} onAdd={(listing) => void handleAddToCart(listing)} onOpenCart={() => setView('cart')} /> : view === 'cart' ? <ShoppingCartPage items={userCart.items} loading={userCart.loading} error={userCart.error} onShop={() => setView('shop')} onSetQuantity={userCart.setQuantity} onRemove={userCart.remove} onCheckout={handlePlaceOrder} onRefresh={userCart.refresh} /> : <GlobalFeed auctions={auctions} onOpen={(auction) => setSelectedId(auction.id)} />}
      </main>

      {!selectedAuction && view === 'feed' && <aside className="hidden border-l border-[#e6ebe7] bg-[#f9faf9] px-4 py-6 xl:block"><div className="mb-6 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8b9891]">Your profile</p><p className="font-display mt-1 text-sm font-semibold text-[#2b4036]">{session?.user.user_metadata.full_name ?? 'Jordan Lee'}</p></div><img src={session?.user.user_metadata.avatar_url ?? 'https://i.pravatar.cc/96?img=32'} alt="" className="size-10 rounded-full object-cover" /></div><div className="rounded-[16px] border border-[#e4eae5] bg-white p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-[#718078]">Seller standing</span><Sparkles size={14} className="text-[#9bad4e]" /></div><p className="font-display text-[31px] font-bold leading-none text-[#294339]">{trustScore}<span className="ml-1 text-sm font-semibold text-[#94a099]">/100</span></p><div className="mt-3"><TrustScoreBadge score={trustScore} completedAuctions={completedAuctions} noReserveHero /></div><p className="mt-3 border-t border-[#eff2ef] pt-3 text-[11px] leading-5 text-[#8a9690]">Your follow-through earns trust. Buyers can see your record in every room.</p></div><div className="mt-6"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[.1em] text-[#718078]">Ending soon</p></div><div className="space-y-2">{auctions.filter((item) => item.status === 'ACTIVE').slice(0, 3).map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="flex w-full items-center gap-2.5 rounded-xl border border-[#e8ede9] bg-white p-2 text-left transition hover:border-[#c9d8cd]"><img src={item.image} alt="" className="size-11 rounded-lg object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[#394b42]">{item.title}</span><span className="mt-1 block text-[10px] text-[#849189]">${item.currentHighestBid} · {item.bids.length} bids</span></span></button>)}</div></div><div className="mt-6 rounded-[14px] bg-[#dcecff] p-3.5"><div className="flex items-center gap-2 text-xs font-bold text-[#345b75]"><Store size={14} />Sell something nearby</div><p className="mt-1 text-[11px] leading-4 text-[#57758b]">List an item and let campus set the price.</p></div></aside>}
    </div>

    <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[#e3e9e4] bg-white/95 px-3 py-2 backdrop-blur lg:hidden"><button type="button" onClick={() => { setView('feed'); setSelectedId(null) }} className={`flex min-w-16 flex-col items-center gap-1 py-1 text-[10px] font-semibold ${view === 'feed' ? 'text-[#376b59]' : 'text-[#839087]'}`}><Compass size={19} />Auctions</button><button type="button" onClick={() => setView('shop')} className={`flex min-w-16 flex-col items-center gap-1 py-1 text-[10px] font-semibold ${view === 'shop' ? 'text-[#376b59]' : 'text-[#839087]'}`}><Store size={19} />Shop</button><button type="button" onClick={() => { setView('cart'); setSelectedId(null) }} className={`flex min-w-16 flex-col items-center gap-1 py-1 text-[10px] font-semibold ${view === 'cart' ? 'text-[#376b59]' : 'text-[#839087]'}`}><span className="relative"><ShoppingCart size={19} />{userCart.items.length > 0 && <span className="absolute -right-2 -top-1 grid min-h-3.5 min-w-3.5 place-items-center rounded-full bg-[#d94b3d] px-0.5 text-[8px] font-bold text-white">{userCart.items.reduce((sum, item) => sum + item.quantity, 0)}</span>}</span>Cart</button><button type="button" onClick={() => { setView('dashboard'); setSelectedId(null) }} className={`flex min-w-16 flex-col items-center gap-1 py-1 text-[10px] font-semibold ${view === 'dashboard' ? 'text-[#376b59]' : 'text-[#839087]'}`}><LayoutDashboard size={19} />Studio</button></nav>


    <AnimatePresence>{toast && <motion.div role="status" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className={`fixed bottom-20 left-1/2 z-[60] flex w-[calc(100%-32px)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl lg:bottom-6 ${toast.kind === 'error' ? 'bg-[#ad473c]' : 'bg-[#274c3d]'}`}><span className="flex-1">{toast.message}</span><IconButton label="Dismiss notification" className="size-8 text-white hover:bg-white/15 hover:text-white" onClick={() => setToast(null)}><X size={15} /></IconButton></motion.div>}</AnimatePresence>
  </div>
}
