import { useMemo, useState } from 'react'
import { bestMatchFree } from '../services/metadata.js'
import Cover from './Cover.jsx'
import Icon from './Icon.jsx'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Finds records with no cover art (placeholder) and pulls candidate covers from
 *  iTunes/MusicBrainz so you can apply them one tap at a time. Runs in YOUR
 *  session, so it works on your real collection without anyone touching your data. */
export default function CoverFixer({ records, onApply, onClose }) {
  const targets = useMemo(() => records.filter((r) => !r.coverUrl && !r.hasPhoto), [records])
  const [results, setResults] = useState([]) // { record, coverUrl }
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [misses, setMisses] = useState(0)
  const [applied, setApplied] = useState(() => new Set())

  const scan = async () => {
    setScanning(true); setResults([]); setMisses(0); setApplied(new Set())
    setProgress({ done: 0, total: targets.length })
    const found = []
    let miss = 0
    for (let i = 0; i < targets.length; i++) {
      const r = targets[i]
      let cover = null
      try { const hit = await bestMatchFree(`${r.artist} ${r.album}`.trim()); cover = hit?.coverUrl || null } catch { /* skip */ }
      if (cover) found.push({ record: r, coverUrl: cover }); else miss += 1
      setResults([...found]); setMisses(miss)
      setProgress({ done: i + 1, total: targets.length })
      await sleep(250)
    }
    setScanning(false); setProgress(null)
  }

  const apply = async (item) => {
    await onApply(item.record.id, item.coverUrl)
    setApplied((s) => new Set(s).add(item.record.id))
  }
  const applyAll = async () => { for (const it of results) if (!applied.has(it.record.id)) await apply(it) }

  const remaining = results.filter((it) => !applied.has(it.record.id)).length

  if (!targets.length) {
    return <div className="empty-note"><p>🎉 Every record already has cover art. Nothing to fix.</p></div>
  }

  return (
    <div className="cover-fixer">
      {!scanning && !results.length && !progress && (
        <>
          <p className="hint">{targets.length} record{targets.length === 1 ? '' : 's'} show a placeholder instead of art. I’ll search iTunes &amp; MusicBrainz for each and show what I find — you choose what to apply.</p>
          <button className="btn btn-primary" onClick={scan}><Icon name="search" size={16} /> Find covers for {targets.length}</button>
        </>
      )}

      {progress && (
        <div className="bulk-progress">
          <div className="bar"><span style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
          <small>Searched {progress.done} of {progress.total} · found {results.length}…</small>
        </div>
      )}

      {results.length > 0 && (
        <>
          {!scanning && remaining > 0 && (
            <button className="btn btn-primary applyall" onClick={applyAll}>Apply all {remaining}</button>
          )}
          <ul className="fix-list">
            {results.map((it) => (
              <li key={it.record.id} className="fix-row">
                <Cover record={it.record} className="fix-old" />
                <Icon name="chevronRight" size={16} />
                <img className="fix-new" src={it.coverUrl} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                <span className="fix-meta"><strong>{it.record.album || 'Untitled'}</strong><small>{it.record.artist}</small></span>
                {applied.has(it.record.id)
                  ? <span className="badge ok"><Icon name="check" size={13} /> set</span>
                  : <button className="btn btn-ghost btn-sm" onClick={() => apply(it)}>Use</button>}
              </li>
            ))}
          </ul>
        </>
      )}

      {!scanning && progress === null && results.length === 0 && misses > 0 && (
        <p className="hint">No covers found for those {misses} — they’re likely live/bootleg/obscure. You can add a photo or official art per record from its detail screen.</p>
      )}
    </div>
  )
}
