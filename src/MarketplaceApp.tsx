import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, Bookmark, Compass, GraduationCap, ImagePlus, LayoutDashboard, Search, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Store, X } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { AuctionRoom } from './components/auction/AuctionRoom'
import { BidAdvert } from './components/auction/BidAdvert'
import { GlobalFeed } from './components/feed/GlobalFeed'
import { SellerStudio as SellerDashboard } from './components/dashboard/SellerStudio'
import { Button, IconButton } from './components/common/Button'
import { NavigationAssistant } from './components/common/NavigationAssistant'
import { AuctionWatchlistPage } from './components/watchlist/AuctionWatchlistPage'
import { AuthPage } from './components/auth/AuthPage'
import { ShoppingCartPage } from './components/cart/ShoppingCartPage'
import { StorePage } from './components/store/StorePage'
import { TrustScoreBadge } from './components/common/TrustScoreBadge'
import { supabase } from './lib/supabase'
import { useAuctionFeedRealtime } from './hooks/useAuctionFeedRealtime'
import { useShoppingCart } from './hooks/useShoppingCart'
import { closeAuction, createScoutSupportRequest, getAuctionWatchlist, getNotifications, getPublicAuctions, getSellerAuctions, markAllNotificationsRead, markNotificationRead, placeBid, removeAuctionWatchlistRule, saveAuctionWatchlistRule, submitScoutFeedback, submitVerdict } from './services/api'
import { getStoreListings, initializePayment, verifyPayment } from './services/cartApi'
import { getListingCategories, getMyListings, getWatchlist, toggleWatchlist } from './services/listingApi'
import type { Auction, AuctionWatchlistRule, MarketplaceListing, NotificationItem, PurchaseOrder, Verdict } from './types'

type View = 'feed' | 'shop' | 'cart' | 'dashboard' | 'watchlist'
type AuthMode = 'signin' | 'register'
type ToastMessage = { message: string; kind: 'success' | 'error' }

const viewPaths: Record<View, string> = {
  feed: '/',
  shop: '/shop',
  cart: '/cart',
  dashboard: '/seller',
  watchlist: '/watchlist',
}

function viewForPath(pathname: string): View {
  if (pathname === '/shop') return 'shop'
  if (pathname === '/cart') return 'cart'
  if (pathname === '/watchlist') return 'watchlist'
  if (pathname === '/seller' || pathname.startsWith('/seller/')) return 'dashboard'
  return 'feed'
}

function returnPath(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('returnTo' in state)) return '/'
  const target = state.returnTo
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/'
}

function isKnownPath(pathname: string): boolean {
  return ['/', '/shop', '/cart', '/seller', '/seller/products/new', '/watchlist', '/auth/sign-in', '/auth/register'].includes(pathname) || /^\/auctions\/[^/]+$/.test(pathname)
}

