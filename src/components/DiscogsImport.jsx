import { useState } from 'react'
import { fetchDiscogsCollection, getUserDiscogsToken, setUserDiscogsToken } from '../services/discogs.js'
import Icon from './Icon.jsx'

/** Import a public Discogs collection by username — covers + full metadata.
 *  Skips records already in SPUN (by artist + album). */
export default function DiscogsImport({ onCommit, onCancel, findDuplicate }) {
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState('idle') // idle | fetching | review | error
  const [progress, setProgress] = useState(null)
  const [drafts, setDrafts] = useState([])
  const [error, setError] = useState(null)
  const [tokenOpen, setTokenOpen] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [hasToken, setHasToken] = useState(() => Boolean(getUserDiscogsToken()))

  const saveToken = () => { setUserDiscogsToken(tokenInput); setHasToken(Boolean(tokenInput.trim())); setTokenOpen(false); setTokenInput('') }
  const clearToken = () => { setUserDiscogsToken(''); setHasToken(false) }

  const run = async () => {
    if (!username.trim()) return
    setStatus('fetching'); setError(null); setProgress(null)
    try {
      const all = await fetchDiscogsCollection(username, { onProgress: setProgress })
      if (!all.length) {
        // Reached Discogs but got nothing — almost always a private collection or
        // the wrong name. (A private collection often returns an empty list rather
        // than an error.) Tell the user exactly how to fix it.
        setError('We reached Discogs but found no records. Two things to check: (1) your collection must be set to Public (Discogs → Settings → Privacy → Collection), and (2) use your exact username from your profile URL discogs.com/user/USERNAME — not your display name or email.')
        setStatus('error')
        return
      }
      setDrafts(all)
      setStatus('review')
    } catch (e) {
      setError(e.message || String(e)); setStatus('error')
    }
  }

  const fresh = findDuplicate ? drafts.filter((d) => !findDuplicate(d.album, d.artist)) : drafts
  const dupCount = drafts.length - fresh.length

  if (status === 'fetching') {
    return (
      <div className="dg-progress" role="status" aria-live="polite">
        <span className="spinner" aria-hidden />
        {progress?.waiting
          ? <p>Discogs is busy — waiting a moment and retrying automatically… ({progress.count} found so far)</p>
          : <p>Fetching your collection…{progress ? ` page ${progress.page} of ${progress.pages} · ${progress.count} found` : ''}</p>}
      </div>
    )
  }

  if (status === 'review') {
    return (
      <div className="discogs-import">
        <div className="dg-summary">
          <span className="big-number">{drafts.length}</span>
          <p>records in your Discogs collection</p>
          <p className="hint">{fresh.length} new to add{dupCount ? ` · ${dupCount} already in SPUN (skipped)` : ''}.</p>
        </div>
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onCommit(fresh)} disabled={!fresh.length}>
            Add {fresh.length} record{fresh.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="discogs-import">
      <p className="hint">
        Pull your collection straight from Discogs — covers, year, genre, label, and catalog number.
        Your Discogs collection must be <strong>public</strong> (Discogs → Settings → Privacy).
      </p>
      <div className="field">
        <label htmlFor="dg-user">Discogs username</label>
        <input
          id="dg-user" type="text" value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run() } }}
          placeholder="your Discogs username" autoCapitalize="off" autoCorrect="off" spellCheck="false"
        />
        <p className="hint-inline">Your exact username from <strong>discogs.com/user/…</strong> (not your display name or email), and your collection must be set to Public.</p>
      </div>
      {error && <p className="auth-err" role="alert">{error}</p>}

      <div className="dg-token">
        {hasToken ? (
          <p className="hint">✓ Using your own Discogs token — imports run on your personal limit. <button className="linkish" onClick={clearToken}>Disconnect</button></p>
        ) : tokenOpen ? (
          <div className="field">
            <label htmlFor="dg-token">Your Discogs token</label>
            <input id="dg-token" type="text" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="paste token" autoCapitalize="off" autoCorrect="off" spellCheck="false" />
            <p className="hint-inline">Discogs → Settings → Developers → <strong>Generate new token</strong>, then paste it here. It’s stored only on this device and never leaves it except to Discogs.</p>
            <div className="form-actions-row">
              <button className="btn btn-ghost btn-sm" onClick={() => setTokenOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={saveToken} disabled={!tokenInput.trim()}>Save token</button>
            </div>
          </div>
        ) : (
          <button className="linkish" onClick={() => setTokenOpen(true)}>Hitting rate limits? Connect your own Discogs token →</button>
        )}
      </div>

      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={run} disabled={!username.trim()}>
          <Icon name="download" size={18} /> Import collection
        </button>
      </div>
    </div>
  )
}
