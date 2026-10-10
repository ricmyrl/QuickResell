import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, BellDot, Bookmark, Compass, GraduationCap, ImagePlus, LayoutDashboard, Menu, PackageCheck, Search, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Store, WalletCards, X } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { Button, IconButton } from './components/common/Button'
import { formatNotificationMessage } from './components/common/notificationMessage'
import { TrustScoreBadge } from './components/common/TrustScoreBadge'
import { useCurrency } from './lib/CurrencyContext'
import { useAuctionFeedRealtime } from './hooks/useAuctionFeedRealtime'
import { useStoreFeed } from './hooks/useStoreFeed'
import { useShoppingCart } from './hooks/useShoppingCart'
import { askScout, closeAuction, createScoutSupportRequest, deleteNotification, getAuctionWatchlist, getNotifications, getPublicAuctions, getSellerAuctions, markAllNotificationsRead, markNotificationRead, placeBid, removeAuctionWatchlistRule, saveAuctionWatchlistRule, submitScoutFeedback, submitVerdict } from './services/api'
import { initializePayment, initializeWalletTopUp } from './services/cartApi'
import { verifyPasskeyForAction } from './services/passkeyVerification'
import { getListingCategories, getMyListings, getWatchlist, toggleWatchlist } from './services/listingApi'
import type { Auction, AuctionWatchlistRule, MarketplaceListing, NotificationItem, PurchaseOrder, Verdict } from './types'

type View = 'feed' | 'shop' | 'cart' | 'dashboard' | 'watchlist' | 'orders' | 'wallet'
type AuthMode = 'signin' | 'register'
type ToastMessage = { message: string; kind: 'success' | 'error' }

const AuctionRoom = lazy(() => import('./components/auction/AuctionRoom').then((module) => ({ default: module.AuctionRoom })))
const AccountMenu = lazy(() => import('./components/account/AccountMenu').then((module) => ({ default: module.AccountMenu })))
const BidAdvert = lazy(() => import('./components/auction/BidAdvert').then((module) => ({ default: module.BidAdvert })))
const GlobalFeed = lazy(() => import('./components/feed/GlobalFeed').then((module) => ({ default: module.GlobalFeed })))
const SellerDashboard = lazy(() => import('./components/dashboard/SellerStudio').then((module) => ({ default: module.SellerStudio })))
const NavigationAssistant = lazy(() => import('./components/common/NavigationAssistant').then((module) => ({ default: module.NavigationAssistant })))
const NotificationsPanel = lazy(() => import('./components/common/NotificationsPanel').then((module) => ({ default: module.NotificationsPanel })))
const AuctionWatchlistPage = lazy(() => import('./components/watchlist/AuctionWatchlistPage').then((module) => ({ default: module.AuctionWatchlistPage })))
const AuthPage = lazy(() => import('./components/auth/AuthPage').then((module) => ({ default: module.AuthPage })))
const ShoppingCartPage = lazy(() => import('./components/cart/ShoppingCartPage').then((module) => ({ default: module.ShoppingCartPage })))
const PurchaseHistoryPage = lazy(() => import('./components/cart/PurchaseHistoryPage').then((module) => ({ default: module.PurchaseHistoryPage })))
const StorePage = lazy(() => import('./components/store/StorePage').then((module) => ({ default: module.StorePage })))
const WalletPage = lazy(() => import('./components/wallet/WalletPage').then((module) => ({ default: module.WalletPage })))
const PaystackReturnPage = lazy(() => import('./components/cart/PaystackReturnPage').then((module) => ({ default: module.PaystackReturnPage })))

const viewPaths: Record<View, string> = {
  feed: '/',
  shop: '/shop',
  cart: '/cart',
  dashboard: '/seller',
  watchlist: '/watchlist',
  orders: '/orders',
  wallet: '/wallet',
}

const supabaseConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY))

function viewForPath(pathname: string): View {
  if (pathname === '/shop') return 'shop'
  if (pathname === '/cart') return 'cart'
  if (pathname === '/orders') return 'orders'
  if (pathname === '/watchlist') return 'watchlist'
  if (pathname === '/wallet') return 'wallet'
  if (pathname === '/seller' || pathname.startsWith('/seller/')) return 'dashboard'
  return 'feed'
}

function returnPath(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('returnTo' in state)) return '/'
  const target = state.returnTo
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/'
}

function isKnownPath(pathname: string): boolean {
  return ['/', '/shop', '/cart', '/orders', '/seller', '/seller/products/new', '/seller/verification', '/watchlist', '/wallet', '/payments/callback', '/auth/sign-in', '/auth/register'].includes(pathname) || /^\/auctions\/[^/]+$/.test(pathname)
}

function mergeAuctionPatch(auction: Auction, patch: Partial<Auction>): Auction {
  const incomingBidIsOlder = patch.currentHighestBid !== undefined && patch.currentHighestBid < auction.currentHighestBid
  const status = auction.status !== 'ACTIVE' && patch.status === 'ACTIVE'
    ? auction.status
    : patch.status ?? auction.status
  const incomingEndIsOlder = auction.status === 'ACTIVE' && status === 'ACTIVE' && patch.endsAt !== undefined &&
    new Date(patch.endsAt).getTime() < new Date(auction.endsAt).getTime()

  return {
    ...auction,
    ...patch,
    currentHighestBid: Math.max(auction.currentHighestBid, patch.currentHighestBid ?? auction.currentHighestBid),
    highestBidderId: incomingBidIsOlder ? auction.highestBidderId : patch.highestBidderId ?? auction.highestBidderId,
    endsAt: incomingEndIsOlder ? auction.endsAt : patch.endsAt ?? auction.endsAt,
    bids: patch.bids
      ? [...new Map([...auction.bids, ...patch.bids].map((bid) => [bid.id, bid])).values()]
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || right.id.localeCompare(left.id))
        .slice(0, 50)
      : auction.bids,
    status,
  }
}

