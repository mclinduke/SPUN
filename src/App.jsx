import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useRecords } from './hooks/useRecords.js'
import { usePlays } from './hooks/usePlays.js'
import { useWants } from './hooks/useWants.js'
import { useFriends } from './hooks/useFriends.js'
import { bustCover } from './hooks/useCoverSrc.js'
import { getRepository } from './data/repository.js'
import { isCloud } from './data/supabaseClient.js'
import Icon from './components/Icon.jsx'
import Sheet from './components/Sheet.jsx'
import GridView from './components/GridView.jsx'
import ListView from './components/ListView.jsx'
import CoverFlowView from './components/CoverFlowView.jsx'
import RecordForm from './components/RecordForm.jsx'
import RecordDetail from './components/RecordDetail.jsx'
import CoverEditor from './components/CoverEditor.jsx'
import BulkAdd from './components/BulkAdd.jsx'
import Stats from './components/Stats.jsx'
import ListeningStats from './components/ListeningStats.jsx'
import RandomPicker from './components/RandomPicker.jsx'
import PressingInfo from './components/PressingInfo.jsx'
import Wishlist from './components/Wishlist.jsx'
import SettingsSheet from './components/SettingsSheet.jsx'
import DiscogsImport from './components/DiscogsImport.jsx'
import BarcodeScanner from './components/BarcodeScanner.jsx'
import TonightCard from './components/TonightCard.jsx'
import CoverFixer from './components/CoverFixer.jsx'
import Logo from './components/Logo.jsx'
import Friends from './components/Friends.jsx'
import FriendCollection from './components/FriendCollection.jsx'
import Onboarding from './components/Onboarding.jsx'
import InstallHint from './components/InstallHint.jsx'

const VIEWS = [
  { id: 'coverflow', icon: 'coverflow', label: 'Cover Flow' },
  { id: 'grid', icon: 'grid', label: 'Grid' },
  { id: 'list', icon: 'list', label: 'List' },
]

const SORTS = [
  { id: 'recent', label: 'Recently added' },
  { id: 'artist', label: 'Artist (A–Z)' },
  { id: 'album', label: 'Album (A–Z)' },
  { id: 'year-desc', label: 'Year (newest)' },
  { id: 'year-asc', label: 'Year (oldest)' },
  { id: 'played-most', label: 'Most played' },
  { id: 'played-recent', label: 'Recently played' },
]

