import { useEffect, useRef } from 'react'
import type { Auction, Bid } from '../types'
import { getAuctionRoom } from '../services/api'
import { supabase } from '../lib/supabase'

type RoomPatch = Partial<Pick<Auction, 'currentHighestBid' | 'endsAt' | 'status' | 'highestBidderId'>> & { id?: string }

export function useAuctionRealtime(roomId: string, onAuctionUpdate: (update: RoomPatch) => void, onNewBid: (bid: Bid) => void) {
  const roomUpdateRef = useRef<((update: RoomPatch) => void) | null>(null)
  const bidRef = useRef<((bid: Bid) => void) | null>(null)

  useEffect(() => {
    roomUpdateRef.current = onAuctionUpdate
    bidRef.current = onNewBid
  }, [onAuctionUpdate, onNewBid])

  useEffect(() => {
    const client = supabase
    if (!roomId) return
    let cancelled = false
    let refreshing = false
    const refreshRoom = async () => {
      if (refreshing) return
      refreshing = true
      try {
        const room = await getAuctionRoom(roomId)
        if (!cancelled) roomUpdateRef.current?.(room)
      } catch {
        // Keep the last realtime state and retry on the next refresh.
      } finally {
        refreshing = false
      }
    }
    void refreshRoom()
    const refreshTimer = window.setInterval(() => void refreshRoom(), 5_000)
    const channel = client?.channel(`auction:${roomId}`)
      .on('broadcast', { event: 'new_bid' }, ({ payload }) => {
        const bid = payload as Bid
        if (bid?.id && bid.amount && bidRef.current) bidRef.current(bid)
      })
      .on('broadcast', { event: 'auction_updated' }, ({ payload }) => {
        if (roomUpdateRef.current) roomUpdateRef.current(payload as RoomPatch)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Bid', filter: `auctionRoomId=eq.${roomId}` }, ({ new: row }) => {
        const bid = row as { id: string; amount: number; createdAt: string; bidderId: string }
        if (bidRef.current) {
          bidRef.current({ id: bid.id, amount: bid.amount, createdAt: bid.createdAt, bidder: { id: bid.bidderId, displayName: 'Bidder' } })
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'AuctionRoom', filter: `id=eq.${roomId}` }, ({ new: row }) => {
        const room = row as { id: string; currentHighestBid: number; endsAt: string; status: Auction['status']; highestBidderId: string | null }
        if (roomUpdateRef.current) {
          roomUpdateRef.current({ id: room.id, currentHighestBid: room.currentHighestBid, endsAt: room.endsAt, status: room.status, highestBidderId: room.highestBidderId })
        }
      })
      .subscribe()
    return () => {
      cancelled = true
      window.clearInterval(refreshTimer)
      if (channel) void client?.removeChannel(channel)
    }
  }, [roomId])
}
