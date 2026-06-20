import { useState } from 'react'
import { bestMatch } from '../services/metadata.js'
import Icon from './Icon.jsx'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const YEAR_RE = /^(18|19|20)\d{2}$/

/**
 * Parse one typed line into a draft record — no network.
 * Format: `Artist - Album - Year - Genre` (year & genre optional, any order for
 * the year). A ` | ` or ` # ` tail becomes notes. A bare line is just an album.
 *   Grateful Dead - American Beauty - 1970 - Folk Rock
 *   Billy Strings - Renewal - 2021 - Bluegrass
 *   Grateful Dead - Dick's Picks Vol. 4 | orange vinyl, near mint
 *   A Live One
 */
function parseLine(line) {
  let head = line
  let notes = ''
  const tail = line.split(/\s+[|#]\s+/)
  if (tail.length > 1) { head = tail[0]; notes = tail.slice(1).join(' ').trim() }

  const parts = head.split(/\s+[-–—]\s+/).map((s) => s.trim()).filter(Boolean)
  let year = ''
  const rest = []
  for (const p of parts) {
    if (!year && YEAR_RE.test(p)) year = p
    else rest.push(p)
  }

  let artist = ''
  let album = ''
  let genre = ''
  if (rest.length <= 1) { album = rest[0] || '' }
  else if (rest.length === 2) { [artist, album] = rest }
  else { artist = rest[0]; album = rest[1]; genre = rest.slice(2).join(' - ') }

  return { artist, album, genre, year, notes, coverUrl: null, line, status: 'manual', include: true }
}

export default function BulkAdd({ onCommit, onCancel }) {
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState([])
  const [progress, setProgress] = useState(null) // { done, total }

  const lines = () => text.split('\n').map((l) => l.trim()).filter(Boolean)

  // No-API path: parse the pasted text locally and go straight to review.
  const createFromText = () => {
    const ls = lines()
    if (!ls.length) return
    setDrafts(ls.map(parseLine))
  }

  // Optional API path: look each line up on iTunes for cover art + metadata.
  const runSearch = async () => {
    const ls = lines()
    if (!ls.length) return
    setProgress({ done: 0, total: ls.length })
    const next = []
    for (let i = 0; i < ls.length; i++) {
      const line = ls[i]
      const manual = parseLine(line)
      try {
        const hit = await bestMatch(line)
        next.push(hit
          ? { ...manual, ...hit, line, status: 'found', include: true }
          : { ...manual, status: 'notfound' })
      } catch {
        next.push({ ...manual, status: 'error' })
      }
      setProgress({ done: i + 1, total: ls.length })
      setDrafts([...next])
      await sleep(180) // be polite to the API
    }
    setProgress(null)
  }

  const patch = (i, key, value) => setDrafts((d) => d.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)))
  const toggle = (i) => patch(i, 'include', !drafts[i].include)

  const includedCount = drafts.filter((d) => d.include).length

  const commit = () => {
    const records = drafts.filter((d) => d.include).map((d) => ({
      album: d.album, artist: d.artist, year: d.year || null, genre: d.genre || '', coverUrl: d.coverUrl || null, notes: d.notes || '',
    }))
    onCommit(records)
  }

  return (
    <div className="bulk">
      {drafts.length === 0 ? (
        <>
          <p className="hint">
            One record per line: <strong>Artist - Album - Year - Genre</strong> (year &amp; genre
            optional). Add <strong>{' | '}</strong> for notes, e.g. pressing or condition.
            <br />
            <strong>Create from text</strong> adds them instantly with no internet. Or
            <strong> Search covers</strong> to auto-pull art from iTunes where it exists.
          </p>
          <textarea
            className="bulk-input"
            rows={9}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Grateful Dead - American Beauty - 1970 - Folk Rock\nBilly Strings - Renewal - 2021 - Bluegrass\nGrateful Dead - Dick\'s Picks Vol. 4 | orange vinyl, near mint\nA Live One'}
          />
          <div className="form-actions form-actions-stack">
            <button className="btn btn-primary" onClick={createFromText} disabled={!text.trim()}>
              <Icon name="check" size={18} /> Create from text
            </button>
            <div className="form-actions-row">
              <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
              <button className="btn btn-ghost" onClick={runSearch} disabled={!text.trim()}>
                <Icon name="search" size={18} /> Search covers
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          {progress && (
            <div className="bulk-progress">
              <div className="bar"><span style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
              <small>Matched {progress.done} of {progress.total}…</small>
            </div>
          )}
          <ul className="bulk-list">
            {drafts.map((d, i) => (
              <li key={i} className={`bulk-row ${d.include ? '' : 'excluded'}`}>
                <button className={`check ${d.include ? 'on' : ''}`} onClick={() => toggle(i)} aria-label="Include">
                  {d.include && <Icon name="check" size={14} />}
                </button>
                {d.coverUrl ? <img className="bulk-thumb" src={d.coverUrl} alt="" /> : <div className="bulk-thumb noart"><Icon name="disc" size={16} /></div>}
                <div className="bulk-fields">
                  <input value={d.album} onChange={(e) => patch(i, 'album', e.target.value)} placeholder="Album" />
                  <input value={d.artist} onChange={(e) => patch(i, 'artist', e.target.value)} placeholder="Artist" />
                  <div className="bulk-small">
                    <input value={d.year || ''} onChange={(e) => patch(i, 'year', e.target.value)} placeholder="Year" />
                    <input value={d.genre || ''} onChange={(e) => patch(i, 'genre', e.target.value)} placeholder="Genre" />
                  </div>
                  <input value={d.notes || ''} onChange={(e) => patch(i, 'notes', e.target.value)} placeholder="Notes" />
                </div>
                {(d.status === 'notfound' || d.status === 'error') && <span className="badge warn" title="No match — edit manually">no match</span>}
              </li>
            ))}
          </ul>
          <div className="form-actions sticky-actions">
            <button className="btn btn-ghost" onClick={() => setDrafts([])}>Back</button>
            <button className="btn btn-primary" onClick={commit} disabled={!includedCount}>
              Add {includedCount} record{includedCount === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
