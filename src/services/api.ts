import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Auction, AuctionWatchlistRule, Bid, ListingReactionCounts, ListingReactionType, NotificationItem, Verdict } from '../types'

const pageHostApiUrl = typeof window !== 'undefined' && window.location.protocol === 'http:'
  ? `http://${window.location.hostname}:3000/api`
  : ''
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()
if (import.meta.env.PROD && !configuredApiUrl) throw new Error('VITE_API_URL must be configured for production.')
if (import.meta.env.PROD && configuredApiUrl && new URL(configuredApiUrl).protocol !== 'https:') {
  throw new Error('VITE_API_URL must use HTTPS in production.')
}
const apiBaseCandidates = Array.from(new Set([
  configuredApiUrl?.replace(/\/$/, '') ?? 'http://localhost:3000/api',
  ...(import.meta.env.PROD ? [] : [pageHostApiUrl, 'http://localhost:3000/api', 'http://127.0.0.1:3000/api']),
])).filter(Boolean)
type ApiBid = { id: string; amount: number; createdAt: string; bidder?: { id: string; displayName?: string | null; avatarUrl?: string | null } }
type ApiAuctionRoom = {
  id: string; postId: string; sellerId: string; currentHighestBid: number; highestBidderId: string | null
  isPublic: boolean; reservePrice?: number | null; status: Auction['status']; endsAt: string
  post?: { id: string; title: string; description?: string | null; price: number; locationCampus?: string | null; category?: { name: string }; images?: { url: string }[]; _count?: { listingReactions: number }; listingReactions?: Array<{ type: ListingReactionType }>; reactionCounts?: ListingReactionCounts }
  seller?: { id: string; displayName?: string | null; avatarUrl?: string | null; trustScore?: number; completedAuctions?: number }
  bids?: ApiBid[]
}
type ApiAuctionWatchlistRule = {
  id: string
  auctionRoomId: string
  maxBid: number
  bidStep: number
  autoBidEnabled: boolean
  updatedAt: string
  auctionRoom: ApiAuctionRoom | null
}
export type ScoutChatMessage = { role: 'user' | 'assistant'; content: string }
export type ScoutChatContext = {
  auctions: Array<{ title: string; category: string; location: string; currentBid: number; bids: number }>
  listings: Array<{ title: string; category: string; location: string; price: number; quantityAvailable: number }>
}
export type ScoutChatReply = { reply: string; model: string }
export type AccountProfile = {
  displayName: string | null
  email: string | null
  avatarUrl: string | null
  preferredDormOrCampus: string | null
  budgetPreference: number | null
}
export type SellerVerificationStatus = 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REVIEW_REQUIRED'
export type SellerCheckStatus = 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REVIEW_REQUIRED'
export type SellerVerification = {
  identityStatus: SellerCheckStatus
  payoutStatus: SellerCheckStatus
  identityVerifiedAt: string | null
  payoutVerifiedAt: string | null
  bankName: string | null
  bankAccountLast4: string | null
  failureCode: string | null
}
export type SellerBank = { name: string; code: string }
export type SmileVerificationSession = {
  reference: string
  token: string
  environment: 'sandbox' | 'production'
  callbackUrl: string
  partnerDetails: { partner_id: string; name: string; logo_url: string; policy_url: string; theme_color: string }
  idSelection: { NG: string[] }
  partnerParams: { internal_reference: string }
}

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status; this.name = 'ApiError' }
}

function normalizeRoom(room: ApiAuctionRoom): Auction {
  return {
    id: room.id, postId: room.postId, sellerId: room.sellerId,
    title: room.post?.title ?? '', description: room.post?.description ?? '',
    category: room.post?.category?.name ?? 'Uncategorized', location: room.post?.locationCampus ?? 'Location not provided',
    image: room.post?.images?.[0]?.url ?? '',
    reactionCount: room.post?._count?.listingReactions ?? 0,
    reactionCounts: room.post?.reactionCounts,
    myReaction: room.post?.listingReactions?.[0]?.type ?? null,
    startingPrice: room.post?.price ?? 0, currentHighestBid: room.currentHighestBid,
    endsAt: room.endsAt, status: room.status, isPublic: room.isPublic, reservePrice: room.reservePrice,
    highestBidderId: room.highestBidderId, noReserve: room.reservePrice == null,
    seller: { id: room.seller?.id ?? room.sellerId, displayName: room.seller?.displayName ?? '', avatarUrl: room.seller?.avatarUrl, trustScore: room.seller?.trustScore ?? 0, completedAuctions: room.seller?.completedAuctions ?? 0 },
    bids: (room.bids ?? []).map((bid) => ({ id: bid.id, amount: bid.amount, createdAt: bid.createdAt, bidder: { id: bid.bidder?.id ?? '', displayName: bid.bidder?.displayName ?? 'Bidder', avatarUrl: bid.bidder?.avatarUrl } })),
  }
}