export default function MarketplaceApp() {
  const location = useLocation()
  const navigate = useNavigate()
  const { localToUsd, formatUsd } = useCurrency()
  const view = viewForPath(location.pathname)
  const selectedId = location.pathname.match(/^\/auctions\/([^/]+)$/)?.[1] ?? null
  const authMode: AuthMode | null = location.pathname === '/auth/register' ? 'register' : location.pathname === '/auth/sign-in' ? 'signin' : null
  const isPaymentCallback = location.pathname === '/payments/callback'
  const paymentReturnParams = new URLSearchParams(location.search)
  const paymentReference = paymentReturnParams.get('reference') ?? paymentReturnParams.get('trxref') ?? ''
  const paymentTransactionType = paymentReturnParams.get('type') === 'WALLET_TOPUP' ? 'WALLET_TOPUP' : 'CART_CHECKOUT'
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [auctionCursor, setAuctionCursor] = useState<string | null>(null)
  const [auctionLoadMoreLoading, setAuctionLoadMoreLoading] = useState(false)
  const [auctionLoadMoreError, setAuctionLoadMoreError] = useState('')
  const auctionLoadMoreInFlight = useRef(false)
  const feedRequestGeneration = useRef(0)
  const [sellerAuctions, setSellerAuctions] = useState<Auction[]>([])
  const [ownListings, setOwnListings] = useState<MarketplaceListing[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [watchlistIds, setWatchlistIds] = useState<string[]>([])
  const [auctionWatchlistRules, setAuctionWatchlistRules] = useState<AuctionWatchlistRule[]>([])
  const watchlistBidValues = useRef(new Map<string, number>())
  const [watchlistBidNotifications, setWatchlistBidNotifications] = useState<string[]>([])
  const [recentWatchlistBidIds, setRecentWatchlistBidIds] = useState<string[]>([])
  const [watchlistLoading, setWatchlistLoading] = useState(false)
  const [watchlistError, setWatchlistError] = useState('')
  const [watchlistSavingId, setWatchlistSavingId] = useState<string | null>(null)
  const pendingAuctionNavigation = useRef(false)
  const nextViewNavigation = useRef<View | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [trustScore, setTrustScore] = useState<number | null>(null)
  const [completedAuctions, setCompletedAuctions] = useState<number | null>(null)
  const [authLoading, setAuthLoading] = useState(supabaseConfigured)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const [dataError, setDataError] = useState('')
  const [dataRetry, setDataRetry] = useState(0)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const emailConfirmed = Boolean(session?.user.email_confirmed_at)
  const currentUserId = session?.user.id ?? ''
  const userCart = useShoppingCart(currentUserId, Boolean(session))
  const selectedAuction = auctions.find((auction) => auction.id === selectedId) ?? sellerAuctions.find((auction) => auction.id === selectedId) ?? null
  const dataKey = session ? `${session.user.id}:${emailConfirmed}` : 'public'
  const storeFeed = useStoreFeed(session, dataKey, loadedUserId === dataKey)
  const listings = storeFeed.listings
  const dataLoading = loadedUserId !== dataKey
  const storeLoading = dataLoading || storeFeed.loading
  const activeWatchlistCount = auctionWatchlistRules.filter((rule) => rule.auction.status === 'ACTIVE').length
  const unreadWatchlistBidCount = watchlistBidNotifications.length

  const setAuthMode = (mode: AuthMode | null, nextPath?: string) => {
    if (mode) {
      navigate(mode === 'signin' ? '/auth/sign-in' : '/auth/register', {
        state: { returnTo: nextPath ?? location.pathname },
      })
      return
    }
    navigate(returnPath(location.state), { replace: true })
  }

  const backFromAuth = () => {
    const destination = returnPath(location.state)
    const isProtectedDestination = destination === '/cart' || destination === '/seller' || destination.startsWith('/seller/')
    navigate(isProtectedDestination ? '/' : destination, { replace: true })
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
  const openWatchlist = () => {
    setWatchlistBidNotifications([])
    setSelectedId(null)
    setView('watchlist')
  }

  useEffect(() => {
    if (!isKnownPath(location.pathname)) navigate('/', { replace: true })
  }, [location.pathname, navigate])

  useEffect(() => {
    if (authLoading || session || (view !== 'cart' && view !== 'dashboard')) return
    setAuthMode('signin', location.pathname)
  }, [authLoading, location.pathname, session, view])

  useEffect(() => {
    if (!supabaseConfigured) return
    let cancelled = false
    let receivedAuthEvent = false
    let unsubscribe = () => {}
    void import('./lib/supabase').then(({ supabase }) => {
      if (cancelled) return
      if (!supabase) {
        setAuthLoading(false)
        return
      }
      const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (event !== 'INITIAL_SESSION' || nextSession) receivedAuthEvent = true
        setSession(nextSession)
        if (!nextSession) {
          setAuctions([])
          setSellerAuctions([])
          setOwnListings([])
          setCategories([])
          setTrustScore(null)
          setCompletedAuctions(null)
          setLoadedUserId(null)
          setDataError('')
          setNotifications([])
          setWatchlistIds([])
          setNotificationsOpen(false)
          setMobileMenuOpen(false)
          watchlistBidValues.current.clear()
          setAuctionWatchlistRules([])
          setWatchlistBidNotifications([])
          setRecentWatchlistBidIds([])
        }
        setAuthLoading(false)
      })
      unsubscribe = () => listener.subscription.unsubscribe()
      void supabase.auth.getSession().then(({ data, error }) => {
        if (cancelled || receivedAuthEvent) return
        if (error) throw error
        setSession(data.session)
        setAuthLoading(false)
      }).catch((caught: unknown) => {
        if (cancelled || receivedAuthEvent) return
        setAuthLoading(false)
        showToast(caught instanceof Error ? caught.message : 'Your sign-in session could not be restored.', 'error')
      })
    }).catch((caught: unknown) => {
      if (cancelled) return
      setAuthLoading(false)
      showToast(caught instanceof Error ? caught.message : 'Your sign-in session could not be restored.', 'error')
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (authLoading || !session) return
    const requestedPath = window.sessionStorage.getItem('quickresell:auth:return-to')
    const destination = requestedPath ?? (authMode ? returnPath(location.state) : null)
    if (requestedPath) window.sessionStorage.removeItem('quickresell:auth:return-to')
    if (destination?.startsWith('/') && !destination.startsWith('//') && destination !== location.pathname) {
      navigate(destination, { replace: true })
    }
  }, [authLoading, authMode, location.pathname, location.state, navigate, session])

  useEffect(() => {
    let cancelled = false
    let secondaryStarted = false
    let secondaryTimer: number | null = null
    let backgroundTimer: number | null = null
    feedRequestGeneration.current += 1
    auctionLoadMoreInFlight.current = false
    setAuctions([])
    setAuctionCursor(null)
    setAuctionLoadMoreError('')
    setAuctionLoadMoreLoading(false)
    const startSecondaryLoads = () => {
      if (cancelled || secondaryStarted) return
      secondaryStarted = true
      if (secondaryTimer !== null) window.clearTimeout(secondaryTimer)
      const requestSession = authLoading ? null : session
      void getListingCategories(requestSession).then((listingCategories) => {
        if (!cancelled) setCategories(listingCategories.map((category) => category.name))
      }).catch(() => {
        if (!cancelled) setCategories([])
      })
      void Promise.all([
        !authLoading && session ? getSellerAuctions(session).catch(() => null) : Promise.resolve(null),
        !authLoading && session && emailConfirmed ? getMyListings(session).catch(() => []) : Promise.resolve([]),
        !authLoading && session && emailConfirmed ? getWatchlist(session).catch(() => []) : Promise.resolve([]),
      ]).then(([sellerData, products, savedItems]) => {
        if (cancelled) return
        setOwnListings(products)
        setSellerAuctions(sellerData?.auctions ?? [])
        setTrustScore(sellerData?.trustScore ?? null)
        setCompletedAuctions(sellerData?.completedAuctions ?? null)
        setWatchlistIds(savedItems)
      })
    }
    secondaryTimer = window.setTimeout(startSecondaryLoads, 1200)
    void getPublicAuctions(authLoading ? null : session, null, 12).then((auctionPage) => {
      if (cancelled) return
      setAuctions(auctionPage.items)
      setAuctionCursor(auctionPage.nextCursor)
      setDataError('')
      setLoadedUserId(dataKey)
    }).catch((caught: unknown) => {
      if (cancelled) return
      setAuctions([])
      setDataError(caught instanceof Error ? caught.message : 'Marketplace data could not be loaded.')
      setLoadedUserId(dataKey)
    }).finally(() => {
      if (!cancelled) backgroundTimer = window.setTimeout(startSecondaryLoads, 0)
    })
    return () => {
      cancelled = true
      if (secondaryTimer !== null) window.clearTimeout(secondaryTimer)
      if (backgroundTimer !== null) window.clearTimeout(backgroundTimer)
    }
  }, [session, emailConfirmed, authLoading, dataKey, dataRetry])

  const loadMoreAuctions = async () => {
    if (!auctionCursor || auctionLoadMoreInFlight.current) return
    const generation = feedRequestGeneration.current
    auctionLoadMoreInFlight.current = true
    setAuctionLoadMoreLoading(true)
    setAuctionLoadMoreError('')
    try {
      const page = await getPublicAuctions(authLoading ? null : session, auctionCursor, 12)
      if (generation !== feedRequestGeneration.current) return
      setAuctions((current) => [...new Map([...current, ...page.items].map((auction) => [auction.id, auction])).values()])
      setAuctionCursor(page.nextCursor)
    } catch (caught) {
      if (generation === feedRequestGeneration.current) {
        setAuctionLoadMoreError(caught instanceof Error ? caught.message : 'More auctions could not be loaded.')
      }
    } finally {
      if (generation === feedRequestGeneration.current) {
        auctionLoadMoreInFlight.current = false
        setAuctionLoadMoreLoading(false)
      }
    }
  }

  useEffect(() => {
    if (!session || !emailConfirmed) {
      setAuctionWatchlistRules([])
      watchlistBidValues.current.clear()
      setWatchlistBidNotifications([])
      setRecentWatchlistBidIds([])
      setWatchlistLoading(false)
      setWatchlistError('')
      return
    }

    let cancelled = false
    setWatchlistLoading(true)
    setWatchlistError('')
    void getAuctionWatchlist(session).then((rules) => {
      if (!cancelled) {
        for (const rule of rules) {
          if (!watchlistBidValues.current.has(rule.auctionRoomId)) {
            watchlistBidValues.current.set(rule.auctionRoomId, rule.auction.currentHighestBid)
          }
        }
        setAuctionWatchlistRules(rules)
      }
    }).catch((caught: unknown) => {
      if (!cancelled) setWatchlistError(caught instanceof Error ? caught.message : 'Your auction watchlist could not be loaded.')
    }).finally(() => {
      if (!cancelled) setWatchlistLoading(false)
    })
    return () => { cancelled = true }
  }, [session, emailConfirmed, dataRetry])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  function showToast(message: string, kind: ToastMessage['kind'] = 'success') { setToast({ message, kind }) }

  const resendConfirmation = async () => {
    if (!session?.user.email) return
    const { supabase } = await import('./lib/supabase')
    if (!supabase) {
      showToast('Email confirmation is not configured.', 'error')
      return
    }
    const { error } = await supabase.auth.resend({ type: 'signup', email: session.user.email, options: { emailRedirectTo: window.location.origin } })
    showToast(error?.message ?? 'A new confirmation link has been sent.', error ? 'error' : 'success')
  }

  const updateWatchedAuction = (roomId: string, patch: Partial<Auction>) => {
    const previousBid = watchlistBidValues.current.get(roomId)
    const updatedBid = typeof patch.currentHighestBid === 'number'
      ? Math.max(previousBid ?? patch.currentHighestBid, patch.currentHighestBid)
      : previousBid
    const bidChanged = previousBid !== undefined && updatedBid !== undefined && updatedBid > previousBid
    if (updatedBid !== undefined) watchlistBidValues.current.set(roomId, updatedBid)

    setAuctionWatchlistRules((current) => {
      const index = current.findIndex((rule) => rule.auctionRoomId === roomId)
      if (index < 0) return current
      const rule = current[index]
      if (!rule) return current
      const updatedRule: AuctionWatchlistRule = {
        ...rule,
        auction: mergeAuctionPatch(rule.auction, {
          ...patch,
          ...(updatedBid !== undefined ? { currentHighestBid: updatedBid } : {}),
        }),
      }
      const remaining = current.filter((item) => item.auctionRoomId !== roomId)
      return bidChanged ? [updatedRule, ...remaining] : [...remaining.slice(0, index), updatedRule, ...remaining.slice(index)]
    })

    if (bidChanged) {
      setWatchlistBidNotifications((current) => current.includes(roomId) ? current : [roomId, ...current])
      setRecentWatchlistBidIds((current) => [roomId, ...current.filter((id) => id !== roomId)])
    }
  }

  const updateRoom = (roomId: string, patch: Partial<Auction>) => {
    setAuctions((items) => items.map((item) => item.id === roomId ? mergeAuctionPatch(item, patch) : item))
    setSellerAuctions((items) => items.map((item) => item.id === roomId ? mergeAuctionPatch(item, patch) : item))
    updateWatchedAuction(roomId, patch)
  }

  useAuctionFeedRealtime({
    onRoomUpdate: (patch) => updateRoom(patch.id, patch),
    onBid: (roomId, bid) => {
      const updatedBid = watchlistBidValues.current.get(roomId)
      updateWatchedAuction(roomId, {
        currentHighestBid: Math.max(updatedBid ?? bid.amount, bid.amount),
        highestBidderId: bid.bidder.id,
      })
      setAuctions((items) => items.map((item) => item.id === roomId
        ? mergeAuctionPatch(item, { currentHighestBid: bid.amount, highestBidderId: bid.bidder.id, bids: [bid, ...item.bids.filter((existing) => existing.id !== bid.id)] })
        : item))
      setSellerAuctions((items) => items.map((item) => item.id === roomId
        ? mergeAuctionPatch(item, { currentHighestBid: bid.amount, highestBidderId: bid.bidder.id, bids: [bid, ...item.bids.filter((existing) => existing.id !== bid.id)] })
        : item))
    },
  })

  const handleBid = async (room: Auction, amount: number) => {
    if (!session) {
      setAuthMode('signin')
      throw new Error('Sign in before placing a bid.')
    }
    if (!emailConfirmed) throw new Error('Confirm your email before placing bids.')
    const result = await verifyPasskeyForAction(session, () => placeBid(room.id, amount, session))
    updateRoom(room.id, result.auction)
    await userCart.refresh()
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
      await verifyPasskeyForAction(session, () => userCart.add(listing))
      showToast(`${listing.title} added to your cart.`)
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'This listing could not be added.', 'error')
    }
  }

  const openPaystackCheckout = (authorizationUrl: string) => {
    const url = new URL(authorizationUrl)
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com') {
      throw new Error('Paystack returned an invalid secure checkout URL.')
    }
    window.location.assign(url.toString())
  }

  const handlePlaceOrder = async (paymentMethod: 'PAYSTACK' | 'WALLET'): Promise<PurchaseOrder | null> => {
    if (!session) {
      setAuthMode('signin')
      throw new Error('Sign in before checking out.')
    }
    if (!emailConfirmed) throw new Error('Confirm your email before checking out.')

    const subtotalCents = userCart.items.filter((item) => item.available).reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0)
    if (subtotalCents <= 0) throw new Error('Add at least one item to your cart before paying.')

    if (paymentMethod === 'WALLET') {
      const order = await verifyPasskeyForAction(session, () => userCart.checkout(undefined, 'WALLET'))
      storeFeed.updateListings((listing) => {
        const purchased = order.items.find((item) => item.postId === listing.id)
        if (!purchased) return listing
        const quantityAvailable = Math.max(0, listing.quantityAvailable - purchased.quantity)
        return quantityAvailable > 0 ? { ...listing, quantityAvailable } : null
      })
      return order
    }

    const payment = await verifyPasskeyForAction(session, () => initializePayment(session))
    openPaystackCheckout(payment.authorization_url)
    return await new Promise<null>(() => undefined)
  }

  const completePaymentCheckout = async (reference: string) => {
    const order = await userCart.checkout(reference)
    storeFeed.updateListings((listing) => {
      const purchased = order.items.find((item) => item.postId === listing.id)
      if (!purchased) return listing
      const quantityAvailable = Math.max(0, listing.quantityAvailable - purchased.quantity)
      return quantityAvailable > 0 ? { ...listing, quantityAvailable } : null
    })
  }

  const completePaystackReturn = (transactionType: 'CART_CHECKOUT' | 'WALLET_TOPUP') => {
    if (transactionType === 'CART_CHECKOUT') {
      showToast('Payment confirmed. Your order has been placed.')
      navigate('/orders', { replace: true })
    } else {
      showToast('Wallet deposit completed successfully.')
      navigate('/wallet', { replace: true })
    }
  }

  const handleAddWalletFunds = async (amountKobo: number) => {
    if (!session) {
      setAuthMode('signin', viewPaths.wallet)
      throw new Error('Sign in before adding money to your wallet.')
    }
    if (!emailConfirmed) throw new Error('Confirm your email before adding money to your wallet.')

    const payment = await initializeWalletTopUp(amountKobo, session)
    openPaystackCheckout(payment.authorization_url)
    return await new Promise<void>(() => undefined)
  }

  const handleListingCreated = (listing: MarketplaceListing) => {
    setOwnListings((current) => [listing, ...current.filter((item) => item.id !== listing.id)])
    showToast(`${listing.title} is now listed for local buyers.`)
  }

  const handleListingUpdated = (listing: MarketplaceListing) => {
    setOwnListings((current) => current.map((item) => item.id === listing.id ? listing : item))
    storeFeed.updateListings((item) => item.id === listing.id ? listing : item)
  }

  const handleAuctionCreated = (auction: Auction) => {
    setAuctions((current) => [auction, ...current.filter((item) => item.id !== auction.id)])
    setSellerAuctions((current) => [auction, ...current.filter((item) => item.id !== auction.id)])
    setOwnListings((current) => current.filter((listing) => listing.id !== auction.postId))
    storeFeed.updateListings((listing) => listing.id === auction.postId ? null : listing)
  }

  const handleSaveAuctionRule = async (auctionRoomId: string, rule: Pick<AuctionWatchlistRule, 'maxBid' | 'bidStep' | 'strategy' | 'jumpMultiplier' | 'sniperWindowSeconds' | 'marginOfSafety' | 'autoBidEnabled'> & { authorizationConfirmed: boolean }) => {
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
      const result = await verifyPasskeyForAction(session, () => saveAuctionWatchlistRule(auctionRoomId, rule, session))
      watchlistBidValues.current.set(auctionRoomId, result.rule.auction.currentHighestBid)
      setAuctionWatchlistRules((current) => [result.rule, ...current.filter((item) => item.auctionRoomId !== auctionRoomId)])
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
    setWatchlistSavingId(auctionRoomId)
    try {
      await removeAuctionWatchlistRule(auctionRoomId, session)
      watchlistBidValues.current.delete(auctionRoomId)
      setAuctionWatchlistRules((current) => current.filter((rule) => rule.auctionRoomId !== auctionRoomId))
      setWatchlistBidNotifications((current) => current.filter((id) => id !== auctionRoomId))
      setRecentWatchlistBidIds((current) => current.filter((id) => id !== auctionRoomId))
      showToast('Auction removed from your watchlist.')
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'This auction could not be removed.', 'error')
    } finally {
      setWatchlistSavingId(null)
    }
  }

  const handleToggleAuctionWatchlist = async (auction: Auction) => {
    if (!session) {
      setAuthMode('signin')
      return
    }
    if (!emailConfirmed) {
      showToast('Confirm your email before saving auctions to your watchlist.', 'error')
      return
    }
    if (auctionWatchlistRules.some((rule) => rule.auctionRoomId === auction.id)) {
      await handleRemoveAuctionRule(auction.id)
      return
    }

    const bidFloor = Math.max(auction.currentHighestBid, auction.startingPrice)
    const maxBid = Math.min(13_312_670_140, bidFloor + 6_656.34)
    if (!Number.isFinite(maxBid) || maxBid <= bidFloor) {
      showToast('This auction has reached the maximum supported watchlist bid.', 'error')
      return
    }
    await handleSaveAuctionRule(auction.id, {
      maxBid,
      bidStep: Math.min(6_656.34, maxBid),
      strategy: 'STANDARD',
      jumpMultiplier: 2,
      sniperWindowSeconds: 120,
      marginOfSafety: 0,
      autoBidEnabled: false,
      authorizationConfirmed: false,
    })
  }

  const prepareAuctionRule = (auction: Auction, maxBid: number, bidStep: number) => {
    const maxBidUsd = localToUsd(maxBid)
    const bidStepUsd = localToUsd(bidStep)
    if (maxBidUsd === null || bidStepUsd === null) {
      showToast('Currency conversion is unavailable. Try again when rates load.', 'error')
      return
    }
    setSelectedId(null)
    setView('watchlist')
    void handleSaveAuctionRule(auction.id, {
      maxBid: maxBidUsd,
      bidStep: bidStepUsd,
      strategy: 'STANDARD',
      jumpMultiplier: 2,
      sniperWindowSeconds: 120,
      marginOfSafety: 0,
      autoBidEnabled: false,
      authorizationConfirmed: false,
    })
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
    navigate('/seller', { replace: location.pathname === '/seller' || location.pathname.startsWith('/seller/') })
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
        setNotifications(items)
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
  const unreadOrderNotifications = notifications.filter((item) => !item.isRead && item.type === 'ORDER_UPDATE').length

  const handleNotificationRead = async (id: string) => {
    if (!session) return
    const updated = await markNotificationRead(id, session)
    setNotifications((items) => items.map((item) => item.id === id ? { ...item, isRead: updated.isRead } : item))
  }

  const handleNotificationClick = async (notification: NotificationItem) => {
    setNotificationsOpen(false)
    await handleNotificationRead(notification.id)
    if (notification.entityType === 'auction' && notification.entityId) {
      setSelectedId(notification.entityId)
      setView('feed')
    } else if (notification.entityType === 'ORDER' || notification.entityType === 'ORDER_ITEM') {
      setSelectedId(null)
      setView('orders')
    } else if (notification.entityType === 'SELLER_PAYOUT') {
      openSellerStudio()
    }
  }

  const handleNotificationDelete = async (notification: NotificationItem) => {
    if (!session) return
    try {
      await deleteNotification(notification.id, session)
      setNotifications((items) => items.filter((item) => item.id !== notification.id))
      showToast('Notification deleted.')
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'The notification could not be deleted. Please try again.', 'error')
    }
  }

  const handleMarkAllNotificationsRead = async () => {
    if (!session) return
    const updated = await markAllNotificationsRead(session)
    if (updated > 0) {
      setNotifications((items) => items.map((item) => ({ ...item, isRead: true })))
    }
  }

  const handleSignOut = async () => {
    const { supabase } = await import('./lib/supabase')
    if (!supabase) throw new Error('Sign out is not configured.')
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) throw error
    setNotifications([])
    setNotificationsOpen(false)
    setMobileMenuOpen(false)
    if (location.pathname !== '/') navigate('/', { replace: true })
  }

  const searchResults = useMemo(() => search.trim() ? auctions.filter((auction) => auction.status === 'ACTIVE' && auction.title.toLowerCase().includes(search.toLowerCase())) : [], [auctions, search])
  const sellerRows = sellerAuctions
  const apiStatus = dataLoading || authLoading ? 'Loading marketplace' : dataError ? 'API unavailable' : session ? 'Live connected' : 'Public browsing'

  const nav = <>
    <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.15em] text-[#98a39d]">Marketplace</p>
    <button type="button" onClick={() => { setView('feed'); setSelectedId(null) }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === 'feed' && !selectedId ? 'bg-[#edf4ed] text-[#2d5d4c]' : 'text-[#78867e] hover:bg-[#f1f4f1] hover:text-[#263b33]'}`}><Compass size={17} />Live auctions<span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] text-[#74847a]">{auctions.filter((item) => item.status === 'ACTIVE').length}</span></button>
    <button type="button" onClick={() => { setView('shop'); setSelectedId(null) }} className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === 'shop' ? 'bg-[#edf4ed] text-[#2d5d4c]' : 'text-[#78867e] hover:bg-[#f1f4f1] hover:text-[#263b33]'}`}><Store size={17} />Shop</button>
    <button type="button" onClick={() => { setView('cart'); setSelectedId(null) }} className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === 'cart' ? 'bg-[#edf4ed] text-[#2d5d4c]' : 'text-[#78867e] hover:bg-[#f1f4f1] hover:text-[#263b33]'}`}><ShoppingCart size={17} />Cart<span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] text-[#74847a]">{userCart.items.reduce((sum, item) => sum + item.quantity, 0)}</span></button>
    <button type="button" onClick={() => { setView('orders'); setSelectedId(null) }} aria-label={unreadOrderNotifications > 0 ? `My orders, ${unreadOrderNotifications} unread order notifications` : 'My orders'} className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === 'orders' ? 'bg-[#edf4ed] text-[#2d5d4c]' : 'text-[#78867e] hover:bg-[#f1f4f1] hover:text-[#263b33]'}`}><span className="relative"><PackageCheck size={17} />{unreadOrderNotifications > 0 && <span className="absolute -right-2 -top-2 min-w-3 text-center text-[9px] font-bold leading-3 text-[#d94b3d]">{Math.min(unreadOrderNotifications, 9)}</span>}</span>My orders</button>
    <button type="button" onClick={() => { setView('wallet'); setSelectedId(null) }} className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === 'wallet' ? 'bg-[#edf4ed] text-[#2d5d4c]' : 'text-[#78867e] hover:bg-[#f1f4f1] hover:text-[#263b33]'}`}><WalletCards size={17} />Wallet</button>
    <button type="button" onClick={openWatchlist} aria-label={unreadWatchlistBidCount > 0 ? `Watchlist, ${unreadWatchlistBidCount} new bid updates` : 'Watchlist'} className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === 'watchlist' ? 'bg-[#edf4ed] text-[#2d5d4c]' : 'text-[#78867e] hover:bg-[#f1f4f1] hover:text-[#263b33]'}`}><span className="relative"><Bookmark size={17} />{unreadWatchlistBidCount > 0 && <BellDot size={12} className="absolute -right-2 -top-2 text-[#d94b3d]" />}</span>Watchlist<span className="ml-auto flex items-center gap-1.5">{unreadWatchlistBidCount > 0 && <span className="px-1.5 text-[9px] font-bold text-[#d94b3d]">{Math.min(unreadWatchlistBidCount, 9)}</span>}<span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-[#74847a]">{activeWatchlistCount}</span></span></button>
    <button type="button" onClick={() => { setView('dashboard'); setSelectedId(null) }} className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${view === 'dashboard' ? 'bg-[#edf4ed] text-[#2d5d4c]' : 'text-[#78867e] hover:bg-[#f1f4f1] hover:text-[#263b33]'}`}><LayoutDashboard size={17} />Seller studio{sellerRows.some((item) => item.status === 'PENDING_APPROVAL') && <span className="ml-auto size-2 rounded-full bg-[#df704a]" />}</button>
  </>

  return <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#f5f7f5] text-sm text-[#849189]">Loading QuickResell…</div>}>
    {authMode ? <AuthPage initialMode={authMode} returnTo={returnPath(location.state)} onBack={backFromAuth} onAuthenticated={() => { setAuthMode(null); showToast('You’re signed in. Welcome to Quick Resell.') }} /> : <div className="min-h-screen bg-[#f5f7f5] text-[#192724]">
    <header className="sticky top-0 z-30 flex h-[68px] items-center gap-3 border-b border-[#e6ebe7] bg-white/95 px-3 backdrop-blur-md sm:gap-4 sm:px-6 lg:px-8">
      <button type="button" aria-label={mobileMenuOpen ? 'Close marketplace menu' : 'Open marketplace menu'} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)} className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#e7ece8] text-[#52685d] transition hover:bg-[#f3f6f3] md:hidden">{mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}</button>
      <button type="button" onClick={() => { setView('feed'); setSelectedId(null) }} className="flex shrink-0 items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-[#d4f06b] text-[#243a33]"><ShoppingBag size={19} strokeWidth={2.5} /></span><span className="font-display text-[17px] font-bold tracking-[-.03em]">quick<span className="text-[#70917c]">resell</span></span></button>
      <div className={`relative mx-auto w-full max-w-[540px] ${searchOpen ? 'block' : 'hidden'} md:block`}><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#96a19b]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search marketplace" className="h-10 w-full rounded-xl border border-[#e7ece8] bg-[#f7f9f7] pl-10 pr-4 text-sm outline-none transition focus:border-[#9ab4a2] focus:bg-white" />{search && <div className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-xl border border-[#e6ebe7] bg-white shadow-lg">{searchResults.map((auction) => <button key={auction.id} type="button" onClick={() => { setSelectedId(auction.id); setSearch(''); setSearchOpen(false) }} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#f5f8f5]"><img src={auction.image} alt="" className="size-10 rounded-lg object-cover" loading="lazy" decoding="async" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{auction.title}</span><span className="text-xs text-[#74847a]">${auction.currentHighestBid}</span></button>)}{!searchResults.length && <p className="p-4 text-sm text-[#849189]">No matching live listings.</p>}</div>}</div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[.08em] sm:inline-flex ${dataError ? 'bg-[#fff1ee] text-[#9c493d]' : 'bg-[#ebf5ee] text-[#477358]'}`}><span className={`size-1.5 rounded-full ${dataError ? 'bg-[#c45c4d]' : 'bg-[#66a178]'}`} />{apiStatus}</span>
        <span className="relative hidden sm:inline-flex">
          <IconButton label={`Open cart, ${userCart.items.reduce((sum, item) => sum + item.quantity, 0)} items`} onClick={() => { setSelectedId(null); setView('cart') }}><ShoppingCart size={18} /></IconButton>
          {userCart.items.length > 0 && <span className="pointer-events-none absolute right-0 top-0 grid min-h-4 min-w-4 place-items-center rounded-full bg-[#d94b3d] px-1 text-[9px] font-bold text-white">{userCart.items.reduce((sum, item) => sum + item.quantity, 0)}</span>}
        </span>
        <div className="relative">
          <IconButton label={unreadNotifications > 0 ? `Notifications, ${unreadNotifications} unread` : 'Notifications'} onClick={() => setNotificationsOpen((current) => !current)}><Bell size={17} /></IconButton>
          {unreadNotifications > 0 && <span className="pointer-events-none absolute -right-1 -top-1 min-w-3 text-center text-[9px] font-bold leading-3 text-[#d94b3d]">{Math.min(unreadNotifications, 9)}</span>}
          {notificationsOpen && <div className="absolute right-0 top-12 z-50 hidden w-[320px] overflow-hidden rounded-2xl border border-[#e4eae5] bg-white shadow-2xl sm:block">
            <div className="flex items-center justify-between border-b border-[#eef2ee] px-4 py-3">
              <div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#909c96]">Alerts</p><p className="mt-0.5 text-sm font-semibold text-[#2a4035]">Your marketplace feed</p></div>
              {unreadNotifications > 0 && <button type="button" onClick={() => void handleMarkAllNotificationsRead()} className="text-[11px] font-semibold text-[#3d6e5d] underline-offset-2 hover:underline">Clear all</button>}
            </div>
            <div className="max-h-[340px] overflow-y-auto p-2">
              {notifications.length === 0
                ? <div className="rounded-xl bg-[#f7faf7] px-3 py-5 text-center text-xs text-[#7d8a84]">No notifications yet. New bids, order updates, and price changes will appear here.</div>
                : notifications.slice(0, 8).map((notification) => <button key={notification.id} type="button" onClick={() => void handleNotificationClick(notification)} className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${notification.isRead ? 'border-transparent bg-[#f9faf9]' : 'border-[#e4f0e7] bg-[#edf8f1]'}`}>
                  <span className={`mt-0.5 grid size-7 place-items-center rounded-full ${notification.type === 'OUTBID' || notification.type === 'AUCTION_CLOSED' ? 'bg-[#fff3ef] text-[#c8574a]' : notification.type === 'AUCTION_WON' || notification.type === 'LISTING_SOLD' ? 'bg-[#eaf9ea] text-[#3c7d5b]' : 'bg-[#edf2ff] text-[#536ab9]'}`}><Bell size={14} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold uppercase tracking-[.08em] text-[#8a9891]">{notification.type.replace(/_/g, ' ').toLowerCase()}</span><span className="mt-0.5 block text-sm font-semibold text-[#21372f]">{notification.title}</span><span className="mt-1 block text-xs leading-5 text-[#75837d]">{formatNotificationMessage(notification.message, formatUsd)}</span></span>
                </button>)}
            </div>
          </div>}
        </div>
        {session ? <Suspense fallback={<span className="ml-1 size-10 animate-pulse rounded-full bg-[#e9f0e8]" />}><AccountMenu session={session} onSignOut={handleSignOut} onDeleted={() => { navigate('/', { replace: true }); showToast('Your account and associated QuickResell data have been deleted.') }} /></Suspense> : <Button variant="secondary" onClick={() => setAuthMode('signin')} className="ml-1 min-h-9 rounded-lg px-3 text-xs">Sign in</Button>}
      </div>
    </header>
    {mobileMenuOpen && <div className="fixed inset-0 z-40 md:hidden">
      <button type="button" aria-label="Close marketplace menu" onClick={() => setMobileMenuOpen(false)} className="absolute inset-0 bg-[#14221c]/35" />
      <nav aria-label="Marketplace menu" onClick={() => setMobileMenuOpen(false)} className="absolute left-3 right-3 top-[76px] max-h-[calc(100dvh-88px)] overflow-y-auto rounded-2xl border border-[#e4eae5] bg-white p-3 shadow-xl">
        {nav}
      </nav>
    </div>}
    {notificationsOpen && <Suspense fallback={null}><NotificationsPanel open notifications={notifications} onClose={() => setNotificationsOpen(false)} onMarkAllRead={() => void handleMarkAllNotificationsRead()} onRead={(notification) => void handleNotificationClick(notification)} onDelete={(notification) => void handleNotificationDelete(notification)} /></Suspense>}
    {isPaymentCallback && <Suspense fallback={<div className="fixed inset-0 z-[100] grid place-items-center bg-[#14221c]/65 text-sm text-white">Verifying Paystack payment…</div>}><PaystackReturnPage reference={paymentReference} transactionType={paymentTransactionType} session={session} authLoading={authLoading} emailConfirmed={emailConfirmed} onRequestSignIn={() => setAuthMode('signin', `${location.pathname}${location.search}`)} onCompleteCheckout={completePaymentCheckout} onComplete={completePaystackReturn} /></Suspense>}

    <div className="border-b border-[#e4eae5] bg-white"><div className="mx-auto flex max-w-[1640px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8"><div><p className="text-sm font-semibold text-[#2b4036]">Have something to sell?</p><p className="mt-0.5 text-xs text-[#7a8781]">Add product photos and list it for local buyers.</p></div><Button variant="secondary" onClick={openSellerStudio} icon={<ImagePlus size={16} />}>Sell an item</Button></div></div>

    <div className="mx-auto grid max-w-[1640px] grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_270px]">
      <aside className="sticky top-[68px] hidden h-[calc(100vh-68px)] min-h-0 flex-col overflow-y-auto overscroll-contain border-r border-[#e6ebe7] bg-[#f9faf9] px-4 py-6 md:flex"><nav className="space-y-1">{nav}</nav><div className="mt-auto rounded-[16px] bg-[#e9f0e8] p-4"><div className="mb-3 grid size-8 place-items-center rounded-lg bg-white text-[#537666]"><GraduationCap size={18} /></div><p className="font-display text-sm font-semibold text-[#2f4a3d]">Trusted sellers</p><p className="mt-1 text-[11px] leading-4 text-[#72867a]">Trade with people who are right around the corner.</p><div className="mt-3 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#63816f]"><ShieldCheck size={12} />Trust matters here</div></div></aside>

      {!selectedAuction && view !== 'watchlist' && <button type="button" aria-label={unreadWatchlistBidCount > 0 ? `Open auction watchlist, ${unreadWatchlistBidCount} new bid updates` : 'Open auction watchlist'} title="Open auction watchlist" onClick={openWatchlist} className="fixed bottom-[calc(154px+env(safe-area-inset-bottom))] right-4 z-40 inline-flex h-12 w-12 transform items-center justify-center rounded-full border border-[#cfe4d5] bg-[#dfeee2] text-[#244737] shadow-[0_12px_28px_rgba(35,56,43,.14)] backdrop-blur-sm transition-transform duration-150 hover:bg-[#d2ebd8] active:translate-y-[1px] lg:hidden"><Bookmark size={17} />{unreadWatchlistBidCount > 0 ? <span className="absolute -right-1 -top-1"><BellDot size={16} className="text-[#d94b3d]" /></span> : activeWatchlistCount > 0 && <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-[#d4f06b] px-1 text-[9px] font-bold text-[#213b30]">{Math.min(activeWatchlistCount, 9)}</span>}</button>}
      <Suspense fallback={null}><NavigationAssistant auctions={auctions} listings={listings} dataReady={!dataLoading && !dataError} onNavigate={(destination) => { if (destination === 'dashboard') { openSellerStudio(); return } setSelectedId(null); setView(destination) }} onOpenAuction={(auction) => { setSelectedId(auction.id); setViewState('feed') }} onOpenListing={handleScoutOpenListing} onPrepareRule={prepareAuctionRule} currentUserId={currentUserId} auctionWatchlistRules={auctionWatchlistRules} onFeedback={(feedback) => void handleScoutFeedback(feedback)} onSupportRequest={handleScoutSupportRequest} onAskModel={askScout} signedIn={Boolean(session)} emailConfirmed={emailConfirmed} onSignIn={() => setAuthMode('signin')} /></Suspense>
      <Suspense fallback={<main className="min-w-0 px-4 pb-24 pt-6 sm:px-6 lg:px-7 lg:pb-8 lg:pt-7"><div className="h-40 animate-pulse rounded-[18px] bg-white" /></main>}>
      {view === 'watchlist' ? <main className="min-w-0 px-4 pb-24 pt-6 sm:px-6 lg:px-7 lg:pb-8 lg:pt-7"><AuctionWatchlistPage rules={auctionWatchlistRules} recentBidAuctionIds={recentWatchlistBidIds} loading={watchlistLoading} error={watchlistError} savingId={watchlistSavingId} onSave={handleSaveAuctionRule} onRemove={handleRemoveAuctionRule} onOpenAuction={(auction) => setSelectedId(auction.id)} onRequestSignIn={() => setAuthMode('signin')} onBrowseAuctions={() => setView('feed')} signedIn={Boolean(session)} emailConfirmed={emailConfirmed} /></main> : view === 'wallet' ? <main className="min-w-0 px-4 pb-24 pt-6 sm:px-6 lg:px-7 lg:pb-8 lg:pt-7"><WalletPage key={`${currentUserId}:${emailConfirmed}`} session={session} emailConfirmed={emailConfirmed} onRequestSignIn={() => setAuthMode('signin', viewPaths.wallet)} onAddFunds={handleAddWalletFunds} onRequestSellerVerification={() => navigate('/seller/verification')} /></main> : <main className="min-w-0 px-4 pb-24 pt-6 sm:px-6 lg:px-7 lg:pb-8 lg:pt-7">
        {session && !emailConfirmed && <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ead9b0] bg-[#fff9e9] px-4 py-3 text-sm text-[#765b22]"><span>Confirm your email to bid, sell, message sellers, or place orders.</span><Button variant="secondary" onClick={() => void resendConfirmation()} className="min-h-8 rounded-lg px-3 text-xs">Resend confirmation</Button></div>}
        {dataLoading && !auctions.length ? <div className="grid min-h-72 place-items-center rounded-xl border border-[#e4eae5] bg-white text-sm text-[#849189]">Loading live auctions…</div> : dataError && !auctions.length ? <div role="alert" className="mx-auto mt-12 max-w-lg rounded-xl border border-[#f0d7d2] bg-white p-6 text-center"><h1 className="font-display text-xl font-semibold text-[#263b33]">Marketplace data unavailable</h1><p className="mt-2 break-words text-sm text-[#7a8781]">{dataError}</p><Button variant="secondary" onClick={() => { setDataError(''); setLoadedUserId(null); setDataRetry((attempt) => attempt + 1) }} className="mt-4">Retry</Button></div> : selectedAuction ? <AuctionRoom auction={selectedAuction} userId={currentUserId} autoBidRule={auctionWatchlistRules.find((rule) => rule.auctionRoomId === selectedAuction.id)} session={session} emailConfirmed={emailConfirmed} onRequestSignIn={() => setAuthMode('signin', location.pathname)} onBack={() => setSelectedId(null)} onBid={(amount) => handleBid(selectedAuction, amount)} onExpire={() => handleExpire(selectedAuction)} onNotice={showToast} onRoomUpdate={(patch) => updateRoom(selectedAuction.id, patch)} onVerdict={(decision) => handleVerdict(selectedAuction, decision)} /> : view === 'dashboard' ? <SellerDashboard key={currentUserId} auctions={sellerRows} userId={currentUserId} trustScore={trustScore} completedAuctions={completedAuctions} session={session} emailConfirmed={emailConfirmed} ownListings={ownListings} onRequestSignIn={() => setAuthMode('signin')} onListingCreated={handleListingCreated} onListingUpdated={handleListingUpdated} onAuctionCreated={handleAuctionCreated} onVerdict={handleVerdict} onNotice={showToast} /> : view === 'shop' ? <StorePage listings={listings} categories={categories} error={storeFeed.error} loading={storeLoading} cartHas={(postId) => userCart.items.some((item) => item.postId === postId)} watchlistIds={watchlistIds} onToggleSaved={(postId) => void handleToggleSaved(postId)} onAdd={(listing) => void handleAddToCart(listing)} onOpenCart={() => setView('cart')} session={session} emailConfirmed={emailConfirmed} onRequestSignIn={() => setAuthMode('signin', '/shop')} hasMore={storeFeed.hasMore} loadingMore={storeFeed.loadingMore} loadMoreError={storeFeed.loadMoreError} onLoadMore={() => void storeFeed.loadMore()} onRefresh={storeFeed.refresh} refreshing={storeFeed.refreshing} /> : view === 'cart' ? <ShoppingCartPage items={userCart.items} loading={userCart.loading} error={userCart.error} session={session} onShop={() => setView('shop')} onOpenWallet={() => navigate('/wallet')} onSetQuantity={userCart.setQuantity} onRemove={userCart.remove} onCheckout={handlePlaceOrder} onRefresh={userCart.refresh} /> : view === 'orders' ? <PurchaseHistoryPage key={currentUserId} session={session} emailConfirmed={emailConfirmed} onRequestSignIn={() => setAuthMode('signin', '/orders')} /> : <GlobalFeed auctions={auctions} categories={categories} watchlistIds={auctionWatchlistRules.map((rule) => rule.auctionRoomId)} savingWatchlistId={watchlistSavingId} watchlistLoading={watchlistLoading} currentUserId={currentUserId} onToggleWatchlist={(auction) => void handleToggleAuctionWatchlist(auction)} onOpen={(auction) => setSelectedId(auction.id)} session={session} emailConfirmed={emailConfirmed} onRequestSignIn={() => setAuthMode('signin', location.pathname)} hasMore={Boolean(auctionCursor)} loadingMore={auctionLoadMoreLoading} loadMoreError={auctionLoadMoreError} onLoadMore={() => void loadMoreAuctions()} />}
      </main>}
      </Suspense>

      {!selectedAuction && view === 'feed' && session && <aside className="hidden border-l border-[#e6ebe7] bg-[#f9faf9] px-4 py-6 xl:block"><div className="mb-6 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8b9891]">Your profile</p><p className="font-display mt-1 max-w-44 truncate text-sm font-semibold text-[#2b4036]">{session.user.user_metadata.full_name ?? session.user.email}</p></div>{session.user.user_metadata.avatar_url && <img src={session.user.user_metadata.avatar_url} alt="" className="size-10 rounded-full object-cover" loading="lazy" decoding="async" />}</div>{trustScore !== null && completedAuctions !== null && <div className="rounded-[16px] border border-[#e4eae5] bg-white p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-[#718078]">Seller standing</span><Sparkles size={14} className="text-[#9bad4e]" /></div><p className="font-display text-[31px] font-bold leading-none text-[#294339]">{trustScore}<span className="ml-1 text-sm font-semibold text-[#94a099]">/100</span></p><div className="mt-3"><TrustScoreBadge score={trustScore} completedAuctions={completedAuctions} noReserveHero /></div><p className="mt-3 border-t border-[#eff2ef] pt-3 text-[11px] leading-5 text-[#8a9690]">Your follow-through earns trust. Buyers can see your record in every room.</p></div>}<div className="mt-6"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[.1em] text-[#718078]">Ending soon</p></div><div className="space-y-2">{auctions.filter((item) => item.status === 'ACTIVE').slice(0, 3).map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="flex w-full items-center gap-2.5 rounded-xl border border-[#e8ede9] bg-white p-2 text-left transition hover:border-[#c9d8cd]"><img src={item.image} alt="" className="size-11 rounded-lg object-cover" loading="lazy" decoding="async" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[#394b42]">{item.title}</span><span className="mt-1 block text-[10px] text-[#849189]">${item.currentHighestBid} · {item.bids.length} bids</span></span></button>)}</div></div><button type="button" onClick={() => { setView('dashboard'); setSelectedId(null) }} className="mt-6 w-full rounded-[14px] bg-[#dcecff] p-3.5 text-left"><span className="flex items-center gap-2 text-xs font-bold text-[#345b75]"><Store size={14} />Sell something nearby</span><span className="mt-1 block text-[11px] leading-4 text-[#57758b]">Create a listing in Seller Studio.</span></button></aside>}
    </div>

    <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[#e3e9e4] bg-white/95 px-3 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden [&>button]:!min-w-0 [&>button]:flex-1">
      <button type="button" onClick={() => { setView('feed'); setSelectedId(null) }} className={`flex min-w-16 flex-col items-center gap-1 py-1 text-[10px] font-semibold ${view === 'feed' ? 'text-[#376b59]' : 'text-[#839087]'}`}><Compass size={19} />Auctions</button>
      <button type="button" onClick={() => setView('shop')} className={`flex min-w-16 flex-col items-center gap-1 py-1 text-[10px] font-semibold ${view === 'shop' ? 'text-[#376b59]' : 'text-[#839087]'}`}><Store size={19} />Shop</button>
      <button type="button" onClick={() => { setView('cart'); setSelectedId(null) }} className={`flex min-w-16 flex-col items-center gap-1 py-1 text-[10px] font-semibold ${view === 'cart' ? 'text-[#376b59]' : 'text-[#839087]'}`}><span className="relative"><ShoppingCart size={19} />{userCart.items.length > 0 && <span className="absolute -right-2 -top-1 grid min-h-3.5 min-w-3.5 place-items-center rounded-full bg-[#d94b3d] px-0.5 text-[8px] font-bold text-white">{userCart.items.reduce((sum, item) => sum + item.quantity, 0)}</span>}</span>Cart</button>
      <button type="button" onClick={() => { setView('orders'); setSelectedId(null) }} aria-label={unreadOrderNotifications > 0 ? `Orders, ${unreadOrderNotifications} unread order notifications` : 'Orders'} className={`flex min-w-16 flex-col items-center gap-1 py-1 text-[10px] font-semibold ${view === 'orders' ? 'text-[#376b59]' : 'text-[#839087]'}`}><span className="relative"><PackageCheck size={19} />{unreadOrderNotifications > 0 && <span className="absolute -right-2 -top-2 min-w-3 text-center text-[9px] font-bold leading-3 text-[#d94b3d]">{Math.min(unreadOrderNotifications, 9)}</span>}</span>Orders</button>
      <button type="button" onClick={() => { setView('dashboard'); setSelectedId(null) }} className={`flex min-w-16 flex-col items-center gap-1 py-1 text-[10px] font-semibold ${view === 'dashboard' ? 'text-[#376b59]' : 'text-[#839087]'}`}><LayoutDashboard size={19} />Studio</button>
    </nav>


    {toast && <div role="status" className={`toast-enter fixed bottom-20 left-1/2 z-[110] flex w-[calc(100%-32px)] max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl lg:bottom-6 ${toast.kind === 'error' ? 'bg-[#ad473c]' : 'bg-[#274c3d]'}`}><span className="flex-1">{toast.message}</span><IconButton label="Dismiss notification" className="size-8 text-white hover:bg-white/15 hover:text-white" onClick={() => setToast(null)}><X size={15} /></IconButton></div>}
      {(selectedAuction || view === 'shop') && <aside style={{ right: 'max(0px, calc(50vw - 820px))' }} className="fixed top-[68px] hidden h-[calc(100vh-68px)] w-[270px] border-l border-[#e6ebe7] bg-[#f9faf9] xl:block"><BidAdvert auction={selectedAuction ?? auctions.filter((item) => item.status === 'ACTIVE').sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())[0] ?? null} onOpen={(auction) => { setSelectedId(auction.id); setViewState('feed') }} /></aside>}
    </div>}
  </Suspense>
}
