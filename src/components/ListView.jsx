import Cover from './Cover.jsx'

export default function ListView({ records, onSelect }) {
  return (
    <div className="list-view">
      {records.map((r) => (
        <button key={r.id} className="list-item" onClick={() => onSelect(r)}>
          <Cover record={r} className="list-thumb" />
          <div className="list-text">
            <span className="list-album">{r.album || 'Untitled'}</span>
            <span className="list-artist">{r.artist}</span>
          </div>
          <div className="list-side">
            {r.genre && <span className="tag">{r.genre}</span>}
            {r.year && <span className="list-year">{r.year}</span>}
          </div>
        </button>
      ))}
    </div>
  )
}
