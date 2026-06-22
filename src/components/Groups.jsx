import { useEffect, useState } from 'react'
import { getRepository } from '../data/repository.js'
import Icon from './Icon.jsx'

function ago(ts) {
  if (!ts) return ''
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}d ago` : new Date(ts).toLocaleDateString()
}

/** Friend groups + a shared "what everyone's been spinning" feed. */
export default function Groups({ onClose }) {
  const repo = getRepository()
  const [groups, setGroups] = useState(null) // null = loading
  const [ready, setReady] = useState(true)
  const [createName, setCreateName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [sel, setSel] = useState(null) // selected group
  const [feed, setFeed] = useState(null)
  const [members, setMembers] = useState([])

  const loadGroups = async () => {
    try { setGroups(await repo.listGroups()); setReady(true) }
    catch (e) { if (/function|does not exist|404|pgrst/i.test(e.message || '')) setReady(false); else setErr(e.message); setGroups([]) }
  }
  useEffect(() => { loadGroups() }, []) // eslint-disable-line

  const run = async (fn) => { setBusy(true); setErr(null); try { await fn() } catch (e) { setErr(e.message || String(e)) } finally { setBusy(false) } }

  const create = () => { if (!createName.trim()) return; run(async () => { const g = await repo.createGroup(createName); setCreateName(''); setMsg(`Created “${g.name}” — share code ${g.inviteCode}`); await loadGroups() }) }
  const join = () => { if (!joinCode.trim()) return; run(async () => { const g = await repo.joinGroup(joinCode); setJoinCode(''); setMsg(g ? `Joined “${g.name}”` : null); if (!g) setErr('No group with that code.'); else await loadGroups() }) }
  const leave = (g) => run(async () => { await repo.leaveGroup(g.id); setSel(null); await loadGroups() })

  const openGroup = (g) => {
    setSel(g); setFeed(null); setMembers([])
    repo.groupFeed(g.id).then(setFeed).catch((e) => setErr(e.message))
    repo.groupMembers(g.id).then(setMembers).catch(() => {})
  }
  const share = (g) => {
    const text = `Join my SPUN group “${g.name}” — open SPUN → Groups → Join, code: ${g.inviteCode}`
    if (navigator.share) navigator.share({ text }).catch(() => {})
    else { navigator.clipboard?.writeText(g.inviteCode); setMsg(`Code ${g.inviteCode} copied`) }
  }

  if (!ready) {
    return <div className="empty-note"><p>Groups needs a one-time database setup (run <strong>supabase/groups.sql</strong>).</p></div>
  }

  // ---- a single group: feed + members ----
  if (sel) {
    return (
      <div className="groups">
        <button className="linkish back" onClick={() => setSel(null)}><Icon name="chevronLeft" size={15} /> All groups</button>
        <div className="group-head">
          <strong>{sel.name}</strong>
          <span className="hint">Invite code <code>{sel.inviteCode}</code> · {members.length || sel.memberCount} member{(members.length || sel.memberCount) === 1 ? '' : 's'}</span>
          <div className="form-actions-row">
            <button className="btn btn-ghost btn-sm" onClick={() => share(sel)}><Icon name="upload" size={14} /> Share invite</button>
            <button className="btn btn-ghost btn-sm danger" onClick={() => leave(sel)} disabled={busy}>Leave</button>
          </div>
        </div>
        {err && <p className="auth-err">{err}</p>}
        <h4 className="group-sub">Recently spun</h4>
        {feed === null ? <p className="hint"><span className="spinner" /> Loading…</p>
          : feed.length === 0 ? <p className="empty-note">No spins yet. When members tap “I spun this”, it shows up here.</p>
          : (
            <ul className="feed">
              {feed.map((f, i) => (
                <li key={i} className="feed-row">
                  {f.coverUrl ? <img className="feed-cover" src={f.coverUrl} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} /> : <div className="feed-cover noart"><Icon name="disc" size={16} /></div>}
                  <span className="feed-meta">
                    <strong>{f.album || 'Untitled'}</strong>
                    <small>{f.artist}</small>
                    <small className="feed-who">{f.username ? `@${f.username}` : f.name} · {ago(f.playedAt)}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
      </div>
    )
  }

  // ---- group list + create/join ----
  return (
    <div className="groups">
      <form className="friend-add" onSubmit={(e) => { e.preventDefault(); create() }}>
        <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="New group name (e.g. The Crate)" maxLength={40} />
        <button className="btn btn-primary" type="submit" disabled={busy || !createName.trim()}>Create</button>
      </form>
      <form className="friend-add" onSubmit={(e) => { e.preventDefault(); join() }}>
        <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Join with an invite code" autoCapitalize="off" autoCorrect="off" spellCheck="false" />
        <button className="btn btn-ghost" type="submit" disabled={busy || !joinCode.trim()}>Join</button>
      </form>
      {msg && <p className="auth-msg" aria-live="polite">{msg}</p>}
      {err && <p className="auth-err" aria-live="polite">{err}</p>}

      {groups === null ? <p className="hint"><span className="spinner" /> Loading your groups…</p>
        : groups.length === 0 ? <p className="empty-note">No groups yet. Create one and share the code, or join a friend’s.</p>
        : (
          <ul className="group-list">
            {groups.map((g) => (
              <li key={g.id}>
                <button className="group-item" onClick={() => openGroup(g)}>
                  <Icon name="users" size={18} />
                  <span className="group-meta"><strong>{g.name}</strong><small>{g.memberCount} member{g.memberCount === 1 ? '' : 's'} · see what they’re spinning</small></span>
                  <Icon name="chevronRight" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
