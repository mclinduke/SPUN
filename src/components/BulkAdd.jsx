import { useState } from 'react'
import { bestMatchFree } from '../services/metadata.js'
import { newId } from '../data/repository.js'
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
  // Strip a leading list marker ("1. ", "- ", "• ") so dictated/pasted lists parse.
  let head = line.replace(/^\s*(\d+[.)]|[-*•])\s+/, '')
  let notes = ''
  const tail = head.split(/\s+[|#]\s+/)
  if (tail.length > 1) { head = tail[0]; notes = tail.slice(1).join(' ').trim() }

  const parts = head.split(/\s+[-–—]\s+/).map((s) => s.trim()).filter(Boolean)
  // Only treat a TRAILING segment as the year, and never when it's the only part —
  // so album titles that are/contain a year ("1999", "1971") aren't eaten.
  let year = ''
  let rest = parts
  if (parts.length > 1 && YEAR_RE.test(parts[parts.length - 1])) {
    year = parts[parts.length - 1]
    rest = parts.slice(0, -1)
  }

  let artist = ''
  let album = ''
  let genre = ''
  if (rest.length <= 1) {
    // No dash separator — accept natural "Album by Artist" (common when dictating).
    const chunk = rest[0] || ''
    const by = chunk.match(/^(.*\S)\s+by\s+(\S.*)$/i)
    if (by) { album = by[1].trim(); artist = by[2].trim() }
    else album = chunk
  } else if (rest.length === 2) {
    [artist, album] = rest
  } else {
    artist = rest[0]; album = rest[1]; genre = rest.slice(2).join(' - ')
  }

  return { id: newId(), artist, album, genre, year, notes, coverUrl: null, line, status: 'manual', include: true }
}

export default function BulkAdd({ onCommit, onCancel, findDuplicate }) {
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState([])
  const [progress, setProgress] = useState(null) // { done, total }

  const lines = () => text.split('\n').map((l) => l.trim()).filter(Boolean)

  // Flag rows already in the collection, or repeated within this paste, and
  // un-check them by default so a re-import doesn't silently duplicate.
  const markDupes = (rows) => {
    const seen = new Set()
    return rows.map((d) => {
      const key = `${(d.album || '').trim().toLowerCase()}|${(d.artist || '').trim().toLowerCase()}`
      const existing = findDuplicate ? findDuplicate(d.album, d.artist) : null
      const batchDup = key !== '|' && seen.has(key)
      seen.add(key)
      const dup = Boolean(existing) || batchDup
      return { ...d, dup, include: d.include !== false && !dup }
    })
  }

  // No-API path: parse the pasted text locally and go straight to review.
  const createFromText = () => {
    const ls = lines()
    if (!ls.length) return
    setDrafts(markDupes(ls.map(parseLine)))
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
      // Search by the parsed "artist album" when we have it (better hit rate than
      // the raw line), else the raw line.
      const term = [manual.artist, manual.album].filter(Boolean).join(' ') || line
      try {
        const hit = await bestMatchFree(term)
        next.push(hit
          ? {
              ...manual,
              // keep what the user typed as authoritative; only FILL gaps from the match
              artist: manual.artist || hit.artist || '',
              album: manual.album || hit.album || '',
              year: manual.year || hit.year || '',
              genre: manual.genre || hit.genre || '',
              label: hit.label || '',
              catalogNo: hit.catalogNo || '',
              coverUrl: hit.coverUrl || null,
              status: 'found',
              include: true,
            }
          : { ...manual, status: 'notfound' })
      } catch {
        next.push({ ...manual, status: 'error' })
      }
      setProgress({ done: i + 1, total: ls.length })
      setDrafts([...next])
      await sleep(220) // pace iTunes + MusicBrainz politely
    }
    setDrafts(markDupes(next)) // flag/uncheck dupes once matches have settled
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
            One record per line — <strong>type or tap your keyboard’s 🎤 to dictate your whole shelf</strong>.
            We understand <strong>Artist – Album</strong>, <strong>Album by Artist</strong>, or just an album title
            (year &amp; genre optional). Add <strong>{' | '}</strong> for notes like pressing or condition.
            <br />
            <strong>Match covers &amp; info</strong> auto-fills art, year, label and genre for each line.
            <strong> Add as typed</strong> skips the lookup and adds them instantly, offline.
          </p>
          <textarea
            className="bulk-input"
            rows={9}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Grateful Dead - American Beauty - 1970\nRenewal by Billy Strings\nDick\'s Picks Vol. 4 | orange vinyl, near mint\nA Live One'}
          />
          <div className="form-actions form-actions-stack">
            <button className="btn btn-primary" onClick={runSearch} disabled={!text.trim()}>
              <Icon name="search" size={18} /> Match covers &amp; info
            </button>
            <div className="form-actions-row">
              <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
              <button className="btn btn-ghost" onClick={createFromText} disabled={!text.trim()}>
                <Icon name="check" size={18} /> Add as typed
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
              <li key={d.id || i} className={`bulk-row ${d.include ? '' : 'excluded'}`}>
                <button className={`check ${d.include ? 'on' : ''}`} onClick={() => toggle(i)} aria-label="Include">
                  {d.include && <Icon name="check" size={14} />}
                </button>
                {d.coverUrl ? <img className="bulk-thumb" src={d.coverUrl} alt="" onError={() => patch(i, 'coverUrl', null)} /> : <div className="bulk-thumb noart"><Icon name="disc" size={16} /></div>}
                <div className="bulk-fields">
                  <input value={d.album} onChange={(e) => patch(i, 'album', e.target.value)} placeholder="Album" />
                  <input value={d.artist} onChange={(e) => patch(i, 'artist', e.target.value)} placeholder="Artist" />
                  <div className="bulk-small">
                    <input value={d.year || ''} onChange={(e) => patch(i, 'year', e.target.value)} placeholder="Year" />
                    <input value={d.genre || ''} onChange={(e) => patch(i, 'genre', e.target.value)} placeholder="Genre" />
                  </div>
                  <input value={d.notes || ''} onChange={(e) => patch(i, 'notes', e.target.value)} placeholder="Notes" />
                </div>
                {d.dup && <span className="badge warn" title="Already in your collection">already added</span>}
                {!d.dup && (d.status === 'notfound' || d.status === 'error') && <span className="badge warn" title="No match — edit manually">no match</span>}
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
