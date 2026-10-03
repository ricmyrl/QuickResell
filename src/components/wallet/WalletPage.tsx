import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowDownToLine, Clock3, LoaderCircle, LockKeyhole, RefreshCw, WalletCards } from 'lucide-react'
import { Button } from '../common/Button'
import { getWallet, type WalletData } from '../../services/cartApi'

const quickAmounts = [10, 25, 50, 100]
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function WalletPage({ session, emailConfirmed, onRequestSignIn, onAddFunds }: {
  session: Session | null
  emailConfirmed: boolean
  onRequestSignIn: () => void
  onAddFunds: (amountCents: number) => Promise<void>
}) {
  const [wallet, setWallet] = useState<WalletData>({ balanceCents: 0, transactions: [] })
  const [amount, setAmount] = useState('25')
  const [loading, setLoading] = useState(Boolean(session && emailConfirmed))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

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
      setError('Enter an amount in dollars with up to two decimal places.')
      return
    }
    const amountCents = Math.round(Number(normalizedAmount) * 100)
    if (!Number.isSafeInteger(amountCents) || amountCents < 100) {
      setError('The minimum wallet deposit is $1.00.')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')
    try {
      await onAddFunds(amountCents)
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
      <p className="mt-2 text-sm text-[#7b8880]">Add funds and keep track of your available balance. Your wallet is stored in US dollars.</p>
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
          : <p className="font-display mt-2 text-4xl font-semibold tracking-[-.04em]">{usdFormatter.format(wallet.balanceCents / 100)}</p>}
        <div className="mt-8 flex items-center gap-2 border-t border-white/15 pt-4 text-xs text-white/70"><LockKeyhole size={14} />Payments are verified securely by Paystack.</div>
      </section>

      <form onSubmit={(event) => void addFunds(event)} className="rounded-[24px] border border-[#e2e9e3] bg-white p-6 shadow-[0_18px_50px_rgba(31,54,43,.05)] sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#f0f5ef] text-[#315f49]"><ArrowDownToLine size={19} /></span>
          <div><h2 className="text-base font-semibold text-[#2c4236]">Add money</h2><p className="mt-0.5 text-xs text-[#87938b]">Choose an amount to add to your balance.</p></div>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-2">
          {quickAmounts.map((quickAmount) => <button key={quickAmount} type="button" onClick={() => setAmount(String(quickAmount))} aria-pressed={amount === String(quickAmount)} className={`min-h-10 rounded-xl border text-sm font-semibold transition ${amount === String(quickAmount) ? 'border-[#76917e] bg-[#edf4ed] text-[#2d5d4c]' : 'border-[#e5ebe5] text-[#718078] hover:bg-[#f7f9f7]'}`}>${quickAmount}</button>)}
        </div>

        <label htmlFor="wallet-amount" className="mt-5 block text-xs font-semibold text-[#53665a]">Custom amount (USD)</label>
        <div className="mt-2 flex items-center rounded-xl border border-[#dfe7df] bg-[#fbfcfb] px-3 focus-within:border-[#90aa98]">
          <span className="text-sm font-semibold text-[#849189]">$</span>
          <input id="wallet-amount" type="number" min="1" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy || !emailConfirmed} className="h-12 w-full bg-transparent px-2 text-base font-semibold text-[#263b33] outline-none disabled:opacity-60" />
        </div>
        <p className="mt-2 text-[11px] leading-5 text-[#8a9690]">The final payment is processed in Nigerian naira using the current exchange rate.</p>

        {error && <p role="alert" className="mt-4 rounded-xl border border-[#f0d7d2] bg-[#fff5f2] px-3 py-2.5 text-xs leading-5 text-[#9c493d]">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-xl border border-[#d9eadc] bg-[#f1f8f1] px-3 py-2.5 text-xs text-[#477358]">{notice}</p>}

        <Button type="submit" disabled={busy || loading || !emailConfirmed} icon={busy ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowDownToLine size={16} />} className="mt-5 w-full justify-center">
          {busy ? 'Processing secure payment…' : 'Add money to wallet'}
        </Button>
      </form>
    </div>

    <section className="mt-7 overflow-hidden rounded-[22px] border border-[#e2e9e3] bg-white">
      <div className="flex items-center justify-between border-b border-[#edf1ed] px-5 py-4 sm:px-6">
        <div><h2 className="text-sm font-semibold text-[#30483a]">Recent deposits</h2><p className="mt-1 text-xs text-[#87938b]">Your latest completed wallet top-ups</p></div>
        <button type="button" onClick={() => void refreshWallet()} disabled={loading || !emailConfirmed} aria-label="Refresh wallet balance and deposits" className="grid size-9 place-items-center rounded-lg text-[#728279] transition hover:bg-[#f2f6f2] disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      {wallet.transactions.length === 0
        ? <div className="px-5 py-10 text-center text-sm text-[#87938b]"><Clock3 size={19} className="mx-auto mb-2 text-[#a3aea6]" />Completed deposits will appear here.</div>
        : <ul className="divide-y divide-[#edf1ed]">
          {wallet.transactions.map((transaction) => <li key={transaction.id} className="flex items-center gap-3 px-5 py-4 sm:px-6">
            <span className="grid size-9 place-items-center rounded-xl bg-[#eef6ee] text-[#4f805a]"><ArrowDownToLine size={16} /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#35483b]">Wallet deposit</span><span className="mt-1 block text-xs text-[#89958e]">{dateFormatter.format(new Date(transaction.createdAt))}</span></span>
            <span className="text-sm font-semibold text-[#477358]">+{usdFormatter.format(transaction.amountCents / 100)}</span>
          </li>)}
        </ul>}
    </section>
  </section>
}