export default function MarketplaceApp() {
  const location = useLocation()
  const navigate = useNavigate()
  const view = viewForPath(location.pathname)
  const selectedId = location.pathname.match(/^\/auctions\/([^/]+)$/)?.[1] ?? null
  const authMode: AuthMode | null = location.pathname === '/auth/register' ? 'register' : location.pathname === '/auth/sign-in' ? 'signin' : null
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [listings, setListings] = useState<MarketplaceListing[]>([])
  const [sellerAuctions, setSellerAuctions] = useState<Auction[]>([])
  const [ownListings, setOwnListings] = useState<MarketplaceListing[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [watchlistIds, setWatchlistIds] = useState<string[]>([])
  const [auctionWatchlistRules, setAuctionWatchlistRules] = useState<AuctionWatchlistRule[]>([])
  const [watchlistLoading, setWatchlistLoading] = useState(false)
  const [watchlistError, setWatchlistError] = useState('')
  const [watchlistSavingId, setWatchlistSavingId] = useState<string | null>(null)
  const [preparedWatchlistDraft, setPreparedWatchlistDraft] = useState<{ auctionRoomId: string; maxBid: number; bidStep: number } | null>(null)
  const pendingAuctionNavigation = useRef(false)
  const nextViewNavigation = useRef<View | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [trustScore, setTrustScore] = useState<number | null>(null)
  const [completedAuctions, setCompletedAuctions] = useState<number | null>(null)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const [dataError, setDataError] = useState('')
  const [shopError, setShopError] = useState('')
  const [dataRetry, setDataRetry] = useState(0)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const emailConfirmed = Boolean(session?.user.email_confirmed_at)
  const currentUserId = session?.user.id ?? ''
  const userCart = useShoppingCart(currentUserId, Boolean(session))
  const selectedAuction = auctions.find((auction) => auction.id === selectedId) ?? sellerAuctions.find((auction) => auction.id === selectedId) ?? null
  const dataKey = session ? `${session.user.id}:${emailConfirmed}` : 'public'
  const dataLoading = authLoading || loadedUserId !== dataKey

  const setAuthMode = (mode: AuthMode | null, nextPath?: string) => {
    if (mode) {
      navigate(mode === 'signin' ? '/auth/sign-in' : '/auth/register', {
        state: { returnTo: nextPath ?? location.pathname },
      })
      return
    }
    navigate(returnPath(location.state), { replace: true })
  }

  const setViewState = (nextView: View) => {
    if (nextView === 'feed' && pendingAuctionNavigation.current) {
      pendingAuctionNavigation.current = false
      return
    }
    pendingAuctionNavigation.current = false
    nextViewNavigation.current = nextView
    navigate(viewPaths[nextView])
  }
  const setSelectedId = (id: string | null) => {
    if (!id) {
      pendingAuctionNavigation.current = false
      if (location.pathname.startsWith('/auctions/')) {
        const nextView = nextViewNavigation.current
        nextViewNavigation.current = null
        navigate(nextView ? viewPaths[nextView] : returnPath(location.state), { replace: true })
      }
      return
    }
    pendingAuctionNavigation.current = true
    const returnTo = location.pathname.startsWith('/auctions/') ? returnPath(location.state) : location.pathname
    navigate(`/auctions/${encodeURIComponent(id)}`, { state: { returnTo } })
  }

  const setView = (nextView: View) => {
    if (nextView === 'cart' && !session) {
      setAuthMode('signin', viewPaths.cart)
      return
    }
    setViewState(nextView)
  }

  useEffect(() => {
    if (!isKnownPath(location.pathname)) navigate('/', { replace: true })
  }, [location.pathname, navigate])

  useEffect(() => {
    if (authLoading || session || (view !== 'cart' && view !== 'dashboard')) return
    setAuthMode('signin', location.pathname)
  }, [authLoading, location.pathname, session, view])

  useEffect(() => {
    if (!supabase) {
      return
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    }).catch(() => setAuthLoading(false))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setAuctions([])
        setListings([])
        setSellerAuctions([])
        setOwnListings([])
        setCategories([])
        setTrustScore(null)
        setCompletedAuctions(null)
        setLoadedUserId(null)
        setDataError('')
      }
      setAuthLoading(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (authLoading || !session) return
    const requestedPath = window.sessionStorage.getItem('quickresell:auth:return-to')
    if (!requestedPath) return
    window.sessionStorage.removeItem('quickresell:auth:return-to')
    if (requestedPath.startsWith('/') && !requestedPath.startsWith('//')) navigate(requestedPath, { replace: true })
  }, [authLoading, navigate, session])

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    void Promise.all([
      getPublicAuctions(session),
      getStoreListings(session).catch((caught: unknown) => {
        if (!cancelled) setShopError(caught instanceof Error ? caught.message : 'Shop listings could not be loaded.')
        return []
      }),
      getListingCategories(session).catch(() => []),
      session ? getSellerAuctions(session).catch(() => null) : Promise.resolve(null),
      session && emailConfirmed ? getMyListings(session).catch(() => []) : Promise.resolve([]),
      session && emailConfirmed ? getWatchlist(session).catch(() => []) : Promise.resolve([]),
    ]).then(([rooms, storeItems, listingCategories, sellerData, products, savedItems]) => {
      if (!cancelled) {
        setAuctions(rooms)
        setListings(storeItems)
        if (storeItems.length > 0 || !session) setShopError('')
        setOwnListings(products)
        setCategories(listingCategories.map((category) => category.name))
        setSellerAuctions(sellerData?.auctions ?? [])
        setTrustScore(sellerData?.trustScore ?? null)
        setCompletedAuctions(sellerData?.completedAuctions ?? null)
        setWatchlistIds(savedItems)
        setDataError('')
        setLoadedUserId(dataKey)
      }
    }).catch((caught: unknown) => {
      if (!cancelled) {
        setAuctions([])
        setListings([])
        setOwnListings([])
        setSellerAuctions([])
        setCategories([])
        setTrustScore(null)
        setCompletedAuctions(null)
        setDataError(caught instanceof Error ? caught.message : 'Marketplace data could not be loaded.')
        setLoadedUserId(dataKey)
      }
    })
    return () => { cancelled = true }
  }, [session, emailConfirmed, authLoading, dataKey, dataRetry])

  useEffect(() => {
    if (view !== 'watchlist') return
    if (!session || !emailConfirmed) {
      setAuctionWatchlistRules([])
      setWatchlistLoading(false)
      setWatchlistError('')
      return
    }

    let cancelled = false
    setWatchlistLoading(true)
    setWatchlistError('')
    void getAuctionWatchlist(session).then((rules) => {
      if (!cancelled) setAuctionWatchlistRules(rules)
    }).catch((caught: unknown) => {
      if (!cancelled) setWatchlistError(caught instanceof Error ? caught.message : 'Your auction watchlist could not be loaded.')
    }).finally(() => {
      if (!cancelled) setWatchlistLoading(false)
    })
    return () => { cancelled = true }
  }, [view, session, emailConfirmed, dataRetry])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  function showToast(message: string, kind: ToastMessage['kind'] = 'success') { setToast({ message, kind }) }

  const loadPaystackScript = async () => {
    if (typeof window === 'undefined' || window.PaystackPop) return
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[src="https://js.paystack.co/v1/inline.js"]') as HTMLScriptElement | null
      if (existing) {
        if (existing.dataset.loaded === 'true') {
          resolve()
          return
        }
        existing.addEventListener('load', () => {
          existing.dataset.loaded = 'true'
          resolve()
        }, { once: true })
        existing.addEventListener('error', () => reject(new Error('Paystack script failed to load.')), { once: true })
        return
      }

      const script = document.createElement('script')
      script.src = 'https://js.paystack.co/v1/inline.js'
      script.async = true
      script.onload = () => {
        script.dataset.loaded = 'true'
        resolve()
      }
      script.onerror = () => reject(new Error('Paystack script failed to load.'))
      document.body.appendChild(script)
    })
  }

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
    if (!session) {
      setAuthMode('signin')
      throw new Error('Sign in before placing a bid.')
    }
    if (!emailConfirmed) throw new Error('Confirm your email before placing bids.')
    const result = await placeBid(room.id, amount, session)
    updateRoom(room.id, { ...result.auction, bids: [result.bid, ...room.bids.filter((bid) => bid.id !== result.bid.id)] })
  }

  const handleExpire = async (room: Auction) => {
    if (!session || !emailConfirmed) return
    updateRoom(room.id, await closeAuction(room.id, session))
  }

  const handleVerdict = async (room: Auction, decision: Verdict) => {
    if (!session) {
      setAuthMode('signin')
      throw new Error('Sign in before managing auctions.')
    }
    if (!emailConfirmed) throw new Error('Confirm your email before managing auctions.')
    const result = await submitVerdict(room.id, decision, session)
    updateRoom(room.id, result.auction)
    setTrustScore(result.trustScore)
    if (decision === 'ACCEPT') setCompletedAuctions((count) => count === null ? count : count + 1)
    setSellerAuctions((items) => items.map((item) => item.id === room.id ? result.auction : item))
  }

  const handleToggleSaved = async (postId: string) => {
    if (!session) {
      setAuthMode('signin')
      showToast('Sign in before saving items.', 'error')
      return
    }

    try {
      const nextSaved = await toggleWatchlist(postId, session)
      setWatchlistIds((current) => nextSaved ? [...new Set([...current, postId])] : current.filter((id) => id !== postId))
      showToast(nextSaved ? 'Item saved to your watchlist.' : 'Item removed from your watchlist.')
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'This item could not be saved.', 'error')
    }
  }

  const handleAddToCart = async (listing: MarketplaceListing) => {
    if (!session) {
      setAuthMode('signin')
      showToast('Sign in before using the cart.', 'error')
      return
    }
    if (!emailConfirmed) {
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
    if (!session) {
      setAuthMode('signin')
      throw new Error('Sign in before checking out.')
    }
    if (!emailConfirmed) throw new Error('Confirm your email before checking out.')

    const subtotalCents = userCart.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0)
    if (subtotalCents <= 0) throw new Error('Add at least one item to your cart before paying.')

    await loadPaystackScript()
    const payment = await initializePayment(session)
    const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY
    if (!publicKey) throw new Error('Add VITE_PAYSTACK_PUBLIC_KEY to your frontend environment.')

    const order = await new Promise<PurchaseOrder>((resolve, reject) => {
      const paystackHandler = window.PaystackPop?.setup({
        key: publicKey,
        email: session.user.email ?? '',
        amount: payment.amountCents,
        ref: payment.reference,
        currency: 'NGN',
        metadata: {
          custom_fields: [
            { display_name: 'QuickResell buyer', variable_name: 'buyer_id', value: session.user.id },
          ],
        },
        callback: (response: { reference?: string }) => {
          void (async () => {
            try {
              const reference = response.reference ?? payment.reference
              const verification = await verifyPayment(reference, session)
              if (!verification.verified) {
                throw new Error('Payment verification failed.')
              }
              const nextOrder = await userCart.checkout(reference)
              setListings((current) => current.map((listing) => {
                const purchased = nextOrder.items.find((item) => item.postId === listing.id)
                if (!purchased) return listing
                const quantityAvailable = Math.max(0, listing.quantityAvailable - purchased.quantity)
                return { ...listing, quantityAvailable }
              }).filter((listing) => listing.quantityAvailable > 0))
              resolve(nextOrder)
            } catch (caught) {
              reject(caught instanceof Error ? caught : new Error('Payment verification failed.'))
            }
          })()
        },
        onClose: () => {
          reject(new Error('Payment cancelled. Your cart remains unchanged.'))
        },
      })

      if (!paystackHandler) {
        reject(new Error('Paystack could not be loaded.'))
        return
      }
      paystackHandler.openIframe()
    })

    return order
  }

  const handleListingCreated = (listing: MarketplaceListing) => {
    setOwnListings((current) => [listing, ...current.filter((item) => item.id !== listing.id)])
    showToast(`${listing.title} is now listed for campus buyers.`)
  }

  const handleSaveAuctionRule = async (auctionRoomId: string, rule: Pick<AuctionWatchlistRule, 'maxBid' | 'bidStep' | 'autoBidEnabled'> & { authorizationConfirmed: boolean }) => {
    if (!session) {
      setAuthMode('signin')
      return
    }
    if (!emailConfirmed) {
      showToast('Confirm your email before saving a bid rule.', 'error')
      return
    }

    setWatchlistSavingId(auctionRoomId)
    try {
      const result = await saveAuctionWatchlistRule(auctionRoomId, rule, session)
      setAuctionWatchlistRules((current) => [result.rule, ...current.filter((item) => item.auctionRoomId !== auctionRoomId)])
      setPreparedWatchlistDraft(null)
      if (result.emailNotified) {
        showToast('Scout email alert sent to your inbox.')
      } else if (result.autoBidPlaced) {
        showToast('Scout placed a bid within your saved maximum.')
      } else if (rule.autoBidEnabled) {
        showToast('Scout is watching this auction within your price limit.')
      } else {
        showToast('Auction saved to your watchlist.')
      }
      return { emailNotified: result.emailNotified }
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'Your bid rule could not be saved.', 'error')
      return undefined
    } finally {
      setWatchlistSavingId(null)
    }
  }

  const handleRemoveAuctionRule = async (auctionRoomId: string) => {
    if (!session) return
    try {
      await removeAuctionWatchlistRule(auctionRoomId, session)
      setAuctionWatchlistRules((current) => current.filter((rule) => rule.auctionRoomId !== auctionRoomId))
      showToast('Auction removed from your watchlist.')
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'This auction could not be removed.', 'error')
    }
  }

  const prepareAuctionRule = (auction: Auction, maxBid: number, bidStep: number) => {
    setPreparedWatchlistDraft({ auctionRoomId: auction.id, maxBid, bidStep })
    setSelectedId(null)
    setView('watchlist')
  }

  const handleScoutFeedback = async (input: { messageId: string; intent: string; helpful: boolean }) => {
    if (!session || !emailConfirmed) return
    try {
      await submitScoutFeedback(input, session)
    } catch {
      showToast('Feedback could not sync right now; it remains saved on this device.', 'error')
    }
  }

  const handleScoutSupportRequest = async (category: string, message: string): Promise<{ id: string; emailNotified: boolean } | null> => {
    if (!session) {
      setAuthMode('signin')
      return null
    }
    if (!emailConfirmed) {
      showToast('Confirm your email before sending a support request.', 'error')
      return null
    }
    try {
      return await createScoutSupportRequest({ category, message }, session)
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'Your support request could not be sent.', 'error')
      return null
    }
  }

  const handleScoutOpenListing = (listing: MarketplaceListing) => {
    try {
      localStorage.setItem('quickresell:store:search', listing.title)
    } catch {
      showToast('Could not prepare that product search in this browser.', 'error')
    }
    setView('shop')
  }

  const openSellerStudio = () => {
    if (!session) {
      setAuthMode('signin', viewPaths.dashboard)
      return
    }
    setSelectedId(null)
    setView('dashboard')
  }

  useEffect(() => {
    if (!session || !emailConfirmed) {
      setNotifications([])
      return
    }

    let cancelled = false
    const refreshNotifications = async () => {
      try {
        const items = await getNotifications(session)
        if (cancelled) return
        setNotifications((current) => {
          const previousUnread = current.filter((item) => !item.isRead).length
          const nextUnread = items.filter((item) => !item.isRead).length
          if (nextUnread > previousUnread && items[0]) {
            showToast(items[0].title, 'success')
          }
          return items
        })
      } catch {
        if (!cancelled) setNotifications([])
      }
    }

    void refreshNotifications()
    const timer = window.setInterval(() => { void refreshNotifications() }, 15000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [session, emailConfirmed, dataRetry])

  const unreadNotifications = notifications.filter((item) => !item.isRead).length

  const handleNotificationRead = async (id: string) => {
    if (!session) return
    const updated = await markNotificationRead(id, session)
    setNotifications((items) => items.map((item) => item.id === id ? { ...item, isRead: updated.isRead } : item))
  }

  const handleMarkAllNotificationsRead = async () => {
    if (!session) return
    const updated = await markAllNotificationsRead(session)
    if (updated > 0) {
      setNotifications((items) => items.map((item) => ({ ...item, isRead: true })))
    }
  }

  const searchResults = useMemo(() => search.trim() ? auctions.filter((auction) => auction.status === 'ACTIVE' && auction.title.toLowerCase().includes(search.toLowerCase())) : [], [auctions, search])
  const sellerRows = sellerAuctions
  const apiStatus = authLoading ? 'Connecting' : !session ? 'Sign in required' : dataLoading ? 'Loading live data' : dataError ? 'API unavailable' : 'Live connected'

  const nav = <>
    <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.15em] text-[#98a39d]">Marketplace</p>
    <button type="button" onClick={() => { setView('feed'); setSelectedId(null) }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === 'feed' && !selectedId ? 'bg-[#edf4ed] text-[#2d5d4c]' : 'text-[#78867e] hover:bg-[#f1f4f1] hover:text-[#263b33]'}`}><Compass size={17} />Live auctions<span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] text-[#74847a]">{auctions.filter((item) => item.status === 'ACTIVE').length}</span></button>
    <button type="button" onClick={() => { setView('shop'); setSelectedId(null) }} className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === 'shop' ? 'bg-[#edf4ed] text-[#2d5d4c]' : 'text-[#78867e] hover:bg-[#f1f4f1] hover:text-[#263b33]'}`}><Store size={17} />Shop</button>
    <button type="button" onClick={() => { setView('cart'); setSelectedId(null) }} className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === 'cart' ? 'bg-[#edf4ed] text-[#2d5d4c]' : 'text-[#78867e] hover:bg-[#f1f4f1] hover:text-[#263b33]'}`}><ShoppingCart size={17} />Cart<span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] text-[#74847a]">{userCart.items.reduce((sum, item) => sum + item.quantity, 0)}</span></button>
    <button type="button" onClick={() => { setSelectedId(null); setView('watchlist') }} className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === 'watchlist' ? 'bg-[#edf4ed] text-[#2d5d4c]' : 'text-[#78867e] hover:bg-[#f1f4f1] hover:text-[#263b33]'}`}><Bookmark size={17} />Watchlist<span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] text-[#74847a]">{auctionWatchlistRules.length}</span></button>
    <button type="button" onClick={() => { setView('dashboard'); setSelectedId(null) }} className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === 'dashboard' ? 'bg-[#edf4ed] text-[#2d5d4c]' : 'text-[#78867e] hover:bg-[#f1f4f1] hover:text-[#263b33]'}`}><LayoutDashboard size={17} />Seller studio{sellerRows.some((item) => item.status === 'PENDING_APPROVAL') && <span className="ml-auto size-2 rounded-full bg-[#df704a]" />}</button>
  </>

  return authMode ? <AuthPage initialMode={authMode} returnTo={returnPath(location.state)} onBack={() => setAuthMode(null)} onAuthenticated={() => { setAuthMode(null); showToast('You’re signed in. Welcome to Quick Resell.') }} /> : <div className="min-h-screen bg-[#f5f7f5] text-[#192724]">
    <header className="sticky top-0 z-30 flex h-[68px] items-center gap-3 border-b border-[#e6ebe7] bg-white/95 px-3 backdrop-blur-md sm:gap-4 sm:px-6 lg:px-8">
      <button type="button" onClick={() => { setView('feed'); setSelectedId(null) }} className="flex shrink-0 items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-[#d4f06b] text-[#243a33]"><ShoppingBag size={19} strokeWidth={2.5} /></span><span className="font-display text-[17px] font-bold tracking-[-.03em]">quick<span className="text-[#70917c]">resell</span></span></button>
      <div className={`relative mx-auto w-full max-w-[540px] ${searchOpen ? 'block' : 'hidden'} md:block`}><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#96a19b]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search finds around campus" className="h-10 w-full rounded-xl border border-[#e7ece8] bg-[#f7f9f7] pl-10 pr-4 text-sm outline-none transition focus:border-[#9ab4a2] focus:bg-white" />{search && <div className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-xl border border-[#e6ebe7] bg-white shadow-lg">{searchResults.map((auction) => <button key={auction.id} type="button" onClick={() => { setSelectedId(auction.id); setSearch(''); setSearchOpen(false) }} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#f5f8f5]"><img src={auction.image} alt="" className="size-10 rounded-lg object-cover" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{auction.title}</span><span className="text-xs text-[#74847a]">${auction.currentHighestBid}</span></button>)}{!searchResults.length && <p className="p-4 text-sm text-[#849189]">No matching live listings.</p>}</div>}</div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5"><span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[.08em] sm:inline-flex ${dataError ? 'bg-[#fff1ee] text-[#9c493d]' : 'bg-[#ebf5ee] text-[#477358]'}`}><span className={`size-1.5 rounded-full ${dataError ? 'bg-[#c45c4d]' : 'bg-[#66a178]'}`} />{apiStatus}</span><span className="relative"><IconButton label={`Open cart, ${userCart.items.reduce((sum, item) => sum + item.quantity, 0)} items`} onClick={() => { setSelectedId(null); setView('cart') }}><ShoppingCart size={18} /></IconButton>{userCart.items.length > 0 && <span className="pointer-events-none absolute right-0 top-0 grid min-h-4 min-w-4 place-items-center rounded-full bg-[#d94b3d] px-1 text-[9px] font-bold text-white">{userCart.items.reduce((sum, item) => sum + item.quantity, 0)}</span>}</span><div className="relative"><IconButton label="Notifications" onClick={() => setNotificationsOpen((current) => !current)}><Bell size={17} /></IconButton>{unreadNotifications > 0 && <span className="pointer-events-none absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-[#d94b3d] px-1 text-[9px] font-bold text-white">{Math.min(unreadNotifications, 9)}</span>}{notificationsOpen && <div className="absolute right-0 top-12 z-50 w-[320px] overflow-hidden rounded-2xl border border-[#e4eae5] bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-[#eef2ee] px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#909c96]">Alerts</p><p className="mt-0.5 text-sm font-semibold text-[#2a4035]">Your marketplace feed</p></div>{unreadNotifications > 0 && <button type="button" onClick={() => void handleMarkAllNotificationsRead()} className="text-[11px] font-semibold text-[#3d6e5d] underline-offset-2 hover:underline">Clear all</button>}</div><div className="max-h-[340px] overflow-y-auto p-2">{notifications.length === 0 ? <div className="rounded-xl bg-[#f7faf7] px-3 py-5 text-center text-xs text-[#7d8a84]">No notifications yet. New bids and price updates will appear here.</div> : notifications.slice(0, 8).map((notification) => <button key={notification.id} type="button" onClick={() => { setNotificationsOpen(false); void handleNotificationRead(notification.id) }} className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${notification.isRead ? 'border-transparent bg-[#f9faf9]' : 'border-[#e4f0e7] bg-[#edf8f1]'}`}><span className={`mt-0.5 grid size-7 place-items-center rounded-full ${notification.type === 'OUTBID' || notification.type === 'AUCTION_CLOSED' ? 'bg-[#fff3ef] text-[#c8574a]' : notification.type === 'AUCTION_WON' || notification.type === 'LISTING_SOLD' ? 'bg-[#eaf9ea] text-[#3c7d5b]' : 'bg-[#edf2ff] text-[#536ab9]'}`}><Bell size={14} /></span><span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold uppercase tracking-[.08em] text-[#8a9891]">{notification.type.replace(/_/g, ' ').toLowerCase()}</span><span className="mt-0.5 block text-sm font-semibold text-[#21372f]">{notification.title}</span><span className="mt-1 block text-xs leading-5 text-[#75837d]">{notification.message}</span></span></button> )}</div></div>}</div>{session ? <button type="button" onClick={() => void supabase?.auth.signOut()} className="ml-1 flex items-center gap-2 rounded-full border border-[#e7ece8] p-1 pr-3"><span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-[#e9f0e8] text-xs font-bold text-[#456555]">{(session.user.user_metadata.full_name ?? session.user.email ?? '?').slice(0, 1).toUpperCase()}</span><span className="hidden max-w-24 truncate text-xs font-semibold sm:block">{session.user.user_metadata.full_name ?? session.user.email}</span></button> : <Button variant="secondary" onClick={() => setAuthMode('signin')} className="ml-1 min-h-9 rounded-lg px-3 text-xs">Sign in</Button>}</div>
    </header>

    <div className="border-b border-[#e4eae5] bg-white"><div className="mx-auto flex max-w-[1640px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8"><div><p className="text-sm font-semibold text-[#2b4036]">Have something to sell?</p><p className="mt-0.5 text-xs text-[#7a8781]">Add product photos and list it for your campus.</p></div><Button variant="secondary" onClick={openSellerStudio} icon={<ImagePlus size={16} />}>Sell an item</Button></div></div>

    <div className="mx-auto grid max-w-[1640px] grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_270px]">
      <aside className="sticky top-[68px] hidden h-[calc(100vh-68px)] flex-col border-r border-[#e6ebe7] bg-[#f9faf9] px-4 py-6 md:flex"><nav className="space-y-1">{nav}</nav><div className="mt-auto rounded-[16px] bg-[#e9f0e8] p-4"><div className="mb-3 grid size-8 place-items-center rounded-lg bg-white text-[#537666]"><GraduationCap size={18} /></div><p className="font-display text-sm font-semibold text-[#2f4a3d]">Campus verified</p><p className="mt-1 text-[11px] leading-4 text-[#72867a]">Trade with people who are right around the corner.</p><div className="mt-3 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#63816f]"><ShieldCheck size={12} />Trust matters here</div></div></aside>

      {!selectedAuction && view !== 'watchlist' && <button type="button" aria-label="Open auction watchlist" title="Open auction watchlist" onClick={() => { setSelectedId(null); setView('watchlist') }} className="fixed bottom-[154px] right-4 z-40 inline-flex h-12 w-12 transform items-center justify-center rounded-full border border-[#cfe4d5] bg-[#dfeee2] text-[#244737] shadow-[0_12px_28px_rgba(35,56,43,.14)] backdrop-blur-sm transition-transform duration-150 hover:bg-[#d2ebd8] active:translate-y-[1px] lg:hidden"><Bookmark size={17} />{auctionWatchlistRules.length > 0 && <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-[#d4f06b] px-1 text-[9px] font-bold text-[#213b30]">{Math.min(auctionWatchlistRules.length, 9)}</span>}</button>}
      <NavigationAssistant auctions={auctions} listings={listings} dataReady={!dataLoading && !dataError} onNavigate={(destination) => { if (destination === 'dashboard') { openSellerStudio(); return } setSelectedId(null); setView(destination) }} onOpenAuction={(auction) => { setSelectedId(auction.id); setViewState('feed') }} onOpenListing={handleScoutOpenListing} onPrepareRule={prepareAuctionRule} currentUserId={currentUserId} auctionWatchlistRules={auctionWatchlistRules} onFeedback={(feedback) => void handleScoutFeedback(feedback)} onSupportRequest={handleScoutSupportRequest} signedIn={Boolean(session)} emailConfirmed={emailConfirmed} onSignIn={() => setAuthMode('signin')} />
      {view === 'watchlist' ? <main className="min-w-0 px-4 pb-24 pt-6 sm:px-6 lg:px-7 lg:pb-8 lg:pt-7"><AuctionWatchlistPage auctions={auctions} rules={auctionWatchlistRules} loading={watchlistLoading} error={watchlistError} savingId={watchlistSavingId} initialDraft={preparedWatchlistDraft} onSave={handleSaveAuctionRule} onRemove={handleRemoveAuctionRule} onOpenAuction={(auction) => setSelectedId(auction.id)} onRequestSignIn={() => setAuthMode('signin')} signedIn={Boolean(session)} emailConfirmed={emailConfirmed} /></main> : <main className="min-w-0 px-4 pb-24 pt-6 sm:px-6 lg:px-7 lg:pb-8 lg:pt-7">
        {session && !emailConfirmed && <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ead9b0] bg-[#fff9e9] px-4 py-3 text-sm text-[#765b22]"><span>Confirm your email to bid, sell, message sellers, or place orders.</span><Button variant="secondary" onClick={() => void resendConfirmation()} className="min-h-8 rounded-lg px-3 text-xs">Resend confirmation</Button></div>}
        {authLoading ? <div className="grid min-h-72 place-items-center rounded-xl border border-[#e4eae5] bg-white text-sm text-[#849189]">Connecting to your account…</div> : dataError ? <div role="alert" className="mx-auto mt-12 max-w-lg rounded-xl border border-[#f0d7d2] bg-white p-6 text-center"><h1 className="font-display text-xl font-semibold text-[#263b33]">Marketplace data unavailable</h1><p className="mt-2 break-words text-sm text-[#7a8781]">{dataError}</p><Button variant="secondary" onClick={() => { setDataError(''); setLoadedUserId(null); setDataRetry((attempt) => attempt + 1) }} className="mt-4">Retry</Button></div> : dataLoading ? <div className="grid min-h-72 place-items-center rounded-xl border border-[#e4eae5] bg-white text-sm text-[#849189]">Loading marketplace data…</div> : selectedAuction ? <AuctionRoom auction={selectedAuction} userId={currentUserId} onBack={() => setSelectedId(null)} onBid={(amount) => handleBid(selectedAuction, amount)} onExpire={() => handleExpire(selectedAuction)} onNotice={showToast} onRoomUpdate={(patch) => updateRoom(selectedAuction.id, patch)} onVerdict={(decision) => handleVerdict(selectedAuction, decision)} /> : view === 'dashboard' ? <SellerDashboard auctions={sellerRows} userId={currentUserId} trustScore={trustScore} completedAuctions={completedAuctions} session={session} emailConfirmed={emailConfirmed} ownListings={ownListings} onRequestSignIn={() => setAuthMode('signin')} onListingCreated={handleListingCreated} onVerdict={handleVerdict} onNotice={showToast} /> : view === 'shop' ? <StorePage listings={listings} categories={categories} error={shopError} cartHas={(postId) => userCart.items.some((item) => item.postId === postId)} watchlistIds={watchlistIds} onToggleSaved={(postId) => void handleToggleSaved(postId)} onAdd={(listing) => void handleAddToCart(listing)} onOpenCart={() => setView('cart')} /> : view === 'cart' ? <ShoppingCartPage items={userCart.items} loading={userCart.loading} error={userCart.error} onShop={() => setView('shop')} onSetQuantity={userCart.setQuantity} onRemove={userCart.remove} onCheckout={handlePlaceOrder} onRefresh={userCart.refresh} /> : <GlobalFeed auctions={auctions} categories={categories} onOpen={(auction) => setSelectedId(auction.id)} />}
      </main>}

      {!selectedAuction && view === 'feed' && session && <aside className="hidden border-l border-[#e6ebe7] bg-[#f9faf9] px-4 py-6 xl:block"><div className="mb-6 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8b9891]">Your profile</p><p className="font-display mt-1 max-w-44 truncate text-sm font-semibold text-[#2b4036]">{session.user.user_metadata.full_name ?? session.user.email}</p></div>{session.user.user_metadata.avatar_url && <img src={session.user.user_metadata.avatar_url} alt="" className="size-10 rounded-full object-cover" />}</div>{trustScore !== null && completedAuctions !== null && <div className="rounded-[16px] border border-[#e4eae5] bg-white p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-[#718078]">Seller standing</span><Sparkles size={14} className="text-[#9bad4e]" /></div><p className="font-display text-[31px] font-bold leading-none text-[#294339]">{trustScore}<span className="ml-1 text-sm font-semibold text-[#94a099]">/100</span></p><div className="mt-3"><TrustScoreBadge score={trustScore} completedAuctions={completedAuctions} noReserveHero /></div><p className="mt-3 border-t border-[#eff2ef] pt-3 text-[11px] leading-5 text-[#8a9690]">Your follow-through earns trust. Buyers can see your record in every room.</p></div>}<div className="mt-6"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[.1em] text-[#718078]">Ending soon</p></div><div className="space-y-2">{auctions.filter((item) => item.status === 'ACTIVE').slice(0, 3).map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="flex w-full items-center gap-2.5 rounded-xl border border-[#e8ede9] bg-white p-2 text-left transition hover:border-[#c9d8cd]"><img src={item.image} alt="" className="size-11 rounded-lg object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[#394b42]">{item.title}</span><span className="mt-1 block text-[10px] text-[#849189]">${item.currentHighestBid} · {item.bids.length} bids</span></span></button>)}</div></div><button type="button" onClick={() => { setView('dashboard'); setSelectedId(null) }} className="mt-6 w-full rounded-[14px] bg-[#dcecff] p-3.5 text-left"><span className="flex items-center gap-2 text-xs font-bold text-[#345b75]"><Store size={14} />Sell something nearby</span><span className="mt-1 block text-[11px] leading-4 text-[#57758b]">Create a listing in Seller Studio.</span></button></aside>}
    </div>

    <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[#e3e9e4] bg-white/95 px-3 py-2 backdrop-blur lg:hidden"><button type="button" onClick={() => { setView('feed'); setSelectedId(null) }} className={`flex min-w-16 flex-col items-center gap-1 py-1 text-[10px] font-semibold ${view === 'feed' ? 'text-[#376b59]' : 'text-[#839087]'}`}><Compass size={19} />Auctions</button><button type="button" onClick={() => setView('shop')} className={`flex min-w-16 flex-col items-center gap-1 py-1 text-[10px] font-semibold ${view === 'shop' ? 'text-[#376b59]' : 'text-[#839087]'}`}><Store size={19} />Shop</button><button type="button" onClick={() => { setView('cart'); setSelectedId(null) }} className={`flex min-w-16 flex-col items-center gap-1 py-1 text-[10px] font-semibold ${view === 'cart' ? 'text-[#376b59]' : 'text-[#839087]'}`}><span className="relative"><ShoppingCart size={19} />{userCart.items.length > 0 && <span className="absolute -right-2 -top-1 grid min-h-3.5 min-w-3.5 place-items-center rounded-full bg-[#d94b3d] px-0.5 text-[8px] font-bold text-white">{userCart.items.reduce((sum, item) => sum + item.quantity, 0)}</span>}</span>Cart</button><button type="button" onClick={() => { setView('dashboard'); setSelectedId(null) }} className={`flex min-w-16 flex-col items-center gap-1 py-1 text-[10px] font-semibold ${view === 'dashboard' ? 'text-[#376b59]' : 'text-[#839087]'}`}><LayoutDashboard size={19} />Studio</button></nav>


    <AnimatePresence>{toast && <motion.div role="status" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className={`fixed bottom-20 left-1/2 z-[60] flex w-[calc(100%-32px)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl lg:bottom-6 ${toast.kind === 'error' ? 'bg-[#ad473c]' : 'bg-[#274c3d]'}`}><span className="flex-1">{toast.message}</span><IconButton label="Dismiss notification" className="size-8 text-white hover:bg-white/15 hover:text-white" onClick={() => setToast(null)}><X size={15} /></IconButton></motion.div>}</AnimatePresence>
      {(selectedAuction || view === 'shop') && <aside style={{ right: 'max(0px, calc(50vw - 820px))' }} className="fixed top-[68px] hidden h-[calc(100vh-68px)] w-[270px] border-l border-[#e6ebe7] bg-[#f9faf9] xl:block"><BidAdvert auction={selectedAuction ?? auctions.filter((item) => item.status === 'ACTIVE').sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())[0] ?? null} onOpen={(auction) => { setSelectedId(auction.id); setViewState('feed') }} /></aside>}
    </div>
  }

