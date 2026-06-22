import { cloneElement, useEffect, useMemo, useState } from 'react'
import { supabase, isCloud } from '../data/supabaseClient.js'
import { createSupabaseRepository } from '../data/supabaseRepository.js'
import { setRepository } from '../data/repository.js'
import { bustAllCovers } from '../hooks/useCoverSrc.js'
import Icon from './Icon.jsx'
import Logo from './Logo.jsx'

function AuthScreen() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(null); setMsg(null)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMsg('Account created. If your project requires email confirmation, check your inbox, then sign in.')
        setMode('signin')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error // AuthGate's listener takes it from here
      }
    } catch (e2) {
      setErr(e2.message || String(e2))
    } finally {
      setBusy(false)
    }
  }

  const signInGoogle = async () => {
    setBusy(true); setErr(null); setMsg(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) { setErr(error.message); setBusy(false) } // success -> redirect to Google
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand"><Logo size={32} /><span>SPUN</span></div>
        <p className="auth-tag">Your vinyl, in your pocket.</p>
        <button type="button" className="btn btn-google" onClick={signInGoogle} disabled={busy}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
          </svg>
          Continue with Google
        </button>
        <div className="auth-or"><span>or</span></div>
        <form onSubmit={submit} className="auth-form">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" />
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (6+ chars)" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
        </form>
        {err && <p className="auth-err">{err}</p>}
        {msg && <p className="auth-msg">{msg}</p>}
        <button className="linkish" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setErr(null); setMsg(null) }}>
          {mode === 'signup' ? 'Have an account? Sign in' : 'New here? Create an account'}
        </button>
      </div>
    </div>
  )
}

/** In cloud mode, require sign-in and point the repository at the user's data.
 *  In local mode (no Supabase env), renders the app unchanged. */
export default function AuthGate({ children }) {
  const cloud = isCloud()
  const [session, setSession] = useState(cloud ? undefined : null) // undefined = loading

  useEffect(() => {
    if (!cloud) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { bustAllCovers(); setSession(s) })
    return () => sub.subscription.unsubscribe()
  }, [cloud])

  // Bind the repository to the signed-in user before the app renders; on sign-out,
  // drop the user-bound client so a stale instance can't serve the next person.
  useMemo(() => {
    if (!cloud) return
    if (session?.user) setRepository(createSupabaseRepository(supabase, session.user.id))
    else setRepository(null) // back to the default repo; nothing reads it while signed out
  }, [cloud, session?.user?.id])

  if (!cloud) return children
  if (session === undefined) return <div className="auth-loading">Loading…</div>
  if (!session) return <AuthScreen />
  // Remount the whole app on user change so every hook re-reads the new account.
  return cloneElement(children, { key: session.user.id })
}
