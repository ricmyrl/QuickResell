export type AuctionStatus = 'ACTIVE' | 'PENDING_APPROVAL' | 'SOLD' | 'REJECTED' | 'CLOSED'

export type Bid = {
  id: string
  amount: number
  createdAt: string
  bidder: { id: string; displayName: string; avatarUrl?: string | null }
}

export type Auction = {
  id: string
  postId: string
  sellerId: string
  title: string
  description: string
  category: string
  location: string
  image: string
  startingPrice: number
  currentHighestBid: number
  endsAt: string
  status: AuctionStatus
  isPublic: boolean
  reservePrice?: number | null
  seller: { id: string; displayName: string; avatarUrl?: string | null; trustScore: number; completedAuctions: number }
  highestBidderId?: string | null
  bids: Bid[]
  noReserve?: boolean
}

export type AuctionWatchlistRule = {
  id: string
  auctionRoomId: string
  maxBid: number
  bidStep: number
  autoBidEnabled: boolean
  updatedAt: string
  auction: Auction
}

export type Verdict = 'ACCEPT' | 'REJECT'

export type MarketplaceListing = {
  id: string
  title: string
  description: string
  price: number
  originalPrice?: number | null
  quantityAvailable: number
  category: string
  location: string
  image: string
  seller: { id: string; displayName: string; avatarUrl?: string | null; trustScore: number; isCampusVerified?: boolean }
}

export type ShoppingCartItem = {
  id: string
  postId: string
  quantity: number
  available: boolean
  unitPriceCents: number
  post: MarketplaceListing
}

export type PurchaseOrder = {
  id: string
  status: 'PENDING_HANDOFF' | 'COMPLETED' | 'CANCELLED'
  subtotalCents: number
  createdAt: string
  items: Array<{ id: string; postId: string; sellerId: string; title: string; quantity: number; unitPriceCents: number }>
}

export type NotificationItem = {
  id: string
  userId: string
  type: 'BID_PLACED' | 'OUTBID' | 'AUCTION_WON' | 'AUCTION_CLOSED' | 'PRICE_UPDATED' | 'LISTING_SOLD' | 'REVIEW' | 'REPLY' | 'ORDER_UPDATE'
  title: string
  message: string
  entityType?: string | null
  entityId?: string | null
  isRead: boolean
  createdAt: string
}
