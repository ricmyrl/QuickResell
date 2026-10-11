import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowDownToLine, ArrowUpRight, BadgeCheck, CircleDollarSign, Clock3, LoaderCircle, LockKeyhole, RefreshCw, WalletCards } from 'lucide-react'
import { Button } from '../common/Button'
import { CartApiError, cashOutSellerOrderItem, getWallet, reconcileSellerPayoutStatus, reconcileSellerWithdrawal, type SellerWalletWithdrawal, type WalletData, withdrawSellerEarnings } from '../../services/cartApi'
import type { SellerWalletPayout } from '../../types'
import { verifyPasskeyForAction } from '../../services/passkeyVerification'

const quickAmounts = [5000, 10000, 25000, 50000]
const ngnFormatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const transactionTitles = {
  TOP_UP: 'Wallet deposit',
  PURCHASE: 'Wallet checkout',
  SELLER_EARNING: 'Sale proceeds',
  CASHOUT: 'Seller cashout',
} as const
const emptyWallet: WalletData = {
  balanceCents: 0,
  withdrawals: [],
  transactions: [],
  sellerEarnings: {
    earnedCents: 0,
    pendingFulfillmentCents: 0,
    readyForCashoutCents: 0,
    paidOutCents: 0,
    legacyReconciliationCents: 0,
    payoutAccountVerified: false,
    payouts: [],
  },
}
const canCashOut = (payout: SellerWalletPayout) =>
  (payout.status === 'PENDING' || payout.status === 'BLOCKED')
  && payout.amountCents > 0
  && payout.withdrawnCents === 0
  && ['READY_FOR_PICKUP', 'SHIPPED', 'COMPLETED'].includes(payout.fulfillmentStatus)

function payoutStatusLabel(payout: SellerWalletPayout, payoutAccountVerified: boolean) {
  if (payout.withdrawnCents >= payout.amountCents) return 'Included in a wallet withdrawal'
  if (payout.withdrawnCents > 0) return 'Partially included in a wallet withdrawal'
  if (payout.status === 'NOT_TRACKED') {
    return payout.fulfillmentStatus === 'PENDING_HANDOFF'
      ? 'Awaiting fulfillment'
      : 'Legacy sale · payout needs reconciliation'
  }
  if (payout.status === 'SUCCESS') return 'Paid out'
  if (payout.status === 'PROCESSING') return 'Transfer processing'
  if (payout.status === 'REVIEW_REQUIRED') return 'Transfer needs review'
  if (payout.status === 'FAILED') return 'Transfer failed — contact support'
  if (payout.status === 'REVERSED') return 'Transfer reversed — contact support'
  if (payout.fulfillmentStatus === 'PENDING_HANDOFF') return 'Awaiting fulfillment'
  if (!payoutAccountVerified) return 'Verify payout account to cash out'
  return payout.status === 'BLOCKED' ? 'Payout blocked — contact support' : 'Ready to cash out'
}

