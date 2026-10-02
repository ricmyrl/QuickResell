import { useEffect, useRef, useState } from 'react'
import { Bot, ChevronDown, Compass, ExternalLink, MessageCircle, Minus, Send, ShieldCheck, Sparkles, Store, Wifi, WifiOff, X } from 'lucide-react'
import type { Auction, AuctionWatchlistRule, MarketplaceListing } from '../../types'

type Destination = 'feed' | 'shop' | 'cart' | 'dashboard' | 'watchlist'
type AssistantAction = { destination?: Destination } & (
  | { label: string; kind: 'navigate'; destination: Destination }
  | { label: string; kind: 'auction'; auctionId: string }
  | { label: string; kind: 'listing'; listingId: string }
  | { label: string; kind: 'prepareRule'; auctionId: string; maxBid: number; bidStep: number }
  | { label: string; kind: 'signin' }
)
type ScoutIntent = 'greeting' | 'bid_rule' | 'bid_status' | 'auction_search' | 'shop_search' | 'checkout' | 'seller' | 'trust' | 'support' | 'unknown'
type ChatMessage = { id: string; role: 'assistant' | 'customer'; text: string; intent?: ScoutIntent; actions?: AssistantAction[]; feedback?: boolean; createdAt: number }
type CachedMarketData = { auctions: Auction[]; listings: MarketplaceListing[]; savedAt: number }
type NavigationAssistantProps = {
  auctions: Auction[]
  listings: MarketplaceListing[]
  dataReady: boolean
  onNavigate: (destination: Destination) => void
  onOpenAuction: (auction: Auction) => void
  onOpenListing: (listing: MarketplaceListing) => void
  onPrepareRule: (auction: Auction, maxBid: number, bidStep: number) => void
  currentUserId: string
  auctionWatchlistRules: AuctionWatchlistRule[]
  onSignIn: () => void
}

const historyKey = 'quickresell:scout:chat:v1'
const marketCacheKey = 'quickresell:scout:market:v1'
const quickPrompts = ['How do I place a bid?', 'Find something to buy', 'How do I sell?']

function readStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) as T : fallback
  } catch {
    return fallback
  }
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true
  if (Math.abs(left.length - right.length) > 1 || Math.min(left.length, right.length) < 4) return false
  let leftIndex = 0
  let rightIndex = 0
  let edits = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1
      rightIndex += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    if (left.length > right.length) leftIndex += 1
    else if (right.length > left.length) rightIndex += 1
    else { leftIndex += 1; rightIndex += 1 }
  }
  return true
}

function findMatches<T extends { title: string; category: string; location?: string; description?: string }>(text: string, items: T[]): T[] {
  const ignored = new Set(['find', 'show', 'want', 'need', 'have', 'with', 'for', 'the', 'can', 'you', 'item', 'items', 'product', 'products', 'auction', 'auctions', 'watch', 'under', 'below', 'less', 'than', 'near', 'around', 'max', 'maximum', 'price', 'bid', 'bids', 'step', 'increment', 'my', 'me', 'is', 'am', 'i', 'still', 'winning'])
  const words = text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !ignored.has(word) && !/^\d+$/.test(word))
  if (!words.length) return []
  return items.map((item) => {
    const titleWords = item.title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    const categoryWords = item.category.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    const searchableWords = [...titleWords, ...categoryWords, ...(item.location ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)]
    const score = words.reduce((total, word) => {
      if (titleWords.some((candidate) => candidate.includes(word) || editDistanceAtMostOne(word, candidate))) return total + 3
      if (categoryWords.some((candidate) => candidate.includes(word) || editDistanceAtMostOne(word, candidate))) return total + 2
      if (searchableWords.some((candidate) => candidate.includes(word))) return total + 1
      return total
    }, 0)
    return { item, score }
  }).filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map((match) => match.item)
}

