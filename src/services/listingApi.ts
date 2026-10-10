import type { Session } from '@supabase/supabase-js'
import { resolveSession } from '../lib/resolveSession'
import type { Auction, IncrementCurveType, ListingReactionCounts, ListingReactionType, MarketplaceListing, ProductComment } from '../types'
import type { Coordinates } from '../lib/geolocation'
import { optimizeListingImage } from '../lib/optimizeListingImage'

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
const storageBucket = 'listing-images'
const maxImages = 8
const maxImageSize = 10 * 1024 * 1024
const acceptedImageTypes = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'])

export type ListingCategory = { id: string; name: string }
export type NewListing = {
  title: string
  description: string
  categoryId: string
  price: number
  originalPrice?: number
  conditionScore?: number
  locationCampus: string
  quantityAvailable: number
  auctionDurationHours?: number
  incrementCurve?: IncrementCurveType
  coordinates?: Coordinates
}

type ApiListing = {
  id: string
  title: string
  description?: string | null
  price: number
  originalPrice?: number | null
  quantityAvailable: number
  locationCampus?: string | null
  latitude?: number | null
  longitude?: number | null
  _count?: { listingReactions?: number }
  reactionCounts?: ListingReactionCounts
  listingReactions?: Array<{ type: ListingReactionType }>
  category?: { name: string }
  images?: Array<{ url: string }>
  user?: { id: string; displayName?: string | null; avatarUrl?: string | null; trustScore?: number; isCampusVerified?: boolean }
}

function normalizeListing(listing: ApiListing): MarketplaceListing {
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description ?? '',
    price: listing.price,
    originalPrice: listing.originalPrice,
    quantityAvailable: listing.quantityAvailable,
    category: listing.category?.name ?? 'Uncategorized',
    location: listing.locationCampus ?? 'Location not provided',
    latitude: listing.latitude,
    longitude: listing.longitude,
    reactionCount: listing._count?.listingReactions ?? 0,
    reactionCounts: listing.reactionCounts,
    myReaction: listing.listingReactions?.[0]?.type ?? null,
    image: listing.images?.[0]?.url ?? '',
    seller: {
      id: listing.user?.id ?? '',
      displayName: listing.user?.displayName ?? 'Seller',
      avatarUrl: listing.user?.avatarUrl,
      trustScore: listing.user?.trustScore ?? 50,
      isCampusVerified: listing.user?.isCampusVerified ?? false,
    },
  }
}