export function WalletPage({ session, emailConfirmed, onRequestSignIn, onAddFunds, onRequestSellerVerification }: {
  session: Session | null
  emailConfirmed: boolean
  onRequestSignIn: () => void
  onAddFunds: (amountKobo: number) => Promise<void>
  onRequestSellerVerification: () => void
}) {
  const [wallet, setWallet] = useState<WalletData>(emptyWallet)
  const [amount, setAmount] = useState('5000')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [loading, setLoading] = useState(Boolean(session && emailConfirmed))
  const [busy, setBusy] = useState(false)
  const [withdrawBusy, setWithdrawBusy] = useState(false)
  const [cashoutBusyId, setCashoutBusyId] = useState<string | null>(null)
  const [reconcileBusyId, setReconcileBusyId] = useState<string | null>(null)
  const [reconcileWithdrawalBusyId, setReconcileWithdrawalBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const availableToWithdrawCents = Math.min(wallet.sellerEarnings.readyForCashoutCents, wallet.balanceCents)

  const refreshWallet = useCallback(async () => {
    if (!session || !emailConfirmed) return
    setLoading(true)
    setError('')
    try {
      setWallet(await getWallet(session))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your wallet could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [session, emailConfirmed])

  const cashOut = async (payout: SellerWalletPayout) => {
    if (!session || !canCashOut(payout) || !wallet.sellerEarnings.payoutAccountVerified) return
    setCashoutBusyId(payout.id)
    setError('')
    setNotice('')
    try {
      const result = await verifyPasskeyForAction(session, () => cashOutSellerOrderItem(payout.orderItemId, session))
      await refreshWallet()
      setNotice(
        result.status === 'SUCCESS'
          ? 'Paystack reports the transfer as successful. Check your bank account to confirm receipt.'
          : 'Cash-out requested. Refresh your wallet to see Paystack transfer updates.',
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The payout could not be requested.')
    } finally {
      setCashoutBusyId(null)
    }
  }

  const reconcilePayout = async (payout: SellerWalletPayout) => {
    if (!session) return
    setReconcileBusyId(payout.id)
    setError('')
    setNotice('')
    try {
      const result = await reconcileSellerPayoutStatus(payout.orderItemId, session)
      await refreshWallet()
      setNotice(
        result.status === 'SUCCESS'
          ? 'Paystack confirms this transfer succeeded. Check your bank account.'
          : result.status === 'FAILED'
            ? 'Paystack confirms this transfer failed. The amount has been returned to your wallet.'
            : result.status === 'REVERSED'
              ? 'Paystack confirms this transfer was reversed. The amount has been returned to your wallet.'
              : result.status === 'REVIEW_REQUIRED'
                ? 'Paystack still requires action on this transfer. Contact support; do not cash out again.'
                : 'Paystack reports that this transfer is still processing. Check again later.',
      )
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Paystack could not confirm the transfer status.'
      const requestId = caught instanceof CartApiError ? caught.requestId : undefined
      setError(requestId ? `${message} Support reference: ${requestId}` : message)
    } finally {
      setReconcileBusyId(null)
    }
  }

  const reconcileWithdrawal = async (withdrawal: SellerWalletWithdrawal) => {
    if (!session) return
    setReconcileWithdrawalBusyId(withdrawal.id)
    setError('')
    setNotice('')
    try {
      const result = await reconcileSellerWithdrawal(withdrawal.id, session)
      await refreshWallet()
      setNotice(
        result.status === 'SUCCESS'
          ? 'Paystack confirms this withdrawal succeeded. Check your bank account.'
          : result.status === 'FAILED'
            ? 'Paystack confirms this withdrawal failed. The amount has been returned to your wallet.'
            : result.status === 'REVERSED'
              ? 'Paystack confirms this withdrawal was reversed. The amount has been returned to your wallet.'
              : result.status === 'REVIEW_REQUIRED'
                ? 'Paystack still requires action on this withdrawal. Contact support; do not withdraw again.'
                : 'Paystack reports that this withdrawal is still processing. Check again later.',
      )
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Paystack could not confirm the withdrawal status.'
      const requestId = caught instanceof CartApiError ? caught.requestId : undefined
      setError(requestId ? `${message} Support reference: ${requestId}` : message)
    } finally {
      setReconcileWithdrawalBusyId(null)
    }
  }

  const withdraw = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session) {
      onRequestSignIn()
      return
    }
    if (!emailConfirmed) {
      setError('Confirm your email before withdrawing seller earnings.')
      return
    }
    if (!wallet.sellerEarnings.payoutAccountVerified) {
      setError('Verify your payout bank account before withdrawing seller earnings.')
      return
    }
    const normalizedAmount = withdrawAmount.trim()
    if (!/^\d+(\.\d{1,2})?$/.test(normalizedAmount)) {
      setError('Enter a withdrawal amount in naira with up to two decimal places.')
      return
    }
    const amountKobo = Math.round(Number(normalizedAmount) * 100)
    const availableCents = Math.min(wallet.sellerEarnings.readyForCashoutCents, wallet.balanceCents)
    if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) {
      setError('Enter a withdrawal amount greater than ₦0.00.')
      return
    }
    if (amountKobo > availableCents) {
      setError(`You can withdraw up to ${ngnFormatter.format(availableCents / 100)} from fulfilled seller earnings.`)
      return
    }

    setWithdrawBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await verifyPasskeyForAction(session, () => withdrawSellerEarnings(amountKobo, session))
      await refreshWallet()
      setWithdrawAmount('')
      setNotice(
        result.status === 'SUCCESS'
          ? 'Paystack reports your withdrawal as successful. Check your bank account to confirm receipt.'
          : result.status === 'FAILED'
            ? 'Paystack reports the withdrawal as failed. The amount has been returned to your wallet; contact support before trying again.'
            : result.status === 'REVERSED'
              ? 'Paystack reversed the withdrawal and the amount has been returned to your wallet. Contact support before trying again.'
          : result.status === 'REVIEW_REQUIRED'
            ? 'Your withdrawal was submitted and needs Paystack reconciliation. Contact support before retrying.'
            : 'Withdrawal requested. Paystack will update the transfer status shortly.',
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your seller earnings could not be withdrawn.')
    } finally {
      setWithdrawBusy(false)
    }
  }

  useEffect(() => {
    if (!session || !emailConfirmed) return
    let cancelled = false
    void getWallet(session).then((nextWallet) => {
      if (!cancelled) setWallet(nextWallet)
    }).catch((caught: unknown) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : 'Your wallet could not be loaded.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [session, emailConfirmed])

  const addFunds = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session) {
      onRequestSignIn()
      return
    }
    if (!emailConfirmed) {
      setError('Confirm your email before adding money to your wallet.')
      return
    }

    const normalizedAmount = amount.trim()
    if (!/^\d+(\.\d{1,2})?$/.test(normalizedAmount)) {
      setError('Enter an amount in naira with up to two decimal places.')
      return
    }
    const amountKobo = Math.round(Number(normalizedAmount) * 100)
    if (!Number.isSafeInteger(amountKobo) || amountKobo < 100) {
      setError('The minimum wallet deposit is ₦1.00.')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')
    try {
      await onAddFunds(amountKobo)
      try {
        setWallet(await getWallet(session))
        setNotice('Your wallet has been topped up.')
      } catch {
        setError('Your payment was verified, but the updated wallet balance could not be loaded. Refresh to check it.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your wallet could not be topped up.')
    } finally {
      setBusy(false)
    }
  }

  if (!session) {
    return <section className="mx-auto max-w-3xl rounded-[24px] border border-[#e2e9e3] bg-white p-8 text-center shadow-[0_24px_80px_rgba(31,54,43,.06)] sm:p-12">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#edf4ed] text-[#315f49]"><WalletCards size={25} /></span>
      <h1 className="font-display mt-5 text-2xl font-semibold text-[#20372d]">Your QuickResell wallet</h1>
      <p className="mt-2 text-sm leading-6 text-[#7b8880]">Sign in to view your balance and add money securely.</p>
      <Button onClick={onRequestSignIn} className="mt-6">Sign in to continue</Button>
    </section>
  }

  return <section className="mx-auto max-w-5xl">
    <div className="mb-6">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#658371]">Your account</p>
      <h1 className="font-display mt-1 text-3xl font-semibold tracking-[-.03em] text-[#20372d]">Wallet</h1>
      <p className="mt-2 text-sm text-[#7b8880]">Fund your wallet through Paystack in naira. Your balance and checkout are all in naira.</p>
    </div>

    {!emailConfirmed && <div role="status" className="mb-5 rounded-xl border border-[#ead9b0] bg-[#fff9e9] px-4 py-3 text-sm text-[#765b22]">Confirm your email before adding money to your wallet.</div>}

    <div className="grid gap-5 lg:grid-cols-[1fr_.9fr]">
      <section className="overflow-hidden rounded-[24px] bg-[#244638] p-6 text-white shadow-[0_20px_50px_rgba(31,54,43,.12)] sm:p-8">
        <div className="flex items-center justify-between">
          <span className="grid size-11 place-items-center rounded-2xl bg-white/10"><WalletCards size={21} /></span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.12em]">Available balance</span>
        </div>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[.12em] text-white/65">QuickResell wallet</p>
        {loading
          ? <div className="mt-2 flex h-10 items-center gap-2 text-sm text-white/75"><LoaderCircle size={16} className="animate-spin" />Loading balance…</div>
          : <p className="font-display mt-2 text-4xl font-semibold tracking-[-.04em]">{ngnFormatter.format(wallet.balanceCents / 100)}</p>}
        <div className="mt-8 flex items-center gap-2 border-t border-white/15 pt-4 text-xs text-white/70"><LockKeyhole size={14} />Payments are verified securely by Paystack.</div>
      </section>

      <form onSubmit={(event) => void addFunds(event)} className="rounded-[24px] border border-[#e2e9e3] bg-white p-6 shadow-[0_18px_50px_rgba(31,54,43,.05)] sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#f0f5ef] text-[#315f49]"><ArrowDownToLine size={19} /></span>
          <div><h2 className="text-base font-semibold text-[#2c4236]">Add money</h2><p className="mt-0.5 text-xs text-[#87938b]">Choose an amount to add to your balance.</p></div>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-2">
          {quickAmounts.map((quickAmount) => <button key={quickAmount} type="button" onClick={() => setAmount(String(quickAmount))} aria-pressed={amount === String(quickAmount)} className={`min-h-10 rounded-xl border text-sm font-semibold transition ${amount === String(quickAmount) ? 'border-[#76917e] bg-[#edf4ed] text-[#2d5d4c]' : 'border-[#e5ebe5] text-[#718078] hover:bg-[#f7f9f7]'}`}>₦{quickAmount.toLocaleString('en-NG')}</button>)}
        </div>

        <label htmlFor="wallet-amount" className="mt-5 block text-xs font-semibold text-[#53665a]">Custom amount (NGN)</label>
        <div className="mt-2 flex items-center rounded-xl border border-[#dfe7df] bg-[#fbfcfb] px-3 focus-within:border-[#90aa98]">
          <span className="text-sm font-semibold text-[#849189]">₦</span>
          <input id="wallet-amount" type="number" min="1" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy || !emailConfirmed} className="h-12 w-full bg-transparent px-2 text-base font-semibold text-[#263b33] outline-none disabled:opacity-60" />
        </div>
        <p className="mt-2 text-[11px] leading-5 text-[#8a9690]">The final payment is processed securely through Paystack in Nigerian naira.</p>

        {error && <p role="alert" className="mt-4 rounded-xl border border-[#f0d7d2] bg-[#fff5f2] px-3 py-2.5 text-xs leading-5 text-[#9c493d]">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-xl border border-[#d9eadc] bg-[#f1f8f1] px-3 py-2.5 text-xs text-[#477358]">{notice}</p>}

        <Button type="submit" disabled={busy || loading || !emailConfirmed} icon={busy ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowDownToLine size={16} />} className="mt-5 w-full justify-center">
          {busy ? 'Processing secure payment…' : 'Add money to wallet'}
        </Button>
      </form>
    </div>

    <section className="mt-7 overflow-hidden rounded-[22px] border border-[#e2e9e3] bg-white">
      <div className="border-b border-[#edf1ed] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#edf4ed] text-[#315f49]"><CircleDollarSign size={19} /></span>
          <div><h2 className="text-sm font-semibold text-[#30483a]">Seller earnings</h2><p className="mt-1 text-xs text-[#87938b]">Net proceeds from paid orders, separate from wallet deposits.</p></div>
        </div>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-5">
        {[
          { label: 'Total from paid orders', cents: wallet.sellerEarnings.earnedCents },
          { label: 'Awaiting fulfillment', cents: wallet.sellerEarnings.pendingFulfillmentCents },
          { label: 'Ready to cash out', cents: wallet.sellerEarnings.readyForCashoutCents },
          { label: 'Legacy · pending review', cents: wallet.sellerEarnings.legacyReconciliationCents },
          { label: 'Paid out', cents: wallet.sellerEarnings.paidOutCents },
        ].map((balance) => <div key={balance.label} className="rounded-xl border border-[#e8eee8] bg-[#f9fbf9] p-4">
          <p className="text-xs font-medium text-[#7d8981]">{balance.label}</p>
          {loading
            ? <div className="mt-2 h-7 animate-pulse rounded bg-[#edf1ed]" />
            : <p className="font-display mt-2 text-2xl font-semibold text-[#2a4034]">{ngnFormatter.format(balance.cents / 100)}</p>}
        </div>)}
      </div>
      {wallet.sellerEarnings.legacyReconciliationCents > 0 && <div role="status" className="mx-4 mb-4 rounded-xl border border-[#ead9b0] bg-[#fff9e9] px-4 py-3 text-xs leading-5 text-[#765b22] sm:mx-5">
        Legacy fulfilled sales totaling {ngnFormatter.format(wallet.sellerEarnings.legacyReconciliationCents / 100)} have no tracked payout record. They are not included in your withdrawable balance until their payout history has been checked against Paystack. Contact support to request reconciliation.
      </div>}
      {!wallet.sellerEarnings.payoutAccountVerified && wallet.sellerEarnings.readyForCashoutCents > 0 && <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ead9b0] bg-[#fff9e9] px-4 py-3 sm:mx-5">
        <p className="flex items-center gap-2 text-xs leading-5 text-[#765b22]"><LockKeyhole size={14} />Verify your payout bank account before cashing out these fulfilled sales.</p>
        <Button variant="secondary" onClick={onRequestSellerVerification} className="min-h-8 px-3 text-xs">Verify payout account <ArrowUpRight size={13} /></Button>
      </div>}
      <form onSubmit={(event) => void withdraw(event)} className="mx-4 mb-4 rounded-xl border border-[#dfe9df] bg-[#f8fbf8] p-4 sm:mx-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-sm font-semibold text-[#30483a]">Withdraw to bank</h3><p className="mt-1 text-xs leading-5 text-[#7d8981]">Choose any amount up to your fulfilled seller earnings available for withdrawal.</p></div>
          <p className="text-xs font-semibold text-[#477358]">Available: {ngnFormatter.format(availableToWithdrawCents / 100)}</p>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="seller-withdraw-amount">Withdrawal amount in naira</label>
          <div className="flex min-w-0 flex-1 items-center rounded-lg border border-[#dfe7df] bg-white px-3 focus-within:border-[#90aa98]">
            <span className="text-sm font-semibold text-[#849189]">₦</span>
            <input id="seller-withdraw-amount" type="number" min="0.01" max={availableToWithdrawCents / 100} step="0.01" inputMode="decimal" value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} disabled={withdrawBusy || loading || !emailConfirmed || !wallet.sellerEarnings.payoutAccountVerified || availableToWithdrawCents <= 0} placeholder="Enter amount" className="h-11 w-full bg-transparent px-2 text-sm font-semibold text-[#263b33] outline-none disabled:opacity-60" />
          </div>
          <Button type={wallet.sellerEarnings.payoutAccountVerified ? 'submit' : 'button'} onClick={!wallet.sellerEarnings.payoutAccountVerified ? onRequestSellerVerification : undefined} disabled={withdrawBusy || loading || !emailConfirmed || (wallet.sellerEarnings.payoutAccountVerified && availableToWithdrawCents <= 0)} icon={withdrawBusy ? <LoaderCircle size={15} className="animate-spin" /> : wallet.sellerEarnings.payoutAccountVerified ? <ArrowUpRight size={15} /> : <LockKeyhole size={15} />} className="min-h-11 justify-center px-4">
            {withdrawBusy ? 'Requesting transfer…' : wallet.sellerEarnings.payoutAccountVerified ? 'Withdraw with Paystack' : 'Verify payout account'}
          </Button>
        </div>
        {!emailConfirmed
          ? <p className="mt-2 text-xs text-[#765b22]">Confirm your email to enable withdrawals.</p>
          : !loading && availableToWithdrawCents <= 0
            ? <p className="mt-2 text-xs text-[#765b22]">{wallet.sellerEarnings.readyForCashoutCents <= 0 ? 'No fulfilled seller earnings are currently available. Mark a paid order as ready for pickup or shipped first.' : 'Your wallet balance is too low. Funds already spent from your wallet cannot be withdrawn again.'}</p>
            : !wallet.sellerEarnings.payoutAccountVerified && <p className="mt-2 text-xs text-[#765b22]">Verify your payout account to enable withdrawals.</p>}
      </form>
      {wallet.withdrawals.length > 0 && <ul aria-label="Recent bank withdrawals" className="divide-y divide-[#edf1ed] border-t border-[#edf1ed]">
        {wallet.withdrawals.map((withdrawal) => <li key={withdrawal.id} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
          <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${withdrawal.status === 'SUCCESS' ? 'bg-[#eef6ee] text-[#4f805a]' : 'bg-[#f1f4ef] text-[#718078]'}`}>
            {withdrawal.status === 'SUCCESS' ? <BadgeCheck size={17} /> : <CircleDollarSign size={17} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[#35483b]">Bank withdrawal</span>
            <span className="mt-1 block text-xs text-[#89958e]">{dateFormatter.format(new Date(withdrawal.createdAt))} · {withdrawal.status.replaceAll('_', ' ').toLowerCase()}</span>
          </span>
          <span className="text-sm font-semibold text-[#405549]">{ngnFormatter.format(withdrawal.amountKobo / 100)}</span>
          {(withdrawal.status === 'REVIEW_REQUIRED' || withdrawal.status === 'PROCESSING') && <Button variant="secondary" disabled={!emailConfirmed || reconcileWithdrawalBusyId === withdrawal.id} onClick={() => void reconcileWithdrawal(withdrawal)} icon={<RefreshCw size={14} className={reconcileWithdrawalBusyId === withdrawal.id ? 'animate-spin' : ''} />} className="min-h-9 px-3 text-xs">{reconcileWithdrawalBusyId === withdrawal.id ? 'Checking…' : 'Check Paystack status'}</Button>}
        </li>)}
      </ul>}
      {wallet.sellerEarnings.payouts.length === 0
        ? <div className="border-t border-[#edf1ed] px-5 py-8 text-center text-sm text-[#87938b]">Paid sales with tracked earnings will appear here.</div>
        : <ul className="divide-y divide-[#edf1ed] border-t border-[#edf1ed]">
          {wallet.sellerEarnings.payouts.map((payout) => <li key={payout.id} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
            <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${payout.status === 'SUCCESS' ? 'bg-[#eef6ee] text-[#4f805a]' : 'bg-[#f1f4ef] text-[#718078]'}`}>{payout.status === 'SUCCESS' ? <BadgeCheck size={17} /> : <CircleDollarSign size={17} />}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#35483b]">{payout.title}</span><span className="mt-1 block text-xs text-[#89958e]">{dateFormatter.format(new Date(payout.createdAt))} · {payoutStatusLabel(payout, wallet.sellerEarnings.payoutAccountVerified)}</span></span>
            <span className="text-sm font-semibold text-[#405549]">{ngnFormatter.format(payout.amountCents / 100)}</span>
            {(payout.status === 'REVIEW_REQUIRED' || payout.status === 'PROCESSING') && <Button variant="secondary" disabled={!emailConfirmed || reconcileBusyId === payout.id} onClick={() => void reconcilePayout(payout)} icon={<RefreshCw size={14} className={reconcileBusyId === payout.id ? 'animate-spin' : ''} />} className="min-h-9 px-3 text-xs">{reconcileBusyId === payout.id ? 'Checking…' : 'Check Paystack status'}</Button>}
            {canCashOut(payout) && wallet.sellerEarnings.payoutAccountVerified && <Button disabled={!emailConfirmed || cashoutBusyId === payout.id} onClick={() => void cashOut(payout)} icon={cashoutBusyId === payout.id ? <LoaderCircle size={14} className="animate-spin" /> : <ArrowUpRight size={14} />} className="min-h-9 px-3 text-xs">{cashoutBusyId === payout.id ? 'Requesting…' : 'Cash out'}</Button>}
          </li>)}
        </ul>}
      {wallet.sellerEarnings.payouts.length > 0 && <p className="border-t border-[#edf1ed] px-5 py-3 text-[11px] leading-5 text-[#89958e] sm:px-6">Withdraw a custom amount from fulfilled earnings or cash out an individual sale. Transfers require a verified payout account and passkey confirmation; settlement is in Nigerian naira.</p>}
    </section>

    <section className="mt-7 overflow-hidden rounded-[22px] border border-[#e2e9e3] bg-white">
      <div className="flex items-center justify-between border-b border-[#edf1ed] px-5 py-4 sm:px-6">
        <div><h2 className="text-sm font-semibold text-[#30483a]">Recent wallet activity</h2><p className="mt-1 text-xs text-[#87938b]">Deposits, purchases, seller proceeds, and cashouts</p></div>
        <button type="button" onClick={() => void refreshWallet()} disabled={loading || !emailConfirmed} aria-label="Refresh wallet, seller earnings, and deposits" className="grid size-9 place-items-center rounded-lg text-[#728279] transition hover:bg-[#f2f6f2] disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      {wallet.transactions.length === 0
        ? <div className="px-5 py-10 text-center text-sm text-[#87938b]"><Clock3 size={19} className="mx-auto mb-2 text-[#a3aea6]" />Wallet activity will appear here.</div>
        : <ul className="divide-y divide-[#edf1ed]">
          {wallet.transactions.map((transaction) => <li key={transaction.id} className="flex items-center gap-3 px-5 py-4 sm:px-6">
            <span className={`grid size-9 place-items-center rounded-xl ${transaction.direction === 'CREDIT' ? 'bg-[#eef6ee] text-[#4f805a]' : 'bg-[#f4f2ee] text-[#83775f]'}`}>{transaction.direction === 'CREDIT' ? <ArrowDownToLine size={16} /> : <ArrowUpRight size={16} />}</span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#35483b]">{transaction.orderItem?.title ? `${transactionTitles[transaction.type]} · ${transaction.orderItem.title}` : transactionTitles[transaction.type]}</span><span className="mt-1 block text-xs text-[#89958e]">{dateFormatter.format(new Date(transaction.createdAt))}</span></span>
            <span className={`text-sm font-semibold ${transaction.direction === 'CREDIT' ? 'text-[#477358]' : 'text-[#83775f]'}`}>{transaction.direction === 'CREDIT' ? '+' : '−'}{ngnFormatter.format(transaction.amountCents / 100)}</span>
          </li>)}
        </ul>}
    </section>
  </section>
}
