import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BadgeCheck, Camera, CircleAlert, Fingerprint, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react'
import {
  cancelSellerIdentityVerification,
  getSellerBanks,
  getSellerVerification,
  getSellerVerificationProvider,
  recordSmileVerificationSubmission,
  startSellerIdentityVerification,
  submitManualSellerReview,
  type SellerBank,
  type SellerCheckStatus,
  type SellerVerification,
  type SellerVerificationProvider,
} from '../../services/api'
import { Button } from '../common/Button'

type SmileScriptWindow = Window & { SmileIdentity?: Window['SmileIdentity'] }

const statusLabels: Record<SellerCheckStatus, string> = {
  NOT_STARTED: 'Not started',
  PENDING: 'In progress',
  VERIFIED: 'Verified',
  REJECTED: 'Not verified',
  REVIEW_REQUIRED: 'Needs review',
}

function VerificationState({ status }: { status: SellerCheckStatus }) {
  const style = status === 'VERIFIED'
    ? 'bg-[#eaf5eb] text-[#42724e]'
    : status === 'PENDING'
      ? 'bg-[#fff6e4] text-[#8a682d]'
      : status === 'REJECTED' || status === 'REVIEW_REQUIRED'
        ? 'bg-[#fff1ee] text-[#a4483e]'
        : 'bg-[#f0f3f0] text-[#758179]'
  return <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-[10px] font-bold uppercase tracking-wide ${style}`}>{statusLabels[status]}</span>
}

async function loadSmileScript(): Promise<void> {
  if (window.SmileIdentity) return
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-smile-id="true"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Smile ID could not be loaded.')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://cdn.usesmileid.com/inline/v12/js/script.min.js'
    script.async = true
    script.dataset.smileId = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Smile ID could not be loaded.'))
    document.head.appendChild(script)
  })
  if (!window.SmileIdentity) throw new Error('Smile ID verification is unavailable in this browser.')
}

export function SellerVerificationPage({ session, emailConfirmed, onRequestSignIn, onVerified }: {
  session: Session | null
  emailConfirmed: boolean
  onRequestSignIn: () => void
  onVerified: () => void
}) {
  const [verification, setVerification] = useState<SellerVerification | null>(null)
  const [verificationProvider, setVerificationProvider] = useState<SellerVerificationProvider>('paystack')
  const [banks, setBanks] = useState<SellerBank[]>([])
  const [banksLoading, setBanksLoading] = useState(true)
  const [bankLoadError, setBankLoadError] = useState('')
  const bankRequestId = useRef(0)
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [consent, setConsent] = useState(false)
  const [manualLegalName, setManualLegalName] = useState('')
  const [manualIdType, setManualIdType] = useState<'NIN' | 'BVN'>('NIN')
  const [manualIdNumber, setManualIdNumber] = useState('')
  const [manualPaystackFlow, setManualPaystackFlow] = useState(false)
  const [loading, setLoading] = useState(true)
  const [identityBusy, setIdentityBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{
    legalName?: string
    idNumber?: string
    bankCode?: string
    accountNumber?: string
    consent?: string
  }>({})

  const refreshVerification = useCallback(async () => {
    if (!session || !emailConfirmed) return
    const [current, provider] = await Promise.all([
      getSellerVerification(session),
      getSellerVerificationProvider(session),
    ])
    setVerification(current)
    setVerificationProvider(provider)
  }, [session, emailConfirmed])

  const loadBanks = useCallback(async () => {
    if (!session) return
    const requestId = ++bankRequestId.current
    setBanksLoading(true)
    setBankLoadError('')
    try {
      const bankList = await getSellerBanks(session)
      if (bankRequestId.current !== requestId) return
      setBanks(bankList)
      if (bankList.length === 0) setBankLoadError('Paystack returned no available Nigerian banks. Please retry.')
    } catch (caught: unknown) {
      if (bankRequestId.current !== requestId) return
      setBankLoadError(caught instanceof Error ? caught.message : 'Banks could not be loaded.')
    } finally {
      if (bankRequestId.current === requestId) setBanksLoading(false)
    }
  }, [session])

  useEffect(() => {
    let cancelled = false
    if (!session || !emailConfirmed) {
      setLoading(false)
      setBanksLoading(false)
      return
    }
    void Promise.all([getSellerVerification(session), getSellerVerificationProvider(session)]).then(([status, provider]) => {
      if (cancelled) return
      setVerification(status)
      setVerificationProvider(provider)
    }).catch((caught: unknown) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : 'Seller verification could not be loaded.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [session, emailConfirmed])

  useEffect(() => {
    if (!session || !emailConfirmed) return
    void loadBanks()
    return () => { bankRequestId.current += 1 }
  }, [session, emailConfirmed, loadBanks])

  useEffect(() => {
    if (verification?.identityStatus !== 'PENDING') return
    let cancelled = false
    const refresh = async () => {
      try {
        const current = await getSellerVerification(session)
        if (!cancelled) setVerification(current)
      } catch {
        // A transient status error should not hide the current pending state.
      }
    }
    const timer = window.setInterval(() => void refresh(), 5_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [verification?.identityStatus, session])

  const startIdentityCheck = async () => {
    if (!session) {
      onRequestSignIn()
      return
    }
    if (!emailConfirmed) {
      setError('Confirm your email before verifying your seller account.')
      return
    }
    if (identityBusy) return
    const nextFieldErrors: typeof fieldErrors = {}
    if (!consent) nextFieldErrors.consent = 'Consent is required to continue.'
    if (paystackProvider) {
      if (!paystackLegalName) nextFieldErrors.legalName = 'Enter your legal name.'
      if (manualIdNumber.length !== 11) nextFieldErrors.idNumber = `Enter your 11-digit ${manualIdType}.`
      if (!bankCode) nextFieldErrors.bankCode = 'Select your bank.'
      if (accountNumber.length !== 10) nextFieldErrors.accountNumber = 'Enter a valid 10-digit account number.'
    }
    setFieldErrors(nextFieldErrors)
    if (Object.keys(nextFieldErrors).length) {
      return
    }
    setIdentityBusy(true)
    setError('')
    setNotice('')
    let reference = ''
    try {
      if (paystackProvider) {
        const review = await submitManualSellerReview({
          legalName: paystackLegalName,
          idType: manualIdType,
          idNumber: manualIdNumber.trim(),
          bankCode,
          accountNumber,
          consent: true,
        }, session)
        setAccountNumber('')
        setNotice(`${review.bankName} account ending ${review.accountLast4} and your identity were verified by Paystack.`)
        await refreshVerification()
        setIdentityBusy(false)
        return
      }

      const identitySession = await startSellerIdentityVerification(session)
      reference = identitySession.reference
      if (identitySession.provider === 'paystack') {
        setManualPaystackFlow(true)
        setNotice('Paystack verification is active. Complete the identity and bank details in the form, then submit again.')
        setIdentityBusy(false)
        return
      }

      await loadSmileScript()
      const runSmile = (window as SmileScriptWindow).SmileIdentity
      if (!runSmile) throw new Error('Smile ID verification is unavailable in this browser.')
      runSmile({
        token: identitySession.token!,
        product: 'biometric_kyc',
        callback_url: identitySession.callbackUrl!,
        environment: identitySession.environment!,
        partner_details: identitySession.partnerDetails!,
        id_selection: identitySession.idSelection!,
        partner_params: { ...(identitySession.partnerParams ?? { internal_reference: reference }), user_id: session.user.id },
        onResult: (result) => {
          if (result.status === 'cancelled') {
            void cancelSellerIdentityVerification(reference, session).then(refreshVerification).catch(() => undefined).finally(() => setIdentityBusy(false))
            return
          }
          if (result.status === 'failure') {
            setError(result.error?.message ?? 'Smile ID could not submit this verification. You can retry.')
            void cancelSellerIdentityVerification(reference, session).then(refreshVerification).catch(() => undefined).finally(() => setIdentityBusy(false))
            return
          }
          const jobId = result.value?.job_id
          const smileUserId = result.value?.user_id
          if (!jobId || !smileUserId) {
            setError('Smile ID accepted the check but returned no verification reference. Contact support.')
            setIdentityBusy(false)
            return
          }
          void recordSmileVerificationSubmission({ reference, jobId, smileUserId }, session).then(async () => {
            setNotice('Identity check submitted. This page will update when Smile ID finishes its review.')
            await refreshVerification()
          }).catch((caught: unknown) => {
            setError(caught instanceof Error ? caught.message : 'Your verification was submitted, but its status could not be recorded. Contact support.')
          }).finally(() => setIdentityBusy(false))
        },
      })
    } catch (caught) {
      if (reference) void cancelSellerIdentityVerification(reference, session).catch(() => undefined)
      const message = caught instanceof Error ? caught.message : 'Identity verification could not be started.'
      if (paystackProvider && /account holder name does not match/i.test(message)) {
        setFieldErrors({
          legalName: 'This name does not match the payout account holder name.',
          accountNumber: 'Check that this is your own bank account.',
        })
      } else if (paystackProvider && /bank account could not be verified for the selected bank/i.test(message)) {
        setFieldErrors({
          bankCode: 'Check that you selected the correct bank.',
          accountNumber: 'This account number could not be found at the selected bank.',
        })
      } else if (paystackProvider && /account-holder name does not match the legal name/i.test(message)) {
        setFieldErrors({
          legalName: 'This does not match the account holder name registered with the bank.',
          accountNumber: 'Check that this is your own bank account.',
        })
      } else if (paystackProvider && /could not match this (NIN|BVN) to the account/i.test(message)) {
        setFieldErrors({
          idNumber: `The ${manualIdType} could not be matched to this account. Check the number.`,
          accountNumber: `The bank account is valid, but Paystack could not match it to this ${manualIdType}.`,
        })
      } else if (paystackProvider && /rejected the identity validation request/i.test(message)) {
        setFieldErrors({
          idNumber: message,
          accountNumber: 'The bank account and account-holder name were verified; Paystack rejected the identity check.',
        })
      } else if (paystackProvider && /could not validate this (NIN|BVN) and bank account/i.test(message)) {
        setFieldErrors({
          idNumber: `Paystack could not validate this ${manualIdType}. Check the number.`,
          accountNumber: 'Paystack could not validate this account with the supplied identity details.',
        })
      } else {
        setError(message)
      }
      setIdentityBusy(false)
    }
  }

  if (!session) return <section className="mx-auto max-w-3xl rounded-[18px] border border-[#e3eae4] bg-white p-6 text-center"><h1 className="font-display text-xl font-semibold text-[#283d32]">Seller verification</h1><p className="mt-2 text-sm text-[#7c8881]">Sign in to verify your seller account.</p><Button onClick={onRequestSignIn} className="mt-4">Sign in</Button></section>

  if (!emailConfirmed) return <section className="mx-auto max-w-3xl rounded-[18px] border border-[#ead9b0] bg-[#fff9e9] p-6"><h1 className="font-display text-xl font-semibold text-[#4f442e]">Confirm your email first</h1><p className="mt-2 text-sm leading-6 text-[#7a6a45]">Confirm your QuickResell email before starting seller identity verification.</p></section>

  const identityStatus = verification?.identityStatus ?? 'NOT_STARTED'
  const payoutStatus = verification?.payoutStatus ?? 'NOT_STARTED'
  const fullyVerified = identityStatus === 'VERIFIED' && payoutStatus === 'VERIFIED'
  const paystackProvider = manualPaystackFlow || verificationProvider === 'paystack'
  const paystackLegalName = manualLegalName.trim() ||
    (typeof session.user.user_metadata?.full_name === 'string' ? session.user.user_metadata.full_name.trim() : '')
  return <section className="mx-auto w-full max-w-3xl pb-8">
    <header className="mb-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-[.13em] text-[#698572]">Seller onboarding · Nigeria</p>
      <h1 className="font-display text-3xl font-semibold text-[#1c2b26]">Verify your seller account</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#718078]">Complete identity and payout-account checks before publishing products or auctions.</p>
    </header>

    {loading && <div role="status" className="mb-4 flex items-center gap-2 text-sm text-[#738178]"><LoaderCircle size={16} className="animate-spin" />Loading verification status…</div>}
    {error && <div role="alert" className="mb-4 rounded-xl border border-[#f0d7d2] bg-[#fff5f2] px-4 py-3 text-sm leading-5 text-[#a34237]">{error}</div>}
    {notice && <div role="status" className="mb-4 rounded-xl border border-[#dceadf] bg-[#f2f8f2] px-4 py-3 text-sm text-[#41694d]">{notice}</div>}

    <div className="space-y-4">
      <section className="rounded-[16px] border border-[#e2e9e3] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#edf4ed] text-[#4c7758]"><Fingerprint size={19} /></span><div><h2 className="text-sm font-semibold text-[#2c4236]">Identity and payout verification</h2><p className="mt-0.5 text-xs text-[#829087]">{paystackProvider ? 'One Paystack form for your legal name, NIN or BVN, and bank account' : 'Verify your identity with Smile ID, then add your payout account'}</p></div></div><VerificationState status={identityStatus} /></div>
        {fullyVerified || (identityStatus === 'VERIFIED' && !paystackProvider) ? <p className="mt-4 flex items-center gap-2 text-sm text-[#477358]"><BadgeCheck size={16} />Identity verification is complete.</p>
          : identityStatus === 'PENDING' ? <p role="status" className="mt-4 flex items-center gap-2 text-sm text-[#85682f]"><LoaderCircle size={16} className="animate-spin" />Smile ID is reviewing your submission. This status refreshes automatically.</p>
            : identityStatus === 'REVIEW_REQUIRED' ? <p className="mt-4 flex items-start gap-2 text-sm leading-5 text-[#8a642d]"><CircleAlert size={16} className="mt-0.5 shrink-0" />Your submission needs additional review. Contact QuickResell support to continue.</p>
              : <form onSubmit={(event) => {
                event.preventDefault()
                void startIdentityCheck()
              }} className="mt-4 space-y-4">
                <div className="rounded-xl bg-[#f7f9f7] p-3.5 text-xs leading-5 text-[#66766e]"><p>{paystackProvider ? 'Paystack validates the NIN or BVN together with the legal name and Nigerian payout account. QuickResell does not store the identity number.' : 'Smile ID verifies your identity and liveness. You can add your payout bank account after the identity check.'}</p>{!paystackProvider && <a href="https://usesmileid.com/privacy" target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-[#41694d] underline">Smile ID privacy information</a>}</div>
                {paystackProvider && <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
                  <label className="block text-xs font-semibold text-[#52645a]"><span className="mb-1.5 block">Legal name</span><input type="text" value={manualLegalName} onChange={(event) => {
                    setManualLegalName(event.target.value)
                    setFieldErrors((current) => ({ ...current, legalName: undefined }))
                  }} aria-invalid={Boolean(fieldErrors.legalName)} placeholder="Full legal name" className="h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3 text-sm text-[#273a30] outline-none focus:border-[#86a995]" />{fieldErrors.legalName && <span role="alert" className="mt-1 block text-xs font-medium text-[#a34237]">{fieldErrors.legalName}</span>}</label>
                  <label className="block text-xs font-semibold text-[#52645a]"><span className="mb-1.5 block">ID type</span><select value={manualIdType} onChange={(event) => {
                    setManualIdType(event.target.value as 'NIN' | 'BVN')
                    setFieldErrors((current) => ({ ...current, idNumber: undefined }))
                  }} className="h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3 text-sm text-[#273a30] outline-none focus:border-[#86a995]">
                    <option value="NIN">NIN</option>
                    <option value="BVN">BVN</option>
                  </select></label>
                </div>}
                {paystackProvider && <>
                  <label className="block text-xs font-semibold text-[#52645a]"><span className="mb-1.5 block">{manualIdType} number</span><input type="text" inputMode="numeric" autoComplete="off" maxLength={11} pattern="[0-9]{11}" value={manualIdNumber} onChange={(event) => {
                    setManualIdNumber(event.target.value.replace(/\D/g, '').slice(0, 11))
                    setFieldErrors((current) => ({ ...current, idNumber: undefined }))
                  }} aria-invalid={Boolean(fieldErrors.idNumber)} placeholder="11-digit number" className="h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3 text-sm text-[#273a30] outline-none focus:border-[#86a995]" />{fieldErrors.idNumber && <span role="alert" className="mt-1 block text-xs font-medium text-[#a34237]">{fieldErrors.idNumber}</span>}</label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-semibold text-[#52645a]"><span className="mb-1.5 block">Payout bank</span><select value={bankCode} onChange={(event) => {
                      setBankCode(event.target.value)
                      setFieldErrors((current) => ({ ...current, bankCode: undefined }))
                    }} aria-invalid={Boolean(fieldErrors.bankCode)} disabled={banksLoading || banks.length === 0 || identityBusy} required={paystackProvider} className="h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3 text-sm text-[#273a30] outline-none focus:border-[#86a995] disabled:bg-[#f4f6f4]"><option value="">{banks.length ? 'Choose your bank' : banksLoading ? 'Loading banks…' : 'Banks unavailable'}</option>{banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select>{fieldErrors.bankCode && <span role="alert" className="mt-1 block text-xs font-medium text-[#a34237]">{fieldErrors.bankCode}</span>}{bankLoadError && <span role="alert" className="mt-1 block text-xs font-medium text-[#a34237]">{bankLoadError} <button type="button" onClick={() => void loadBanks()} className="font-semibold underline">Retry</button></span>}</label>
                    <label className="block text-xs font-semibold text-[#52645a]"><span className="mb-1.5 block">Payout account number</span><input type="text" inputMode="numeric" autoComplete="off" minLength={10} maxLength={10} pattern="[0-9]{10}" value={accountNumber} onChange={(event) => {
                    const nextValue = event.target.value.replace(/\D/g, '').slice(0, 10)
                    setAccountNumber(nextValue)
                    setFieldErrors((current) => ({ ...current, accountNumber: undefined }))
                  }} aria-invalid={Boolean(fieldErrors.accountNumber)} disabled={identityBusy} required={paystackProvider} placeholder="10 digits" className="h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3 text-sm text-[#273a30] outline-none focus:border-[#86a995] disabled:bg-[#f4f6f4]" />{fieldErrors.accountNumber && <span role="alert" className="mt-1 block text-xs font-medium text-[#a34237]">{fieldErrors.accountNumber}</span>}</label>
                  </div>
                </>}
                {paystackProvider && <p className="text-xs leading-5 text-[#718078]">Enter your legal name, 11-digit NIN or BVN, bank, and 10-digit account number, then submit once to verify your identity and payout account.</p>}
                <label className="flex items-start gap-2.5 text-xs leading-5 text-[#5e6f64]"><input type="checkbox" checked={consent} onChange={(event) => {
                  setConsent(event.target.checked)
                  setFieldErrors((current) => ({ ...current, consent: undefined }))
                }} className="mt-1 size-4 accent-[#315f49]" /><span>I consent to QuickResell processing my identity details for seller verification and matching them against the payout account holder name.{fieldErrors.consent && <span role="alert" className="mt-1 block text-xs font-medium text-[#a34237]">{fieldErrors.consent}</span>}</span></label>
                <Button type="submit" disabled={identityBusy || loading} icon={identityBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Camera size={16} />}>{identityBusy ? 'Verifying…' : paystackProvider ? 'Verify identity and payout account' : 'Start identity verification'}</Button>
              </form>}
        {fullyVerified && verification?.bankName && <p className="mt-4 flex items-center gap-2 text-sm text-[#477358]"><BadgeCheck size={16} />{verification.bankName} · account ending {verification.bankAccountLast4}</p>}
      </section>

    </div>

    {fullyVerified && <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-[#dceadf] bg-[#f2f8f2] p-4"><p className="flex items-center gap-2 text-sm font-semibold text-[#41694d]"><ShieldCheck size={17} />Seller verification complete</p><Button onClick={onVerified}>Continue to add a product</Button></div>}
    <div className="mt-5 flex items-start gap-2 border-t border-[#e6ebe7] pt-4 text-[11px] leading-5 text-[#859189]"><LockKeyhole size={14} className="mt-0.5 shrink-0" />Identity numbers are sent to the active verification provider and are not stored by QuickResell. QuickResell retains your verification state and payout account details needed for seller payments.</div>
  </section>
}