function answerLocally(text: string, auctions: Auction[], listings: MarketplaceListing[], currentUserId: string, rules: AuctionWatchlistRule[], online: boolean): Omit<ChatMessage, 'id' | 'role' | 'createdAt'> {
  const normalized = text.toLowerCase()
  const activeAuctions = auctions.filter((auction) => auction.status === 'ACTIVE')
  const auctionMatches = findMatches(normalized, activeAuctions)
  const listingMatches = findMatches(normalized, listings)
  const matchedAuction = auctionMatches[0]
  const matchedListing = listingMatches[0]

  const maximumMatch = normalized.match(/(?:max(?:imum)?(?:\s+(?:bid|price))?|up to|bid limit)(?:\s+of)?\s*:?\s*\$?([\d,]+(?:\.\d{1,2})?)/)
  const stepMatch = normalized.match(/(?:step|increment|raise by)\s*:?\s*\$?([\d,]+(?:\.\d{1,2})?)/)
  const maximum = maximumMatch ? Number(maximumMatch[1].replaceAll(',', '')) : 0
  const step = stepMatch ? Number(stepMatch[1].replaceAll(',', '')) : 0
  const asksScoutToBid = /\b(auto.?bid|bid on my behalf|bid up to|maximum bid|bid limit|watch|watchlist|wishlist)\b/.test(normalized)

  if (asksScoutToBid && matchedAuction) {
    if (auctionMatches.length > 1 && !normalized.includes(matchedAuction.title.toLowerCase())) {
      return { text: 'I found several live auctions. Choose the exact item first, then I can prepare its price rule.', intent: 'bid_rule', actions: auctionMatches.slice(0, 3).map((auction) => ({ label: auction.title, kind: 'auction' as const, auctionId: auction.id })) }
    }
    if (maximum > matchedAuction.currentHighestBid && step > 0 && step <= maximum) {
      return {
        text: `I can prepare a rule for “${matchedAuction.title}”: maximum ${currency(maximum)}, step ${currency(step)}. I will not bid until you review the rule, enable Scout, and confirm authorization on the Watchlist screen.`,
        intent: 'bid_rule',
        actions: [{ label: 'Review this bid rule', kind: 'prepareRule', auctionId: matchedAuction.id, maxBid: maximum, bidStep: step }],
      }
    }
    return {
      text: `I found “${matchedAuction.title}” at ${currency(matchedAuction.currentHighestBid)}. Tell me your maximum and bid step, for example: “Watch ${matchedAuction.title}, max $80, step $5.” Scout will only prepare the rule; you must enable and authorize it before any bid is placed.`,
      intent: 'bid_rule',
      actions: [{ label: 'Open Watchlist', kind: 'navigate', destination: 'watchlist' }],
    }
  }

  if (asksScoutToBid) {
    return { text: 'Which live auction should I watch? Include its title, your maximum price, and a bid step. Example: “Watch Intro Psychology Textbook, max $80, step $5.” I’ll prepare a rule for you to review; it will not bid until you authorize it.', intent: 'bid_rule', actions: [{ label: 'Browse auctions', kind: 'navigate', destination: 'feed' }, { label: 'Open Watchlist', kind: 'navigate', destination: 'watchlist' }] }
  }

  if (/\b(watchlist|wishlist|watch my auctions|saved auctions)\b/.test(normalized)) {
    return { text: 'Your Watchlist stores live auctions and their price rules. Choose a maximum and bid step. Scout bidding stays paused until you enable it and confirm the per-auction authorization.', intent: 'bid_rule', actions: [{ label: 'Open Watchlist', kind: 'navigate', destination: 'watchlist' }] }
  }

  if (/\b(am i (still )?winning|did i win|outbid|my bid|bid status|is my bid|did scout bid)\b/.test(normalized)) {
    if (!matchedAuction) {
      return { text: 'Which auction should I check? Include a few words from its title and I’ll compare your current position with the live high bid.', intent: 'bid_status', actions: [{ label: 'Open live auctions', kind: 'navigate', destination: 'feed' }] }
    }
    if (!currentUserId) {
      return { text: `I can check “${matchedAuction.title}” at ${currency(matchedAuction.currentHighestBid)}, but you’ll need to sign in for me to identify your bid position.`, intent: 'bid_status', actions: [{ label: 'Sign in', kind: 'signin' }, { label: 'Open auction', kind: 'auction', auctionId: matchedAuction.id }] }
    }
    const rule = rules.find((item) => item.auctionRoomId === matchedAuction.id)
    const leading = matchedAuction.highestBidderId === currentUserId
    const position = leading ? 'You are currently the high bidder.' : matchedAuction.highestBidderId ? 'You are not currently leading; another bidder is ahead.' : 'No one has placed a bid yet.'
    const scout = rule ? ` Your saved Scout rule is ${rule.autoBidEnabled ? 'on' : 'paused'} with a ${currency(rule.maxBid)} maximum and ${currency(rule.bidStep)} step.` : ''
    const offlineNotice = online ? '' : ' This is the last saved state; reconnect to confirm the live price.'
    return { text: `“${matchedAuction.title}” is at ${currency(matchedAuction.currentHighestBid)}. ${position}${scout}${offlineNotice}`, intent: 'bid_status', actions: [{ label: 'Open auction', kind: 'auction', auctionId: matchedAuction.id }, { label: 'Open Watchlist', kind: 'navigate', destination: 'watchlist' }] }
  }

  if (/\b(hi|hello|hey|good morning|good afternoon)\b/.test(normalized)) {
    return { text: 'Hi there. I’m Scout, your QuickResell guide. I can help you browse, bid, shop, or find your way around.', intent: 'greeting', actions: [{ label: 'Browse auctions', kind: 'navigate', destination: 'feed' }, { label: 'Open campus shop', kind: 'navigate', destination: 'shop' }] }
  }

  if (/\b(bid|bidding|bidder|auction|raise my offer|place an offer)\b/.test(normalized)) {
    if (matchedAuction) {
      if (auctionMatches.length > 1 && !normalized.includes(matchedAuction.title.toLowerCase())) {
        return { text: `I found a few auctions that may fit. Which one did you mean?`, intent: 'auction_search', actions: auctionMatches.slice(0, 3).map((auction) => ({ label: `${auction.title} · ${currency(auction.currentHighestBid)}`, kind: 'auction' as const, auctionId: auction.id })) }
      }
      return { text: `“${matchedAuction.title}” is live at ${currency(matchedAuction.currentHighestBid)}. Open the room to review the details and place a bid greater than the current bid. You’ll need to sign in and confirm your email first.${online ? '' : ' The saved price may be stale while offline; bidding requires a connection.'}`, intent: 'auction_search', actions: [{ label: 'Open this auction', kind: 'auction', auctionId: matchedAuction.id }] }
    }
    const guide = activeAuctions.length
      ? `There ${activeAuctions.length === 1 ? 'is' : 'are'} ${activeAuctions.length} live ${activeAuctions.length === 1 ? 'auction' : 'auctions'} right now. Open a room, enter an amount above its current bid, and confirm. You must be signed in with a confirmed email; if you win, the seller still needs to accept the bid.`
      : 'Open Live auctions to browse the rooms. To bid, sign in with a confirmed email, open a live room, and enter an amount above its current bid. If you win, the seller still needs to accept the bid.'
    return { text: guide, intent: 'auction_search', actions: [{ label: 'Browse live auctions', kind: 'navigate', destination: 'feed' }, ...(!activeAuctions.length ? [{ label: 'Sign in', kind: 'signin' as const }] : [])] }
  }

  const priceLimitMatch = normalized.match(/(?:under|below|less than|budget of|up to)\s*\$?([\d,]+(?:\.\d{1,2})?)/)
  const priceLimit = priceLimitMatch ? Number(priceLimitMatch[1].replaceAll(',', '')) : null
  if (/\b(shop|buy|browse|product|products|listing|listings|price|deal|deals|cheap|under|below)\b/.test(normalized)) {
    const eligibleListings = listings.filter((listing) => priceLimit === null || listing.price <= priceLimit)
    const matchingListings = findMatches(normalized, eligibleListings)
    if (matchingListings.length > 1 && !matchingListings.some((item) => normalized.includes(item.title.toLowerCase()))) {
      return { text: `I found several${priceLimit === null ? '' : ` under ${currency(priceLimit)}`} matches. Choose one to view it in the Shop.`, intent: 'shop_search', actions: matchingListings.slice(0, 3).map((listing) => ({ label: `${listing.title} · ${currency(listing.price)}`, kind: 'listing' as const, listingId: listing.id })) }
    }
    const listingToShow = matchingListings[0] ?? (priceLimit !== null ? eligibleListings.slice(0, 3)[0] : undefined)
    if (listingToShow) {
      return { text: `I found “${listingToShow.title}” in ${listingToShow.category} for ${currency(listingToShow.price)}${priceLimit === null ? '' : `, within your ${currency(priceLimit)} budget`}. Open it in the Shop to confirm stock and seller details.`, intent: 'shop_search', actions: [{ label: 'View this product', kind: 'listing', listingId: listingToShow.id }, { label: 'Open campus shop', kind: 'navigate', destination: 'shop' }] }
    }
    if (priceLimit !== null && eligibleListings.length === 0) {
      return { text: `I couldn’t find a fixed-price item at or below ${currency(priceLimit)} in the current marketplace data. You can raise the budget or browse all Shop items.`, intent: 'shop_search', actions: [{ label: 'Browse the Shop', kind: 'navigate', destination: 'shop' }] }
    }
    if (matchedListing) {
      return { text: `I found “${matchedListing.title}” in ${matchedListing.category} for ${currency(matchedListing.price)}.`, intent: 'shop_search', actions: [{ label: 'View this product', kind: 'listing', listingId: matchedListing.id }] }
    }
    return { text: `The Campus shop has ${listings.length} ${listings.length === 1 ? 'fixed-price item' : 'fixed-price items'} in the latest marketplace data. You can search by product, filter by category, and add available items to your cart.`, intent: 'shop_search', actions: [{ label: 'Open campus shop', kind: 'navigate', destination: 'shop' }] }
  }

  if (/\b(cart|checkout|check out|pay|payment|order|purchase)\b/.test(normalized)) {
    return { text: 'Your cart is in the bottom navigation. Checkout is available after sign-in and email confirmation; payment is verified by the server before an order is finalized.', intent: 'checkout', actions: [{ label: 'Open cart', kind: 'navigate', destination: 'cart' }, { label: 'Sign in', kind: 'signin' }] }
  }

  if (/\b(sell|seller|studio|my products|my listings|list an item|add a product)\b/.test(normalized)) {
    return { text: 'Seller Studio is where you manage inventory, auctions, and seller standing. To publish a product, sign in with a confirmed email and choose “Add a product.”', intent: 'seller', actions: [{ label: 'Open Seller Studio', kind: 'navigate', destination: 'dashboard' }, { label: 'Sign in', kind: 'signin' }] }
  }

  if (/\b(trust|verified|verification|review|reviews|reputation)\b/.test(normalized)) {
    return { text: 'Seller trust reflects completed auction follow-through. Buyers can see trust on seller and product details; accepting a winning bid and completing the handoff builds a stronger record.', intent: 'trust', actions: [{ label: 'Open Seller Studio', kind: 'navigate', destination: 'dashboard' }] }
  }

  if (matchedAuction) {
    if (auctionMatches.length > 1 && !normalized.includes(matchedAuction.title.toLowerCase())) {
      return { text: 'Several auctions could match that. Choose one and I’ll open its current details.', intent: 'auction_search', actions: auctionMatches.slice(0, 3).map((auction) => ({ label: auction.title, kind: 'auction' as const, auctionId: auction.id })) }
    }
    return { text: `This looks close to “${matchedAuction.title},” currently at ${currency(matchedAuction.currentHighestBid)}. Want to open its live room?`, intent: 'auction_search', actions: [{ label: 'View auction', kind: 'auction', auctionId: matchedAuction.id }] }
  }

  if (matchedListing) {
    return { text: `I found “${matchedListing.title}” for ${currency(matchedListing.price)}. Open it in the Shop to view availability and seller details.`, intent: 'shop_search', actions: [{ label: 'View this product', kind: 'listing', listingId: matchedListing.id }] }
  }

  return { text: 'I’m not sure I understood. Try asking about a bid, a product and budget, checkout, or selling; I can also open the live auctions or Shop.', intent: 'unknown', actions: [{ label: 'Live auctions', kind: 'navigate', destination: 'feed' }, { label: 'Shop', kind: 'navigate', destination: 'shop' }, { label: 'Seller Studio', kind: 'navigate', destination: 'dashboard' }] }
}

