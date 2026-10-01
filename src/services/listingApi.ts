import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { MarketplaceListing } from '../types'

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '')
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
  locationCampus: string
  quantityAvailable: number
}

type ApiListing = {
  id: string
  title: string
  description?: string | null
  price: number
  originalPrice?: number | null
  quantityAvailable: number
  locationCampus?: string | null
  category?: { name: string }
  images?: Array<{ url: string }>
  user?: { id: string; displayName?: string | null; avatarUrl?: string | null; trustScore?: number }
}

function normalizeListing(listing: ApiListing): MarketplaceListing {
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description ?? '',
    price: listing.price,
    originalPrice: listing.originalPrice,
    quantityAvailable: listing.quantityAvailable,
    category: listing.category?.name ?? 'Campus finds',
    location: listing.locationCampus ?? 'Campus',
    image: listing.images?.[0]?.url ?? '',
    seller: {
      id: listing.user?.id ?? '',
      displayName: listing.user?.displayName ?? 'Campus seller',
      avatarUrl: listing.user?.avatarUrl,
      trustScore: listing.user?.trustScore ?? 50,
    },
  }
}

async function apiRequest<T>(path: string, session: Session, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${session.access_token}`)
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers })
  const payload = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status}).`)
  return payload as T
}

export async function getListingCategories(session: Session): Promise<ListingCategory[]> {
  const result = await apiRequest<{ categories: ListingCategory[] }>('/categories', session)
  return result.categories
}

export async function getMyListings(session: Session): Promise<MarketplaceListing[]> {
  const result = await apiRequest<{ items: ApiListing[] }>('/listings/mine', session)
  return result.items.map(normalizeListing)
}

export async function createListing(
  details: NewListing,
  images: File[],
  session: Session,
): Promise<MarketplaceListing> {
  if (!supabase) throw new Error('Supabase Storage is not configured.')
  if (!session.user.email_confirmed_at) throw new Error('Confirm your email before creating a listing.')
  if (images.length < 1 || images.length > maxImages) throw new Error(`Choose between 1 and ${maxImages} product images.`)
  const storage = supabase.storage

  for (const image of images) {
    if (!acceptedImageTypes.has(image.type)) throw new Error('Use JPEG, PNG, WebP, AVIF, or GIF images.')
    if (image.size > maxImageSize) throw new Error('Each image must be 10 MB or smaller.')
  }

  const uploadedPaths: string[] = []
  try {
    const imageUrls: string[] = []
    for (const image of images) {
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

    const result = await apiRequest<{ listing: ApiListing }>('/listings', session, {
      method: 'POST',
      body: JSON.stringify({ ...details, imageUrls }),
    })
    return normalizeListing(result.listing)
  } catch (error) {
    if (uploadedPaths.length) {
      const { error: cleanupError } = await storage.from(storageBucket).remove(uploadedPaths)
      if (cleanupError) console.warn('Could not clean up uploaded listing images.', cleanupError)
    }
    throw error
  }
}