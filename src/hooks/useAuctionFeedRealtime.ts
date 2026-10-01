import { useEffect, useRef } from 'react'
import type { Auction, Bid } from '../types'
import { supabase } from '../lib/supabase'

type RoomPatch = Partial<Pick<Auction, 'currentHighestBid' | 'endsAt' | 'status' | 'highestBidderId'>> & { id: string }
type FeedHandlers = { onRoomUpdate: (patch: RoomPatch) => void; onBid: (roomId: string, bid: Bid) => void }

export function useAuctionFeedRealtime({ onRoomUpdate, onBid }: FeedHandlers) {
  const handlersRef = useRef<FeedHandlers | null>(null)

  useEffect(() => {
    handlersRef.current = { onRoomUpdate, onBid }
  }, [onRoomUpdate, onBid])

  useEffect(() => {
    const client = supabase
    if (!client) return
    const channel = client.channel('public-auction-feed')
      .on('broadcast', { event: 'new_bid' }, ({ payload }) => {
        const event = payload as { auctionRoomId?: string; bid?: Bid }
        if (event.auctionRoomId && event.bid?.id && handlersRef.current) {
          handlersRef.current.onBid(event.auctionRoomId, event.bid)
        }
      })
      .on('broadcast', { event: 'auction_updated' }, ({ payload }) => {
        const room = payload as RoomPatch
        if (room.id && handlersRef.current) handlersRef.current.onRoomUpdate(room)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Bid' }, ({ new: row }) => {
        const bid = row as { id: string; auctionRoomId: string; bidderId: string; amount: number; createdAt: string }
        if (handlersRef.current) {
          handlersRef.current.onBid(bid.auctionRoomId, { id: bid.id, amount: bid.amount, createdAt: bid.createdAt, bidder: { id: bid.bidderId, displayName: 'Bidder' } })
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'AuctionRoom' }, ({ new: row }) => {
        const room = row as RoomPatch
        if (room.id && handlersRef.current) handlersRef.current.onRoomUpdate(room)
      })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [])
}
