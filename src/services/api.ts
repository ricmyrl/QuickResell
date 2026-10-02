import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Auction, AuctionWatchlistRule, Bid, NotificationItem, Verdict } from '../types'

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
  post?: { id: string; title: string; description?: string | null; price: number; locationCampus?: string | null; category?: { name: string }; images?: { url: string }[] }
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
    startingPrice: room.post?.price ?? 0, currentHighestBid: room.currentHighestBid,
    endsAt: room.endsAt, status: room.status, isPublic: room.isPublic, reservePrice: room.reservePrice,
    highestBidderId: room.highestBidderId, noReserve: room.reservePrice == null,
    seller: { id: room.seller?.id ?? room.sellerId, displayName: room.seller?.displayName ?? '', avatarUrl: room.seller?.avatarUrl, trustScore: room.seller?.trustScore ?? 0, completedAuctions: room.seller?.completedAuctions ?? 0 },
    bids: (room.bids ?? []).map((bid) => ({ id: bid.id, amount: bid.amount, createdAt: bid.createdAt, bidder: { id: bid.bidder?.id ?? '', displayName: bid.bidder?.displayName ?? 'Bidder', avatarUrl: bid.bidder?.avatarUrl } })),
  }
}

async function request<T>(path: string, init: RequestInit = {}, session?: Session | null): Promise<T> {
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
          continue
        }
        throw new ApiError(payload.error ?? `Request failed (${response.status}).`, response.status)
      }
      return payload as T
    } catch (error) {
      lastError = error
      if (error instanceof ApiError && error.status < 500) {
        throw error
      }
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error(`Request failed for ${path}.`)
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
