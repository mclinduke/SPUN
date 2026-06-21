import { useEffect, useMemo, useState } from 'react'
import { supabase, isCloud } from '../data/supabaseClient.js'
import { createSupabaseRepository } from '../data/supabaseRepository.js'
import { setRepository } from '../data/repository.js'
import { bustAllCovers } from '../hooks/useCoverSrc.js'
import Icon from './Icon.jsx'

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

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand"><Icon name="disc" size={30} /><span>SPUN</span></div>
        <p className="auth-tag">Your vinyl, in your pocket.</p>
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

  // Bind the repository to the signed-in user before the app renders.
  useMemo(() => {
    if (cloud && session?.user) setRepository(createSupabaseRepository(supabase, session.user.id))
  }, [cloud, session?.user?.id])

  if (!cloud) return children
  if (session === undefined) return <div className="auth-loading">Loading…</div>
  if (!session) return <AuthScreen />
  return children
}
