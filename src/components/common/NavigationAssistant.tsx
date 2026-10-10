import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bot, ChevronDown, Compass, ExternalLink, MessageCircle, Minus, Send, ShieldCheck, Sparkles, Store, ThumbsDown, ThumbsUp, Wifi, WifiOff, X } from 'lucide-react'
import type { FormEvent } from 'react'
import type { Auction, AuctionWatchlistRule, MarketplaceListing } from '../../types'
import { useCurrency } from '../../lib/CurrencyContext'
import type { ScoutChatContext, ScoutChatMessage, ScoutChatReply } from '../../services/api'

type Destination = 'feed' | 'shop' | 'cart' | 'dashboard' | 'watchlist'
type AssistantAction = { destination?: Destination } & (
  | { label: string; kind: 'navigate'; destination: Destination }
  | { label: string; kind: 'auction'; auctionId: string }
  | { label: string; kind: 'listing'; listingId: string }
  | { label: string; kind: 'prepareRule'; auctionId: string; maxBid: number; bidStep: number }
  | { label: string; kind: 'support' }
  | { label: string; kind: 'signin' }
)
type ScoutIntent = 'greeting' | 'bid_rule' | 'bid_status' | 'auction_search' | 'shop_search' | 'checkout' | 'seller' | 'trust' | 'support' | 'unknown'
type ChatMessage = { id: string; role: 'assistant' | 'customer'; text: string; intent?: ScoutIntent; actions?: AssistantAction[]; feedback?: boolean; model?: string; createdAt: number }
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
  onFeedback: (feedback: { messageId: string; intent: string; helpful: boolean }) => void
  onSupportRequest: (category: string, message: string) => Promise<{ id: string; emailNotified: boolean } | null>
  onAskModel: (messages: ScoutChatMessage[], context: ScoutChatContext) => Promise<ScoutChatReply>
  signedIn: boolean
  emailConfirmed: boolean
  onSignIn: () => void
}

const historyKey = 'quickresell:scout:chat:v1'
const marketCacheKey = 'quickresell:scout:market:v1'
const quickPrompts = ['How do I place a bid?', 'Find affordable products', 'Check my bid position', 'Talk to support']

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
  const ignored = new Set(['find', 'show', 'want', 'need', 'have', 'with', 'for', 'the', 'can', 'you', 'item', 'items', 'product', 'products', 'auction', 'auctions', 'watch', 'under', 'below', 'less', 'than', 'near', 'around', 'max', 'maximum', 'price', 'bid', 'bids', 'step', 'increment', 'my', 'me', 'is', 'am', 'i', 'still', 'winning', 'cheap', 'budget', 'deal'])
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

function extractPriceNumbers(text: string): number[] {
  const matches = [...text.matchAll(/(?:(?:₦|ngn\s*|naira\s*)|under\s*|below\s*|up to\s*|budget\s*of\s*)?([\d][\d,]*(?:\.\d{1,2})?)/g)]
  return matches.map((match) => Number(match[1].replaceAll(',', ''))).filter((amount) => Number.isFinite(amount) && amount >= 0)
}

function getPriceLimit(text: string, localToUsd: (amount: number) => number | null): number | null {
  const normalized = text.toLowerCase()
  const directMatch = normalized.match(/(?:under|below|less than|budget of|up to|max(?:imum)?(?:\s+(?:bid|price))?)\s*(?:₦|ngn\s*|naira\s*)?([\d][\d,]*(?:\.\d{1,2})?)/)
  if (directMatch) return localToUsd(Number(directMatch[1].replaceAll(',', '')))
  const numericMatches = extractPriceNumbers(normalized)
  if (!numericMatches.length) return null
  return localToUsd(numericMatches[0])
}

function buildRecommendationSummary(text: string, matches: Auction[], currency: (amount: number) => string): string {
  if (!matches.length) return 'I could not find a match for that request right now.'
  const normalized = text.toLowerCase()
  const isBudgetSearch = /(?:cheap|budget|deal|under|below|less than|affordable|save)/.test(normalized)
  if (isBudgetSearch) {
    return `I found ${matches.length} good options${matches[0].category ? ` in ${matches[0].category}` : ''} for that budget, starting at ${currency(matches[0].currentHighestBid)}.`
  }
  return `The best match looks like “${matches[0].title}” at ${currency(matches[0].currentHighestBid)} in ${matches[0].location}.`
}

