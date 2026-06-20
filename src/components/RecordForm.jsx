import { useEffect, useRef, useState } from 'react'
import { searchAlbums } from '../services/metadata.js'
import { getRepository } from '../data/repository.js'
import Icon from './Icon.jsx'

const empty = { album: '', artist: '', year: '', genre: '', notes: '', coverUrl: null }

export default function RecordForm({ initial, genres = [], onSave, onSaveAndNext, sessionCount = 0, onCancel }) {
  const editing = Boolean(initial?.id)
  const loopMode = !editing && typeof onSaveAndNext === 'function'
  const [form, setForm] = useState(() => ({ ...empty, ...initial, year: initial?.year || '' }))
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [photoPreview, setPhotoPreview] = useState(null) // object URL of pending/existing photo
  const [pendingPhoto, setPendingPhoto] = useState(undefined) // File = new, null = remove, undefined = unchanged
  const fileRef = useRef(null)
  const albumRef = useRef(null)
  const artistRef = useRef(null)
  const yearRef = useRef(null)
  const genreRef = useRef(null)

  // Load an existing personal photo into the preview when editing.
  useEffect(() => {
    let url
    if (editing && initial.hasPhoto) {
      getRepository().getPhoto(initial.id).then((blob) => {
        if (blob) { url = URL.createObjectURL(blob); setPhotoPreview(url) }
      })
    }
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [editing, initial])

  // Debounced album search.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    const ctrl = new AbortController()
    setSearching(true)
    const t = setTimeout(() => {
      searchAlbums(q, { signal: ctrl.signal })
        .then((r) => setResults(r))
        .catch(() => {})
        .finally(() => setSearching(false))
    }, 350)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [query])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const applyResult = (r) => {
    setForm((f) => ({
      ...f,
      album: r.album || f.album,
      artist: r.artist || f.artist,
      year: r.year || f.year,
      genre: r.genre || f.genre,
      coverUrl: r.coverUrl || f.coverUrl,
    }))
    setQuery('')
    setResults([])
  }

  const onPickPhoto = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPendingPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const clearPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(null)
    setPendingPhoto(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const payload = () => ({ ...form, year: form.year ? Number(form.year) : null })

  // After "Save & add another": keep artist + genre (records cluster by these),
  // clear everything else, drop any pending photo, and refocus Album.
  const resetForNext = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setForm((f) => ({ ...empty, artist: f.artist, genre: f.genre }))
    setPhotoPreview(null)
    setPendingPhoto(undefined)
    setQuery('')
    setResults([])
    if (fileRef.current) fileRef.current.value = ''
    requestAnimationFrame(() => albumRef.current?.focus())
  }

  const saveAndClose = () => {
    if (!form.album.trim() && !form.artist.trim()) return
    onSave(payload(), pendingPhoto)
  }

  const addAnother = () => {
    if (!form.album.trim()) return // an album is required in the loop so a sticky artist can't save a blank
    onSaveAndNext(payload(), pendingPhoto)
    resetForNext()
  }

  // Primary submit: loop in add mode, save+close when editing.
  const submit = (e) => {
    e.preventDefault()
    if (loopMode) addAnother()
    else saveAndClose()
  }

  // Enter moves to the next field instead of submitting mid-record; on the last
  // field it commits. Notes (textarea) and the search box are excluded.
  const fieldRefs = [albumRef, artistRef, yearRef, genreRef]
  const onFieldKey = (idx) => (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const next = fieldRefs[idx + 1]?.current
    if (next) next.focus()
    else submit(e)
  }

  const coverSrc = photoPreview || form.coverUrl
  const genreChips = genres.slice(0, 8)

  return (
    <form className="record-form" onSubmit={submit}>
      {/* Search-and-autofill (handy for mainstream records; manual fields below are the main path) */}
      <div className="field">
        <label>Search to auto-fill (optional)</label>
        <div className="search-inline">
          <Icon name="search" size={18} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
            placeholder="e.g. Miles Davis Kind of Blue"
          />
          {searching && <span className="spinner" aria-hidden />}
        </div>
        {results.length > 0 && (
          <ul className="search-results">
            {results.map((r, i) => (
              <li key={`${r._sourceId}-${i}`}>
                <button type="button" onClick={() => applyResult(r)}>
                  {r.coverUrl ? <img src={r.coverUrl} alt="" /> : <div className="result-noart"><Icon name="disc" size={18} /></div>}
                  <span className="result-text">
                    <strong>{r.album}</strong>
                    <small>{r.artist}{r.year ? ` · ${r.year}` : ''}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="form-cover-row">
        <div className="cover form-cover">
          {coverSrc ? <img src={coverSrc} alt="cover preview" /> : <div className="cover-fallback"><Icon name="disc" size={26} /></div>}
        </div>
        <div className="photo-actions">
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            <Icon name="camera" size={18} /> {photoPreview ? 'Replace photo' : 'Add your photo'}
          </button>
          {(photoPreview || (editing && initial.hasPhoto && pendingPhoto !== null)) && (
            <button type="button" className="btn btn-ghost danger" onClick={clearPhoto}>Use official art</button>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPickPhoto} />
          <p className="hint">Official art shows by default. Snap your own copy to override it.</p>
        </div>
      </div>

      <div className="field">
        <label>Album</label>
        <input ref={albumRef} type="text" value={form.album} onChange={set('album')} onKeyDown={onFieldKey(0)} placeholder="Album name" autoFocus={!editing} />
      </div>
      <div className="field">
        <label>Artist</label>
        <input ref={artistRef} type="text" value={form.artist} onChange={set('artist')} onKeyDown={onFieldKey(1)} placeholder="Artist" />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Year</label>
          <input ref={yearRef} type="number" inputMode="numeric" value={form.year} onChange={set('year')} onKeyDown={onFieldKey(2)} placeholder="1959" />
        </div>
        <div className="field">
          <label>Genre</label>
          <input ref={genreRef} type="text" list="genre-list" value={form.genre} onChange={set('genre')} onKeyDown={onFieldKey(3)} placeholder="Jazz" />
          <datalist id="genre-list">
            {genres.map((g) => <option key={g} value={g} />)}
          </datalist>
        </div>
      </div>
      {genreChips.length > 0 && (
        <div className="genre-chips">
          {genreChips.map((g) => (
            <button
              type="button"
              key={g}
              className={`chip ${form.genre === g ? 'on' : ''}`}
              onClick={() => setForm((f) => ({ ...f, genre: g }))}
            >
              {g}
            </button>
          ))}
        </div>
      )}
      <div className="field">
        <label>Notes</label>
        <textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="Pressing, condition, where you got it..." />
      </div>

      {loopMode && sessionCount > 0 && (
        <p className="hint session-count"><Icon name="check" size={15} /> {sessionCount} added this session</p>
      )}

      {loopMode ? (
        <div className="form-actions form-actions-stack">
          <button type="submit" className="btn btn-primary">Save &amp; add another</button>
          <div className="form-actions-row">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>Done</button>
            <button type="button" className="btn btn-ghost" onClick={saveAndClose}>Save &amp; close</button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary">{editing ? 'Save changes' : 'Add record'}</button>
        </div>
      )}
    </form>
  )
}
