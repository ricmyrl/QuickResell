import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { MarketplaceListing, PurchaseOrder, ShoppingCartItem } from '../types'

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '')

export class CartApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status; this.name = 'CartApiError' }
}

type ApiPost = {
  id: string; title: string; description?: string | null; price: number; originalPrice?: number | null
  quantityAvailable: number; locationCampus?: string | null
  category?: { name: string }
  images?: Array<{ url: string }>
  user?: { id: string; displayName?: string | null; avatarUrl?: string | null; trustScore?: number }
}

type ApiCartItem = { id: string; postId: string; quantity: number; available: boolean; unitPriceCents: number; post: ApiPost }

function normalizePost(post: ApiPost): MarketplaceListing {
  return {
    id: post.id, title: post.title, description: post.description ?? '', price: post.price,
    originalPrice: post.originalPrice, quantityAvailable: post.quantityAvailable,
    category: post.category?.name ?? 'Uncategorized', location: post.locationCampus ?? 'Location not provided',
    image: post.images?.[0]?.url ?? '',
    seller: { id: post.user?.id ?? '', displayName: post.user?.displayName ?? '', avatarUrl: post.user?.avatarUrl, trustScore: post.user?.trustScore ?? 0 },
  }
}

function normalizeItem(item: ApiCartItem): ShoppingCartItem {
  return { id: item.id, postId: item.postId, quantity: item.quantity, available: item.available, unitPriceCents: item.unitPriceCents, post: normalizePost(item.post) }
}

async function request<T>(path: string, init: RequestInit = {}, session?: Session | null): Promise<T> {
  const activeSession = session ?? (await supabase?.auth.getSession())?.data.session
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (activeSession?.access_token) headers.set('Authorization', `Bearer ${activeSession.access_token}`)
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers })
  const payload = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new CartApiError(payload.error ?? `Request failed (${response.status}).`, response.status)
  return payload as T
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

export async function placeCartOrder(session?: Session | null): Promise<PurchaseOrder> {
  const result = await request<{ order: PurchaseOrder }>('/cart/checkout', { method: 'POST' }, session)
  return result.order
}
