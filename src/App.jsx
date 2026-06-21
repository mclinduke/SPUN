import { useEffect, useMemo, useState } from 'react'
import { useRecords } from './hooks/useRecords.js'
import { usePlays } from './hooks/usePlays.js'
import { bustCover } from './hooks/useCoverSrc.js'
import Icon from './components/Icon.jsx'
import Sheet from './components/Sheet.jsx'
import GridView from './components/GridView.jsx'
import ListView from './components/ListView.jsx'
import CoverFlowView from './components/CoverFlowView.jsx'
import RecordForm from './components/RecordForm.jsx'
import RecordDetail from './components/RecordDetail.jsx'
import BulkAdd from './components/BulkAdd.jsx'
import Stats from './components/Stats.jsx'
import ListeningStats from './components/ListeningStats.jsx'
import RandomPicker from './components/RandomPicker.jsx'
import SettingsSheet from './components/SettingsSheet.jsx'

const VIEWS = [
  { id: 'coverflow', icon: 'coverflow', label: 'Cover Flow' },
  { id: 'grid', icon: 'grid', label: 'Grid' },
  { id: 'list', icon: 'list', label: 'List' },
]

const SORTS = [
  { id: 'recent', label: 'Recently added' },
  { id: 'artist', label: 'Artist' },
  { id: 'album', label: 'Album' },
  { id: 'year-desc', label: 'Year (newest)' },
  { id: 'year-asc', label: 'Year (oldest)' },
]

