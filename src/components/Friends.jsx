import { useState } from 'react'
import { getRepository } from '../data/repository.js'
import Icon from './Icon.jsx'

const REQUEST_MSG = {
  requested: 'Request sent.',
  accepted: "You’re now friends!",
  already_friends: 'You’re already friends.',
  already_pending: 'There’s already a pending request with them.',
  not_found: 'No SPUN user has that email yet — they need an account first.',
}

/** Add friends by email, accept/decline requests, browse a friend's collection. */
export default function Friends({ accepted, incoming, outgoing, loading, error, ready, reload, onViewFriend }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const repo = getRepository()

  const run = async (fn) => {
    setBusy(true); setErr(null)
    try { await fn() } catch (e) { setErr(e.message || String(e)) } finally { setBusy(false) }
  }

  const send = (e) => {
    e.preventDefault()
    const addr = email.trim()
    if (!addr) return
    setMsg(null)
    run(async () => {
      const res = await repo.sendFriendRequest(addr)
      setMsg(REQUEST_MSG[res] || 'Done.')
      if (res === 'requested' || res === 'accepted') setEmail('')
      await reload()
    })
  }
  const respond = (f, accept) => run(async () => { await repo.respondFriendRequest(f.friendshipId, accept); await reload() })
  const unfriend = (f) => run(async () => { await repo.removeFriend(f.otherId); await reload() })

  if (!ready) {
    return (
      <div className="empty-note">
        <p>Friends needs a quick one-time database setup.</p>
        <p>Once that’s done, come back here to add friends by email.</p>
      </div>
    )
  }

  return (
    <div className="friends">
      <form className="friend-add" onSubmit={send}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Friend’s email" autoComplete="off" aria-label="Friend’s email" />
        <button className="btn btn-primary" type="submit" disabled={busy || !email.trim()}>Add</button>
      </form>
      {msg && <p className="auth-msg" aria-live="polite">{msg}</p>}
      {err && <p className="auth-err" aria-live="polite">{err}</p>}
      <p className="hint">They need a SPUN account on that email. Once you connect, you can each browse the other’s collection.</p>

      {incoming.length > 0 && (
        <section className="friend-group">
          <h4>Requests for you</h4>
          {incoming.map((f) => (
            <div key={f.friendshipId} className="friend-row">
              <span className="friend-id"><strong>{f.name}</strong><small>{f.email}</small></span>
              <span className="friend-actions">
                <button className="btn btn-primary btn-sm" onClick={() => respond(f, true)} disabled={busy}>Accept</button>
                <button className="btn btn-ghost btn-sm" onClick={() => respond(f, false)} disabled={busy}>Decline</button>
              </span>
            </div>
          ))}
        </section>
      )}

      {accepted.length > 0 && (
        <section className="friend-group">
          <h4>Friends</h4>
          {accepted.map((f) => (
            <div key={f.friendshipId} className="friend-row">
              <button className="friend-id friend-open" onClick={() => onViewFriend(f)}>
                <strong>{f.name}</strong><small>{f.email}</small>
              </button>
              <span className="friend-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => onViewFriend(f)}><Icon name="grid" size={15} /> Collection</button>
                <button className="btn btn-ghost btn-sm danger" onClick={() => unfriend(f)} disabled={busy} aria-label={`Remove ${f.name}`}><Icon name="trash" size={15} /></button>
              </span>
            </div>
          ))}
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="friend-group">
          <h4>Sent requests</h4>
          {outgoing.map((f) => (
            <div key={f.friendshipId} className="friend-row">
              <span className="friend-id"><strong>{f.name}</strong><small>{f.email} · pending</small></span>
              <button className="btn btn-ghost btn-sm" onClick={() => respond(f, false)} disabled={busy}>Cancel</button>
            </div>
          ))}
        </section>
      )}

      {!loading && !accepted.length && !incoming.length && !outgoing.length && (
        <p className="empty-note">No friends yet — add one by email above.</p>
      )}
    </div>
  )
}