function answerLocally(text: string, auctions: Auction[], listings: MarketplaceListing[], currentUserId: string, rules: AuctionWatchlistRule[], online: boolean, formatUsd: (amount: number, fractionDigits?: number) => string, localToUsd: (amount: number) => number | null): Omit<ChatMessage, 'id' | 'role' | 'createdAt'> {
  const currency = (amount: number) => formatUsd(amount, 0)
  const normalized = text.toLowerCase()
  const activeAuctions = auctions.filter((auction) => auction.status === 'ACTIVE')
  const auctionMatches = findMatches(normalized, activeAuctions)
  const listingMatches = findMatches(normalized, listings)
  const matchedAuction = auctionMatches[0]
  const matchedListing = listingMatches[0]

  const maximumMatch = normalized.match(/(?:max(?:imum)?(?:\s+(?:bid|price))?|up to|bid limit)(?:\s+of)?\s*:?\s*(?:₦|ngn\s*|naira\s*)?([\d,]+(?:\.\d{1,2})?)/)
  const stepMatch = normalized.match(/(?:step|increment|raise by)\s*:?\s*(?:₦|ngn\s*|naira\s*)?([\d,]+(?:\.\d{1,2})?)/)
  const maximum = maximumMatch ? localToUsd(Number(maximumMatch[1].replaceAll(',', ''))) ?? 0 : 0
  const step = stepMatch ? localToUsd(Number(stepMatch[1].replaceAll(',', ''))) ?? 0 : Math.min(6_656.34, maximum)
  const asksScoutToBid = /\b(auto.?bid|bid on my behalf|bid up to|maximum bid|bid limit|watch|watchlist|wishlist|track this|save this|watch this)\b/.test(normalized)
  const wantsBudgetHelp = /\b(cheap|budget|deal|good value|best value|affordable|under|below|less than|save|lowest price)\b/.test(normalized)
  const wantsRecommendations = /\b(best|recommend|suggest|what should i buy|what should i bid|good pick|worth it)\b/.test(normalized)
  const priceLimit = getPriceLimit(normalized, localToUsd)

  if (asksScoutToBid && matchedAuction) {
    if (auctionMatches.length > 1 && !normalized.includes(matchedAuction.title.toLowerCase())) {
      return { text: 'I found several live auctions. Choose the exact item first, then I can prepare its price rule.', intent: 'bid_rule', actions: auctionMatches.slice(0, 3).map((auction) => ({ label: auction.title, kind: 'auction' as const, auctionId: auction.id })) }
    }
    if (maximum >= Math.max(matchedAuction.currentHighestBid, matchedAuction.startingPrice) + 1 && step > 0 && step <= maximum) {
      return {
        text: `I can prepare a rule for “${matchedAuction.title}” with a maximum of ${currency(maximum)}. Standard bidding follows the system increment schedule. Review and choose a strategy in your Watchlist; Scout will not bid until you enable it and confirm authorization.`,
        intent: 'bid_rule',
        actions: [{ label: 'Review this bid rule', kind: 'prepareRule', auctionId: matchedAuction.id, maxBid: maximum, bidStep: step }],
      }
    }
    return {
      text: `I found “${matchedAuction.title}” at ${currency(matchedAuction.currentHighestBid)}. Tell me your maximum, for example: “Watch ${matchedAuction.title}, max ${currency(100_000)}.” You can choose a bidding strategy in the Watchlist. Scout will only prepare the rule; you must enable and authorize it before any bid is placed.`,
      intent: 'bid_rule',
      actions: [{ label: 'Open Watchlist', kind: 'navigate', destination: 'watchlist' }],
    }
  }

  if (wantsBudgetHelp && activeAuctions.length) {
    const sortedByBudget = [...activeAuctions].sort((left, right) => left.currentHighestBid - right.currentHighestBid)
    const filtered = priceLimit === null ? sortedByBudget : sortedByBudget.filter((auction) => auction.currentHighestBid <= priceLimit)
    const shortlist = (filtered.length ? filtered : sortedByBudget).slice(0, 3)
    if (shortlist.length) {
      return {
        text: `${buildRecommendationSummary(normalized, shortlist, currency)} ${shortlist.map((auction) => `${auction.title} (${currency(auction.currentHighestBid)})`).join(', ')}. Open any auction to review the live room or set a Watchlist cap to let Scout guard your max.`,
        intent: 'auction_search',
        actions: shortlist.map((auction) => ({ label: `${auction.title} · ${currency(auction.currentHighestBid)}`, kind: 'auction' as const, auctionId: auction.id })),
      }
    }
  }

  if (wantsRecommendations && activeAuctions.length) {
    const scored = [...activeAuctions].map((auction) => ({
      auction,
      valueScore: (auction.currentHighestBid > 0 ? 1 / auction.currentHighestBid : 0) + (auction.bids.length * 0.05),
    })).sort((left, right) => right.valueScore - left.valueScore)
    const best = scored[0]?.auction
    if (best) {
      return {
        text: `My best-value pick is “${best.title}” at ${currency(best.currentHighestBid)} in ${best.location}. It looks like a relatively lower priced auction with some room to move, but it is still subject to the current bid and seller approval.`,
        intent: 'auction_search',
        actions: [{ label: 'Open this pick', kind: 'auction', auctionId: best.id }, { label: 'Browse live auctions', kind: 'navigate', destination: 'feed' }],
      }
    }
  }

  if (asksScoutToBid) {
    return { text: `Which live auction should I watch? Include its title and maximum price. Example: “Watch Intro Psychology Textbook, max ${currency(100_000)}.” You can choose a bidding strategy in your Watchlist; Scout will not bid until you authorize it.`, intent: 'bid_rule', actions: [{ label: 'Browse auctions', kind: 'navigate', destination: 'feed' }, { label: 'Open Watchlist', kind: 'navigate', destination: 'watchlist' }] }
  }

  if (/\b(watchlist|wishlist|watch my auctions|saved auctions)\b/.test(normalized)) {
    return { text: 'Your Watchlist stores live auctions and their price rules. Choose a maximum and one of the available bidding strategies. Scout bidding stays paused until you enable it and confirm the per-auction authorization.', intent: 'bid_rule', actions: [{ label: 'Open Watchlist', kind: 'navigate', destination: 'watchlist' }] }
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
    const scout = rule ? ` Your saved Scout rule is ${rule.autoBidEnabled ? 'on' : 'paused'} with a ${currency(rule.maxBid)} maximum and the ${rule.strategy.replace('_', ' ').toLowerCase()} strategy.` : ''
    const offlineNotice = online ? '' : ' This is the last saved state; reconnect to confirm the live price.'
    return { text: `“${matchedAuction.title}” is at ${currency(matchedAuction.currentHighestBid)}. ${position}${scout}${offlineNotice}`, intent: 'bid_status', actions: [{ label: 'Open auction', kind: 'auction', auctionId: matchedAuction.id }, { label: 'Open Watchlist', kind: 'navigate', destination: 'watchlist' }] }
  }

  if (/\b(hi|hello|hey|good morning|good afternoon)\b/.test(normalized)) {
    return { text: 'Hi there. I’m Scout, your QuickResell guide. I can help you browse, bid, shop, or find your way around.', intent: 'greeting', actions: [{ label: 'Browse auctions', kind: 'navigate', destination: 'feed' }, { label: 'Open shop', kind: 'navigate', destination: 'shop' }] }
  }

  if (/\b(talk to (a )?(person|human)|human support|customer service|support agent|contact support|talk to support)\b/.test(normalized)) {
    return { text: 'I can create a support request for a person to follow up. Please include what you were trying to do and any relevant item or auction title. Do not include passwords or payment details.', intent: 'support', actions: [{ label: 'Contact support', kind: 'support' }] }
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

  const listingPriceLimit = normalized.match(/(?:under|below|less than|budget of|up to)\s*\$?([\d,]+(?:\.\d{1,2})?)/)
  const listingBudget = listingPriceLimit ? localToUsd(Number(listingPriceLimit[1].replaceAll(',', ''))) : null
  if (/\b(shop|buy|browse|product|products|listing|listings|price|deal|deals|cheap|under|below)\b/.test(normalized)) {
    const eligibleListings = listings.filter((listing) => listingBudget === null || listing.price <= listingBudget)
    const matchingListings = findMatches(normalized, eligibleListings)
    if (matchingListings.length > 1 && !matchingListings.some((item) => normalized.includes(item.title.toLowerCase()))) {
      return { text: `I found several${listingBudget === null ? '' : ` under ${currency(listingBudget)}`} matches. Choose one to view it in the Shop.`, intent: 'shop_search', actions: matchingListings.slice(0, 3).map((listing) => ({ label: `${listing.title} · ${currency(listing.price)}`, kind: 'listing' as const, listingId: listing.id })) }
    }
    const listingToShow = matchingListings[0] ?? (listingBudget !== null ? eligibleListings.slice(0, 3)[0] : undefined)
    if (listingToShow) {
      return { text: `I found “${listingToShow.title}” in ${listingToShow.category} for ${currency(listingToShow.price)}${listingBudget === null ? '' : `, within your ${currency(listingBudget)} budget`}. Open it in the Shop to confirm stock and seller details.`, intent: 'shop_search', actions: [{ label: 'View this product', kind: 'listing', listingId: listingToShow.id }, { label: 'Open shop', kind: 'navigate', destination: 'shop' }] }
    }
    if (listingBudget !== null && eligibleListings.length === 0) {
      return { text: `I couldn’t find a fixed-price item at or below ${currency(listingBudget)} in the current marketplace data. You can raise the budget or browse all Shop items.`, intent: 'shop_search', actions: [{ label: 'Browse the Shop', kind: 'navigate', destination: 'shop' }] }
    }
    if (matchedListing) {
      return { text: `I found “${matchedListing.title}” in ${matchedListing.category} for ${currency(matchedListing.price)}.`, intent: 'shop_search', actions: [{ label: 'View this product', kind: 'listing', listingId: matchedListing.id }] }
    }
    return { text: `The Shop has ${listings.length} ${listings.length === 1 ? 'fixed-price item' : 'fixed-price items'} in the latest marketplace data. You can search by product, filter by category, and add available items to your cart.`, intent: 'shop_search', actions: [{ label: 'Open shop', kind: 'navigate', destination: 'shop' }] }
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

function NavigationAssistant({ auctions, listings, dataReady, onNavigate, onOpenAuction, onOpenListing, onPrepareRule, currentUserId, auctionWatchlistRules, onFeedback, onSupportRequest, onAskModel, signedIn, emailConfirmed, onSignIn }: NavigationAssistantProps) {
  const { currency: selectedCurrency, formatUsd, localToUsd, ratesReady } = useCurrency()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [feedbackVotes, setFeedbackVotes] = useState<Record<string, boolean>>(() => readStorage('quickresell:scout:feedback:v1', {}))
  const [supportOpen, setSupportOpen] = useState(false)
  const [supportCategory, setSupportCategory] = useState('BIDDING')
  const [supportMessage, setSupportMessage] = useState('')
  const [supportNotice, setSupportNotice] = useState('')
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine)
  const [isThinking, setIsThinking] = useState(false)
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

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const sendMessage = async (rawText: string) => {
    const text = rawText.trim()
    if (!text || isThinking) return
    const answer = selectedCurrency !== 'NGN' && !ratesReady
      ? { text: 'Currency rates are still loading. Please try that price request again in a moment.', intent: 'unknown' as const }
      : answerLocally(text, context.auctions, context.listings, currentUserId, auctionWatchlistRules, online, formatUsd, localToUsd)
    const now = Date.now()
    const customerId = makeId()
    const assistantId = makeId()
    setMessages((current) => [
      ...current,
      { id: customerId, role: 'customer' as const, text, createdAt: now },
      { id: assistantId, role: 'assistant' as const, ...answer, createdAt: now + 1 },
    ].slice(-40))
    setDraft('')
    if (answer.intent !== 'unknown' || !online || (selectedCurrency !== 'NGN' && !ratesReady)) return

    setIsThinking(true)
    const conversation: ScoutChatMessage[] = [
      ...messages.slice(-6).map((message): ScoutChatMessage => ({
        role: message.role === 'customer' ? 'user' as const : 'assistant' as const,
        content: message.text.slice(0, 1000),
      })),
      { role: 'user' as const, content: text },
    ].slice(-8)
    const modelContext: ScoutChatContext = {
      auctions: context.auctions.filter((auction) => auction.status === 'ACTIVE').slice(0, 20).map((auction) => ({
        title: auction.title,
        category: auction.category,
        location: auction.location,
        currentBid: auction.currentHighestBid,
        bids: auction.bids.length,
      })),
      listings: context.listings.slice(0, 20).map((listing) => ({
        title: listing.title,
        category: listing.category,
        location: listing.location,
        price: listing.price,
        quantityAvailable: listing.quantityAvailable,
      })),
    }
    try {
      const reply = await onAskModel(conversation, modelContext)
      setMessages((current) => current.map((message) => message.id === assistantId
        ? { ...message, text: reply.reply, model: reply.model }
        : message))
    } catch {
      setMessages((current) => current.map((message) => message.id === assistantId
        ? { ...message, text: `${message.text} AI assistance is unavailable right now; you can still use the links above.` }
        : message))
    } finally {
      setIsThinking(false)
    }
  }

  const runAction = (action: AssistantAction) => {
    if (action.kind === 'navigate') onNavigate(action.destination)
    if (action.kind === 'signin') onSignIn()
    if (action.kind === 'prepareRule') {
      const auction = context.auctions.find((item) => item.id === action.auctionId)
      if (auction) onPrepareRule(auction, action.maxBid, action.bidStep)
      else onNavigate('watchlist')
    }
    if (action.kind === 'listing') {
      const listing = context.listings.find((item) => item.id === action.listingId)
      if (listing) onOpenListing(listing)
      else onNavigate('shop')
    }
    if (action.kind === 'support') {
      setSupportOpen(true)
      setSupportNotice('')
    }
    if (action.kind === 'auction') {
      const auction = context.auctions.find((item) => item.id === action.auctionId)
      if (auction) onOpenAuction(auction)
      else onNavigate('feed')
    }
    setOpen(false)
  }

  const saveFeedback = (message: ChatMessage, helpful: boolean) => {
    const next = { ...feedbackVotes, [message.id]: helpful }
    setFeedbackVotes(next)
    try {
      localStorage.setItem('quickresell:scout:feedback:v1', JSON.stringify(next))
    } catch {
      setSupportNotice('Feedback could not be saved on this device.')
    }
    onFeedback({ messageId: message.id, intent: message.intent ?? 'unknown', helpful })
  }

  const submitSupport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!online) {
      setSupportNotice('Reconnect to submit your support request. Your drafted message remains here.')
      return
    }
    if (!signedIn) {
      setSupportNotice('Sign in to send a support request.')
      return
    }
    if (!emailConfirmed) {
      setSupportNotice('Confirm your email to send a support request.')
      return
    }
    const result = await onSupportRequest(supportCategory, supportMessage)
    if (!result) return
    setSupportMessage('')
    setSupportNotice(result.emailNotified
      ? `Request ${result.id} was sent to the support team.`
      : `Request ${result.id} was saved. Support email is not configured, so the team was not notified yet.`)
  }

  const statusText = !online ? 'Offline · local help ready' : isUsingCache ? 'Reconnecting · saved data' : 'Ready to help'

  return <>
    {createPortal(open ? <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#101a17]/55 sm:pointer-events-none sm:inset-auto sm:bottom-24 sm:right-5 sm:block sm:bg-transparent" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section role="dialog" aria-modal="true" aria-label="Scout navigation assistant" className="pointer-events-auto flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[22px] border border-[#dfe7df] bg-[#fcfdfb] shadow-[0_24px_80px_rgba(26,47,35,.24)] sm:max-h-[min(640px,calc(100dvh-112px))] sm:w-[390px] sm:rounded-[18px]">
      <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-[#d8dfd9] sm:hidden" />
      <header className="flex items-center gap-3 bg-[#263d31] px-4 py-3.5 text-white"><span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-[#d4f06b] text-[#233a30]"><Bot size={19} /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="font-display text-sm font-semibold">Scout</h2><span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.1em] text-[#d8e5da]">Campus guide</span></div><p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#c1d0c4]"><span className={`size-1.5 rounded-full ${online ? 'bg-[#b9e475]' : 'bg-[#f3be68]'}`} />{statusText}</p></div><button type="button" aria-label="Minimize Scout" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"><Minus size={17} /></button><button type="button" aria-label="Close Scout" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"><X size={17} /></button></header>

      <div className="flex items-center gap-2 border-b border-[#edf1ec] bg-[#f6f8f4] px-4 py-2 text-[10px] text-[#77867b]"><Sparkles size={12} className="text-[#82934f]" />AI help uses the configured model when available. Avoid sharing passwords or payment details; app actions stay in your control. {isUsingCache ? `Using saved marketplace data from ${new Date(cachedData.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : dataReady ? 'Marketplace context is up to date.' : 'Local navigation and bidding help work without a connection.'}</div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="py-3">
            <div className="mb-4 flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[#e8f0e4] text-[#4f7050]"><Compass size={16} /></span>
              <div className="max-w-[84%] rounded-2xl rounded-tl-sm bg-[#eef3eb] px-3.5 py-3 text-[13px] leading-5 text-[#3f5143]">
                <p className="font-semibold text-[#2d4535]">Hi, I’m Scout.</p>
                <p className="mt-1">I can find your way around QuickResell, explain bidding, and help you reach the right screen.</p>
              </div>
            </div>
            <div className="ml-11 flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => <button key={prompt} type="button" disabled={isThinking} onClick={() => void sendMessage(prompt)} className="rounded-full border border-[#dce6d9] bg-white px-3 py-2 text-left text-[11px] font-semibold text-[#526b55] transition hover:border-[#9fb49c] hover:bg-[#f5f8f3] disabled:cursor-not-allowed disabled:opacity-60">{prompt}</button>)}
            </div>
          </div>
        ) : messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === 'customer' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] ${message.role === 'customer' ? 'rounded-2xl rounded-br-sm bg-[#2d5140] px-3.5 py-2.5 text-white' : 'rounded-2xl rounded-tl-sm bg-[#eef3eb] px-3.5 py-3 text-[#405245]'}`}>
              <p className="whitespace-pre-wrap text-[12px] leading-[19px]">{message.text}</p>
              {message.model && <p className="mt-2 text-[9px] font-semibold text-[#71816f]">{message.model} · AI-assisted</p>}
              {message.actions?.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {message.actions.map((action, index) => (
                    <button key={`${message.id}-${index}`} type="button" onClick={() => runAction(action)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#d8e2d4] bg-white px-2.5 text-[10px] font-bold text-[#436448] transition hover:border-[#a9bca4] hover:bg-[#f8faf6]">
                      {action.kind === 'auction' ? <ExternalLink size={11} /> : action.kind === 'signin' ? <ShieldCheck size={11} /> : action.destination === 'shop' ? <Store size={11} /> : <Compass size={11} />}
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {message.role === 'assistant' && message.intent && !feedbackVotes[message.id] ? (
                <div className="mt-3 flex items-center gap-2 border-t border-[#e2e9e0] pt-2 text-[10px] font-semibold text-[#64766a]">
                  <span>Helpful?</span>
                  <button type="button" aria-label="Mark answer helpful" onClick={() => saveFeedback(message, true)} className="inline-flex items-center gap-1 rounded-full border border-[#d7e1d5] bg-white px-2 py-1 text-[#2a5140] hover:bg-[#f5faf4]"><ThumbsUp size={11} />Yes</button>
                  <button type="button" aria-label="Mark answer unhelpful" onClick={() => saveFeedback(message, false)} className="inline-flex items-center gap-1 rounded-full border border-[#d7e1d5] bg-white px-2 py-1 text-[#6c4b3c] hover:bg-[#faf3f0]"><ThumbsDown size={11} />No</button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {isThinking && <p role="status" className="text-center text-[10px] text-[#77867b]">Scout is preparing an AI-assisted reply…</p>}
        <div ref={endRef} />
      </div>

      {supportOpen && <form onSubmit={submitSupport} className="border-t border-[#e9eee8] bg-[#f9faf8] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#6e7d74]">Support request</p>
          <button type="button" onClick={() => setSupportOpen(false)} className="rounded-full p-1 text-[#6f796d] hover:bg-[#eef2ee]"><X size={12} /></button>
        </div>
        <label className="mb-2 block text-[11px] font-semibold text-[#42564a]">
          Topic
          <select value={supportCategory} onChange={(event) => setSupportCategory(event.target.value)} className="app-select mt-1 w-full rounded-lg border border-[#dfe7df] bg-white px-3 py-2 text-[12px] text-[#2c4137] outline-none focus:border-[#9cae9c]">
            <option value="BIDDING">Bidding</option>
            <option value="SHOPPING">Shopping</option>
            <option value="SELLING">Selling</option>
            <option value="PAYMENT">Payment</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="mb-2 block text-[11px] font-semibold text-[#42564a]">
          Details
          <textarea value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} rows={4} placeholder="Tell us what happened and which item or auction you mean." className="mt-1 w-full rounded-lg border border-[#dfe7df] bg-white px-3 py-2 text-[12px] text-[#2c4137] outline-none focus:border-[#9cae9c]" />
        </label>
        {supportNotice && <p className="mb-2 rounded-lg bg-[#edf3ee] px-2.5 py-2 text-[11px] text-[#3c4e43]">{supportNotice}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { setSupportOpen(false); setSupportNotice('') }} className="rounded-lg border border-[#dfe7df] bg-white px-3 py-2 text-[11px] font-semibold text-[#4d6257]">Cancel</button>
          <button type="submit" disabled={!supportMessage.trim() || !online || !signedIn || !emailConfirmed} className="rounded-lg bg-[#2d5140] px-3 py-2 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#b9c2b8]">Send request</button>
        </div>
      </form>}

      <div className="border-t border-[#e9eee8] bg-white p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:pb-3"><form onSubmit={(event) => { event.preventDefault(); void sendMessage(draft) }} className="flex items-center gap-2 rounded-xl border border-[#dfe7dd] bg-[#fafbf9] p-1.5 pl-3 focus-within:border-[#93ad8e]"><input value={draft} maxLength={1000} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about bidding, shopping…" aria-label="Message Scout" className="min-w-0 flex-1 bg-transparent py-2 text-xs text-[#314336] outline-none placeholder:text-[#9aa59b]" /><button type="submit" disabled={!draft.trim() || isThinking} aria-label="Send message" className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#2d5140] text-white transition hover:bg-[#3d684d] disabled:cursor-not-allowed disabled:bg-[#b8c2b8]"><Send size={15} /></button></form><div className="mt-2 flex items-center justify-between px-1 text-[9px] text-[#9aa49c]"><span className="inline-flex items-center gap-1">{online ? <Wifi size={10} /> : <WifiOff size={10} />}{isThinking ? 'Scout is thinking…' : online ? 'AI assist · local fallback ready' : 'Offline ready'}</span><span>Scout can make mistakes</span></div></div>
      </section>
    </div> : null, document.body)}

    <button type="button" aria-label={open ? 'Close Scout assistant' : 'Open Scout assistant'} aria-expanded={open} onClick={() => setOpen((current) => !current)} className={`fixed bottom-[82px] right-4 z-40 inline-flex h-12 w-12 transform items-center justify-center rounded-full border border-[#eadfb9] bg-[#f4eddb] text-[#2d3d34] shadow-[0_12px_28px_rgba(42,37,24,.14)] backdrop-blur-sm transition-transform duration-150 hover:bg-[#efe6cc] active:translate-y-[1px] sm:bottom-6 sm:right-6 sm:h-12 sm:w-auto sm:px-4 sm:gap-2 ${open ? 'hidden sm:inline-flex' : ''}`}><MessageCircle size={18} /><span className="hidden sm:inline">Ask Scout</span><ChevronDown size={15} className="hidden sm:inline" /></button>
  </>
}

export { NavigationAssistant }