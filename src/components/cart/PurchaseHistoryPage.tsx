import { useEffect, useState } from 'react'
import { Check, LoaderCircle, MapPin, PackageCheck, Printer, Truck } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import type { FulfillmentMethod, PurchaseOrder, PurchaseOrderItem } from '../../types'
import { CartApiError, confirmOrderItemReceived, getMyOrders } from '../../services/cartApi'
import { useCurrency } from '../../lib/CurrencyContext'
import { Button } from '../common/Button'

const fulfillmentLabel: Record<PurchaseOrderItem['fulfillmentStatus'], string> = {
  PENDING_HANDOFF: 'Awaiting seller fulfillment',
  READY_FOR_PICKUP: 'Ready for pickup',
  SHIPPED: 'Shipped',
  COMPLETED: 'Received',
}

export function PurchaseHistoryPage({ session, emailConfirmed, onRequestSignIn }: {
  session: Session | null
  emailConfirmed: boolean
  onRequestSignIn: () => void
}) {
  const { formatUsd } = useCurrency()
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(Boolean(session))
  const [error, setError] = useState('')
  const [errorRequestId, setErrorRequestId] = useState('')
  const [workingItemId, setWorkingItemId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null)

  useEffect(() => {
    if (!printingOrderId) return
    const afterPrint = () => setPrintingOrderId(null)
    window.addEventListener('afterprint', afterPrint)
    const timer = window.setTimeout(() => window.print(), 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', afterPrint)
    }
  }, [printingOrderId])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    void getMyOrders(session).then((items) => {
      if (!cancelled) setOrders(items)
    }).catch((caught: unknown) => {
      if (!cancelled) {
        setError(caught instanceof Error ? caught.message : 'Your orders could not be loaded.')
        setErrorRequestId(caught instanceof CartApiError ? caught.requestId ?? '' : '')
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [session, reloadKey])

  const confirmReceived = async (item: PurchaseOrderItem, orderId: string) => {
    if (!session) return
    setWorkingItemId(item.id)
    setError('')
    setErrorRequestId('')
    try {
      await confirmOrderItemReceived(item.id, session)
      setOrders((current) => current.map((order) => {
        if (order.id !== orderId) return order
        const items = order.items.map((orderItem) => orderItem.id === item.id
          ? { ...orderItem, fulfillmentStatus: 'COMPLETED' as const }
          : orderItem)
        return { ...order, items, status: items.every((orderItem) => orderItem.fulfillmentStatus === 'COMPLETED') ? 'COMPLETED' : order.status }
      }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Receipt could not be confirmed.')
      setErrorRequestId(caught instanceof CartApiError ? caught.requestId ?? '' : '')
    } finally {
      setWorkingItemId(null)
    }
  }

  return <section className="mx-auto min-w-0 max-w-4xl py-4 sm:py-8">
    <div className="mb-5"><p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-[#698572]">Buyer account</p><h1 className="font-display text-[30px] font-semibold text-[#1c2b26]">My orders</h1><p className="mt-1 text-sm text-[#819087]">Follow payment and pickup or shipping updates from each seller.</p></div>
    {error && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f0d7d2] bg-[#fff5f2] px-4 py-3 text-sm text-[#a34237]"><div><p>{error}</p>{errorRequestId && <p className="mt-1 text-xs">Support reference: {errorRequestId}</p>}</div>{session && <Button variant="secondary" onClick={() => { setLoading(true); setError(''); setErrorRequestId(''); setReloadKey((value) => value + 1) }} className="min-h-8 px-3 text-xs">Try again</Button>}</div>}
    {!session ? <div className="rounded-[18px] border border-[#e5eae6] bg-white px-6 py-12 text-center"><PackageCheck size={25} className="mx-auto text-[#6f8b76]" /><p className="mt-3 text-sm text-[#728178]">Sign in to see order tracking.</p><Button onClick={onRequestSignIn} className="mt-4">Sign in</Button></div>
      : loading ? <div className="grid min-h-48 place-items-center rounded-[18px] border border-[#e5eae6] bg-white"><LoaderCircle size={24} className="animate-spin text-[#6f8b76]" /></div>
        : orders.length === 0 ? <div className="rounded-[18px] border border-[#e5eae6] bg-white px-6 py-12 text-center"><PackageCheck size={25} className="mx-auto text-[#6f8b76]" /><p className="mt-3 text-sm text-[#728178]">Your paid orders will appear here.</p></div>
          : <div className="space-y-4">{orders.map((order) => <article key={order.id} data-print-receipt={printingOrderId === order.id ? 'true' : undefined} className={`overflow-hidden rounded-[18px] border border-[#e2e9e3] bg-white ${printingOrderId === order.id ? 'order-receipt-print' : ''}`}>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#edf1ed] px-4 py-4 sm:px-5"><div><p className="text-sm font-semibold text-[#30483a]">QuickResell · Order {order.id}</p><p className="mt-1 text-xs text-[#89958e]">Receipt date: {new Date(order.createdAt).toLocaleDateString()}</p></div><div className="no-print flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] ${order.paymentStatus === 'PAID' ? 'bg-[#e8f4eb] text-[#477358]' : 'bg-[#fff4df] text-[#9b7135]'}`}>{order.paymentStatus === 'PAID' ? 'Paid' : 'Payment not confirmed'}</span>{order.paymentStatus === 'PAID' && <Button variant="secondary" onClick={() => setPrintingOrderId(order.id)} icon={<Printer size={15} />} className="min-h-8 rounded-lg px-3 text-xs">Print receipt</Button>}</div><span className="hidden print:block text-xs font-bold uppercase tracking-[.08em] text-[#477358]">{order.paymentStatus === 'PAID' ? 'PAID RECEIPT' : 'PAYMENT NOT CONFIRMED'}</span></header>
            <div className="divide-y divide-[#edf1ed]">{order.items.map((item) => {
              const method: FulfillmentMethod | null = item.fulfillmentMethod
              const readyToConfirm = item.fulfillmentStatus === 'READY_FOR_PICKUP' || item.fulfillmentStatus === 'SHIPPED'
              return <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf4ed] text-[#587b62]">{method === 'SHIPPING' ? <Truck size={18} /> : method === 'PICKUP' ? <MapPin size={18} /> : <PackageCheck size={18} />}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#34483b]">{item.quantity} × {item.title}</p><p className="mt-1 text-xs text-[#829087]">Seller: {item.seller?.displayName || 'QuickResell seller'} · {fulfillmentLabel[item.fulfillmentStatus]}</p>{method === 'PICKUP' && item.fulfillmentStatus === 'READY_FOR_PICKUP' && <p className="mt-1 flex items-center gap-1 text-[11px] text-[#728178]"><MapPin size={12} />Contact the seller to arrange a public meetup.</p>}</div>
                <span className="text-sm font-semibold text-[#405549]">{formatUsd(item.unitPriceCents * item.quantity / 100)}</span>
                {readyToConfirm && <Button disabled={workingItemId === item.id || !emailConfirmed} onClick={() => void confirmReceived(item, order.id)} icon={<Check size={15} />} className="no-print min-h-9 px-3 text-xs">{workingItemId === item.id ? 'Saving…' : 'Confirm received'}</Button>}
              </div>
            })}</div>
            <footer className="flex justify-end border-t border-[#edf1ed] px-4 py-3 sm:px-5"><span className="text-xs text-[#849087]">Subtotal <strong className="ml-2 text-sm text-[#33483a]">{formatUsd(order.subtotalCents / 100)}</strong></span></footer>
          </article>)}</div>}
    {session && !emailConfirmed && <p className="mt-4 text-xs text-[#89958e]">Confirm your email before marking a pickup or delivery as received.</p>}
  </section>
}
