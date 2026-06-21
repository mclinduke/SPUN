import { useEffect, useRef, useState } from 'react'
import Cover from './Cover.jsx'
import Icon from './Icon.jsx'

function ago(ts) {
  if (!ts) return null
  const days = Math.floor((Date.now() - ts) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} wk ago`
  return new Date(ts).toLocaleDateString()
}

export default function RecordDetail({ record, onEdit, onDelete, onPlay, onChangeCover, playCount = 0, lastPlayed, children }) {
  const [confirming, setConfirming] = useState(false)
  const [justSpun, setJustSpun] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])

  const spin = async () => {
    if (busy) return // guard against double-tap double-logging
    setBusy(true)
    try {
      await onPlay(record.id)
      setJustSpun(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setJustSpun(false), 1400)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="detail">
      <Cover record={record} className="detail-cover" />
      {onChangeCover && (
        <button className="linkish ce-trigger" onClick={() => onChangeCover(record)}>
          <Icon name="edit" size={13} /> Change cover
        </button>
      )}
      <h3 className="detail-album">{record.album || 'Untitled'}</h3>
      <p className="detail-artist">{record.artist}</p>
      <div className="detail-tags">
        {record.year && <span className="tag">{record.year}</span>}
        {record.genre && <span className="tag">{record.genre}</span>}
        {record.hasPhoto && <span className="tag tag-soft">Your photo</span>}
        {(record.tags || []).map((t) => <span key={t} className="tag tag-soft">{t}</span>)}
      </div>

      <button className={`btn btn-primary spin-btn ${justSpun ? 'spun' : ''}`} onClick={spin} disabled={busy}>
        <Icon name={justSpun ? 'check' : 'play'} size={18} /> {justSpun ? 'Logged!' : 'I spun this'}
      </button>
      {playCount > 0 && (
        <p className="play-stat">Played {playCount}×{lastPlayed ? ` · last ${ago(lastPlayed)}` : ''}</p>
      )}

      {(record.label || record.catalogNo) && (
        <p className="detail-pressing">{[record.label, record.catalogNo].filter(Boolean).join(' · ')}</p>
      )}
      {record.notes && <p className="detail-notes">{record.notes}</p>}

      {children /* pressing & rarity panel (Discogs) injected by App */}

      <div className="detail-actions">
        <button className="btn btn-ghost" onClick={() => onEdit(record)}>
          <Icon name="edit" size={18} /> Edit
        </button>
        {confirming ? (
          <span className="confirm-delete">
            <span>Delete?</span>
            <button className="btn btn-danger" onClick={() => onDelete(record)}>Yes, delete</button>
            <button className="btn btn-ghost" onClick={() => setConfirming(false)}>No</button>
          </span>
        ) : (
          <button className="btn btn-ghost danger" onClick={() => setConfirming(true)}>
            <Icon name="trash" size={18} /> Delete
          </button>
        )}
      </div>
    </div>
  )
}
