import { useEffect, useState } from 'react'
import { getRepository } from '../data/repository.js'
import Icon from './Icon.jsx'

const REQUEST_MSG = {
  requested: 'Request sent.',
  accepted: 'You’re now friends!',
  already_friends: 'You’re already friends.',
  already_pending: 'There’s already a pending request with them.',
  not_found: 'No SPUN user found — double-check the username (or email).',
}
const SET_HANDLE_MSG = {
  ok: 'Handle saved.',
  taken: 'That handle is taken — try another.',
  invalid: '3–20 characters, lowercase letters, numbers and _ only.',
}
const handleLabel = (f) => (f.username ? `@${f.username}` : f.email)

/** Pick a @handle, find friends by username, accept/decline, browse collections. */
export default function Friends({ accepted, incoming, outgoing, loading, error, ready, reload, onViewFriend }) {
  const repo = getRepository()
  const [handle, setHandle] = useState(null) // null=loading, ''=unclaimed
  const [handleInput, setHandleInput] = useState('')
  const [editingHandle, setEditingHandle] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [usernamesReady, setUsernamesReady] = useState(true)

  useEffect(() => {
    repo.myProfile().then((p) => setHandle(p.username || '')).catch(() => setHandle(''))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Live username search (skip when it looks like an email).
  useEffect(() => {
    const q = query.trim()
    if (q.includes('@') || q.length < 2) { setResults([]); return }
    let active = true
    const t = setTimeout(() => {
      repo.searchUsers(q)
        .then((r) => { if (active) setResults(r) })
        .catch((e) => { if (active && /function|does not exist|404|pgrst/i.test(e.message || '')) setUsernamesReady(false) })
    }, 300)
    return () => { active = false; clearTimeout(t) }
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn) => {
    setBusy(true); setErr(null)
    try { await fn() } catch (e) {
      const m = e.message || String(e)
      if (/function|does not exist|404|pgrst/i.test(m)) { setUsernamesReady(false); setErr('Usernames need the latest database update (run supabase/usernames.sql).') }
      else setErr(m)
    } finally { setBusy(false) }
  }

  const claimHandle = () => {
    const v = handleInput.trim().toLowerCase()
    if (!v) return
    setMsg(null)
    run(async () => {
      const res = await repo.setUsername(v)
      setMsg(SET_HANDLE_MSG[res] || 'Done.')
      if (res === 'ok') { setHandle(v); setEditingHandle(false) }
    })
  }

  const requestByUsername = (uname) => run(async () => {
    setMsg(REQUEST_MSG[await repo.sendFriendRequestByUsername(uname)] || 'Done.')
    setQuery(''); setResults([])
    await reload()
  })

  const addTyped = (e) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setMsg(null)
    run(async () => {
      const res = q.includes('@') ? await repo.sendFriendRequest(q) : await repo.sendFriendRequestByUsername(q)
      setMsg(REQUEST_MSG[res] || 'Done.')
      if (res === 'requested' || res === 'accepted') { setQuery(''); setResults([]) }
      await reload()
    })
  }

  const respond = (f, accept) => run(async () => { await repo.respondFriendRequest(f.friendshipId, accept); await reload() })
  const unfriend = (f) => run(async () => { await repo.removeFriend(f.otherId); await reload() })

  if (!ready) {
    return (
      <div className="empty-note">
        <p>Friends needs a quick one-time database setup.</p>
        <p>Once that’s done, come back to pick a username and add friends.</p>
      </div>
    )
  }

  return (
    <div className="friends">
      {/* your handle */}
      <div className="handle-box">
        {handle === null ? (
          <p className="hint">Loading your handle…</p>
        ) : (handle && !editingHandle) ? (
          <p className="handle-current">Your handle: <strong>@{handle}</strong> <button className="linkish" onClick={() => { setEditingHandle(true); setHandleInput(handle) }}>Change</button></p>
        ) : (
          <>
            <label className="hint" htmlFor="handle-in">{handle ? 'Change your handle' : 'Pick a username so friends can find you'}</label>
            <div className="handle-row">
              <span className="handle-at">@</span>
              <input id="handle-in" value={handleInput} onChange={(e) => setHandleInput(e.target.value.toLowerCase())} placeholder="yourname" maxLength={20} autoCapitalize="off" autoCorrect="off" spellCheck="false" />
              <button className="btn btn-primary btn-sm" onClick={claimHandle} disabled={busy || !handleInput.trim()}>Save</button>
            </div>
          </>
        )}
      </div>

      {/* add a friend */}
      <form className="friend-add" onSubmit={addTyped}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a friend by @username (or email)" autoCapitalize="off" autoCorrect="off" spellCheck="false" aria-label="Find a friend by username or email" />
        <button className="btn btn-primary" type="submit" disabled={busy || !query.trim()}>Add</button>
      </form>
      {results.length > 0 && (
        <ul className="user-results">
          {results.map((u) => (
            <li key={u.username}>
              <button type="button" className="user-result" onClick={() => requestByUsername(u.username)} disabled={busy}>
                <span className="friend-id"><strong>@{u.username}</strong></span>
                <span className="user-add"><Icon name="plus" size={16} /> Add</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="auth-msg" aria-live="polite">{msg}</p>}
      {err && <p className="auth-err" aria-live="polite">{err}</p>}
      {!usernamesReady && <p className="hint">Tip: share your @handle with friends so they can add you.</p>}

      {incoming.length > 0 && (
        <section className="friend-group">
          <h4>Requests for you</h4>
          {incoming.map((f) => (
            <div key={f.friendshipId} className="friend-row">
              <span className="friend-id"><strong>{f.name}</strong><small>{handleLabel(f)}</small></span>
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
                <strong>{f.name}</strong><small>{handleLabel(f)}</small>
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
              <span className="friend-id"><strong>{f.name}</strong><small>{handleLabel(f)} · pending</small></span>
              <button className="btn btn-ghost btn-sm" onClick={() => respond(f, false)} disabled={busy}>Cancel</button>
            </div>
          ))}
        </section>
      )}

      {!loading && !accepted.length && !incoming.length && !outgoing.length && (
        <p className="empty-note">No friends yet — find one by @username above.</p>
      )}
    </div>
  )
}
