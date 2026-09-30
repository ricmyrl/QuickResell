import { useEffect, useState } from 'react'
import type { MarketplaceListing, PurchaseOrder, ShoppingCartItem } from '../types'
import { addCartItem, getCart, placeCartOrder, removeCartItem, updateCartQuantity } from '../services/cartApi'

const storageKey = 'quickresell:buy-now-carts:v1'
type GuestCarts = Record<string, ShoppingCartItem[]>

function readGuestCarts(): GuestCarts {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as GuestCarts : {}
  } catch { return {} }
}

export function useShoppingCart(userId: string, authenticated: boolean) {
  const [guestCarts, setGuestCarts] = useState<GuestCarts>(readGuestCarts)
  const [serverItems, setServerItems] = useState<ShoppingCartItem[]>([])
  const [loading, setLoading] = useState(authenticated)
  const [error, setError] = useState('')
  const items = authenticated ? serverItems : guestCarts[userId] ?? []

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(guestCarts)) } catch { /* Cart remains available for this session. */ }
  }, [guestCarts])

  useEffect(() => {
    let cancelled = false
    if (!authenticated) { setLoading(false); setServerItems([]); setError(''); return }
    setLoading(true)
    void getCart().then((cart) => { if (!cancelled) { setServerItems(cart); setError('') } }).catch((caught: unknown) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load your cart.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId, authenticated])

  const add = async (listing: MarketplaceListing, quantity = 1) => {
    if (authenticated) {
      const item = await addCartItem(listing.id, quantity)
      setServerItems((current) => [item, ...current.filter((line) => line.postId !== item.postId)])
      return
    }
    setGuestCarts((current) => {
      const cart = current[userId] ?? []
      const old = cart.find((line) => line.postId === listing.id)
      const nextQuantity = Math.min(listing.quantityAvailable, (old?.quantity ?? 0) + quantity)
      const item: ShoppingCartItem = { id: `guest-${listing.id}`, postId: listing.id, quantity: nextQuantity, available: true, unitPriceCents: Math.round(listing.price * 100), post: listing }
      return { ...current, [userId]: [item, ...cart.filter((line) => line.postId !== listing.id)] }
    })
  }

  const setQuantity = async (postId: string, quantity: number) => {
    if (authenticated) {
      const item = await updateCartQuantity(postId, quantity)
      setServerItems((current) => current.map((line) => line.postId === postId ? item : line))
      return
    }
    setGuestCarts((current) => ({ ...current, [userId]: (current[userId] ?? []).map((line) => line.postId === postId ? { ...line, quantity: Math.max(1, Math.min(line.post.quantityAvailable, quantity)) } : line) }))
  }

  const remove = async (postId: string) => {
    if (authenticated) {
      await removeCartItem(postId)
      setServerItems((current) => current.filter((line) => line.postId !== postId))
      return
    }
    setGuestCarts((current) => ({ ...current, [userId]: (current[userId] ?? []).filter((line) => line.postId !== postId) }))
  }

  const checkout = async (): Promise<PurchaseOrder> => {
    if (authenticated) {
      const order = await placeCartOrder()
      setServerItems([])
      return order
    }
    const currentItems = guestCarts[userId] ?? []
    if (!currentItems.length) throw new Error('Your cart is empty.')
    const subtotalCents = currentItems.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0)
    const order: PurchaseOrder = {
      id: `preview-${Date.now()}`, status: 'PENDING_HANDOFF', subtotalCents, createdAt: new Date().toISOString(),
      items: currentItems.map((item) => ({ id: `preview-${item.postId}`, postId: item.postId, sellerId: item.post.seller.id, title: item.post.title, quantity: item.quantity, unitPriceCents: item.unitPriceCents })),
    }
    setGuestCarts((current) => ({ ...current, [userId]: [] }))
    return order
  }

  return { items, loading, error, add, setQuantity, remove, checkout, refresh: async () => {
    if (!authenticated) return
    setLoading(true)
    try { setServerItems(await getCart()); setError('') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load your cart.') }
    finally { setLoading(false) }
  } }
}
