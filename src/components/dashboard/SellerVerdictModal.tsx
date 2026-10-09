import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react'
import type { Auction, Verdict } from '../../types'
import { Button } from '../common/Button'
import { Modal } from '../common/Modal'
import { useCurrency } from '../../lib/CurrencyContext'

export function SellerVerdictModal({ auction, open, onClose, onSubmit }: { auction: Auction | null; open: boolean; onClose: () => void; onSubmit: (decision: Verdict) => Promise<void> }) {
  const { formatUsd } = useCurrency()
  const currency = { format: (amount: number) => formatUsd(amount, 2) }
  const [decision, setDecision] = useState<Verdict | null>(null)
  const [error, setError] = useState('')
  const submit = async (value: Verdict) => {
    setDecision(value); setError('')
    try { await onSubmit(value); onClose() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Your verdict could not be submitted.') }
    finally { setDecision(null) }
  }
  return <Modal open={open && Boolean(auction)} onClose={onClose} title="Confirm the winning bid">{auction && <div>
    <div className="flex gap-4"><img src={auction.image} alt="" className="size-20 shrink-0 rounded-xl object-cover" loading="lazy" decoding="async" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#31443a]">{auction.title}</p><p className="mt-1 text-xs text-[#819087]">Winning bid from {auction.bids[0]?.bidder.displayName ?? 'the highest bidder'}</p><p className="font-display mt-1 text-[25px] font-bold text-[#20352d]">{currency.format(auction.currentHighestBid)}</p></div></div>
    <div className="mt-3 rounded-xl border border-[#e4eae4] bg-white p-3 text-xs text-[#66776d]">{auction.platformFeeEnabled ? <><div className="flex justify-between gap-3"><span>QuickResell fee</span><span className="font-semibold text-[#405549]">{currency.format((auction.platformFeeCents ?? 0) / 100)}</span></div><div className="mt-2 flex justify-between gap-3 border-t border-[#edf0ed] pt-2"><span>Estimated seller proceeds</span><span className="font-semibold text-[#2f6046]">{currency.format(auction.currentHighestBid - (auction.platformFeeCents ?? 0) / 100)}</span></div></> : <p>No QuickResell platform fee applies to this auction.</p>}</div>
    <div className="mt-5 rounded-xl bg-[#f2f7f3] p-4"><div className="flex gap-2.5"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-[#4f8067]" /><div><p className="text-xs font-bold text-[#385a48]">Accepting protects your seller record</p><p className="mt-1 text-xs leading-5 text-[#6e8176]">Accepting marks the listing sold and adds 5 trust points. Rejecting freezes the listing and removes 20 trust points.</p></div></div></div>
    {error && <p role="alert" className="mt-3 text-xs font-medium text-[#c7473c]">{error}</p>}
    <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2"><Button disabled={decision !== null} onClick={() => void submit('ACCEPT')} icon={<CheckCircle2 size={16} />} className="py-3">{decision === 'ACCEPT' ? 'Saving…' : 'Accept highest bid'}</Button><Button variant="danger" disabled={decision !== null} onClick={() => void submit('REJECT')} icon={<AlertTriangle size={16} />} className="py-3">{decision === 'REJECT' ? 'Saving…' : 'Reject bid'}</Button></div>
    <button type="button" onClick={onClose} className="mt-4 w-full py-2 text-xs font-semibold text-[#89958f] hover:text-[#35473f]">Decide later</button>
  </div>}</Modal>
}