async function request<T>(path: string, init: RequestInit = {}, session?: Session | null, retryServerErrors = true): Promise<T> {
  let lastError: unknown
  for (const baseUrl of apiBaseCandidates) {
    try {
      const activeSession = session ?? (await supabase?.auth.getSession())?.data.session
      const headers = new Headers(init.headers)
      headers.set('Content-Type', 'application/json')
      if (activeSession?.access_token) headers.set('Authorization', `Bearer ${activeSession.access_token}`)
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        if (response.status >= 500) {
          lastError = new ApiError(payload.error ?? `Request failed (${response.status}).`, response.status)
          if (!retryServerErrors) throw lastError
          continue
        }
        throw new ApiError(payload.error ?? `Request failed (${response.status}).`, response.status)
      }
      return payload as T
    } catch (error) {
      lastError = error
      if (error instanceof ApiError && (!retryServerErrors || error.status < 500)) {
        throw error
      }
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error(`Request failed for ${path}.`)
}

export async function askScout(messages: ScoutChatMessage[], context: ScoutChatContext): Promise<ScoutChatReply> {
  const result = await request<{ reply?: unknown; model?: unknown }>('/scout/chat', {
    method: 'POST',
    body: JSON.stringify({ messages, context }),
  }, undefined, false)
  if (typeof result.reply !== 'string' || !result.reply.trim()) {
    throw new Error('Scout returned an invalid response.')
  }
  return {
    reply: result.reply.trim(),
    model: typeof result.model === 'string' && result.model.trim() ? result.model.trim() : 'Configured model',
  }
}

export async function getPublicAuctions(session?: Session | null): Promise<Auction[]> {
  const result = await request<{ auctionRooms: ApiAuctionRoom[] }>('/auctions?limit=50', {}, session)
  return result.auctionRooms.map(normalizeRoom)
}

export async function getAuctionWatchlist(session?: Session | null): Promise<AuctionWatchlistRule[]> {
  const result = await request<{ items: ApiAuctionWatchlistRule[] }>('/watchlist/auctions', {}, session)
  return result.items.flatMap((item) => item.auctionRoom ? [{
    id: item.id,
    auctionRoomId: item.auctionRoomId,
    maxBid: item.maxBid,
    bidStep: item.bidStep,
    autoBidEnabled: item.autoBidEnabled,
    updatedAt: item.updatedAt,
    auction: normalizeRoom(item.auctionRoom),
  }] : [])
}

export async function saveAuctionWatchlistRule(
  auctionRoomId: string,
  rule: Pick<AuctionWatchlistRule, 'maxBid' | 'bidStep' | 'autoBidEnabled'> & { authorizationConfirmed: boolean },
  session?: Session | null,
): Promise<{ rule: AuctionWatchlistRule; autoBidPlaced: boolean; emailNotified: boolean }> {
  const result = await request<{ item: ApiAuctionWatchlistRule; autoBidPlaced: boolean; emailNotified: boolean }>(`/watchlist/auctions/${encodeURIComponent(auctionRoomId)}`, {
    method: 'PUT',
    body: JSON.stringify(rule),
  }, session)
  if (!result.item.auctionRoom) throw new Error('This auction is no longer available.')
  return {
    rule: {
      id: result.item.id,
      auctionRoomId: result.item.auctionRoomId,
      maxBid: result.item.maxBid,
      bidStep: result.item.bidStep,
      autoBidEnabled: result.item.autoBidEnabled,
      updatedAt: result.item.updatedAt,
      auction: normalizeRoom(result.item.auctionRoom),
    },
    autoBidPlaced: result.autoBidPlaced,
    emailNotified: result.emailNotified,
  }
}

export async function removeAuctionWatchlistRule(auctionRoomId: string, session?: Session | null): Promise<void> {
  await request<{ removed: number }>(`/watchlist/auctions/${encodeURIComponent(auctionRoomId)}`, { method: 'DELETE' }, session)
}

export async function submitScoutFeedback(input: { messageId: string; intent: string; helpful: boolean }, session?: Session | null): Promise<void> {
  await request<{ feedback: { id: string; helpful: boolean } }>('/scout/feedback', {
    method: 'POST',
    body: JSON.stringify(input),
  }, session)
}

export async function createScoutSupportRequest(input: { category: string; message: string }, session?: Session | null): Promise<{ id: string; emailNotified: boolean }> {
  const result = await request<{ request: { id: string }; emailNotified: boolean }>('/scout/support', {
    method: 'POST',
    body: JSON.stringify(input),
  }, session)
  return { id: result.request.id, emailNotified: result.emailNotified }
}

export async function getSellerAuctions(session?: Session | null): Promise<{ auctions: Auction[]; trustScore: number; completedAuctions: number }> {
  const result = await request<{ auctionRooms: ApiAuctionRoom[]; seller: { trustScore: number; completedAuctions: number } }>('/auctions/mine', {}, session)
  return {
    auctions: result.auctionRooms.map(normalizeRoom),
    trustScore: result.seller.trustScore,
    completedAuctions: result.seller.completedAuctions,
  }
}

export async function getAuctionRoom(roomId: string, session?: Session | null): Promise<Auction> {
  const result = await request<{ auctionRoom: ApiAuctionRoom }>(`/auctions/${encodeURIComponent(roomId)}`, {}, session)
  return normalizeRoom(result.auctionRoom)
}

export async function placeBid(roomId: string, amount: number, session?: Session | null): Promise<{ bid: Bid; auction: Auction }> {
  const result = await request<{ bid: ApiBid; auctionRoom: ApiAuctionRoom }>(`/auctions/${encodeURIComponent(roomId)}/bids`, { method: 'POST', body: JSON.stringify({ amount }) }, session)
  const auction = normalizeRoom(result.auctionRoom)
  const bid = auction.bids.find((item) => item.id === result.bid.id) ?? { ...result.bid, bidder: result.bid.bidder ? { id: result.bid.bidder.id, displayName: result.bid.bidder.displayName ?? 'Bidder', avatarUrl: result.bid.bidder.avatarUrl } : { id: '', displayName: 'Bidder' } }
  return { bid, auction }
}

export async function closeAuction(roomId: string, session?: Session | null): Promise<Auction> {
  const result = await request<{ auctionRoom: ApiAuctionRoom }>(`/auctions/${encodeURIComponent(roomId)}/close`, { method: 'POST' }, session)
  return normalizeRoom(result.auctionRoom)
}

export async function submitVerdict(roomId: string, decision: Verdict, session?: Session | null): Promise<{ auction: Auction; trustScore: number }> {
  const result = await request<{ auctionRoom: ApiAuctionRoom; trustScore: number }>(`/auctions/${encodeURIComponent(roomId)}/verdict`, { method: 'POST', body: JSON.stringify({ decision }) }, session)
  return { auction: normalizeRoom(result.auctionRoom), trustScore: result.trustScore }
}

export async function getNotifications(session?: Session | null): Promise<NotificationItem[]> {
  const result = await request<{ notifications: NotificationItem[] }>('/notifications', {}, session)
  return result.notifications
}

export async function markNotificationRead(id: string, session?: Session | null): Promise<NotificationItem> {
  const result = await request<{ notification: NotificationItem }>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }, session)
  return result.notification
}