function currency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

function NavigationAssistant({ auctions, listings, dataReady, onNavigate, onOpenAuction, onPrepareRule, onSignIn }: NavigationAssistantProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine)
  const [cachedData] = useState<CachedMarketData>(() => readStorage(marketCacheKey, { auctions: [], listings: [], savedAt: 0 }))
  const [messages, setMessages] = useState<ChatMessage[]>(() => readStorage(historyKey, []))
  const endRef = useRef<HTMLDivElement>(null)

  const context = dataReady ? { auctions, listings } : cachedData
  const isUsingCache = !dataReady && (context.auctions.length > 0 || context.listings.length > 0)

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(historyKey, JSON.stringify(messages.slice(-40)))
    } catch {
      return
    }
  }, [messages])

  useEffect(() => {
    if (!dataReady || (!auctions.length && !listings.length)) return
    const snapshot = { auctions, listings, savedAt: Date.now() }
    try {
      localStorage.setItem(marketCacheKey, JSON.stringify(snapshot))
    } catch {
      return
    }
  }, [auctions, dataReady, listings])

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, open])

  const sendMessage = (rawText: string) => {
    const text = rawText.trim()
    if (!text) return
    const answer = answerLocally(text, context.auctions, context.listings)
    const now = Date.now()
    setMessages((current) => [
      ...current,
      { id: makeId(), role: 'customer' as const, text, createdAt: now },
      { id: makeId(), role: 'assistant' as const, ...answer, createdAt: now + 1 },
    ].slice(-40))
    setDraft('')
  }

  const runAction = (action: AssistantAction) => {
    if (action.kind === 'navigate') onNavigate(action.destination)
    if (action.kind === 'signin') onSignIn()
    if (action.kind === 'prepareRule') {
      const auction = context.auctions.find((item) => item.id === action.auctionId)
      if (auction) onPrepareRule(auction, action.maxBid, action.bidStep)
      else onNavigate('watchlist')
    }
    if (action.kind === 'auction') {
      const auction = context.auctions.find((item) => item.id === action.auctionId)
      if (auction) onOpenAuction(auction)
      else onNavigate('feed')
    }
    setOpen(false)
  }

  const statusText = !online ? 'Offline · local help ready' : isUsingCache ? 'Reconnecting · saved data' : 'Ready to help'

  return <>
    {open && <section aria-label="Scout navigation assistant" className="fixed inset-x-3 bottom-[78px] z-50 flex max-h-[min(640px,calc(100dvh-112px))] flex-col overflow-hidden rounded-[18px] border border-[#dfe7df] bg-[#fcfdfb] shadow-[0_24px_80px_rgba(26,47,35,.24)] sm:inset-x-auto sm:bottom-24 sm:right-5 sm:w-[390px]">
      <header className="flex items-center gap-3 bg-[#263d31] px-4 py-3.5 text-white"><span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-[#d4f06b] text-[#233a30]"><Bot size={19} /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="font-display text-sm font-semibold">Scout</h2><span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.1em] text-[#d8e5da]">Campus guide</span></div><p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#c1d0c4]"><span className={`size-1.5 rounded-full ${online ? 'bg-[#b9e475]' : 'bg-[#f3be68]'}`} />{statusText}</p></div><button type="button" aria-label="Minimize Scout" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"><Minus size={17} /></button><button type="button" aria-label="Close Scout" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"><X size={17} /></button></header>

      <div className="flex items-center gap-2 border-b border-[#edf1ec] bg-[#f6f8f4] px-4 py-2 text-[10px] text-[#77867b]"><Sparkles size={12} className="text-[#82934f]" />Answers run on this device. {isUsingCache ? `Using saved marketplace data from ${new Date(cachedData.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : dataReady ? 'Marketplace context is up to date.' : 'Navigation and bidding help work without a connection.'}</div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4" aria-live="polite">
        {messages.length === 0 ? <div className="py-3"><div className="mb-4 flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[#e8f0e4] text-[#4f7050]"><Compass size={16} /></span><div className="max-w-[84%] rounded-2xl rounded-tl-sm bg-[#eef3eb] px-3.5 py-3 text-[13px] leading-5 text-[#3f5143]"><p className="font-semibold text-[#2d4535]">Hi, I’m Scout.</p><p className="mt-1">I can find your way around QuickResell, explain bidding, and help you reach the right screen.</p></div></div><div className="ml-11 flex flex-wrap gap-2">{quickPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => sendMessage(prompt)} className="rounded-full border border-[#dce6d9] bg-white px-3 py-2 text-left text-[11px] font-semibold text-[#526b55] transition hover:border-[#9fb49c] hover:bg-[#f5f8f3]">{prompt}</button>)}</div></div> : messages.map((message) => <div key={message.id} className={`flex ${message.role === 'customer' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] ${message.role === 'customer' ? 'rounded-2xl rounded-br-sm bg-[#2d5140] px-3.5 py-2.5 text-white' : 'rounded-2xl rounded-tl-sm bg-[#eef3eb] px-3.5 py-3 text-[#405245]'}`}><p className="whitespace-pre-wrap text-[12px] leading-[19px]">{message.text}</p>{message.actions?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{message.actions.map((action, index) => <button key={`${message.id}-${index}`} type="button" onClick={() => runAction(action)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#d8e2d4] bg-white px-2.5 text-[10px] font-bold text-[#436448] transition hover:border-[#a9bca4] hover:bg-[#f8faf6]">{action.kind === 'auction' ? <ExternalLink size={11} /> : action.kind === 'signin' ? <ShieldCheck size={11} /> : action.destination === 'shop' ? <Store size={11} /> : <Compass size={11} />}{action.label}</button>)}</div> : null}</div></div>)}
        <div ref={endRef} />
      </div>

      <div className="border-t border-[#e9eee8] bg-white p-3"><form onSubmit={(event) => { event.preventDefault(); sendMessage(draft) }} className="flex items-center gap-2 rounded-xl border border-[#dfe7dd] bg-[#fafbf9] p-1.5 pl-3 focus-within:border-[#93ad8e]"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about bidding, shopping…" aria-label="Message Scout" className="min-w-0 flex-1 bg-transparent py-2 text-xs text-[#314336] outline-none placeholder:text-[#9aa59b]" /><button type="submit" disabled={!draft.trim()} aria-label="Send message" className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#2d5140] text-white transition hover:bg-[#3d684d] disabled:cursor-not-allowed disabled:bg-[#b8c2b8]"><Send size={15} /></button></form><div className="mt-2 flex items-center justify-between px-1 text-[9px] text-[#9aa49c]"><span className="inline-flex items-center gap-1">{online ? <Wifi size={10} /> : <WifiOff size={10} />}{online ? 'Local assistant · marketplace context' : 'Offline ready'}</span><span>Scout can make mistakes</span></div></div>
    </section>}

    <button type="button" aria-label={open ? 'Close Scout assistant' : 'Open Scout assistant'} aria-expanded={open} onClick={() => setOpen((current) => !current)} className={`fixed bottom-[82px] right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full border border-[#d4e1d1] bg-[#d4f06b] px-4 text-sm font-bold text-[#243a30] shadow-[0_8px_28px_rgba(28,49,34,.2)] transition hover:bg-[#c6e65b] sm:bottom-6 sm:right-6 ${open ? 'hidden sm:inline-flex' : ''}`}><MessageCircle size={18} /><span>Ask Scout</span><ChevronDown size={15} /></button>
  </>
}

export { NavigationAssistant }