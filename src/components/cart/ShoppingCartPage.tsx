import { useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronDown, LoaderCircle, MapPin, PackageCheck, ShieldCheck, ShoppingCart, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import type { PurchaseOrder, ShoppingCartItem } from '../../types'
import { Button } from '../common/Button'
import { useCurrency } from '../../lib/CurrencyContext'

export function ShoppingCartPage({ items, loading, error, onShop, onSetQuantity, onRemove, onCheckout, onRefresh }: {
  items: ShoppingCartItem[]
  loading: boolean
  error: string
  onShop: () => void
  onSetQuantity: (postId: string, quantity: number) => Promise<void>
  onRemove: (postId: string) => Promise<void>
  onCheckout: () => Promise<PurchaseOrder>
  onRefresh: () => Promise<void>
}) {
  const { formatUsd } = useCurrency()
  const currency = { format: formatUsd }
  const [busy, setBusy] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [order, setOrder] = useState<PurchaseOrder | null>(null)
  const subtotalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0)
  const unavailableCount = items.filter((item) => !item.available).length

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
    setBusy(true); setNotice('')
    try { setOrder(await onCheckout()) }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : 'Your order could not be placed.') }
    finally { setBusy(false) }
  }

  if (order) return <section className="mx-auto max-w-[760px] py-8"><button type="button" onClick={() => { setOrder(null); onShop() }} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#6f8078] hover:text-[#263b33]"><ArrowLeft size={16} />Back to shop</button><motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-[20px] border border-[#dfebe0] bg-white p-6 sm:p-9"><span className="grid size-12 place-items-center rounded-2xl bg-[#eaf5e9] text-[#4c8056]"><CheckCircle2 size={24} /></span><p className="mt-5 text-xs font-bold uppercase tracking-[.13em] text-[#63836c]">Order placed</p><h1 className="font-display mt-2 text-3xl font-semibold text-[#233b2f]">Your campus order is in.</h1><p className="mt-2 text-sm leading-6 text-[#748279]">Inventory has been reserved. Coordinate pickup and payment directly with each seller.</p><div className="mt-6 rounded-xl bg-[#f6f8f6] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-[#76847b]">Order reference</span><span className="font-mono text-xs font-bold text-[#425c4a]">{order.id}</span></div><div className="mt-3 flex items-center justify-between border-t border-[#e8ede9] pt-3"><span className="text-sm font-semibold text-[#53645a]">Order subtotal</span><span className="font-display text-xl font-bold text-[#263b33]">{currency.format(order.subtotalCents / 100)}</span></div></div><div className="mt-5 space-y-2">{order.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 text-xs"><span className="min-w-0 flex-1 truncate text-[#6d7c73]">{item.quantity} × {item.title}</span><span className="font-semibold text-[#405549]">{currency.format(item.unitPriceCents * item.quantity / 100)}</span></div>)}</div><div className="mt-6 flex items-start gap-2 rounded-xl border border-[#e6ece7] p-3 text-xs leading-5 text-[#78867e]"><MapPin size={15} className="mt-0.5 shrink-0 text-[#71917a]" />Keep exchanges on campus and agree on a public meetup spot with each seller.</div><Button onClick={() => { setOrder(null); onShop() }} className="mt-6">Continue shopping</Button></motion.div></section>

  return <section className="min-w-0"><div className="mb-5 flex items-end justify-between gap-3"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-[#698572]">Your order</p><h1 className="font-display text-[30px] font-semibold tracking-[-.03em] text-[#1c2b26]">Shopping cart <span className="text-lg font-medium text-[#859189]">({items.length} {items.length === 1 ? 'item' : 'items'})</span></h1></div><button type="button" onClick={onShop} className="hidden items-center gap-1.5 text-xs font-semibold text-[#57765f] hover:text-[#334d3a] sm:inline-flex"><ArrowLeft size={14} />Continue shopping</button></div>
    {notice && <div role="alert" className="mb-4 rounded-xl border border-[#f0d7d2] bg-[#fff5f2] px-4 py-3 text-sm text-[#a34237]">{notice}{error && <button type="button" onClick={() => void onRefresh()} className="ml-2 font-semibold underline">Refresh cart</button>}</div>}
    {error && <div role="alert" className="mb-4 rounded-xl border border-[#f0d7d2] bg-[#fff5f2] px-4 py-3 text-sm text-[#a34237]">{error}<button type="button" onClick={() => void onRefresh()} className="ml-2 font-semibold underline">Try again</button></div>}
    {loading ? <div className="grid min-h-72 place-items-center rounded-[18px] border border-[#e5eae6] bg-white"><LoaderCircle size={25} className="animate-spin text-[#6f8b76]" /></div> : items.length === 0 ? <div className="rounded-[18px] border border-[#e5eae6] bg-white px-6 py-16 text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#edf4ed] text-[#63846d]"><ShoppingCart size={23} /></span><h2 className="font-display mt-4 text-xl font-semibold text-[#2a4035]">Your cart is empty</h2><p className="mt-1 text-sm text-[#849189]">Shop fixed-price listings and they’ll show up here.</p><Button onClick={onShop} className="mt-5">Browse the campus shop</Button></div> : <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]"><div className="overflow-hidden rounded-[18px] border border-[#e4eae5] bg-white"><div className="flex items-center justify-between border-b border-[#edf0ed] px-5 py-4"><h2 className="font-display text-base font-semibold text-[#2d4036]">Items in your cart</h2><span className="text-xs text-[#849189]">Price</span></div><div className="divide-y divide-[#edf0ed]">{items.map((item) => <article key={item.postId} className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 p-4 sm:grid-cols-[132px_minmax(0,1fr)_112px] sm:gap-4 sm:p-5"><img src={item.post.image} alt={item.post.title} className="h-[92px] w-[92px] rounded-xl object-cover sm:h-[120px] sm:w-[132px]" /><div className="min-w-0"><h3 className="font-display text-sm font-semibold leading-5 text-[#2b4036] sm:text-base">{item.post.title}</h3><p className="mt-1 line-clamp-1 text-xs text-[#819087]">Sold by {item.post.seller.displayName} · {item.post.location}</p><div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#6d816f]"><ShieldCheck size={12} />{Math.round(item.post.seller.trustScore)} seller trust</div><p className="mt-2 text-[10px] text-[#849189]">{item.available ? `${item.post.quantityAvailable} available` : 'Currently unavailable'}</p><div className="mt-3 flex flex-wrap items-center gap-3"><label className="relative inline-flex h-8 items-center"><span className="sr-only">Quantity</span><select value={item.quantity} disabled={workingId === item.postId || !item.available} onChange={(event) => void changeQuantity(item.postId, Number(event.target.value))} className="h-8 appearance-none rounded-lg border border-[#dfe7e1] bg-[#f8faf8] pl-2.5 pr-7 text-xs font-semibold text-[#405549] outline-none focus:border-[#94ae9b]">{Array.from({ length: Math.min(item.post.quantityAvailable, 50) }, (_, index) => index + 1).map((quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}</select><ChevronDown size={13} className="pointer-events-none absolute right-2 text-[#718078]" /></label><button type="button" disabled={workingId === item.postId} onClick={() => void removeItem(item.postId)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#6c7b72] hover:text-[#bd473b]"><Trash2 size={13} />Delete</button></div></div><div className="col-span-2 flex items-center justify-between sm:col-span-1 sm:block sm:text-right"><span className="font-display text-base font-bold text-[#263b33]">{currency.format(item.unitPriceCents * item.quantity / 100)}</span><span className="ml-3 text-[10px] text-[#849189] sm:mt-1 sm:block">{currency.format(item.unitPriceCents / 100)} each</span></div></article>)}</div></div>
      <aside className="rounded-[18px] border border-[#e4eae5] bg-white p-5"><div className="flex items-center gap-2 text-xs font-semibold text-[#54755d]"><PackageCheck size={15} />Campus handoff</div><p className="mt-1 text-[11px] leading-5 text-[#829087]">No shipping fee. Arrange pickup with the seller; Paystack checkout is charged in NGN at the current exchange rate.</p><div className="mt-4 border-t border-[#edf0ed] pt-4"><div className="flex justify-between gap-3 text-sm"><span className="text-[#66766e]">Subtotal ({items.reduce((sum, item) => sum + item.quantity, 0)} items)</span><span className="font-semibold text-[#263b33]">{currency.format(subtotalCents / 100)}</span></div><div className="mt-2 flex justify-between gap-3 text-xs"><span className="text-[#829087]">Campus delivery</span><span className="font-semibold text-[#55735e]">Pickup</span></div><div className="mt-4 flex justify-between gap-3 border-t border-[#edf0ed] pt-4"><span className="font-display font-semibold text-[#34483b]">Order subtotal</span><span className="font-display text-lg font-bold text-[#263b33]">{currency.format(subtotalCents / 100)}</span></div></div>{unavailableCount > 0 && <p className="mt-3 text-xs font-medium text-[#b34439]">Remove {unavailableCount} unavailable {unavailableCount === 1 ? 'item' : 'items'} to continue.</p>}<Button disabled={busy || unavailableCount > 0 || items.length === 0} onClick={() => void submitOrder()} className="mt-5 w-full py-3">{busy ? 'Reserving items…' : 'Place campus order'}</Button><p className="mt-3 flex items-start gap-1.5 text-[10px] leading-4 text-[#929d96]"><ShieldCheck size={12} className="mt-0.5 shrink-0" />Items are reserved when your order is placed. Paystack charges in NGN; coordinate pickup directly with sellers.</p></aside></div>}
  </section>
}
