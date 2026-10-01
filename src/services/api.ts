import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Auction, Bid, Verdict } from '../types'

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '')
type ApiBid = { id: string; amount: number; createdAt: string; bidder?: { id: string; displayName?: string | null; avatarUrl?: string | null } }
type ApiAuctionRoom = {
  id: string; postId: string; sellerId: string; currentHighestBid: number; highestBidderId: string | null
  isPublic: boolean; reservePrice?: number | null; status: Auction['status']; endsAt: string
  post?: { id: string; title: string; description?: string | null; price: number; locationCampus?: string | null; category?: { name: string }; images?: { url: string }[] }
  seller?: { id: string; displayName?: string | null; avatarUrl?: string | null; trustScore?: number; completedAuctions?: number }
  bids?: ApiBid[]
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
  const activeSession = session ?? (await supabase?.auth.getSession())?.data.session
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (activeSession?.access_token) headers.set('Authorization', `Bearer ${activeSession.access_token}`)
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers })
  const payload = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new ApiError(payload.error ?? `Request failed (${response.status}).`, response.status)
  return payload as T
}

export async function getPublicAuctions(session?: Session | null): Promise<Auction[]> {
  const result = await request<{ auctionRooms: ApiAuctionRoom[] }>('/auctions?limit=50', {}, session)
  return result.auctionRooms.map(normalizeRoom)
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
