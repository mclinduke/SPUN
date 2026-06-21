import { useEffect, useRef, useState } from 'react'
import { searchAll } from '../services/metadata.js'
import Cover from './Cover.jsx'
import Icon from './Icon.jsx'

/** Fix a record's cover on the fly: search official art and tap to set it,
 *  take/replace your own photo, or switch which one shows when you have both. */
export default function CoverEditor({ record, onSetOfficial, onPickPhoto, onUsePhoto, onUseOfficial, onRemovePhoto }) {
  const [query, setQuery] = useState(`${record.artist} ${record.album}`.trim())
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    const ctrl = new AbortController()
    setSearching(true)
    const t = setTimeout(() => {
      searchAll(q, { signal: ctrl.signal })
        .then((r) => setResults(r.filter((x) => x.coverUrl)))
        .catch(() => {})
        .finally(() => setSearching(false))
    }, 400)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [query])

  const bothCovers = record.hasPhoto && record.coverUrl

  return (
    <div className="cover-editor">
      <div className="ce-current">
        <Cover record={record} className="ce-cover" />
        <div className="ce-current-meta">
          <strong>{record.album || 'Untitled'}</strong>
          <small>{record.artist}</small>
          {bothCovers && (
            <div className="ce-toggle">
              <button type="button" className={`chip ${record.coverSource !== 'official' ? 'on' : ''}`} onClick={onUsePhoto}>My photo</button>
              <button type="button" className={`chip ${record.coverSource === 'official' ? 'on' : ''}`} onClick={onUseOfficial}>Official art</button>
            </div>
          )}
        </div>
      </div>

      <div className="field">
        <label htmlFor="ce-search">Find the right cover</label>
        <div className="search-inline">
          <Icon name="search" size={18} />
          <input id="ce-search" type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search album art…" />
          {searching && <span className="spinner" aria-hidden />}
        </div>
        <p className="hint">Tap a cover to use it as the official art (your photo is kept as a fallback).</p>
      </div>

      {results.length > 0 && (
        <div className="ce-grid">
          {results.map((r, i) => (
            <button
              key={`${r._source}-${r._sourceId}-${i}`}
              type="button"
              className="ce-option"
              onClick={() => onSetOfficial(r.coverUrl)}
              title={`${r.album} — ${r.artist}`}
            >
              <img src={r.coverUrl} alt={`${r.album} — ${r.artist}`} loading="lazy" onError={(e) => { const b = e.currentTarget.closest('.ce-option'); if (b) b.style.display = 'none' }} />
            </button>
          ))}
        </div>
      )}

      <div className="ce-photo">
        <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
          <Icon name="camera" size={18} /> {record.hasPhoto ? 'Replace my photo' : 'Use my own photo'}
        </button>
        {record.hasPhoto && <button type="button" className="btn btn-ghost danger" onClick={onRemovePhoto}>Remove my photo</button>}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickPhoto(f) }} />
      </div>
    </div>
  )
}
