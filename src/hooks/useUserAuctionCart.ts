import { useEffect, useState } from 'react'
import type { Auction } from '../types'

const storageKey = 'quickresell:user-auction-carts:v1'
type UserCarts = Record<string, Auction[]>

function readCarts(): UserCarts {
  if (typeof window === 'undefined') return {}
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    return value as UserCarts
  } catch {
    return {}
  }
}

export function useUserAuctionCart(userId: string) {
  const [carts, setCarts] = useState<UserCarts>(readCarts)
  const items = carts[userId] ?? []

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(carts))
    } catch {
      // Keep cart actions usable if browser storage is unavailable.
    }
  }, [carts])

  const toggle = (auction: Auction) => {
    setCarts((current) => {
      const userItems = current[userId] ?? []
      const alreadySaved = userItems.some((item) => item.id === auction.id)
      return {
        ...current,
        [userId]: alreadySaved
          ? userItems.filter((item) => item.id !== auction.id)
          : [auction, ...userItems].slice(0, 50),
      }
    })
  }

  const remove = (auctionId: string) => {
    setCarts((current) => ({
      ...current,
      [userId]: (current[userId] ?? []).filter((item) => item.id !== auctionId),
    }))
  }

  return { items, toggle, remove, has: (auctionId: string) => items.some((item) => item.id === auctionId) }
}
