import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AlertTriangle, LoaderCircle, ShieldCheck } from 'lucide-react'
import { CartApiError, verifyPayment, verifyWalletTopUp } from '../../services/cartApi'
import { Button } from '../common/Button'

type PaymentType = 'CART_CHECKOUT' | 'WALLET_TOPUP'

export function PaystackReturnPage({ reference, transactionType, session, authLoading, emailConfirmed, onRequestSignIn, onCompleteCheckout, onComplete }: {
  reference: string
  transactionType: PaymentType
  session: Session | null
  authLoading: boolean
  emailConfirmed: boolean
  onRequestSignIn: () => void
  onCompleteCheckout: (reference: string) => Promise<void>
  onComplete: (transactionType: PaymentType) => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [manualRetrying, setManualRetrying] = useState(false)
  const attempted = useRef(false)
  const callbacks = useRef({ onRequestSignIn, onCompleteCheckout, onComplete })
  callbacks.current = { onRequestSignIn, onCompleteCheckout, onComplete }

  const handleRetryPaymentCheck = async () => {
    setManualRetrying(true)
    setError('')
    setBusy(true)
    try {
      if (transactionType === 'CART_CHECKOUT') {
        const result = await verifyPayment(reference, session)
        if (!result.verified) throw new Error('This payment has not been confirmed by Paystack yet.')
        await callbacks.current.onCompleteCheckout(reference)
      } else {
        const result = await verifyWalletTopUp(reference, session)
        if (!result.verified) throw new Error('This wallet deposit has not been confirmed by Paystack yet.')
      }
      callbacks.current.onComplete(transactionType)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The payment could not be confirmed. Contact support with your Paystack reference.'
      const requestId = caught instanceof CartApiError ? caught.requestId : undefined
      const supportMessage = `${message} If your bank shows a charge, do not pay again; contact support with your Paystack reference.`
      setError(requestId ? `${supportMessage} Support reference: ${requestId}` : supportMessage)
      setBusy(false)
    } finally {
      setManualRetrying(false)
    }
  }

  useEffect(() => {
    if (authLoading || attempted.current) return
    if (!reference) {
      setError('Paystack did not return a transaction reference. Contact support if your account was charged.')
      setBusy(false)
      return
    }
    if (!session) {
      callbacks.current.onRequestSignIn()
      return
    }
    if (!emailConfirmed) {
      setError('Confirm your email before completing this payment.')
      setBusy(false)
      return
    }

    attempted.current = true
    let cancelled = false
    void (async () => {
      try {
        if (transactionType === 'CART_CHECKOUT') {
          await callbacks.current.onCompleteCheckout(reference)
        } else {
          const result = await verifyWalletTopUp(reference, session)
          if (!result.verified) throw new Error('Paystack could not verify this wallet deposit.')
        }
        if (!cancelled) callbacks.current.onComplete(transactionType)
      } catch (caught) {
        if (!cancelled) {
          const message = caught instanceof Error ? caught.message : 'The payment could not be confirmed. Contact support with your Paystack reference.'
          const requestId = caught instanceof CartApiError ? caught.requestId : undefined
          const supportMessage = `${message} If your bank shows a charge, do not pay again; contact support with your Paystack reference.`
          setError(requestId ? `${supportMessage} Support reference: ${requestId}` : supportMessage)
          setBusy(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [authLoading, emailConfirmed, reference, session, transactionType])

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-[#14221c]/65 p-4 backdrop-blur-sm">
    <section role="status" aria-live="polite" className="w-full max-w-md rounded-[20px] border border-[#e4eae5] bg-white p-6 text-center shadow-[0_28px_90px_rgba(17,34,26,.25)] sm:p-8">
      <span className={`mx-auto grid size-12 place-items-center rounded-2xl ${error ? 'bg-[#fff1ee] text-[#a34237]' : 'bg-[#edf5eb] text-[#456b54]'}`}>
        {error ? <AlertTriangle size={22} /> : busy ? <LoaderCircle size={22} className="animate-spin" /> : <ShieldCheck size={22} />}
      </span>
      <h1 className="font-display mt-5 text-2xl font-semibold text-[#20372d]">{error ? 'Payment needs attention' : 'Confirming your payment'}</h1>
      <p className="mt-2 text-sm leading-6 text-[#748279]">{error ? error : 'We’re verifying the transaction securely with Paystack. Keep this page open for a moment.'}</p>
      <p className="mt-4 break-all font-mono text-[11px] text-[#87938c]">Reference: {reference || 'missing'}</p>
      {error && <>
        <Button onClick={handleRetryPaymentCheck} disabled={manualRetrying} className="mt-6 w-full justify-center">
          {manualRetrying ? 'Checking payment…' : 'Request payment check'}
        </Button>
        <Button onClick={() => window.location.assign(transactionType === 'WALLET_TOPUP' ? '/wallet' : '/cart')} className="mt-3 w-full justify-center">Return to {transactionType === 'WALLET_TOPUP' ? 'wallet' : 'cart'}</Button>
      </>}
    </section>
  </div>
}