export async function markAllNotificationsRead(session?: Session | null): Promise<number> {
  const result = await request<{ updated: number }>('/notifications/read-all', { method: 'POST' }, session)
  return result.updated
}

export async function getAccountProfile(session?: Session | null): Promise<AccountProfile> {
  const result = await request<{ profile: AccountProfile }>('/account', {}, session)
  return result.profile
}

export async function getSellerVerification(session?: Session | null): Promise<SellerVerification | null> {
  const result = await request<{ verification: SellerVerification | null }>('/seller/verification', {}, session)
  return result.verification
}

export async function getSellerBanks(session?: Session | null): Promise<SellerBank[]> {
  const result = await request<{ banks: SellerBank[] }>('/seller/verification/banks', {}, session)
  return result.banks
}

export async function startSellerIdentityVerification(session?: Session | null): Promise<SmileVerificationSession> {
  const result = await request<SmileVerificationSession>('/seller/verification/identity/start', {
    method: 'POST',
    body: JSON.stringify({ consent: true }),
  }, session)
  return result
}

export async function recordSmileVerificationSubmission(
  input: { reference: string; jobId: string; smileUserId: string },
  session?: Session | null,
): Promise<void> {
  await request<{ status: SellerCheckStatus }>('/seller/verification/identity/submitted', {
    method: 'POST',
    body: JSON.stringify(input),
  }, session)
}

export async function cancelSellerIdentityVerification(reference: string, session?: Session | null): Promise<void> {
  await request<{ cancelled: boolean }>('/seller/verification/identity/cancel', {
    method: 'POST',
    body: JSON.stringify({ reference }),
  }, session)
}

export async function verifySellerPayoutAccount(
  bankCode: string,
  accountNumber: string,
  session?: Session | null,
): Promise<{ verified: boolean; bankName: string; accountLast4: string }> {
  return request<{ verified: boolean; bankName: string; accountLast4: string }>('/seller/verification/payout-account', {
    method: 'POST',
    body: JSON.stringify({ bankCode, accountNumber }),
  }, session)
}

export async function updateAccountPreferences(
  preferences: Pick<AccountProfile, 'preferredDormOrCampus' | 'budgetPreference'> & Partial<Pick<AccountProfile, 'avatarUrl'>>,
  session?: Session | null,
): Promise<AccountProfile> {
  const result = await request<{ profile: AccountProfile }>('/account', {
    method: 'PATCH',
    body: JSON.stringify(preferences),
  }, session)
  return result.profile
}

export async function deleteAccount(confirmation: string, session?: Session | null): Promise<void> {
  await request<{ deleted: boolean }>('/account', {
    method: 'DELETE',
    body: JSON.stringify({ confirmation }),
  }, session, false)
}