function getInitialTheme() {
  const saved = localStorage.getItem('vinyl-theme')
  if (saved) return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function App() {
  const { records, loading, error, add, bulkAdd, update, remove, setPhoto, removePhoto, reload } = useRecords()
  const { plays, counts, lastPlayed, logPlay, reload: reloadPlays } = usePlays()
  const { wants, addWant, removeWant, reload: reloadWants } = useWants()
  const friendsApi = useFriends()

  // Reload everything after Clear / Import so plays + wishlist can't show ghosts.
  const reloadAll = useCallback(async () => { await Promise.all([reload(), reloadPlays(), reloadWants()]) }, [reload, reloadPlays, reloadWants])

  const [view, setView] = useState(() => localStorage.getItem('vinyl-view') || 'coverflow')
  const [theme, setTheme] = useState(getInitialTheme)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query) // keep typing snappy on big collections
  const [genreFilter, setGenreFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [sort, setSort] = useState(() => localStorage.getItem('vinyl-sort') || 'recent')

  const [selected, setSelected] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [discogsOpen, setDiscogsOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [listeningOpen, setListeningOpen] = useState(false)
  const [randomOpen, setRandomOpen] = useState(false)
  const [wishlistOpen, setWishlistOpen] = useState(false)
  const [coverEditOpen, setCoverEditOpen] = useState(false)
  const [showTour, setShowTour] = useState(() => !localStorage.getItem('spun-onboarded'))
  const closeTour = () => { localStorage.setItem('spun-onboarded', '1'); setShowTour(false) }
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [friendsOpen, setFriendsOpen] = useState(false)
  const [coverFixOpen, setCoverFixOpen] = useState(false)
  const [viewingFriend, setViewingFriend] = useState(null)
  const [shareNotes, setShareNotes] = useState(false)
  const [addedThisSession, setAddedThisSession] = useState(0)

  // Load the "share my notes with friends" preference (cloud only).
  useEffect(() => {
    if (!isCloud()) return
    getRepository().myProfile().then((p) => setShareNotes(p.shareNotes)).catch(() => {})
  }, [])

  const toggleShareNotes = useCallback(async () => {
    const next = !shareNotes
    setShareNotes(next) // optimistic
    try { await getRepository().setShareNotes(next) }
    catch (err) { setShareNotes(!next); alert(`Couldn't update that setting: ${err.message || err}`) }
  }, [shareNotes])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('vinyl-theme', theme)
  }, [theme])

  useEffect(() => { localStorage.setItem('vinyl-view', view) }, [view])
  useEffect(() => { localStorage.setItem('vinyl-sort', sort) }, [sort])

  const genres = useMemo(
    () => [...new Set(records.map((r) => r.genre).filter(Boolean))].sort(),
    [records],
  )

  // If the active genre filter no longer exists (last record of it deleted/edited,
  // or collection cleared/imported), reset it so the grid doesn't dead-end on "no records".
  useEffect(() => {
    if (genreFilter && !genres.includes(genreFilter)) setGenreFilter('')
  }, [genres, genreFilter])

  const allTags = useMemo(() => [...new Set(records.flatMap((r) => r.tags || []))].sort(), [records])
  useEffect(() => {
    if (tagFilter && !allTags.includes(tagFilter)) setTagFilter('')
  }, [allTags, tagFilter])

  // Keep an open detail/edit sheet in sync with the collection: drop it if the
  // record was deleted/cleared, refresh it if it changed (e.g. after import).
  useEffect(() => {
    if (selected) {
      const fresh = records.find((r) => r.id === selected.id)
      if (!fresh) setSelected(null)
      else if (fresh !== selected) setSelected(fresh)
    }
    if (editing) {
      const fresh = records.find((r) => r.id === editing.id)
      if (!fresh) setEditing(null)
    }
  }, [records, selected, editing])

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    const list = records.filter((r) => {
      if (genreFilter && r.genre !== genreFilter) return false
      if (tagFilter && !(r.tags || []).includes(tagFilter)) return false
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
      'played-most': (a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0) || b.createdAt - a.createdAt,
      'played-recent': (a, b) => (lastPlayed.get(b.id) || 0) - (lastPlayed.get(a.id) || 0) || b.createdAt - a.createdAt,
    }
    return [...list].sort(by[sort] || by.recent)
  }, [records, deferredQuery, genreFilter, tagFilter, sort, counts, lastPlayed])

  // Home-screen listening snapshot — emphasizes the spin loop + opens full Wrapped.
  const homeStats = useMemo(() => {
    const DAY = 86400000
    const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10)
    const days = new Set(plays.map((p) => dayKey(p.playedAt)))
    let streak = 0
    let cursor = Date.now()
    if (!days.has(dayKey(cursor)) && days.has(dayKey(cursor - DAY))) cursor -= DAY
    while (days.has(dayKey(cursor))) { streak++; cursor -= DAY }
    const monthCutoff = Date.now() - 30 * DAY
    return { spins: plays.length, thisMonth: plays.filter((p) => p.playedAt >= monthCutoff).length, streak }
  }, [plays])

  const openAdd = () => { setEditing(null); setAddedThisSession(0); setFormOpen(true) }
  const openEdit = (rec) => { setSelected(null); setEditing(rec); setFormOpen(true) }

  // Duplicate check for the add flow: same album + artist (case-insensitive).
  const findDuplicate = useCallback((album, artist) => {
    const a = (album || '').trim().toLowerCase()
    const ar = (artist || '').trim().toLowerCase()
    if (!a) return null
    return records.find((r) => r.album.toLowerCase() === a && r.artist.toLowerCase() === ar) || null
  }, [records])

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

  const addFromScan = useCallback((draft) => add({
    album: draft.album,
    artist: draft.artist,
    year: draft.year,
    genre: draft.genre,
    label: draft.label,
    catalogNo: draft.catalogNo,
    coverUrl: draft.coverUrl,
    coverSource: draft.coverUrl ? 'official' : null,
  }), [add])

  const handleIdentifyPressing = async (id, pressing) => {
    try { await update(id, { pressing }) }
    catch (err) { alert(`Couldn't save that pressing: ${err.message || err}`) }
  }

  const applyFoundCover = async (id, coverUrl) => {
    try { await update(id, { coverUrl, coverSource: 'official' }); bustCover(id) }
    catch (err) { alert(`Couldn't set that cover: ${err.message || err}`) }
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

  const handleDiscogsCommit = async (recs) => {
    try {
      await bulkAdd(recs)
      setDiscogsOpen(false)
      setSettingsOpen(false)
    } catch (err) {
      alert(`Couldn't import: ${err.message || err}`)
    }
  }

  // Per-record cover fixes (from the Change-cover editor). selected reconciles
  // automatically after each write, so the editor re-renders with the new state.
  const runCover = async (fn, label) => {
    const id = selected?.id
    if (!id) return
    try { await fn(id); bustCover(id) }
    catch (e) { if (!/not found/i.test(e?.message || '')) alert(`${label}: ${e.message || e}`) } // record gone mid-edit = silent no-op
  }
  const cover = {
    setOfficial: (url) => runCover((id) => update(id, { coverUrl: url, coverSource: 'official' }), "Couldn't set cover"),
    pickPhoto: (file) => runCover(async (id) => { await setPhoto(id, file); await update(id, { coverSource: null }) }, "Couldn't set photo"),
    usePhoto: () => runCover((id) => update(id, { coverSource: null }), "Couldn't update cover"),
    useOfficial: () => runCover((id) => update(id, { coverSource: 'official' }), "Couldn't update cover"),
    removePhoto: () => runCover((id) => removePhoto(id), "Couldn't remove photo"),
  }

  // "Got it!" — move a wishlist record into the owned collection.
  const handlePromoteWant = async (want) => {
    try {
      await add({ album: want.album, artist: want.artist, year: want.year, genre: want.genre, coverUrl: want.coverUrl, coverSource: want.coverUrl ? 'official' : null })
      await removeWant(want.id)
    } catch (err) {
      alert(`Couldn't move that to your collection: ${err.message || err}`)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="brand">
          <Logo size={28} />
          <span>SPUN</span>
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
                aria-pressed={view === v.id}
                title={v.label}
              >
                <Icon name={v.icon} size={18} />
              </button>
            ))}
          </div>
          <label className="select-wrap" title="Filter by genre">
            <Icon name="filter" size={15} />
            <select className="select" value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)} aria-label="Filter genre">
              <option value="">All genres</option>
              {genres.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label className="select-wrap" title="Sort records">
            <Icon name="sort" size={15} />
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.id === sort ? `Sort: ${s.label}` : s.label}</option>)}
            </select>
          </label>
          <button className="icon-btn dice-btn" onClick={() => setRandomOpen(true)} aria-label="What do I play tonight? Pick a random record" title="What do I play tonight?">
            <Icon name="dice" size={26} />
          </button>
        </div>
        {allTags.length > 0 && (
          <div className="crate-chips">
            <button className={`chip ${!tagFilter ? 'on' : ''}`} onClick={() => setTagFilter('')}>All crates</button>
            {allTags.map((t) => (
              <button key={t} className={`chip ${tagFilter === t ? 'on' : ''}`} onClick={() => setTagFilter(tagFilter === t ? '' : t)}>
                <Icon name="tag" size={13} /> {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <InstallHint />

      {records.length > 0 && !deferredQuery.trim() && !genreFilter && !tagFilter && (
        <TonightCard records={records} lastPlayed={lastPlayed} onSpin={logPlay} onOpen={setSelected} />
      )}

      {records.length > 0 && (
        <button className="home-stats" onClick={() => setListeningOpen(true)} aria-label="Open your listening stats (Wrapped)">
          <span className="home-stat"><strong>{homeStats.spins}</strong><small>spins</small></span>
          <span className="home-stat"><strong>{homeStats.thisMonth}</strong><small>this month</small></span>
          <span className="home-stat"><strong>{homeStats.streak}{homeStats.streak > 0 ? ' 🔥' : ''}</strong><small>day streak</small></span>
          <span className="home-stat"><strong>{records.length}</strong><small>records</small></span>
          <Icon name="chevronRight" size={16} />
        </button>
      )}

      <main className="content">
        {loading ? (
          <p className="empty-note">Loading your collection…</p>
        ) : error ? (
          <div className="empty-state">
            <Logo size={56} />
            <h2>Couldn't load your collection</h2>
            <p>{navigator.onLine ? 'Something went wrong reaching your data.' : "You're offline — reconnect and retry."}</p>
            <div className="empty-cta">
              <button className="btn btn-primary" onClick={reload}>Retry</button>
            </div>
          </div>
        ) : records.length === 0 ? (
          <div className="empty-state">
            <Logo size={56} />
            <h2>Your crate is empty</h2>
            <p>Add records one at a time, or paste a whole list to add them in bulk.</p>
            <div className="empty-cta">
              <button className="btn btn-primary" onClick={openAdd}><Icon name="plus" size={18} /> Add a record</button>
              <button className="btn btn-ghost" onClick={() => setScanOpen(true)}><Icon name="camera" size={18} /> Scan a barcode</button>
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
            onChangeCover={() => setCoverEditOpen(true)}
            playCount={counts.get(selected.id) || 0}
            lastPlayed={lastPlayed.get(selected.id)}
          >
            <PressingInfo record={selected} onIdentify={(p) => handleIdentifyPressing(selected.id, p)} />
          </RecordDetail>
        </Sheet>
      )}

      {coverEditOpen && selected && (
        <Sheet title="Change cover" onClose={() => setCoverEditOpen(false)}>
          <CoverEditor
            record={selected}
            onSetOfficial={(url) => cover.setOfficial(url)}
            onPickPhoto={(file) => cover.pickPhoto(file)}
            onUsePhoto={cover.usePhoto}
            onUseOfficial={cover.useOfficial}
            onRemovePhoto={cover.removePhoto}
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
          <BulkAdd onCommit={handleBulkCommit} onCancel={() => setBulkOpen(false)} findDuplicate={findDuplicate} />
        </Sheet>
      )}

      {discogsOpen && (
        <Sheet title="Import from Discogs" onClose={() => setDiscogsOpen(false)}>
          <DiscogsImport onCommit={handleDiscogsCommit} onCancel={() => setDiscogsOpen(false)} findDuplicate={findDuplicate} />
        </Sheet>
      )}

      {scanOpen && (
        <Sheet title="Scan a barcode" onClose={() => setScanOpen(false)}>
          <BarcodeScanner onAdd={addFromScan} findDuplicate={findDuplicate} onClose={() => setScanOpen(false)} />
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


      {wishlistOpen && (
        <Sheet title={`Wishlist${wants.length ? ` (${wants.length})` : ''}`} onClose={() => setWishlistOpen(false)} wide>
          <Wishlist wants={wants} onAdd={addWant} onRemove={removeWant} onPromote={handlePromoteWant} />
        </Sheet>
      )}

      {settingsOpen && (
        <Sheet title="Menu" onClose={() => setSettingsOpen(false)}>
          <SettingsSheet
            count={records.length}
            dark={theme === 'dark'}
            onToggleDark={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            onBulkAdd={() => { setSettingsOpen(false); setBulkOpen(true) }}
            onScan={() => { setSettingsOpen(false); setScanOpen(true) }}
            onImportDiscogs={() => { setSettingsOpen(false); setDiscogsOpen(true) }}
            onShowStats={() => { setSettingsOpen(false); setStatsOpen(true) }}
            onShowListening={() => { setSettingsOpen(false); setListeningOpen(true) }}
            onShowRandom={() => { setSettingsOpen(false); setRandomOpen(true) }}
            onShowWishlist={() => { setSettingsOpen(false); setWishlistOpen(true) }}
            onShowCoverFix={() => { setSettingsOpen(false); setCoverFixOpen(true) }}
            onShowFriends={() => { setSettingsOpen(false); friendsApi.reload(); setFriendsOpen(true) }}
            onShowTour={() => { setSettingsOpen(false); setShowTour(true) }}
            wantCount={wants.length}
            pendingCount={friendsApi.pendingCount}
            shareNotes={shareNotes}
            onToggleShareNotes={toggleShareNotes}
            onChanged={reloadAll}
          />
        </Sheet>
      )}

      {coverFixOpen && (
        <Sheet title="Find missing covers" onClose={() => setCoverFixOpen(false)} wide>
          <CoverFixer records={records} onApply={applyFoundCover} onClose={() => setCoverFixOpen(false)} />
        </Sheet>
      )}

      {friendsOpen && (
        <Sheet title="Friends" onClose={() => setFriendsOpen(false)} wide>
          <Friends {...friendsApi} onViewFriend={(f) => { setFriendsOpen(false); setViewingFriend(f) }} />
        </Sheet>
      )}

      {viewingFriend && (
        <Sheet title={`${viewingFriend.name}’s collection`} onClose={() => setViewingFriend(null)} wide>
          <FriendCollection friend={viewingFriend} />
        </Sheet>
      )}

      {showTour && <Onboarding onClose={closeTour} />}
    </div>
  )
}
