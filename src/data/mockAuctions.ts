import type { Auction } from '../types'

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()
const recent = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

export const mockAuctions: Auction[] = [
  {
    id: 'room-camera', postId: 'post-camera', sellerId: 'seller-jules', title: 'Fujifilm X100V · silver', description: 'Barely used, includes the original strap, two batteries, and a soft case. Meet at the student union.', category: 'Tech', location: 'North Campus', image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=85', startingPrice: 650, currentHighestBid: 735, endsAt: inMinutes(4), status: 'ACTIVE', isPublic: true,
    seller: { id: 'seller-jules', displayName: 'Jules M.', avatarUrl: 'https://i.pravatar.cc/96?img=47', trustScore: 98, completedAuctions: 16 }, highestBidderId: 'buyer-aria', bids: [
      { id: 'bid-1', amount: 735, createdAt: recent(1), bidder: { id: 'buyer-aria', displayName: 'Aria K.', avatarUrl: 'https://i.pravatar.cc/96?img=44' } },
      { id: 'bid-2', amount: 720, createdAt: recent(2), bidder: { id: 'buyer-theo', displayName: 'Theo R.', avatarUrl: 'https://i.pravatar.cc/96?img=12' } },
      { id: 'bid-3', amount: 700, createdAt: recent(3), bidder: { id: 'buyer-aria', displayName: 'Aria K.', avatarUrl: 'https://i.pravatar.cc/96?img=44' } },
    ], noReserve: true,
  },
  {
    id: 'room-bike', postId: 'post-bike', sellerId: 'seller-nico', title: 'Trek FX 2 Disc · size M', description: 'Commuter-ready hybrid with recent tune-up and a new rear tire. Lock included.', category: 'Campus life', location: 'West Quad', image: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1200&q=85', startingPrice: 180, currentHighestBid: 245, endsAt: inMinutes(18), status: 'ACTIVE', isPublic: true,
    seller: { id: 'seller-nico', displayName: 'Nico P.', avatarUrl: 'https://i.pravatar.cc/96?img=13', trustScore: 92, completedAuctions: 8 }, highestBidderId: 'buyer-maya', bids: [
      { id: 'bid-4', amount: 245, createdAt: recent(4), bidder: { id: 'buyer-maya', displayName: 'Maya L.', avatarUrl: 'https://i.pravatar.cc/96?img=49' } },
      { id: 'bid-5', amount: 230, createdAt: recent(8), bidder: { id: 'buyer-lee', displayName: 'Lee C.', avatarUrl: 'https://i.pravatar.cc/96?img=33' } },
    ],
  },
  {
    id: 'room-chair', postId: 'post-chair', sellerId: 'seller-sam', title: 'Herman Miller Sayl chair', description: 'Great condition, ergonomic mesh back. Pickup from Cedar Hall lobby.', category: 'Home', location: 'Cedar Hall', image: 'https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=1200&q=85', startingPrice: 220, currentHighestBid: 310, endsAt: inMinutes(42), status: 'ACTIVE', isPublic: true,
    seller: { id: 'seller-sam', displayName: 'Sam W.', trustScore: 88, completedAuctions: 5 }, highestBidderId: 'buyer-ezra', bids: [
      { id: 'bid-6', amount: 310, createdAt: recent(7), bidder: { id: 'buyer-ezra', displayName: 'Ezra D.', avatarUrl: 'https://i.pravatar.cc/96?img=68' } },
      { id: 'bid-7', amount: 280, createdAt: recent(15), bidder: { id: 'buyer-aria', displayName: 'Aria K.', avatarUrl: 'https://i.pravatar.cc/96?img=44' } },
    ], noReserve: true,
  },
  {
    id: 'room-textbook', postId: 'post-textbook', sellerId: 'seller-ellie', title: 'Organic Chemistry 2e bundle', description: 'Textbook, problem workbook, and a neatly tabbed reaction map. No highlighting.', category: 'Books', location: 'East Campus', image: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=1200&q=85', startingPrice: 45, currentHighestBid: 68, endsAt: inMinutes(9), status: 'ACTIVE', isPublic: true,
    seller: { id: 'seller-ellie', displayName: 'Ellie T.', trustScore: 100, completedAuctions: 24 }, highestBidderId: 'buyer-tess', bids: [
      { id: 'bid-8', amount: 68, createdAt: recent(2), bidder: { id: 'buyer-tess', displayName: 'Tess B.', avatarUrl: 'https://i.pravatar.cc/96?img=5' } },
      { id: 'bid-9', amount: 62, createdAt: recent(6), bidder: { id: 'buyer-lee', displayName: 'Lee C.', avatarUrl: 'https://i.pravatar.cc/96?img=33' } },
    ],
  },
  {
    id: 'room-lamp', postId: 'post-lamp', sellerId: 'seller-jordan', title: 'Anglepoise desk lamp', description: 'Original-style metal task lamp, warm LED bulb included. Works perfectly.', category: 'Home', location: 'South Campus', image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1200&q=85', startingPrice: 30, currentHighestBid: 54, endsAt: inMinutes(26), status: 'ACTIVE', isPublic: true,
    seller: { id: 'seller-jordan', displayName: 'Jordan L.', avatarUrl: 'https://i.pravatar.cc/96?img=32', trustScore: 96, completedAuctions: 12 }, highestBidderId: 'buyer-kai', bids: [
      { id: 'bid-10', amount: 54, createdAt: recent(9), bidder: { id: 'buyer-kai', displayName: 'Kai N.', avatarUrl: 'https://i.pravatar.cc/96?img=60' } },
    ], noReserve: true,
  },
  {
    id: 'room-speaker', postId: 'post-speaker', sellerId: 'seller-milo', title: 'Marshall Emberton II', description: 'Portable Bluetooth speaker with up to 30 hours of battery. Clean, boxed, ready to go.', category: 'Tech', location: 'North Campus', image: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=1200&q=85', startingPrice: 80, currentHighestBid: 112, endsAt: inMinutes(65), status: 'ACTIVE', isPublic: true,
    seller: { id: 'seller-milo', displayName: 'Milo A.', trustScore: 84, completedAuctions: 3 }, highestBidderId: 'buyer-zoe', bids: [
      { id: 'bid-11', amount: 112, createdAt: recent(3), bidder: { id: 'buyer-zoe', displayName: 'Zoe H.', avatarUrl: 'https://i.pravatar.cc/96?img=25' } },
    ],
  },
]

export const mockSellerAuctions: Auction[] = [
  { ...mockAuctions[4], id: 'seller-room-pending', sellerId: 'demo-seller', status: 'PENDING_APPROVAL', endsAt: new Date(Date.now() - 120_000).toISOString() },
  { ...mockAuctions[2], id: 'seller-room-active', sellerId: 'demo-seller' },
]
