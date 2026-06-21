import { useState } from 'react'
import { fetchDiscogsCollection } from '../services/discogs.js'
import Icon from './Icon.jsx'

/** Import a public Discogs collection by username — covers + full metadata.
 *  Skips records already in SPUN (by artist + album). */
export default function DiscogsImport({ onCommit, onCancel, findDuplicate }) {
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState('idle') // idle | fetching | review | error
  const [progress, setProgress] = useState(null)
  const [drafts, setDrafts] = useState([])
  const [error, setError] = useState(null)

  const run = async () => {
    if (!username.trim()) return
    setStatus('fetching'); setError(null); setProgress(null)
    try {
      const all = await fetchDiscogsCollection(username, { onProgress: setProgress })
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
        <p>Fetching your collection…{progress ? ` page ${progress.page} of ${progress.pages} · ${progress.count} found` : ''}</p>
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
      </div>
      {error && <p className="auth-err" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={run} disabled={!username.trim()}>
          <Icon name="download" size={18} /> Import collection
        </button>
      </div>
    </div>
  )
}