function getInitialTheme() {
  const saved = localStorage.getItem('vinyl-theme')
  if (saved) return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function App() {
  const { records, loading, add, bulkAdd, update, remove, setPhoto, removePhoto, reload } = useRecords()
  const { plays, counts, lastPlayed, logPlay } = usePlays()

  const [view, setView] = useState(() => localStorage.getItem('vinyl-view') || 'coverflow')
  const [theme, setTheme] = useState(getInitialTheme)
  const [query, setQuery] = useState('')
  const [genreFilter, setGenreFilter] = useState('')
  const [sort, setSort] = useState('recent')

  const [selected, setSelected] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [listeningOpen, setListeningOpen] = useState(false)
  const [randomOpen, setRandomOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addedThisSession, setAddedThisSession] = useState(0)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('vinyl-theme', theme)
  }, [theme])

  useEffect(() => { localStorage.setItem('vinyl-view', view) }, [view])

  const genres = useMemo(
    () => [...new Set(records.map((r) => r.genre).filter(Boolean))].sort(),
    [records],
  )

  // If the active genre filter no longer exists (last record of it deleted/edited,
  // or collection cleared/imported), reset it so the grid doesn't dead-end on "no records".
  useEffect(() => {
    if (genreFilter && !genres.includes(genreFilter)) setGenreFilter('')
  }, [genres, genreFilter])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = records.filter((r) => {
      if (genreFilter && r.genre !== genreFilter) return false
      if (!q) return true
      return [r.album, r.artist, r.genre, r.notes, r.year]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    })
    const cmp = (x, y) => (x || '').localeCompare(y || '', undefined, { numeric: true, sensitivity: 'base' })
    const by = {
      recent: (a, b) => b.createdAt - a.createdAt,
      artist: (a, b) => cmp(a.artist, b.artist) || cmp(a.album, b.album),
      album: (a, b) => cmp(a.album, b.album),
      'year-desc': (a, b) => (b.year || 0) - (a.year || 0),
      'year-asc': (a, b) => (a.year || 9999) - (b.year || 9999),
    }
    return [...list].sort(by[sort] || by.recent)
  }, [records, query, genreFilter, sort])

  const openAdd = () => { setEditing(null); setAddedThisSession(0); setFormOpen(true) }
  const openEdit = (rec) => { setSelected(null); setEditing(rec); setFormOpen(true) }

  // Duplicate check for the add flow: same album + artist (case-insensitive).
  const findDuplicate = (album, artist) => {
    const a = (album || '').trim().toLowerCase()
    const ar = (artist || '').trim().toLowerCase()
    if (!a) return null
    return records.find((r) => r.album.toLowerCase() === a && r.artist.toLowerCase() === ar) || null
  }

  const handleSave = async (data, pendingPhoto) => {
    try {
      let rec
      if (editing?.id) rec = await update(editing.id, data)
      else rec = await add(data)
      if (pendingPhoto instanceof File) {
        await setPhoto(rec.id, pendingPhoto)
        bustCover(rec.id)
      } else if (pendingPhoto === null && rec.hasPhoto) {
        await removePhoto(rec.id)
        bustCover(rec.id)
      }
      setFormOpen(false)
      setEditing(null)
    } catch (err) {
      // Keep the sheet open so the user can retry; never silently lose a write.
      alert(`Couldn't save this record: ${err.message || err}`)
    }
  }

  // "Save & add another": persist, attach an optional photo, and leave the sheet
  // open so the next record can be typed straight away.
  const handleSaveAndNext = async (data, pendingPhoto) => {
    try {
      const rec = await add(data)
      if (pendingPhoto instanceof File) {
        await setPhoto(rec.id, pendingPhoto)
        bustCover(rec.id)
      }
      setAddedThisSession((n) => n + 1)
      return true
    } catch (err) {
      alert(`Couldn't save this record: ${err.message || err}`)
      return false
    }
  }

  const handleDelete = async (rec) => {
    try {
      await remove(rec.id)
      bustCover(rec.id)
      setSelected(null)
    } catch (err) {
      alert(`Couldn't delete this record: ${err.message || err}`)
    }
  }

  const handleBulkCommit = async (recs) => {
    try {
      await bulkAdd(recs)
      setBulkOpen(false)
      setSettingsOpen(false)
    } catch (err) {
      alert(`Couldn't add these records: ${err.message || err}`)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="brand">
          <Icon name="disc" size={26} />
          <span>Crate</span>
        </h1>
        <div className="header-actions">
          <button className="icon-btn" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} aria-label="Toggle theme">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Menu">
            <Icon name="menu" />
          </button>
        </div>
      </header>

      <div className="controls">
        <div className="search-bar">
          <Icon name="search" size={18} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search albums, artists, genres…"
          />
        </div>
        <div className="control-row">
          <div className="segmented">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                className={view === v.id ? 'active' : ''}
                onClick={() => setView(v.id)}
                aria-label={v.label}
                title={v.label}
              >
                <Icon name={v.icon} size={18} />
              </button>
            ))}
          </div>
          <select className="select" value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)} aria-label="Filter genre">
            <option value="">All genres</option>
            {genres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button className="icon-btn dice-btn" onClick={() => setRandomOpen(true)} aria-label="Pick a random record" title="What do I play tonight?">
            <Icon name="dice" size={20} />
          </button>
        </div>
      </div>

      <main className="content">
        {loading ? (
          <p className="empty-note">Loading your collection…</p>
        ) : records.length === 0 ? (
          <div className="empty-state">
            <Icon name="disc" size={56} />
            <h2>Your crate is empty</h2>
            <p>Add records one at a time, or paste a whole list to add them in bulk.</p>
            <div className="empty-cta">
              <button className="btn btn-primary" onClick={openAdd}><Icon name="plus" size={18} /> Add a record</button>
              <button className="btn btn-ghost" onClick={() => setBulkOpen(true)}>Bulk add</button>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <p className="empty-note">No records match your search.</p>
        ) : view === 'grid' ? (
          <GridView records={visible} onSelect={setSelected} />
        ) : view === 'list' ? (
          <ListView records={visible} onSelect={setSelected} />
        ) : (
          <CoverFlowView records={visible} onSelect={setSelected} />
        )}
      </main>

      {records.length > 0 && (
        <button className="fab" onClick={openAdd} aria-label="Add record">
          <Icon name="plus" size={26} />
        </button>
      )}

      {selected && (
        <Sheet title="Record" onClose={() => setSelected(null)}>
          <RecordDetail
            record={selected}
            onEdit={openEdit}
            onDelete={handleDelete}
            onPlay={logPlay}
            playCount={counts.get(selected.id) || 0}
            lastPlayed={lastPlayed.get(selected.id)}
          />
        </Sheet>
      )}

      {formOpen && (
        <Sheet title={editing ? 'Edit record' : 'Add record'} onClose={() => { setFormOpen(false); setEditing(null) }}>
          <RecordForm
            initial={editing || undefined}
            genres={genres}
            onSave={handleSave}
            onSaveAndNext={editing ? undefined : handleSaveAndNext}
            sessionCount={addedThisSession}
            findDuplicate={editing ? undefined : findDuplicate}
            onViewExisting={(rec) => { setFormOpen(false); setEditing(null); setSelected(rec) }}
            onCancel={() => { setFormOpen(false); setEditing(null) }}
          />
        </Sheet>
      )}

      {bulkOpen && (
        <Sheet title="Bulk add" onClose={() => setBulkOpen(false)} wide>
          <BulkAdd onCommit={handleBulkCommit} onCancel={() => setBulkOpen(false)} />
        </Sheet>
      )}

      {statsOpen && (
        <Sheet title="Collection stats" onClose={() => setStatsOpen(false)}>
          <Stats records={records} />
        </Sheet>
      )}

      {listeningOpen && (
        <Sheet title="Your listening" onClose={() => setListeningOpen(false)}>
          <ListeningStats records={records} plays={plays} onSelect={(r) => { setListeningOpen(false); setSelected(r) }} />
        </Sheet>
      )}

      {randomOpen && (
        <Sheet title="What do I play tonight?" onClose={() => setRandomOpen(false)}>
          <RandomPicker records={records} counts={counts} genres={genres} onSelect={(r) => { setRandomOpen(false); setSelected(r) }} />
        </Sheet>
      )}

      {settingsOpen && (
        <Sheet title="Menu" onClose={() => setSettingsOpen(false)}>
          <SettingsSheet
            count={records.length}
            dark={theme === 'dark'}
            onToggleDark={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            onBulkAdd={() => { setSettingsOpen(false); setBulkOpen(true) }}
            onShowStats={() => { setSettingsOpen(false); setStatsOpen(true) }}
            onShowListening={() => { setSettingsOpen(false); setListeningOpen(true) }}
            onShowRandom={() => { setSettingsOpen(false); setRandomOpen(true) }}
            onChanged={reload}
          />
        </Sheet>
      )}
    </div>
  )
}
