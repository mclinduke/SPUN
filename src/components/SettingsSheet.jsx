import { useRef, useState } from 'react'
import { exportJSON, exportCSV, importJSON, importCSV, downloadFile } from '../services/importExport.js'
import { getRepository } from '../data/repository.js'
import { bustAllCovers } from '../hooks/useCoverSrc.js'
import Icon from './Icon.jsx'

function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}

export default function SettingsSheet({ count, dark, onToggleDark, onBulkAdd, onShowStats, onShowListening, onShowRandom, onShowValue, onChanged }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const doExportJSON = async () => {
    setBusy('Exporting…')
    const data = await exportJSON({ includePhotos: true })
    downloadFile(`vinyl-collection-${todayStamp()}.json`, JSON.stringify(data, null, 2))
    setBusy('')
  }

  const doExportCSV = async () => {
    setBusy('Exporting…')
    const csv = await exportCSV()
    downloadFile(`vinyl-collection-${todayStamp()}.csv`, csv, 'text/csv')
    setBusy('')
  }

  const onImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy('Importing…')
    try {
      const text = await file.text()
      if (file.name.toLowerCase().endsWith('.csv')) {
        await importCSV(text)
      } else {
        await importJSON(JSON.parse(text), { merge: true })
      }
      bustAllCovers() // imported photos may reuse ids — drop stale object URLs
      await onChanged()
    } catch (err) {
      alert(`Import failed: ${err.message}`)
    } finally {
      setBusy('')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const doClear = async () => {
    await getRepository().clear()
    bustAllCovers()
    await onChanged()
    setConfirmClear(false)
  }

  return (
    <div className="settings">
      <button className="menu-item" onClick={onBulkAdd}>
        <Icon name="plus" /> <span><strong>Bulk add records</strong><small>Paste or type a whole list at once</small></span>
      </button>
      <button className="menu-item" onClick={onShowRandom} disabled={!count}>
        <Icon name="dice" /> <span><strong>What do I play tonight?</strong><small>Random pick, with filters</small></span>
      </button>
      <button className="menu-item" onClick={onShowListening}>
        <Icon name="headphones" /> <span><strong>Your listening</strong><small>Spins, streaks, most-played</small></span>
      </button>
      <button className="menu-item" onClick={onShowStats}>
        <Icon name="stats" /> <span><strong>Collection stats</strong><small>{count} records</small></span>
      </button>
      <button className="menu-item" onClick={onShowValue} disabled={!count}>
        <Icon name="sparkle" /> <span><strong>Collection value</strong><small>Rough estimate via Discogs</small></span>
      </button>

      <div className="menu-section">Backup &amp; share</div>
      <button className="menu-item" onClick={doExportJSON} disabled={!count}>
        <Icon name="download" /> <span><strong>Export full backup (JSON)</strong><small>Everything, including your photos</small></span>
      </button>
      <button className="menu-item" onClick={doExportCSV} disabled={!count}>
        <Icon name="download" /> <span><strong>Export spreadsheet (CSV)</strong><small>Metadata only</small></span>
      </button>
      <button className="menu-item" onClick={() => fileRef.current?.click()}>
        <Icon name="upload" /> <span><strong>Import (JSON or CSV)</strong><small>Merges into your collection</small></span>
      </button>
      <input ref={fileRef} type="file" accept=".json,.csv,application/json,text/csv" hidden onChange={onImportFile} />

      <div className="menu-section">Appearance</div>
      <button className="menu-item" onClick={onToggleDark}>
        <Icon name={dark ? 'sun' : 'moon'} /> <span><strong>{dark ? 'Light mode' : 'Dark mode'}</strong></span>
      </button>

      <div className="menu-section danger-section">Danger zone</div>
      {confirmClear ? (
        <div className="confirm-clear">
          <span>Delete all {count} records? This can't be undone.</span>
          <div>
            <button className="btn btn-danger" onClick={doClear}>Delete everything</button>
            <button className="btn btn-ghost" onClick={() => setConfirmClear(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="menu-item danger" onClick={() => setConfirmClear(true)} disabled={!count}>
          <Icon name="trash" /> <span><strong>Clear collection</strong></span>
        </button>
      )}

      {busy && <p className="busy-note">{busy}</p>}
    </div>
  )
}
