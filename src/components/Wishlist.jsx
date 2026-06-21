import { useEffect, useState } from 'react'
import { searchAll } from '../services/metadata.js'
import Cover from './Cover.jsx'
import Icon from './Icon.jsx'

/** Records you're hunting for. Search-to-add, remove, or "Got it!" to move one
 *  into the owned collection. */
export default function Wishlist({ wants, onAdd, onRemove, onPromote }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    const ctrl = new AbortController()
    setSearching(true)
    const t = setTimeout(() => {
      searchAll(q, { signal: ctrl.signal }).then(setResults).catch(() => {}).finally(() => setSearching(false))
    }, 400)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [query])

  const addResult = (r) => {
    onAdd({ album: r.album, artist: r.artist, year: r.year, genre: r.genre, coverUrl: r.coverUrl })
    setQuery(''); setResults([])
  }
  const addTyped = () => {
    if (!query.trim()) return
    onAdd({ album: query.trim(), artist: '' })
    setQuery(''); setResults([])
  }

  return (
    <div className="wishlist">
      <div className="field">
        <div className="search-inline">
          <Icon name="search" size={18} />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a record to add to your wishlist…" />
          {searching && <span className="spinner" aria-hidden />}
        </div>
        {results.length > 0 && (
          <ul className="search-results">
            {results.map((r, i) => (
              <li key={`${r._source}-${r._sourceId}-${i}`}>
                <button type="button" onClick={() => addResult(r)}>
                  {r.coverUrl
                    ? <img src={r.coverUrl} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    : <div className="result-noart"><Icon name="disc" size={18} /></div>}
                  <span className="result-text"><strong>{r.album}</strong><small>{r.artist}{r.year ? ` · ${r.year}` : ''}</small></span>
                  <Icon name="plus" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim().length >= 2 && !searching && results.length === 0 && (
          <button className="btn btn-ghost" onClick={addTyped}>Add “{query.trim()}” manually</button>
        )}
      </div>

      {wants.length === 0 ? (
        <p className="empty-note">Nothing on the hunt yet. Search above to add records you want.</p>
      ) : (
        <ul className="want-list">
          {wants.map((w) => (
            <li key={w.id} className="want-row">
              <Cover record={w} className="want-thumb" />
              <div className="want-text"><strong>{w.album || 'Untitled'}</strong><small>{w.artist}{w.year ? ` · ${w.year}` : ''}</small></div>
              <div className="want-actions">
                <button className="btn btn-ghost" onClick={() => onPromote(w)} title="Move to collection">Got it!</button>
                <button className="icon-btn" onClick={() => onRemove(w.id)} aria-label="Remove from wishlist"><Icon name="close" size={18} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
