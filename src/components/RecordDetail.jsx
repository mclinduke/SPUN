import { useState } from 'react'
import Cover from './Cover.jsx'
import Icon from './Icon.jsx'

export default function RecordDetail({ record, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="detail">
      <Cover record={record} className="detail-cover" />
      <h3 className="detail-album">{record.album || 'Untitled'}</h3>
      <p className="detail-artist">{record.artist}</p>
      <div className="detail-tags">
        {record.year && <span className="tag">{record.year}</span>}
        {record.genre && <span className="tag">{record.genre}</span>}
        {record.hasPhoto && <span className="tag tag-soft">Your photo</span>}
      </div>
      {record.notes && <p className="detail-notes">{record.notes}</p>}

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