async function apiRequest<T>(path: string, session?: Session | null, init: RequestInit = {}): Promise<T> {
  session = await resolveSession(session)
  let lastError: unknown
  for (const baseUrl of apiBaseCandidates) {
    try {
      const headers = new Headers(init.headers)
      if (session?.access_token) {
        headers.set('Authorization', `Bearer ${session.access_token}`)
      } else {
        headers.delete('Authorization')
      }
      if (init.body) headers.set('Content-Type', 'application/json')
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        if (response.status >= 500) {
          lastError = new Error(payload.error ?? `Request failed (${response.status}).`)
          continue
        }
        throw new Error(payload.error ?? `Request failed (${response.status}).`)
      }
      return payload as T
    } catch (error) {
      lastError = error
      if (error instanceof Error && !/Request failed \(\d+\)/.test(error.message)) {
        continue
      }
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error(`Request failed for ${path}.`)
}

export async function getListingCategories(session?: Session | null): Promise<ListingCategory[]> {
  const result = await apiRequest<{ categories: ListingCategory[] }>('/categories', session)
  return result.categories
}

export async function getMyListings(session: Session): Promise<MarketplaceListing[]> {
  const result = await apiRequest<{ items: ApiListing[] }>('/listings/mine', session)
  return result.items.map(normalizeListing)
}

export async function getWatchlist(session?: Session | null): Promise<string[]> {
  const result = await apiRequest<{ items: string[] }>('/watchlist', session)
  return result.items
}

export async function toggleWatchlist(postId: string, session?: Session | null): Promise<boolean> {
  const current = await getWatchlist(session)
  if (current.includes(postId)) {
    await apiRequest<void>(`/watchlist/${encodeURIComponent(postId)}`, session, { method: 'DELETE' })
    return false
  }
  await apiRequest<{ item: { id: string } }>(`/watchlist/${encodeURIComponent(postId)}`, session, { method: 'POST' })
  return true
}

export async function createListing(
  details: NewListing,
  images: File[],
  session: Session,
): Promise<{ listing: MarketplaceListing; auction: Auction | null }> {
  const { supabase } = await import('../lib/supabase')
  if (!supabase) throw new Error('Supabase Storage is not configured.')
  if (!session.user.email_confirmed_at) throw new Error('Confirm your email before creating a listing.')
  if (images.length < 1 || images.length > maxImages) throw new Error(`Choose between 1 and ${maxImages} product images.`)
  const storage = supabase.storage

  for (const image of images) {
    if (!acceptedImageTypes.has(image.type)) throw new Error('Use JPEG, PNG, WebP, AVIF, or GIF images.')
    if (image.size > maxImageSize) throw new Error('Each image must be 10 MB or smaller.')
  }

  const optimizedImages: File[] = []
  for (const image of images) optimizedImages.push(await optimizeListingImage(image))
  const uploadedPaths: string[] = []
  try {
    const imageUrls: string[] = []
    for (const image of optimizedImages) {
      const extension = image.type.split('/')[1].replace('jpeg', 'jpg')
      const path = `${session.user.id}/${crypto.randomUUID()}.${extension}`
      const { data, error } = await storage.from(storageBucket).upload(path, image, {
        contentType: image.type,
        upsert: false,
      })
      if (error) throw error
      uploadedPaths.push(data.path)
      imageUrls.push(storage.from(storageBucket).getPublicUrl(data.path).data.publicUrl)
    }

    const { coordinates, ...listingDetails } = details
    const result = await apiRequest<{ listing: ApiListing; auctionRoom: { id: string; postId: string; sellerId: string; currentHighestBid: number; endsAt: string; status: Auction['status']; isPublic: boolean; reservePrice?: number | null; incrementCurve?: IncrementCurveType } | null }>('/listings', session, {
      method: 'POST',
      body: JSON.stringify({
        ...listingDetails,
        ...(coordinates ? {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        } : {}),
        imageUrls,
      }),
    })
    const listing = normalizeListing(result.listing)
    const room = result.auctionRoom
    return {
      listing,
      auction: room ? {
        id: room.id,
        postId: room.postId,
        sellerId: room.sellerId,
        title: listing.title,
        description: listing.description,
        category: listing.category,
        location: listing.location,
        image: listing.image,
        startingPrice: listing.price,
        currentHighestBid: room.currentHighestBid,
        endsAt: room.endsAt,
        status: room.status,
        isPublic: room.isPublic,
        reservePrice: room.reservePrice,
        incrementCurve: room.incrementCurve ?? details.incrementCurve ?? 'LINEAR_TIERED',
        seller: {
          id: listing.seller.id,
          displayName: listing.seller.displayName,
          avatarUrl: listing.seller.avatarUrl,
          trustScore: listing.seller.trustScore,
          completedAuctions: 0,
        },
        bids: [],
        noReserve: room.reservePrice == null || room.reservePrice <= 0,
      } : null,
    }
  } catch (error) {
    if (uploadedPaths.length) {
      const { error: cleanupError } = await storage.from(storageBucket).remove(uploadedPaths)
      if (cleanupError) console.warn('Could not clean up uploaded listing images.', cleanupError)
    }
    throw error
  }
}

export async function updateListingLocation(
  listingId: string,
  coordinates: Coordinates,
  session: Session,
): Promise<MarketplaceListing> {
  const result = await apiRequest<{ listing: ApiListing }>(`/listings/${encodeURIComponent(listingId)}`, session, {
    method: 'PUT',
    body: JSON.stringify({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    }),
  })
  return normalizeListing(result.listing)
}

export async function getProductComments(listingId: string, session?: Session | null): Promise<{ items: ProductComment[]; commentsCount: number }> {
  return apiRequest<{ items: ProductComment[]; commentsCount: number }>(`/listings/${encodeURIComponent(listingId)}/comments`, session)
}

export async function addProductComment(
  listingId: string,
  content: string,
  session: Session,
  parentId?: string,
): Promise<{ comment: ProductComment; commentsCount: number }> {
  return apiRequest<{ comment: ProductComment; commentsCount: number }>(
    `/listings/${encodeURIComponent(listingId)}/comments`,
    session,
    { method: 'POST', body: JSON.stringify({ content, ...(parentId ? { parentId } : {}) }) },
  )
}

export async function setProductCommentReaction(
  listingId: string,
  commentId: string,
  liked: boolean,
  session: Session,
): Promise<{ liked: boolean; likeCount: number }> {
  return apiRequest<{ liked: boolean; likeCount: number }>(
    `/listings/${encodeURIComponent(listingId)}/comments/${encodeURIComponent(commentId)}/reaction`,
    session,
    { method: liked ? 'POST' : 'DELETE' },
  )
}

export async function setListingReaction(
  listingId: string,
  reaction: ListingReactionType | null,
  session: Session,
): Promise<{ reaction: ListingReactionType | null; reactionCount: number; reactionCounts: ListingReactionCounts }> {
  return apiRequest<{ reaction: ListingReactionType | null; reactionCount: number; reactionCounts: ListingReactionCounts }>(
    `/listings/${encodeURIComponent(listingId)}/reaction`,
    session,
    reaction
      ? { method: 'POST', body: JSON.stringify({ type: reaction }) }
      : { method: 'DELETE' },
  )
}