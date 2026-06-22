import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { searchAll } from '../services/metadata.js'
import { getRepository } from '../data/repository.js'
import Icon from './Icon.jsx'

const empty = { album: '', artist: '', year: '', genre: '', label: '', catalogNo: '', tagsInput: '', notes: '', coverUrl: null, coverSource: null }

function fromInitial(initial) {
  return {
    ...empty,
    ...initial,
    year: initial?.year || '',
    label: initial?.label || '',
    catalogNo: initial?.catalogNo || '',
    tagsInput: (initial?.tags || []).join(', '),
  }
}

export default function RecordForm({ initial, genres = [], onSave, onSaveAndNext, sessionCount = 0, onCancel, findDuplicate, onViewExisting }) {
  const editing = Boolean(initial?.id)
  const loopMode = !editing && typeof onSaveAndNext === 'function'
  const uid = useId()
  const [form, setForm] = useState(() => fromInitial(initial))
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [pendingPhoto, setPendingPhoto] = useState(undefined) // File = new, null = remove, undefined = unchanged
  const [allowDup, setAllowDup] = useState(false)
  const fileRef = useRef(null)
  const albumRef = useRef(null)
  const artistRef = useRef(null)
  const yearRef = useRef(null)
  const genreRef = useRef(null)

  // Load an existing personal photo into the preview when editing.
  useEffect(() => {
    let active = true
    let url
    if (editing && initial.hasPhoto) {
      getRepository().getPhoto(initial.id).then((blob) => {
        if (active && blob) { url = URL.createObjectURL(blob); setPhotoPreview(url) }
      })
    }
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [editing, initial])

  // Debounced combined (MusicBrainz + iTunes) search.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    const ctrl = new AbortController()
    setSearching(true)
    const t = setTimeout(() => {
      searchAll(q, { signal: ctrl.signal })
        .then((r) => setResults(r))
        .catch(() => {})
        .finally(() => setSearching(false))
    }, 400)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [query])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const duplicate = useMemo(
    () => (!editing && findDuplicate ? findDuplicate(form.album, form.artist) : null),
    [editing, findDuplicate, form.album, form.artist],
  )

  const applyResult = (r) => {
    setForm((f) => ({
      ...f,
      album: r.album || f.album,
      artist: r.artist || f.artist,
      year: r.year || f.year,
      genre: r.genre || f.genre,
      label: r.label || f.label,
      catalogNo: r.catalogNo || f.catalogNo,
      coverUrl: r.coverUrl || f.coverUrl,
      coverSource: r.coverUrl ? 'official' : f.coverSource,
    }))
    setQuery('')
    setResults([])
    setAllowDup(false)
  }

  const onPickPhoto = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPendingPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
    setForm((f) => ({ ...f, coverSource: null })) // photo should win once added
  }

  const clearPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(null)
    setPendingPhoto(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const payload = () => ({
    ...form,
    year: form.year ? Number(form.year) : null,
    tags: form.tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
  })

  const resetForNext = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setForm((f) => ({ ...empty, artist: f.artist, genre: f.genre }))
    setPhotoPreview(null)
    setPendingPhoto(undefined)
    setQuery('')
    setResults([])
    setAllowDup(false)
    if (fileRef.current) fileRef.current.value = ''
    requestAnimationFrame(() => albumRef.current?.focus())
  }

  const blockedByDup = () => duplicate && !allowDup

  const saveAndClose = () => {
    if (!form.album.trim() && !form.artist.trim()) return
    if (blockedByDup()) return
    onSave(payload(), pendingPhoto)
  }

  const addAnother = async () => {
    if (!form.album.trim()) return
    if (blockedByDup()) return
    const ok = await onSaveAndNext(payload(), pendingPhoto)
    if (ok !== false) resetForNext()
  }

  const submit = (e) => {
    e.preventDefault()
    if (loopMode) addAnother()
    else saveAndClose()
  }

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
      <div className="field">
        <label htmlFor={`${uid}-q`}>Search to auto-fill (optional)</label>
        <div className="search-inline">
          <Icon name="search" size={18} />
          <input
            id={`${uid}-q`}
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
              <li key={`${r._source}-${r._sourceId}-${i}`}>
                <button type="button" onClick={() => applyResult(r)}>
                  {r.coverUrl
                    ? <img src={r.coverUrl} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    : <div className="result-noart"><Icon name="disc" size={18} /></div>}
                  <span className="result-text">
                    <strong>{r.album}</strong>
                    <small>{r.artist}{r.year ? ` · ${r.year}` : ''}{r.catalogNo ? ` · ${r.catalogNo}` : ''}</small>
                  </span>
                  <span className={`src-badge ${r._source}`}>{r._source === 'discogs' ? 'Discogs' : r._source === 'musicbrainz' ? 'MB' : 'iTunes'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {duplicate && (
        <div className="dup-warning">
          <Icon name="disc" size={18} />
          <div>
            <strong>Already in your collection</strong>
            <small>{duplicate.album} — {duplicate.artist}</small>
          </div>
          <div className="dup-actions">
            <button type="button" className="btn btn-ghost" onClick={() => onViewExisting?.(duplicate)}>View</button>
            {!allowDup && <button type="button" className="btn btn-ghost" onClick={() => setAllowDup(true)}>Add anyway</button>}
          </div>
        </div>
      )}

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
        <label htmlFor={`${uid}-album`}>Album</label>
        <input id={`${uid}-album`} ref={albumRef} type="text" value={form.album} onChange={set('album')} onKeyDown={onFieldKey(0)} placeholder="Album name" autoFocus={!editing} />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-artist`}>Artist</label>
        <input id={`${uid}-artist`} ref={artistRef} type="text" value={form.artist} onChange={set('artist')} onKeyDown={onFieldKey(1)} placeholder="Artist" />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${uid}-year`}>Year</label>
          <input id={`${uid}-year`} ref={yearRef} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={form.year} onChange={set('year')} onKeyDown={onFieldKey(2)} placeholder="1959" />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-genre`}>Genre</label>
          <input id={`${uid}-genre`} ref={genreRef} type="text" list={`${uid}-genres`} value={form.genre} onChange={set('genre')} onKeyDown={onFieldKey(3)} placeholder="Jazz" />
          <datalist id={`${uid}-genres`}>
            {genres.map((g) => <option key={g} value={g} />)}
          </datalist>
        </div>
      </div>
      {genreChips.length > 0 && (
        <div className="genre-chips">
          {genreChips.map((g) => (
            <button type="button" key={g} className={`chip ${form.genre === g ? 'on' : ''}`} onClick={() => setForm((f) => ({ ...f, genre: g }))}>{g}</button>
          ))}
        </div>
      )}
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${uid}-label`}>Label</label>
          <input id={`${uid}-label`} type="text" value={form.label} onChange={set('label')} placeholder="Columbia" />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-catno`}>Catalog #</label>
          <input id={`${uid}-catno`} type="text" value={form.catalogNo} onChange={set('catalogNo')} placeholder="PC 34074" />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${uid}-tags`}>Crates / tags <span className="hint-inline">comma-separated</span></label>
        <input id={`${uid}-tags`} type="text" value={form.tagsInput} onChange={set('tagsInput')} placeholder="Sunday morning, Heavy rotation" />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-notes`}>Notes</label>
        <textarea id={`${uid}-notes`} value={form.notes} onChange={set('notes')} rows={3} placeholder="Pressing, condition, where you got it..." />
      </div>

      {loopMode && sessionCount > 0 && (
        <p className="hint session-count"><Icon name="check" size={15} /> {sessionCount} added this session</p>
      )}

      {loopMode ? (
        <div className="form-actions form-actions-stack">
          <button type="submit" className="btn btn-primary" disabled={blockedByDup()}>Save &amp; add another</button>
          <div className="form-actions-row">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>Done</button>
            <button type="button" className="btn btn-ghost" onClick={saveAndClose} disabled={blockedByDup()}>Save &amp; close</button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={blockedByDup()}>{editing ? 'Save changes' : 'Add record'}</button>
        </div>
      )}
    </form>
  )
}
