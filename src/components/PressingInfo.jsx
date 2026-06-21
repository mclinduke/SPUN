import { useEffect, useState } from 'react'
import { lookupRecord, cachedRecord, rarityStale, rarityLabel } from '../services/discogs.js'
import Icon from './Icon.jsx'

/** Pressing details + an honest rarity signal from Discogs. Lazy (no network on
 *  open unless the user asks); cached; marketplace numbers hidden once stale. */
export default function PressingInfo({ record }) {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | error
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setData(null); setStatus('idle'); setError('')
    cachedRecord(record.id).then((c) => { if (active && c) setData(c) })
    return () => { active = false }
  }, [record.id])

  const load = async (force = false) => {
    setStatus('loading'); setError('')
    try { setData(await lookupRecord(record, { force })) }
    catch (e) { setError(e.message || String(e)); setStatus('error'); return }
    setStatus('idle')
  }

  const stale = data?.found && rarityStale(data.fetchedAt)
  const label = data?.found ? rarityLabel(data.have, data.want) : null

  return (
    <section className="pressing">
      <h4 className="pressing-head"><Icon name="sparkle" size={16} /> Tracklist, credits &amp; pressing</h4>

      {!data && status === 'idle' && (
        <button className="btn btn-ghost pressing-cta" onClick={() => load(false)}>
          <Icon name="search" size={16} /> Look up on Discogs
        </button>
      )}
      {status === 'loading' && <p className="hint"><span className="spinner" /> Checking Discogs…</p>}
      {status === 'error' && (
        <p className="hint">Couldn’t reach Discogs: {error}. <button className="linkish" onClick={() => load(false)}>Retry</button></p>
      )}

      {data && !data.found && status !== 'loading' && (
        <p className="hint">No Discogs match found — pressing/rarity unavailable. <button className="linkish" onClick={() => load(true)}>Search again</button></p>
      )}

      {data?.found && (
        <>
          <dl className="pressing-grid">
            {data.labels?.length > 0 && (
              <><dt>Label</dt><dd>{data.labels.map((l) => `${l.name}${l.catno ? ` — ${l.catno}` : ''}`).join(' · ')}</dd></>
            )}
            {data.formats?.length > 0 && (<><dt>Format</dt><dd>{data.formats.join(', ')}</dd></>)}
            {(data.country || data.year) && (<><dt>Pressing</dt><dd>{[data.country, data.year].filter(Boolean).join(' · ')}</dd></>)}
            {data.styles?.length > 0 && (<><dt>Style</dt><dd>{data.styles.join(', ')}</dd></>)}
          </dl>

          <div className="rarity">
            {stale ? (
              <p className="hint">Marketplace data is more than 6 h old.{' '}
                <button className="linkish" onClick={() => load(true)}>Refresh rarity</button></p>
            ) : (data.have || data.want) ? (
              <>
                {label && <span className="rarity-badge">{label}</span>}
                <p className="rarity-line">
                  Wanted by <strong>{data.want ?? '—'}</strong>, owned by <strong>{data.have ?? '—'}</strong> collectors
                  {data.numForSale != null && data.numForSale > 0 && (
                    <> · {data.numForSale} for sale{data.lowestPrice != null ? ` from $${Math.round(data.lowestPrice)}` : ''}</>
                  )}
                </p>
                <p className="hint">Rarity is inferred from Discogs community counts — a signal, not a verdict.</p>
              </>
            ) : (
              <p className="hint">No community rarity data for this pressing.</p>
            )}
          </div>

          {data.recordedAt?.length > 0 && (
            <div className="liner-block">
              <h5>Recorded at</h5>
              <p className="liner-studios">{data.recordedAt.map((r) => r.kind && !/^recorded at$/i.test(r.kind) ? `${r.name} (${r.kind})` : r.name).join(' · ')}</p>
            </div>
          )}

          {data.tracklist?.length > 0 && (
            <div className="liner-block">
              <h5>Tracklist</h5>
              <ol className="tracklist">
                {data.tracklist.map((t, i) => (
                  <li key={i}><span className="tk-pos">{t.pos || i + 1}</span><span className="tk-title">{t.title}</span>{t.dur && <span className="tk-dur">{t.dur}</span>}</li>
                ))}
              </ol>
            </div>
          )}

          {data.credits?.length > 0 && (
            <div className="liner-block">
              <h5>Credits</h5>
              <ul className="credits">
                {data.credits.map((c, i) => (
                  <li key={i}><span className="cr-role">{c.role}</span><span className="cr-name">{c.name}</span></li>
                ))}
              </ul>
            </div>
          )}

          {!data.tracklist?.length && !data.credits?.length && !data.recordedAt?.length && (
            <p className="hint">Discogs has this release, but no tracklist, credits, or studio are listed for this pressing.</p>
          )}

          <a className="discogs-link" href={data.url} target="_blank" rel="noreferrer">
            View on Discogs <Icon name="chevronRight" size={14} />
          </a>
        </>
      )}
    </section>
  )
}
