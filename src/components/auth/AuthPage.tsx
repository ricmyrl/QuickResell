import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShoppingBag, UserRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Button } from '../common/Button'

type AuthMode = 'signin' | 'register'

export function AuthPage({ initialMode = 'signin', returnTo = '/', onBack, onAuthenticated }: { initialMode?: AuthMode; returnTo?: string; onBack: () => void; onAuthenticated: () => void }) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmationEmail, setConfirmationEmail] = useState('')

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setError('')
    setMessage('')
    setConfirmationEmail('')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!supabase) {
      setError('Sign-in is not configured yet. Add the Supabase URL and anon key to the frontend environment.')
      return
    }

    setBusy(true)
    try {
      if (mode === 'register') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: window.location.origin,
          },
        })
        if (signUpError) throw signUpError
        if (data.user?.email_confirmed_at) onAuthenticated()
        else {
          if (data.session) await supabase.auth.signOut()
          setConfirmationEmail(email.trim())
          setMessage('Confirm your email using the link in your inbox. Then return here to sign in.')
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (signInError) {
          if (/email not confirmed/i.test(signInError.message)) {
            setConfirmationEmail(email.trim())
            setMessage('Confirm your email before signing in.')
            return
          }
          throw signInError
        }
        if (!data.user.email_confirmed_at) {
          await supabase.auth.signOut()
          setConfirmationEmail(email.trim())
          setMessage('Your email is not confirmed yet. Confirm it before signing in.')
          return
        }
        onAuthenticated()
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We couldn’t complete that request. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const resendConfirmation = async () => {
    if (!supabase || !confirmationEmail) return
    setBusy(true)
    setError('')
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: confirmationEmail, options: { emailRedirectTo: window.location.origin } })
    setBusy(false)
    if (resendError) setError(resendError.message)
    else setMessage('A new confirmation link has been sent. Check your inbox.')
  }

  const signInWithGoogle = async () => {
    if (!supabase) {
      setError('Sign-in is not configured yet. Add the Supabase URL and anon key to the frontend environment.')
      return
    }
    setError('')
    if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
      window.sessionStorage.setItem('quickresell:auth:return-to', returnTo)
    }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    if (oauthError) setError(oauthError.message)
  }

  const sendPasswordReset = async () => {
    setError('')
    setMessage('')
    if (!email.trim()) {
      setError('Enter your email address first, then request a reset link.')
      return
    }
    if (!supabase) {
      setError('Password recovery is not configured until Supabase credentials are added.')
      return
    }
    setBusy(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
    setBusy(false)
    if (resetError) setError(resetError.message)
    else setMessage('If an account matches that email, a password reset link is on its way.')
  }

  return <main className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,1.04fr)_minmax(440px,.96fr)]">
    <section className="relative hidden min-h-screen overflow-hidden bg-[#203c32] lg:block">
      <img src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1800&q=90" alt="Students spending time together on campus" className="absolute inset-0 size-full object-cover opacity-70" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#16251f]/90 via-[#1b3027]/25 to-[#16251f]/20" />
      <button type="button" onClick={onBack} className="absolute left-8 top-8 z-10 flex items-center gap-2 text-white/90 transition hover:text-white"><span className="grid size-9 place-items-center rounded-xl bg-[#d4f06b] text-[#243a33]"><ShoppingBag size={18} /></span><span className="font-display text-lg font-bold tracking-[-.03em]">quick<span className="text-[#d4f06b]">resell</span></span></button>
      <div className="absolute bottom-12 left-10 right-10 text-white xl:bottom-16 xl:left-16 xl:right-16"><p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#d4f06b]"><span className="size-1.5 rounded-full bg-[#d4f06b]" />Good things travel close</p><h1 className="font-display max-w-xl text-4xl font-semibold leading-[1.08] xl:text-5xl">Your next favorite is already on campus.</h1><p className="mt-7 text-xs text-white/75">A marketplace built around trust.</p></div>
    </section>

    <section className="flex min-h-screen flex-col px-5 py-5 sm:px-10 lg:px-12 xl:px-20">
      <div className="flex items-center justify-between lg:justify-end"><button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[#66766e] transition hover:text-[#263b33] lg:hidden"><ArrowLeft size={16} />Back to marketplace</button><span className="hidden text-xs text-[#87938d] lg:inline">Campus starts here</span><span className="font-display ml-auto text-base font-bold lg:hidden">quick<span className="text-[#70917c]">resell</span></span></div>

      <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center py-12">
        <motion.div key={mode} initial={{ opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .22 }}>
          <div className="mb-7"><p className="mb-3 text-xs font-bold uppercase tracking-[.13em] text-[#658273]">{mode === 'signin' ? 'Welcome back' : 'Join your campus'}</p><h2 className="font-display text-[32px] font-semibold leading-tight tracking-[-.03em] text-[#1c2b26]">{mode === 'signin' ? 'Sign in to Quick Resell' : 'Create your account'}</h2><p className="mt-2 text-sm leading-6 text-[#7c8982]">{mode === 'signin' ? 'Pick up where campus left off.' : 'Make your next campus find a little closer.'}</p></div>

          <div className="mb-6 grid grid-cols-2 rounded-xl bg-[#f2f5f2] p-1"><button type="button" onClick={() => changeMode('signin')} aria-pressed={mode === 'signin'} className={`rounded-lg py-2.5 text-sm font-semibold transition ${mode === 'signin' ? 'bg-white text-[#263b33] shadow-sm' : 'text-[#7a8880] hover:text-[#354c41]'}`}>Sign in</button><button type="button" onClick={() => changeMode('register')} aria-pressed={mode === 'register'} className={`rounded-lg py-2.5 text-sm font-semibold transition ${mode === 'register' ? 'bg-white text-[#263b33] shadow-sm' : 'text-[#7a8880] hover:text-[#354c41]'}`}>Register</button></div>

          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            {mode === 'register' && <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#43564b]">Full name</span><span className="relative block"><UserRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#96a29b]" /><input autoComplete="name" required maxLength={80} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" className="h-12 w-full rounded-xl border border-[#dfe7e1] bg-white pl-10 pr-3 text-sm text-[#25382f] outline-none transition placeholder:text-[#a0aaa4] focus:border-[#86a995] focus:ring-4 focus:ring-[#e7f0e9]" /></span></label>}
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#43564b]">Email address</span><span className="relative block"><Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#96a29b]" /><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@school.edu" className="h-12 w-full rounded-xl border border-[#dfe7e1] bg-white pl-10 pr-3 text-sm text-[#25382f] outline-none transition placeholder:text-[#a0aaa4] focus:border-[#86a995] focus:ring-4 focus:ring-[#e7f0e9]" /></span></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#43564b]">Password</span><span className="relative block"><LockKeyhole size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#96a29b]" /><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} className="h-12 w-full rounded-xl border border-[#dfe7e1] bg-white pl-10 pr-11 text-sm text-[#25382f] outline-none transition placeholder:text-[#a0aaa4] focus:border-[#86a995] focus:ring-4 focus:ring-[#e7f0e9]" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-[#829087] hover:bg-[#f2f5f2] hover:text-[#354c41]">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
            {mode === 'signin' && <div className="-mt-2 flex justify-end"><button type="button" disabled={busy} onClick={() => void sendPasswordReset()} className="text-xs font-semibold text-[#587a65] hover:text-[#31573f] disabled:opacity-50">Forgot password?</button></div>}

            {error && <p role="alert" className="rounded-lg border border-[#f1d8d3] bg-[#fff5f2] px-3 py-2.5 text-xs leading-5 text-[#a34237]">{error}</p>}
            {message && <div role="status" className="flex gap-2 rounded-lg border border-[#dcebdc] bg-[#f1f8f0] px-3 py-2.5 text-xs leading-5 text-[#456c4d]"><CheckCircle2 size={16} className="mt-0.5 shrink-0" />{message}</div>}
            {confirmationEmail && <button type="button" disabled={busy} onClick={() => void resendConfirmation()} className="text-xs font-semibold text-[#587a65] hover:text-[#31573f] disabled:opacity-50">Resend confirmation email</button>}

            <Button type="submit" disabled={busy} icon={mode === 'signin' ? <ArrowRight size={16} /> : <ShoppingBag size={16} />} className="mt-2 w-full py-3">{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</Button>
          </form>

          <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-[#e9eeea]" /><span className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#9aa49e]">or continue with</span><span className="h-px flex-1 bg-[#e9eeea]" /></div>
          <Button type="button" variant="secondary" onClick={() => void signInWithGoogle()} className="w-full py-3"><span className="grid size-5 place-items-center rounded-full border border-[#dfe6e0] text-[11px] font-bold text-[#456555]">G</span>Google</Button>

          <p className="mt-6 text-center text-xs leading-5 text-[#8b9790]">By continuing, you agree to trade fairly and follow through on accepted bids.</p>
          <p className="mt-5 text-center text-sm text-[#7c8982]">{mode === 'signin' ? 'New around here?' : 'Already have an account?'} <button type="button" onClick={() => changeMode(mode === 'signin' ? 'register' : 'signin')} className="font-semibold text-[#436a55] hover:text-[#284a38]">{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></p>
        </motion.div>
      </div>
      <p className="pb-3 text-center text-[10px] text-[#a0aaa4]">Quick Resell · A campus marketplace</p>
    </section>
  </main>
}
