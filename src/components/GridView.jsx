import Cover from './Cover.jsx'

export default function GridView({ records, onSelect }) {
  return (
    <div className="grid-view">
      {records.map((r) => (
        <button key={r.id} className="grid-item" onClick={() => onSelect(r)}>
          <Cover record={r} />
          <div className="grid-meta">
            <span className="grid-album">{r.album}</span>
            <span className="grid-artist">{r.artist}{r.year ? ` · ${r.year}` : ''}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
