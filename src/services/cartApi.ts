import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { FulfillmentMethod, ListingReactionCounts, ListingReactionType, MarketplaceListing, PurchaseOrder, SellerOrderItem, ShoppingCartItem } from '../types'

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

export class CartApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly requestId?: string
  constructor(message: string, status: number, code?: string, requestId?: string) {
    super(message)
    this.status = status
    this.code = code
    this.requestId = requestId
    this.name = 'CartApiError'
  }
}

type ApiErrorPayload = { error?: unknown; code?: unknown; requestId?: unknown }

type ApiPost = {
  id: string; title: string; description?: string | null; price: number; originalPrice?: number | null
  quantityAvailable: number; locationCampus?: string | null; latitude?: number | null; longitude?: number | null
  listingReactions?: Array<{ type: ListingReactionType }>
  reactionCounts?: ListingReactionCounts
  _count?: { comments: number; listingReactions?: number }
  category?: { name: string }
  images?: Array<{ url: string }>
  user?: { id: string; displayName?: string | null; avatarUrl?: string | null; trustScore?: number }
}

type ApiCartItem = {
  id: string
  postId: string
  quantity: number
  available: boolean
  unitPriceCents: number
  post: ApiPost
  auction?: ShoppingCartItem['auction']
}

function normalizePost(post: ApiPost): MarketplaceListing {
  return {
    id: post.id, title: post.title, description: post.description ?? '', price: post.price,
    originalPrice: post.originalPrice, quantityAvailable: post.quantityAvailable,
    category: post.category?.name ?? 'Uncategorized', location: post.locationCampus ?? 'Location not provided',
    latitude: post.latitude, longitude: post.longitude,
    commentsCount: post._count?.comments ?? 0,
    reactionCount: post._count?.listingReactions ?? 0,
    reactionCounts: post.reactionCounts,
    myReaction: post.listingReactions?.[0]?.type ?? null,
    image: post.images?.[0]?.url ?? '',
    seller: { id: post.user?.id ?? '', displayName: post.user?.displayName ?? '', avatarUrl: post.user?.avatarUrl, trustScore: post.user?.trustScore ?? 0 },
  }
}

function normalizeItem(item: ApiCartItem): ShoppingCartItem {
  return { id: item.id, postId: item.postId, quantity: item.quantity, available: item.available, unitPriceCents: item.unitPriceCents, post: normalizePost(item.post), auction: item.auction }
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
      const body = await response.text()
      let payload: ApiErrorPayload = {}
      if (body) {
        try {
          payload = JSON.parse(body) as ApiErrorPayload
        } catch {
          if (response.ok) {
            throw new CartApiError('The server returned an unreadable response.', response.status, 'INVALID_SERVER_RESPONSE', response.headers.get('X-Request-Id') ?? undefined)
          }
        }
      }
      if (!response.ok) {
        const message = typeof payload.error === 'string' ? payload.error : `Request failed (${response.status}).`
        const code = typeof payload.code === 'string' ? payload.code : undefined
        const requestId = typeof payload.requestId === 'string' ? payload.requestId : response.headers.get('X-Request-Id') ?? undefined
        throw new CartApiError(message, response.status, code, requestId)
      }
      return (body ? payload : undefined) as T
    } catch (error) {
      lastError = error
      if (error instanceof CartApiError) {
        throw error
      }
    }
  }

  if (lastError instanceof CartApiError) throw lastError
  throw new CartApiError('Could not connect to the marketplace server. Check your connection and try again.', 0, 'NETWORK_ERROR')
}

export async function getStoreListings(session?: Session | null): Promise<MarketplaceListing[]> {
  const result = await request<{ items: ApiPost[] }>('/store', {}, session)
  return result.items.map(normalizePost)
}

export async function getCart(session?: Session | null): Promise<ShoppingCartItem[]> {
  const result = await request<{ items: ApiCartItem[] }>('/cart', {}, session)
  return result.items.map(normalizeItem)
}

export async function addCartItem(postId: string, quantity = 1, session?: Session | null): Promise<ShoppingCartItem> {
  const result = await request<{ item: ApiCartItem }>('/cart/items', { method: 'POST', body: JSON.stringify({ postId, quantity }) }, session)
  return normalizeItem(result.item)
}

export async function updateCartQuantity(postId: string, quantity: number, session?: Session | null): Promise<ShoppingCartItem> {
  const result = await request<{ item: ApiCartItem }>(`/cart/items/${encodeURIComponent(postId)}`, { method: 'PATCH', body: JSON.stringify({ quantity }) }, session)
  return normalizeItem(result.item)
}

export async function removeCartItem(postId: string, session?: Session | null): Promise<void> {
  await request<void>(`/cart/items/${encodeURIComponent(postId)}`, { method: 'DELETE' }, session)
}

export async function initializePayment(session?: Session | null): Promise<{ status: string; authorization_url: string; access_code: string; reference: string; amountCents: number; currency: string }> {
  return request<{ status: string; authorization_url: string; access_code: string; reference: string; amountCents: number; currency: string }>('/payments/initialize', {
    method: 'POST',
    body: JSON.stringify({}),
  }, session)
}

export async function verifyPayment(reference: string, session?: Session | null): Promise<{ verified: boolean; status: string; reference: string; amount: number; currency: string; metadata?: Record<string, unknown> }> {
  return request<{ verified: boolean; status: string; reference: string; amount: number; currency: string; metadata?: Record<string, unknown> }>(`/payments/verify/${encodeURIComponent(reference)}`, { method: 'GET' }, session)
}

export async function placeCartOrder(paymentReference?: string, session?: Session | null): Promise<PurchaseOrder> {
  const result = await request<{ order: PurchaseOrder }>('/cart/checkout', {
    method: 'POST',
    body: JSON.stringify(paymentReference ? { paymentReference } : {}),
  }, session)
  return result.order
}

export async function getMyOrders(session: Session): Promise<PurchaseOrder[]> {
  const result = await request<{ orders: PurchaseOrder[] }>('/orders/mine', {}, session)
  return result.orders
}

export async function getSellerOrders(session: Session): Promise<SellerOrderItem[]> {
  const result = await request<{ items: SellerOrderItem[] }>('/seller/orders', {}, session)
  return result.items
}

export async function updateOrderFulfillment(itemId: string, method: FulfillmentMethod, session: Session): Promise<SellerOrderItem> {
  const result = await request<{ item: SellerOrderItem }>(`/seller/orders/${encodeURIComponent(itemId)}/fulfillment`, {
    method: 'POST',
    body: JSON.stringify({ method }),
  }, session)
  return result.item
}

export async function confirmOrderItemReceived(itemId: string, session: Session): Promise<void> {
  await request<{ item: { id: string } }>(`/orders/items/${encodeURIComponent(itemId)}/complete`, { method: 'POST' }, session)
}
