import { useEffect, useMemo, useState } from 'react'
import { getMasterVersions } from '../services/discogs.js'
import Sheet from './Sheet.jsx'
import Icon from './Icon.jsx'

/** Lists every Discogs pressing of an album so the user can match the one they
 *  physically own (by catalog # + deadwax) and store it on the record. */
export default function PressingIdentify({ masterId, masterYear, current, onChoose, onClose }) {
  const [versions, setVersions] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let active = true
    setVersions(null); setError('')
    getMasterVersions(masterId)
      .then((v) => { if (active) setVersions(v) })
      .catch((e) => { if (active) setError(e.message || String(e)) })
    return () => { active = false }
  }, [masterId])

  const isOriginal = (v) => Boolean(v.year && masterYear && v.year <= masterYear)

  const filtered = useMemo(() => {
    if (!versions) return []
    const q = filter.trim().toLowerCase()
    if (!q) return versions
    return versions.filter((v) => `${v.country} ${v.label} ${v.catalogNo} ${v.year} ${v.format}`.toLowerCase().includes(q))
  }, [versions, filter])

  const choose = (v) => onChoose({
    releaseId: v.id,
    year: v.year || null,
    country: v.country || '',
    label: v.label || '',
    catalogNo: v.catalogNo || '',
    format: v.format || '',
    isOriginal: isOriginal(v),
    identifiedAt: Date.now(),
  })

  return (
    <Sheet title="Which pressing do you have?" onClose={onClose} wide>
      <div className="pressing-identify">
        <p className="hint">
          Match yours by the <strong>catalog #</strong> on the spine/label and the <strong>deadwax</strong> etching in the run-out groove.
          {masterYear ? ` The original is from ${masterYear}.` : ''}
        </p>
        <div className="search-inline">
          <Icon name="search" size={16} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by country, label, catalog #…" aria-label="Filter pressings" />
        </div>

        {error && <p className="hint">Couldn’t load pressings: {error}. <button className="linkish" onClick={() => setFilter((f) => f)}>Retry by reopening</button></p>}
        {!versions && !error && <p className="hint"><span className="spinner" /> Loading every pressing…</p>}

        {versions && (
          <ul className="version-list">
            {filtered.map((v) => {
              const chosen = current?.releaseId === v.id
              return (
                <li key={v.id}>
                  <button type="button" className={`version-row ${chosen ? 'chosen' : ''}`} onClick={() => choose(v)}>
                    {v.thumb
                      ? <img src={v.thumb} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                      : <div className="version-noart"><Icon name="disc" size={16} /></div>}
                    <span className="version-meta">
                      <strong>{[v.year, v.country].filter(Boolean).join(' · ') || 'Unknown'}{isOriginal(v) && <span className="verdict-badge is-original">Original</span>}</strong>
                      {(v.label || v.catalogNo) && <small>{[v.label, v.catalogNo].filter(Boolean).join(' — ')}</small>}
                      {v.format && <small className="version-fmt">{v.format}</small>}
                    </span>
                    {chosen && <Icon name="check" size={18} />}
                  </button>
                </li>
              )
            })}
            {!filtered.length && <li className="hint">No pressings match that filter.</li>}
          </ul>
        )}
      </div>
    </Sheet>
  )
}
