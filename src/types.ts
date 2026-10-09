export type AuctionStatus = 'ACTIVE' | 'PENDING_APPROVAL' | 'SOLD' | 'REJECTED' | 'CLOSED'
export type IncrementCurveType = 'LINEAR_TIERED' | 'LOGARITHMIC' | 'EXPONENTIAL' | 'MARKET_SIGMOID'

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
  platformFeeCents?: number
  platformFeeEnabled?: boolean
  endsAt: string
  status: AuctionStatus
  isPublic: boolean
  reservePrice?: number | null
  incrementCurve?: IncrementCurveType
  seller: { id: string; displayName: string; avatarUrl?: string | null; trustScore: number; completedAuctions: number }
  highestBidderId?: string | null
  bids: Bid[]
  noReserve?: boolean
  reactionCount?: number
  reactionCounts?: ListingReactionCounts
  myReaction?: ListingReactionType | null
}

export type AuctionWatchlistRule = {
  id: string
  auctionRoomId: string
  maxBid: number
  bidStep: number
  strategy: BidStrategy
  jumpMultiplier: number
  sniperWindowSeconds: number
  marginOfSafety: number
  autoBidEnabled: boolean
  updatedAt: string
  auction: Auction
}

export type BidStrategy = 'STANDARD' | 'JUMP_BID' | 'SNIPER' | 'RESERVE_TARGET' | 'ANALYST'

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
  latitude?: number | null
  longitude?: number | null
  commentsCount?: number
  reactionCount?: number
  reactionCounts?: ListingReactionCounts
  myReaction?: ListingReactionType | null
  image: string
  seller: { id: string; displayName: string; avatarUrl?: string | null; trustScore: number; isCampusVerified?: boolean }
}

export type ListingReactionType = 'LIKE' | 'LOVE' | 'HAHA' | 'WOW' | 'SAD' | 'ANGRY'
export type ListingReactionCounts = Record<ListingReactionType, number>

export type ProductComment = {
  id: string
  content: string
  createdAt: string
  user: { id: string; displayName: string | null; avatarUrl: string | null }
  likeCount: number
  likedByMe: boolean
  replies: ProductComment[]
}

export type ShoppingCartItem = {
  id: string
  postId: string
  quantity: number
  available: boolean
  unitPriceCents: number
  post: MarketplaceListing
  auction?: {
    roomId: string
    status: AuctionStatus
    endsAt: string
    isHighestBidder: boolean
    currentHighestBid: number
  } | null
}

export type PurchaseOrder = {
  id: string
  status: 'PENDING_HANDOFF' | 'COMPLETED' | 'CANCELLED'
  subtotalCents: number
  createdAt: string
  paymentStatus?: 'PAID' | 'UNPAID'
  items: PurchaseOrderItem[]
}

export type FulfillmentMethod = 'PICKUP' | 'SHIPPING'
export type OrderItemFulfillmentStatus = 'PENDING_HANDOFF' | 'READY_FOR_PICKUP' | 'SHIPPED' | 'COMPLETED'
export type PurchaseOrderItem = {
  id: string
  postId: string
  sellerId: string
  title: string
  quantity: number
  unitPriceCents: number
  sellerFeeCents: number
  fulfillmentStatus: OrderItemFulfillmentStatus
  fulfillmentMethod: FulfillmentMethod | null
  seller?: { displayName: string | null }
}
export type SellerOrderItem = PurchaseOrderItem & {
  paymentStatus: 'PAID' | 'UNPAID'
  sellerPayout?: {
    id: string
    status: 'BLOCKED' | 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REVERSED' | 'REVIEW_REQUIRED'
    amountKobo: number | null
    updatedAt: string
    completedAt: string | null
  } | null
  order: {
    id: string
    createdAt: string
    buyer: { displayName: string | null }
  }
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
