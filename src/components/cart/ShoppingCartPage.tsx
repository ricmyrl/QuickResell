import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Clock3, CreditCard, LoaderCircle, LockKeyhole, MapPin, PackageCheck, ShieldCheck, ShoppingCart, Trash2, WalletCards } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Session } from '@supabase/supabase-js'
import type { AuctionStatus, PurchaseOrder, ShoppingCartItem } from '../../types'
import { useCountdown } from '../../hooks/useCountdown'
import { Button } from '../common/Button'
import { useCurrency } from '../../lib/CurrencyContext'
import { getWallet } from '../../services/cartApi'

function AuctionCartCountdown({ endsAt, status }: { endsAt: string; status: AuctionStatus }) {
  const countdown = useCountdown(endsAt)
  const timeRemaining = countdown.days > 0
    ? `${countdown.days}d ${String(countdown.hours).padStart(2, '0')}h ${String(countdown.minutes).padStart(2, '0')}m`
    : `${String(countdown.hours).padStart(2, '0')}:${String(countdown.minutes).padStart(2, '0')}:${String(countdown.seconds).padStart(2, '0')}`

  if (status !== 'ACTIVE') {
    return <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e8e5] bg-white/75 px-2 py-1 text-[10px] font-semibold text-[#707c75]">
      <Clock3 size={12} />
      {status === 'PENDING_APPROVAL' ? 'Timer ended · awaiting seller decision' : status === 'SOLD' ? 'Auction won' : status === 'REJECTED' ? 'Auction closed · not sold' : 'Auction ended'}
    </span>
  }

  return <span role="timer" aria-label={countdown.expired ? 'Auction timer ended' : `${timeRemaining} remaining in this auction`} className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold tabular-nums ${countdown.expired ? 'border-[#f0d7d2] bg-[#fff5f2] text-[#a34237]' : 'border-[#e6eae5] bg-white/75 text-[#53665a]'}`}>
    <Clock3 size={12} />
    {countdown.expired ? 'Timer ended · awaiting result' : `${timeRemaining} left`}
  </span>
}

export function ShoppingCartPage({ items, loading, error, session, onShop, onOpenWallet, onSetQuantity, onRemove, onCheckout, onRefresh }: {
  items: ShoppingCartItem[]
  loading: boolean
  error: string
  session: Session | null
  onShop: () => void
  onOpenWallet: () => void
  onSetQuantity: (postId: string, quantity: number) => Promise<void>
  onRemove: (postId: string) => Promise<void>
  onCheckout: (method: 'PAYSTACK' | 'WALLET') => Promise<PurchaseOrder | null>
  onRefresh: () => Promise<void>
}) {
  const { formatUsd } = useCurrency()
  const currency = { format: formatUsd }
  const [busy, setBusy] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [order, setOrder] = useState<PurchaseOrder | null>(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'PAYSTACK' | 'WALLET'>('PAYSTACK')
  const [orderPaymentMethod, setOrderPaymentMethod] = useState<'PAYSTACK' | 'WALLET'>('PAYSTACK')
  const [walletBalanceCents, setWalletBalanceCents] = useState<number | null>(null)
  const [walletLoading, setWalletLoading] = useState(false)
  const [walletLoadError, setWalletLoadError] = useState('')
  const checkoutItems = items.filter((item) => item.available)
  const lockedAuctionCount = items.filter((item) => item.auction && !item.available).length
  const unavailableCount = items.filter((item) => !item.available && !item.auction).length
  const subtotalCents = checkoutItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0)

  useEffect(() => {
    if (!checkoutOpen || !session) return
    let cancelled = false
    setWalletLoading(true)
    setWalletLoadError('')
    void getWallet(session).then((wallet) => {
      if (!cancelled) setWalletBalanceCents(wallet.balanceCents)
    }).catch((caught: unknown) => {
      if (!cancelled) setWalletLoadError(caught instanceof Error ? caught.message : 'Your wallet balance could not be loaded.')
    }).finally(() => {
      if (!cancelled) setWalletLoading(false)
    })
    return () => { cancelled = true }
  }, [checkoutOpen, session])

  const changeQuantity = async (postId: string, quantity: number) => {
    setWorkingId(postId); setNotice('')
    try { await onSetQuantity(postId, quantity) }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : 'Quantity could not be updated.') }
    finally { setWorkingId(null) }
  }
  const removeItem = async (postId: string) => {
    setWorkingId(postId); setNotice('')
    try { await onRemove(postId) }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : 'Item could not be removed.') }
    finally { setWorkingId(null) }
  }
  const submitOrder = async () => {
    if (!checkoutOpen) {
      setCheckoutOpen(true)
      return
    }
    setBusy(true); setNotice('')
    try {
      const completedOrder = await onCheckout(paymentMethod)
      if (completedOrder) {
        setOrderPaymentMethod(paymentMethod)
        setOrder(completedOrder)
      }
    }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : 'Your order could not be placed.') }
    finally { setBusy(false) }
  }

  if (checkoutOpen) return <section className="mx-auto max-w-[920px] py-5 sm:py-10">
    <button type="button" onClick={() => setCheckoutOpen(false)} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#6f8078] transition hover:text-[#263b33]">
      <ArrowLeft size={16} />Back to cart
    </button>
    <div className="grid overflow-hidden rounded-[24px] border border-[#e2e9e3] bg-white shadow-[0_24px_80px_rgba(31,54,43,.08)] md:grid-cols-[1.1fr_.9fr]">
      <div className="p-6 sm:p-9">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-[#d4f06b] text-[#253b32]"><CreditCard size={22} /></div>
        <p className="mt-6 text-[11px] font-bold uppercase tracking-[.16em] text-[#658371]">Secure checkout</p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-[-.03em] text-[#20372d]">Review your payment</h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-[#7b8880]">Choose your QuickResell wallet balance or pay securely through Paystack.</p>

        <div className="mt-7 rounded-2xl border border-[#e8eee9] bg-[#f8faf8] p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-white text-[#315f49] shadow-sm"><LockKeyhole size={17} /></span>
            <div><p className="text-sm font-semibold text-[#30483a]">{paymentMethod === 'WALLET' ? 'QuickResell wallet' : 'Protected by Paystack'}</p><p className="mt-0.5 text-xs text-[#829087]">{paymentMethod === 'WALLET' ? 'Paid securely from your available balance' : 'Card details are entered with Paystack, never stored here'}</p></div>
            <span className="ml-auto rounded-full bg-[#e8f4eb] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-[#477358]">Secure</span>
          </div>
        </div>

        <div className="mt-7 border-t border-[#edf0ed] pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#34483b]">Items ready for payment ({checkoutItems.reduce((sum, item) => sum + item.quantity, 0)})</h2>
            <button type="button" onClick={() => setCheckoutOpen(false)} className="text-xs font-semibold text-[#55765f] hover:underline">Edit cart</button>
          </div>
          <div className="max-h-48 space-y-3 overflow-y-auto pr-1">
            {checkoutItems.map((item) => <div key={item.postId} className="flex items-center gap-3">
              <img src={item.post.image} alt="" className="size-11 rounded-xl bg-[#f0f3f0] object-cover" loading="lazy" decoding="async" />
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#34483b]">{item.post.title}</p><p className="mt-0.5 text-[11px] text-[#87938c]">Qty {item.quantity}</p></div>
              <span className="text-xs font-semibold text-[#405549]">{currency.format(item.unitPriceCents * item.quantity / 100)}</span>
            </div>)}
          </div>
        </div>
      </div>

      <aside className="flex flex-col justify-between border-t border-[#e9eee9] bg-[#f7faf7] p-6 sm:p-9 md:border-l md:border-t-0">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.13em] text-[#7a8b80]">Order summary</p>
          <div className="mt-5 flex items-start justify-between gap-3">
            <span className="text-sm text-[#748279]">Subtotal</span>
            <span className="font-display text-lg font-semibold text-[#2b4035]">{currency.format(subtotalCents / 100)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs">
            <span className="text-[#829087]">Delivery</span><span className="font-semibold text-[#55735e]">Local pickup</span>
          </div>
          <div className="mt-5 border-t border-[#e3eae4] pt-5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-display text-base font-semibold text-[#34483b]">Total</span>
              <span className="font-display text-2xl font-bold tracking-[-.03em] text-[#20372d]">{currency.format(subtotalCents / 100)}</span>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-[#89958e]">{paymentMethod === 'WALLET' ? 'The amount will be deducted from your naira wallet balance.' : 'Paystack will charge the displayed total in naira.'}</p>
          </div>
          <fieldset className="mt-5 space-y-2">
            <legend className="mb-2 text-xs font-semibold text-[#53665a]">Choose payment method</legend>
            <button type="button" aria-pressed={paymentMethod === 'PAYSTACK'} onClick={() => setPaymentMethod('PAYSTACK')} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${paymentMethod === 'PAYSTACK' ? 'border-[#76917e] bg-white ring-1 ring-[#76917e]' : 'border-[#e2e9e3] bg-transparent hover:bg-white'}`}>
              <CreditCard size={17} className="text-[#456b54]" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#34483b]">Paystack</span><span className="mt-0.5 block text-xs text-[#829087]">Pay now by card or bank</span></span><span className={`size-4 rounded-full border ${paymentMethod === 'PAYSTACK' ? 'border-[5px] border-[#456b54]' : 'border-[#b8c2ba]'}`} />
            </button>
            <button type="button" aria-pressed={paymentMethod === 'WALLET'} disabled={walletLoading || walletBalanceCents === null} onClick={() => setPaymentMethod('WALLET')} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition disabled:cursor-wait disabled:opacity-60 ${paymentMethod === 'WALLET' ? 'border-[#76917e] bg-white ring-1 ring-[#76917e]' : 'border-[#e2e9e3] bg-transparent hover:bg-white'}`}>
              <WalletCards size={17} className="text-[#456b54]" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#34483b]">QuickResell wallet</span><span className="mt-0.5 block text-xs text-[#829087]">{walletLoading ? 'Loading balance…' : walletBalanceCents === null ? 'Wallet balance unavailable' : `Available: ${currency.format(walletBalanceCents / 100)}`}</span></span><span className={`size-4 rounded-full border ${paymentMethod === 'WALLET' ? 'border-[5px] border-[#456b54]' : 'border-[#b8c2ba]'}`} />
            </button>
          </fieldset>
          {walletLoadError && <div role="alert" className="mt-3 rounded-lg border border-[#f0d7d2] bg-[#fff5f2] p-3 text-xs text-[#9c493d]">{walletLoadError}<Button variant="secondary" onClick={onOpenWallet} className="ml-2 min-h-7 px-2 text-xs">Open wallet</Button></div>}
          {walletBalanceCents !== null && walletBalanceCents < subtotalCents && <p className="mt-2 text-xs text-[#8a6b38]">Your wallet needs {currency.format((subtotalCents - walletBalanceCents) / 100)} more to cover this order. Add funds in Wallet or choose Paystack.</p>}
        </div>
        <div className="mt-8">
          <Button disabled={busy || unavailableCount > 0 || items.length === 0 || walletLoading || (paymentMethod === 'WALLET' && (walletBalanceCents === null || walletBalanceCents < subtotalCents))} onClick={() => void submitOrder()} icon={busy ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />} className="w-full justify-center py-3.5">
            {busy ? paymentMethod === 'WALLET' ? 'Paying from wallet…' : 'Opening secure payment…' : paymentMethod === 'WALLET' ? 'Pay with wallet' : 'Continue to Paystack'}
          </Button>
          {unavailableCount > 0 && <p className="mt-3 text-xs font-medium text-[#b34439]">Remove unavailable items to continue.</p>}
          {lockedAuctionCount > 0 && <p className="mt-3 text-xs leading-5 text-[#748279]">{lockedAuctionCount} auction {lockedAuctionCount === 1 ? 'item is' : 'items are'} locked until the auction ends and the seller confirms your win.</p>}
          <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-4 text-[#929d96]"><ShieldCheck size={12} className="mt-0.5 shrink-0" />After successful payment, your order is recorded and you can arrange pickup with the seller.</p>
        </div>
      </aside>
    </div>
  </section>

  if (order) return <section className="mx-auto max-w-[760px] py-8"><button type="button" onClick={() => { setOrder(null); onShop() }} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#6f8078] hover:text-[#263b33]"><ArrowLeft size={16} />Back to shop</button><motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-[20px] border border-[#dfebe0] bg-white p-6 sm:p-9"><span className="grid size-12 place-items-center rounded-2xl bg-[#eaf5e9] text-[#4c8056]"><CheckCircle2 size={24} /></span><p className="mt-5 text-xs font-bold uppercase tracking-[.13em] text-[#63836c]">Order placed</p><h1 className="font-display mt-2 text-3xl font-semibold text-[#233b2f]">Your campus order is in.</h1><p className="mt-2 text-sm leading-6 text-[#748279]">Payment was made using {orderPaymentMethod === 'WALLET' ? 'your QuickResell wallet' : 'Paystack'}. Coordinate pickup or shipping with each seller from My Orders.</p><div className="mt-6 rounded-xl bg-[#f6f8f6] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-[#76847b]">Order reference</span><span className="font-mono text-xs font-bold text-[#425c4a]">{order.id}</span></div><div className="mt-3 flex items-center justify-between border-t border-[#e8ede9] pt-3"><span className="text-sm font-semibold text-[#53645a]">Order subtotal</span><span className="font-display text-xl font-bold text-[#263b33]">{currency.format(order.subtotalCents / 100)}</span></div></div><div className="mt-5 space-y-2">{order.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 text-xs"><span className="min-w-0 flex-1 truncate text-[#6d7c73]">{item.quantity} × {item.title}</span><span className="font-semibold text-[#405549]">{currency.format(item.unitPriceCents * item.quantity / 100)}</span></div>)}</div><div className="mt-6 flex items-start gap-2 rounded-xl border border-[#e6ece7] p-3 text-xs leading-5 text-[#78867e]"><MapPin size={15} className="mt-0.5 shrink-0 text-[#71917a]" />Keep exchanges on campus and agree on a public meetup spot with each seller.</div><Button onClick={() => { setOrder(null); onShop() }} className="mt-6">Continue shopping</Button></motion.div></section>

  return <section className="min-w-0"><div className="mb-5 flex items-end justify-between gap-3"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-[#698572]">Your order</p><h1 className="font-display text-[30px] font-semibold tracking-[-.03em] text-[#1c2b26]">Shopping cart <span className="text-lg font-medium text-[#859189]">({items.length} {items.length === 1 ? 'item' : 'items'})</span></h1></div><button type="button" onClick={onShop} className="hidden items-center gap-1.5 text-xs font-semibold text-[#57765f] hover:text-[#334d3a] sm:inline-flex"><ArrowLeft size={14} />Continue shopping</button></div>
    {notice && <div role="alert" className="mb-4 rounded-xl border border-[#f0d7d2] bg-[#fff5f2] px-4 py-3 text-sm text-[#a34237]">{notice}{error && <button type="button" onClick={() => void onRefresh()} className="ml-2 font-semibold underline">Refresh cart</button>}</div>}
    {error && <div role="alert" className="mb-4 rounded-xl border border-[#f0d7d2] bg-[#fff5f2] px-4 py-3 text-sm text-[#a34237]">{error}<button type="button" onClick={() => void onRefresh()} className="ml-2 font-semibold underline">Try again</button></div>}
    {loading ? <div className="grid min-h-72 place-items-center rounded-[18px] border border-[#e5eae6] bg-white"><LoaderCircle size={25} className="animate-spin text-[#6f8b76]" /></div> : items.length === 0 ? <div className="rounded-[18px] border border-[#e5eae6] bg-white px-6 py-16 text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#edf4ed] text-[#63846d]"><ShoppingCart size={23} /></span><h2 className="font-display mt-4 text-xl font-semibold text-[#2a4035]">Your cart is empty</h2><p className="mt-1 text-sm text-[#849189]">Shop fixed-price listings or bid on an auction to see items here.</p><Button onClick={onShop} className="mt-5">Browse the campus shop</Button></div> : <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]"><div className="overflow-hidden rounded-[18px] border border-[#e4eae5] bg-white"><div className="flex items-center justify-between border-b border-[#edf0ed] px-5 py-4"><h2 className="font-display text-base font-semibold text-[#2d4036]">Items in your cart</h2><span className="text-xs text-[#849189]">Price</span></div><div className="divide-y divide-[#edf0ed]">{items.map((item) => {
      const lockedAuction = Boolean(item.auction && !item.available)
      const auctionStatus = item.auction?.status
      const lockMessage = item.available && item.auction
        ? 'Auction won · ready for payment'
        : auctionStatus === 'PENDING_APPROVAL'
          ? item.auction?.isHighestBidder ? 'You’re the highest bidder · awaiting seller approval' : 'Auction ended · awaiting seller decision'
          : item.auction?.isHighestBidder
            ? 'You’re leading · locked until the auction timer ends'
            : 'Bidding active · locked until the auction ends'
      return <article key={item.postId} aria-disabled={lockedAuction} className={`grid grid-cols-[92px_minmax(0,1fr)] gap-3 p-4 transition-opacity sm:grid-cols-[132px_minmax(0,1fr)_112px] sm:gap-4 sm:p-5 ${lockedAuction ? 'bg-[#f5f6f5] opacity-55 grayscale' : ''}`}>
        <img src={item.post.image} alt={item.post.title} className="h-[92px] w-[92px] rounded-xl object-cover sm:h-[120px] sm:w-[132px]" loading="lazy" decoding="async" />
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold leading-5 text-[#2b4036] sm:text-base">{item.post.title}</h3>
          <p className="mt-1 line-clamp-1 text-xs text-[#819087]">Sold by {item.post.seller.displayName} · {item.post.location}</p>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#6d816f]"><ShieldCheck size={12} />{Math.round(item.post.seller.trustScore)} seller trust</div>
          {item.auction
            ? <div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold text-[#748279]">{lockMessage}</span>{lockedAuction && <AuctionCartCountdown endsAt={item.auction.endsAt} status={item.auction.status} />}</div>
            : <p className="mt-2 text-[10px] text-[#849189]">{item.available ? `${item.post.quantityAvailable} available` : 'Currently unavailable'}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {item.auction
              ? <span className="text-xs font-semibold text-[#63756a]">Qty {item.quantity}</span>
              : <label className="relative inline-flex h-8 items-center"><span className="sr-only">Quantity</span><select value={item.quantity} disabled={workingId === item.postId || !item.available} onChange={(event) => void changeQuantity(item.postId, Number(event.target.value))} className="app-select h-8 rounded-lg border border-[#dfe7e1] bg-[#f8faf8] pl-2.5 pr-7 text-xs font-semibold text-[#405549] outline-none focus:border-[#94ae9b]">{Array.from({ length: Math.min(item.post.quantityAvailable, 50) }, (_, index) => index + 1).map((quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}</select><ChevronDown size={13} className="pointer-events-none absolute right-2 text-[#718078]" /></label>}
            <button type="button" disabled={workingId === item.postId} onClick={() => void removeItem(item.postId)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#6c7b72] hover:text-[#bd473b]"><Trash2 size={13} />Delete</button>
          </div>
        </div>
        <div className="col-span-2 flex items-center justify-between sm:col-span-1 sm:block sm:text-right"><span className="font-display text-base font-bold text-[#263b33]">{currency.format(item.unitPriceCents * item.quantity / 100)}</span><span className="ml-3 text-[10px] text-[#849189] sm:mt-1 sm:block">{item.auction ? 'Current bid' : `${currency.format(item.unitPriceCents / 100)} each`}</span></div>
      </article>
    })}</div></div>
      <aside className="rounded-[18px] border border-[#e4eae5] bg-white p-5"><div className="flex items-center gap-2 text-xs font-semibold text-[#54755d]"><PackageCheck size={15} />Campus handoff</div><p className="mt-1 text-[11px] leading-5 text-[#829087]">Pay securely with Paystack after a seller confirms your auction win. Arrange pickup or shipping with the seller after checkout.</p><div className="mt-4 border-t border-[#edf0ed] pt-4"><div className="flex justify-between gap-3 text-sm"><span className="text-[#66766e]">Ready to pay ({checkoutItems.reduce((sum, item) => sum + item.quantity, 0)} items)</span><span className="font-semibold text-[#263b33]">{currency.format(subtotalCents / 100)}</span></div><div className="mt-2 flex justify-between gap-3 text-xs"><span className="text-[#829087]">Campus delivery</span><span className="font-semibold text-[#55735e]">Pickup / shipping</span></div><div className="mt-4 flex justify-between gap-3 border-t border-[#edf0ed] pt-4"><span className="font-display font-semibold text-[#34483b]">Payable subtotal</span><span className="font-display text-lg font-bold text-[#263b33]">{currency.format(subtotalCents / 100)}</span></div></div>{lockedAuctionCount > 0 && <p className="mt-3 text-xs leading-5 text-[#748279]">{lockedAuctionCount} auction {lockedAuctionCount === 1 ? 'item is' : 'items are'} locked while bidding is active or awaiting seller approval. Locked items will not be charged.</p>}{unavailableCount > 0 && <p className="mt-3 text-xs font-medium text-[#b34439]">Remove {unavailableCount} unavailable {unavailableCount === 1 ? 'item' : 'items'} to continue.</p>}<Button disabled={busy || unavailableCount > 0 || checkoutItems.length === 0} onClick={() => void submitOrder()} className="mt-5 w-full py-3">{busy ? 'Opening secure payment…' : 'Continue to Paystack'}</Button><p className="mt-3 flex items-start gap-1.5 text-[10px] leading-4 text-[#929d96]"><ShieldCheck size={12} className="mt-0.5 shrink-0" />Only available fixed-price items and seller-approved auction wins are charged. Paystack displays the final amount before you approve.</p></aside></div>}
  </section>
}
