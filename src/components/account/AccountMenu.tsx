import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AlertTriangle, Check, ChevronDown, KeyRound, LoaderCircle, LogOut, Mail, MapPin, Settings, ShieldCheck, Trash2, UserRound, X } from 'lucide-react'
import { deleteAccount, getAccountProfile, updateAccountPreferences, type AccountProfile } from '../../services/api'
import { supabase } from '../../lib/supabase'
import { Button } from '../common/Button'

type AccountSection = 'profile' | 'settings' | 'security' | 'delete'

const sections: Array<{ id: AccountSection; label: string; icon: typeof UserRound }> = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'settings', label: 'Preferences', icon: Settings },
  { id: 'security', label: 'Sign-in & security', icon: ShieldCheck },
]

function AccountDialog({ session, initialSection, onClose, onDeleted }: {
  session: Session
  initialSection: AccountSection
  onClose: () => void
  onDeleted: () => void
}) {
  const [section, setSection] = useState(initialSection)
  const [profile, setProfile] = useState<AccountProfile>({
    displayName: typeof session.user.user_metadata.full_name === 'string'
      ? session.user.user_metadata.full_name
      : typeof session.user.user_metadata.name === 'string' ? session.user.user_metadata.name : null,
    email: session.user.email ?? null,
    preferredDormOrCampus: '',
    budgetPreference: null,
  })
  const [name, setName] = useState(profile.displayName ?? '')
  const [campus, setCampus] = useState('')
  const [budget, setBudget] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [deleteEmail, setDeleteEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const userId = session.user.id

  useEffect(() => {
    let cancelled = false
    void getAccountProfile().then((result) => {
      if (cancelled) return
      setProfile(result)
      setName(result.displayName ?? '')
      setCampus(result.preferredDormOrCampus ?? '')
      setBudget(result.budgetPreference === null ? '' : String(result.budgetPreference))
    }).catch((caught: unknown) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : 'Your account details could not be loaded.')
    })
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      if (!supabase) throw new Error('Account management is not configured.')
      const normalizedName = name.trim()
      if (normalizedName.length < 2 || normalizedName.length > 80) throw new Error('Your name must be between 2 and 80 characters.')
      const parsedBudget = budget.trim() ? Number(budget) : null
      if (parsedBudget !== null && (!Number.isFinite(parsedBudget) || parsedBudget < 0 || parsedBudget > 100000)) {
        throw new Error('Enter a budget between 0 and 100,000, or leave it blank.')
      }
      const { error: authError } = await supabase.auth.updateUser({ data: { full_name: normalizedName } })
      if (authError) throw authError
      const updatedProfile = await updateAccountPreferences({
        preferredDormOrCampus: campus.trim(),
        budgetPreference: parsedBudget,
      })
      const nextProfile = { ...updatedProfile, displayName: normalizedName }
      setProfile(nextProfile)
      setNotice('Your profile and preferences have been saved.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your profile could not be saved. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const savePreferences = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const parsedBudget = budget.trim() ? Number(budget) : null
      if (campus.trim().length > 120) throw new Error('Campus or area must be 120 characters or fewer.')
      if (parsedBudget !== null && (!Number.isFinite(parsedBudget) || parsedBudget < 0 || parsedBudget > 100000)) {
        throw new Error('Enter a budget between 0 and 100,000, or leave it blank.')
      }
      const updatedProfile = await updateAccountPreferences({
        preferredDormOrCampus: campus.trim(),
        budgetPreference: parsedBudget,
      })
      setProfile(updatedProfile)
      setNotice('Your shopping preferences have been saved.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your preferences could not be saved. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const updateEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      if (!supabase) throw new Error('Account management is not configured.')
      const normalizedEmail = newEmail.trim().toLowerCase()
      if (!normalizedEmail || normalizedEmail === profile.email?.toLowerCase()) throw new Error('Enter a different email address.')
      const { error: authError } = await supabase.auth.updateUser({ email: normalizedEmail })
      if (authError) throw authError
      setNewEmail('')
      setNotice('Email change requested. Follow the confirmation link sent by Supabase to finish updating your address.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your email address could not be updated.')
    } finally {
      setBusy(false)
    }
  }

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      if (!supabase) throw new Error('Account management is not configured.')
      if (password.length < 10) throw new Error('Use a password with at least 10 characters.')
      if (password !== passwordConfirmation) throw new Error('The new passwords do not match.')
      const { error: authError } = await supabase.auth.updateUser({ password })
      if (authError) throw authError
      setPassword('')
      setPasswordConfirmation('')
      setNotice('Your password has been updated.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your password could not be updated.')
    } finally {
      setBusy(false)
    }
  }

  const permanentlyDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      if (!profile.email || deleteEmail.trim().toLowerCase() !== profile.email.toLowerCase()) {
        throw new Error('Enter the email address currently on your account to confirm deletion.')
      }
      await deleteAccount(profile.email, session)
      if (!supabase) throw new Error('Your account was deleted. Close this browser session before returning to QuickResell.')
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw new Error('Your account was deleted, but this browser session could not be cleared. Close the browser before returning to QuickResell.')
      onDeleted()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The account could not be deleted. Please try again or contact support.')
    } finally {
      setBusy(false)
    }
  }

  return <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }} className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-[#14221c]/45 p-3 backdrop-blur-sm sm:p-6">
    <section role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" className="my-auto flex max-h-[min(850px,calc(100dvh-24px))] w-full max-w-3xl flex-col overflow-hidden rounded-[22px] border border-[#e4eae5] bg-white shadow-[0_28px_90px_rgba(17,34,26,.25)]">
      <header className="flex items-start justify-between border-b border-[#edf1ed] px-5 py-4 sm:px-7 sm:py-5">
        <div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#6d8a76]">Your account</p><h2 id="account-dialog-title" className="font-display mt-1 text-xl font-semibold text-[#233b2f]">{section === 'delete' ? 'Delete account' : 'Account & settings'}</h2><p className="mt-1 text-xs text-[#839087]">{profile.email ?? session.user.email}</p></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close account settings" className="grid size-9 place-items-center rounded-lg text-[#718078] transition hover:bg-[#f3f6f3] hover:text-[#263b33] disabled:opacity-50"><X size={18} /></button>
      </header>
      <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[190px_minmax(0,1fr)]">
        <nav aria-label="Account settings" className="flex gap-1 overflow-x-auto border-b border-[#edf1ed] bg-[#fafbfa] p-3 md:flex-col md:border-b-0 md:border-r md:p-4">
          {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => { setSection(id); setError(''); setNotice('') }} aria-current={section === id ? 'page' : undefined} className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${section === id ? 'bg-[#eaf2eb] text-[#315c45]' : 'text-[#78867e] hover:bg-white hover:text-[#293c32]'}`}><Icon size={16} />{label}</button>)}
          <button type="button" onClick={() => { setSection('delete'); setError(''); setNotice('') }} aria-current={section === 'delete' ? 'page' : undefined} className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition md:mt-auto ${section === 'delete' ? 'bg-[#fff0ed] text-[#a33d32]' : 'text-[#a65249] hover:bg-[#fff5f2]'}`}><Trash2 size={16} />Delete account</button>
        </nav>

        <div className="min-w-0 p-5 sm:p-7">
          {error && <div role="alert" className="mb-4 rounded-xl border border-[#f0d7d2] bg-[#fff5f2] px-3.5 py-3 text-xs leading-5 text-[#a34237]">{error}</div>}
          {notice && <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-[#dceadf] bg-[#f2f8f2] px-3.5 py-3 text-xs leading-5 text-[#41694d]"><Check size={15} className="mt-0.5 shrink-0" />{notice}</div>}

          {section === 'profile' && <form onSubmit={(event) => void saveProfile(event)} className="space-y-5">
            <div><h3 className="font-display text-lg font-semibold text-[#2b4035]">Public profile</h3><p className="mt-1 text-xs leading-5 text-[#7f8c84]">These details help campus buyers and sellers recognize you. Your email is never shown as your public name.</p></div>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#52645a]">Display name</span><input required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3.5 text-sm text-[#273a30] outline-none transition focus:border-[#87a58e] focus:ring-2 focus:ring-[#e5efe7]" placeholder="How people will see you" /></label>
            <div className="rounded-xl border border-[#e9eee9] bg-[#f8faf8] p-3.5"><div className="flex items-center gap-2 text-xs font-semibold text-[#4d6557]"><Mail size={14} />Sign-in email</div><p className="mt-1.5 break-all text-xs text-[#718078]">{profile.email ?? 'Email not available'}</p><p className="mt-1 text-[10px] leading-4 text-[#909b94]">To change your email, use Sign-in &amp; security. A confirmation is required.</p></div>
            <Button disabled={busy} className="min-w-32 justify-center">{busy ? <><LoaderCircle size={15} className="animate-spin" />Saving…</> : 'Save profile'}</Button>
          </form>}

          {section === 'settings' && <form onSubmit={(event) => void savePreferences(event)} className="space-y-5">
            <div><h3 className="font-display text-lg font-semibold text-[#2b4035]">Shopping preferences</h3><p className="mt-1 text-xs leading-5 text-[#7f8c84]">Help Scout and the marketplace make more relevant recommendations. You can change or clear these any time.</p></div>
            <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#52645a]"><MapPin size={14} />Preferred campus or area</span><input maxLength={120} value={campus} onChange={(event) => setCampus(event.target.value)} className="h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3.5 text-sm text-[#273a30] outline-none transition focus:border-[#87a58e] focus:ring-2 focus:ring-[#e5efe7]" placeholder="e.g. North Campus" /><span className="mt-1.5 block text-[10px] text-[#909b94]">Used to prioritize nearby listings and pickup options.</span></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#52645a]">Typical shopping budget (USD)</span><input type="number" min="0" max="100000" step="1" inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} className="h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3.5 text-sm text-[#273a30] outline-none transition focus:border-[#87a58e] focus:ring-2 focus:ring-[#e5efe7]" placeholder="Leave blank to skip" /><span className="mt-1.5 block text-[10px] text-[#909b94]">Optional; this is a recommendation preference, not a spending limit.</span></label>
            <Button disabled={busy} className="min-w-36 justify-center">{busy ? <><LoaderCircle size={15} className="animate-spin" />Saving…</> : 'Save preferences'}</Button>
          </form>}

          {section === 'security' && <div className="space-y-6">
            <div><h3 className="font-display text-lg font-semibold text-[#2b4035]">Sign-in &amp; security</h3><p className="mt-1 text-xs leading-5 text-[#7f8c84]">Changes to email require confirmation. Use a unique password you do not use on other sites.</p></div>
            <form onSubmit={(event) => void updateEmail(event)} className="space-y-3 border-b border-[#edf1ed] pb-6">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-[#3a5143]"><Mail size={15} />Change email address</h4><p className="text-[11px] text-[#87938c]">Current: {profile.email ?? session.user.email}</p>
              <input required type="email" autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className="h-10 w-full rounded-xl border border-[#dfe7e1] px-3 text-sm outline-none focus:border-[#87a58e]" placeholder="New email address" />
              <Button type="submit" disabled={busy || !newEmail.trim()} variant="secondary" className="min-w-36 justify-center">{busy ? 'Updating…' : 'Request email change'}</Button>
            </form>
            <form onSubmit={(event) => void updatePassword(event)} className="space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-[#3a5143]"><KeyRound size={15} />Set a new password</h4>
              <input required type="password" minLength={10} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-10 w-full rounded-xl border border-[#dfe7e1] px-3 text-sm outline-none focus:border-[#87a58e]" placeholder="At least 10 characters" />
              <input required type="password" minLength={10} autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} className="h-10 w-full rounded-xl border border-[#dfe7e1] px-3 text-sm outline-none focus:border-[#87a58e]" placeholder="Confirm new password" />
              <Button type="submit" disabled={busy || !password || !passwordConfirmation} variant="secondary" className="min-w-36 justify-center">{busy ? 'Updating…' : 'Update password'}</Button>
            </form>
          </div>}

          {section === 'delete' && <div className="space-y-5">
            <div><h3 className="font-display text-lg font-semibold text-[#a33d32]">Permanently delete your account</h3><p className="mt-1 text-xs leading-5 text-[#7f8c84]">This action cannot be undone. QuickResell will permanently remove the account and its linked marketplace data.</p></div>
            <div className="rounded-xl border border-[#f1d8d3] bg-[#fff7f5] p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-[#9e4439]"><AlertTriangle size={15} />What will be deleted</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] leading-5 text-[#8a625d]"><li>Your profile, preferences, listings, bids, and watchlists</li><li>Cart contents, notifications, comments, and marketplace conversations</li><li>All purchase orders and receipts associated with you as buyer or seller</li><li>Your QuickResell sign-in account and sessions</li></ul>
            </div>
            <p className="rounded-xl border border-[#e9eee9] bg-[#f8faf8] p-3 text-[11px] leading-5 text-[#748279]"><strong className="text-[#55675c]">Payment records:</strong> Paystack and other payment providers may retain transaction details where required by law or their own policies. Deleting QuickResell data does not delete records held by those providers.</p>
            <form onSubmit={(event) => void permanentlyDelete(event)} className="space-y-3">
              <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#52645a]">Type your account email to confirm</span><input required type="email" autoComplete="off" value={deleteEmail} onChange={(event) => setDeleteEmail(event.target.value)} className="h-11 w-full rounded-xl border border-[#e6d4d1] bg-white px-3.5 text-sm outline-none focus:border-[#c67a70]" placeholder={profile.email ?? ''} /></label>
              <Button type="submit" disabled={busy || !profile.email || deleteEmail.trim().toLowerCase() !== profile.email.toLowerCase()} className="w-full justify-center bg-[#a33d32] text-white hover:bg-[#8f332a] disabled:opacity-50">{busy ? <><LoaderCircle size={15} className="animate-spin" />Deleting account and data…</> : <><Trash2 size={15} />Permanently delete account and data</>}</Button>
            </form>
          </div>}
        </div>
      </div>
    </section>
  </div>
}

export function AccountMenu({ session, onSignOut, onDeleted }: {
  session: Session
  onSignOut: () => Promise<void>
  onDeleted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [dialogSection, setDialogSection] = useState<AccountSection | null>(null)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const displayName = typeof session.user.user_metadata.full_name === 'string'
    ? session.user.user_metadata.full_name
    : typeof session.user.user_metadata.name === 'string' ? session.user.user_metadata.name : session.user.email ?? 'Account'
  const initial = displayName.slice(0, 1).toUpperCase()

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const logout = async () => {
    setLogoutBusy(true); setError('')
    try {
      await onSignOut()
      setOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign out failed. Please try again.')
    } finally {
      setLogoutBusy(false)
    }
  }

  return <>
    <div ref={rootRef} className="relative ml-1">
      <button type="button" aria-expanded={open} aria-controls="account-actions" onClick={() => { setOpen((value) => !value); setError('') }} className="flex max-w-[190px] items-center gap-2 rounded-full border border-[#e7ece8] p-1 pr-2.5 transition hover:border-[#cad8cd] hover:bg-[#fafcfa] sm:pr-3">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[#e9f0e8] text-xs font-bold text-[#456555]">{typeof session.user.user_metadata.avatar_url === 'string' ? <img src={session.user.user_metadata.avatar_url} alt="" className="size-full object-cover" /> : initial}</span>
        <span className="hidden min-w-0 truncate text-xs font-semibold sm:block">{displayName}</span><ChevronDown size={14} className={`hidden shrink-0 text-[#829087] transition sm:block ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div id="account-actions" aria-label="Account actions" className="absolute right-0 top-12 z-[60] w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-[#e3eae4] bg-white p-2 shadow-[0_18px_55px_rgba(31,54,43,.18)]">
        <div className="flex items-center gap-3 border-b border-[#edf1ed] px-3 py-3"><span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[#e9f0e8] text-sm font-bold text-[#456555]">{typeof session.user.user_metadata.avatar_url === 'string' ? <img src={session.user.user_metadata.avatar_url} alt="" className="size-full object-cover" /> : initial}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#2a4035]">{displayName}</span><span className="mt-0.5 block truncate text-[11px] text-[#829087]">{session.user.email}</span></span></div>
        <div className="py-1.5">{sections.map(({ id, icon: Icon }) => <button key={id} type="button" onClick={() => { setDialogSection(id); setOpen(false) }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-[#53675a] transition hover:bg-[#f3f7f3]"><Icon size={16} />{id === 'profile' ? 'Edit profile' : id === 'settings' ? 'Preferences' : 'Sign-in & security'}</button>)}</div>
        {error && <p role="alert" className="mx-2 mb-2 rounded-lg bg-[#fff5f2] px-2.5 py-2 text-[11px] leading-4 text-[#a34237]">{error}</p>}
        <button type="button" disabled={logoutBusy} onClick={() => void logout()} className="flex w-full items-center gap-3 rounded-xl border-t border-[#edf1ed] px-3 py-3 text-left text-xs font-semibold text-[#8d4c43] transition hover:bg-[#fff6f4] disabled:opacity-50"><LogOut size={16} />{logoutBusy ? 'Signing out…' : 'Sign out'}</button>
      </div>}
    </div>
    {dialogSection && <AccountDialog session={session} initialSection={dialogSection} onClose={() => setDialogSection(null)} onDeleted={() => { setDialogSection(null); onDeleted() }} />}
  </>
}
