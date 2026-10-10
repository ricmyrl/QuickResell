import { useEffect, useState } from 'react'
import type { MarketplaceListing, PurchaseOrder, ShoppingCartItem } from '../types'
import { addCartItem, getCart, placeCartOrder, removeCartItem, updateCartQuantity } from '../services/cartApi'

export function useShoppingCart(userId: string, authenticated: boolean) {
  const [serverCart, setServerCart] = useState<{ userId: string; items: ShoppingCartItem[] }>({ userId: '', items: [] })
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const [cartError, setCartError] = useState<{ userId: string; message: string } | null>(null)
  const loading = authenticated && loadedUserId !== userId
  const error = cartError?.userId === userId ? cartError.message : ''
  const items = authenticated && serverCart.userId === userId ? serverCart.items : []
  const hasActiveAuctionHolds = items.some((item) =>
    item.auction?.status === 'ACTIVE' || item.auction?.status === 'PENDING_APPROVAL',
  )

  useEffect(() => {
    let cancelled = false
    if (!authenticated || !userId) return
    void getCart().then((cart) => {
      if (!cancelled) {
        setServerCart({ userId, items: cart })
        setCartError(null)
        setLoadedUserId(userId)
      }
    }).catch((caught: unknown) => {
      if (!cancelled) {
        setCartError({ userId, message: caught instanceof Error ? caught.message : 'Could not load your cart.' })
        setLoadedUserId(userId)
      }
    })
    return () => { cancelled = true }
  }, [userId, authenticated])

  useEffect(() => {
    if (!authenticated || !userId || !hasActiveAuctionHolds) return
    let cancelled = false
    const refreshAuctionHolds = async () => {
      try {
        const cart = await getCart()
        if (!cancelled) {
          setServerCart({ userId, items: cart })
          setCartError(null)
        }
      } catch (caught) {
        if (!cancelled) {
          setCartError({ userId, message: caught instanceof Error ? caught.message : 'Could not refresh your auction cart.' })
        }
      }
    }
    const timer = window.setInterval(() => { void refreshAuctionHolds() }, 10_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [userId, authenticated, hasActiveAuctionHolds])

  const add = async (listing: MarketplaceListing, quantity = 1) => {
    if (!authenticated) throw new Error('Sign in before adding items to your cart.')
    const item = await addCartItem(listing.id, quantity)
    setServerCart((current) => ({ userId, items: [item, ...(current.userId === userId ? current.items : []).filter((line) => line.postId !== item.postId)] }))
  }

  const setQuantity = async (postId: string, quantity: number) => {
    if (!authenticated) throw new Error('Sign in before changing your cart.')
    const item = await updateCartQuantity(postId, quantity)
    setServerCart((current) => ({ userId, items: (current.userId === userId ? current.items : []).map((line) => line.postId === postId ? item : line) }))
  }

  const remove = async (postId: string) => {
    if (!authenticated) throw new Error('Sign in before changing your cart.')
    await removeCartItem(postId)
    setServerCart((current) => ({ userId, items: (current.userId === userId ? current.items : []).filter((line) => line.postId !== postId) }))
  }

  const checkout = async (paymentReference?: string, paymentMethod: 'PAYSTACK' | 'WALLET' = 'PAYSTACK'): Promise<PurchaseOrder> => {
    if (!authenticated) throw new Error('Sign in before checking out.')
    const order = await placeCartOrder(paymentReference, undefined, paymentMethod)
    const purchasedPostIds = new Set(order.items.map((item) => item.postId))
    setServerCart((current) => ({
      userId,
      items: (current.userId === userId ? current.items : []).filter((item) => !purchasedPostIds.has(item.postId)),
    }))
    try {
      setServerCart({ userId, items: await getCart() })
      setCartError(null)
    } catch (caught) {
      setCartError({
        userId,
        message: caught instanceof Error ? `Your order was placed, but the remaining cart could not be refreshed: ${caught.message}` : 'Your order was placed, but the remaining cart could not be refreshed.',
      })
    }
    return order
  }

  return { items, loading, error, add, setQuantity, remove, checkout, refresh: async () => {
    if (!authenticated) return
    try {
      setServerCart({ userId, items: await getCart() })
      setCartError(null)
      setLoadedUserId(userId)
    } catch (caught) {
      setCartError({ userId, message: caught instanceof Error ? caught.message : 'Could not load your cart.' })
      setLoadedUserId(userId)
    }
  } }
}
