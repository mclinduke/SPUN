import { useEffect, useMemo, useRef, useState } from 'react'
import { cachedRecord, lookupRecord } from '../services/discogs.js'

/** Rough collection value from Discogs lowest "for sale" prices. Honest about
 *  what it is (an estimate from cached lookups) and lets the owner scan the rest
 *  on demand, throttled under Discogs' rate limit. */
export default function CollectionValue({ records }) {
  const [priced, setPriced] = useState(() => new Map()) // id -> lowestPrice
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const cancel = useRef(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const m = new Map()
      for (const r of records) {
        const c = await cachedRecord(r.id)
        if (c?.found && c.lowestPrice != null) m.set(r.id, c.lowestPrice)
      }
      if (active) { setPriced(m); setLoading(false) }
    })()
    return () => { active = false }
  }, [records])

  const { total, count } = useMemo(() => {
    let total = 0
    for (const p of priced.values()) total += p
    return { total, count: priced.size }
  }, [priced])

  const remaining = records.length - count

  const scan = async () => {
    setScanning(true); cancel.current = false; setProgress(0)
    const todo = records.filter((r) => !priced.has(r.id))
    for (let i = 0; i < todo.length; i++) {
      if (cancel.current) break
      try {
        const d = await lookupRecord(todo[i])
        if (d.found && d.lowestPrice != null) {
          setPriced((prev) => new Map(prev).set(todo[i].id, d.lowestPrice))
        }
      } catch { /* rate-limited or no match — skip */ }
      setProgress(i + 1)
      await new Promise((r) => setTimeout(r, 2500)) // 2 calls/record, stay under 60/min
    }
    setScanning(false)
  }

  if (loading) return <p className="empty-note">Reading cached prices…</p>

  return (
    <div className="value">
      <div className="stat-headline">
        <span className="big-number">${Math.round(total).toLocaleString()}</span>
        <span>estimated · based on {count} of {records.length} records</span>
      </div>
      <p className="hint">
        A rough floor from Discogs’ lowest “for sale” price per pressing. Actual value swings with
        condition, pressing, and demand — treat it as a ballpark, not an appraisal.
      </p>

      {remaining > 0 && !scanning && (
        <button className="btn btn-primary" onClick={scan}>
          Estimate the other {remaining} (slow — ~{Math.ceil((remaining * 2.5) / 60)} min)
        </button>
      )}
      {scanning && (
        <div className="bulk-progress">
          <div className="bar"><span style={{ width: `${(progress / Math.max(remaining, 1)) * 100}%` }} /></div>
          <small>Pricing {progress} of {remaining}… <button className="linkish" onClick={() => { cancel.current = true }}>Stop</button></small>
        </div>
      )}
      {remaining === 0 && <p className="hint">Every record with a Discogs match has a price. ✓</p>}
    </div>
  )
}
