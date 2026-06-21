import { useMemo, useState } from 'react'
import Cover from './Cover.jsx'
import Icon from './Icon.jsx'

/** "What do I play tonight?" — pick a random record, optionally constrained. */
export default function RandomPicker({ records, counts, genres, onSelect }) {
  const [genre, setGenre] = useState('')
  const [decade, setDecade] = useState('')
  const [unplayedOnly, setUnplayedOnly] = useState(false)
  const [pick, setPick] = useState(null)
  const [empty, setEmpty] = useState(false)

  const decades = useMemo(() => {
    const set = new Set()
    for (const r of records) {
      const y = Number(r.year)
      if (Number.isFinite(y) && y >= 1900 && y <= 2100) set.add(Math.floor(y / 10) * 10)
    }
    return [...set].sort((a, b) => a - b)
  }, [records])

  const pool = useMemo(() => records.filter((r) => {
    if (genre && r.genre !== genre) return false
    if (decade) {
      const y = Number(r.year)
      if (!(Number.isFinite(y) && Math.floor(y / 10) * 10 === Number(decade))) return false
    }
    if (unplayedOnly && (counts.get(r.id) || 0) > 0) return false
    return true
  }), [records, genre, decade, unplayedOnly, counts])

  const roll = () => {
    if (!pool.length) { setEmpty(true); setPick(null); return }
    setEmpty(false)
    // avoid repeating the current pick when the pool is big enough
    let next = pool[Math.floor(Math.random() * pool.length)]
    if (pool.length > 1 && pick && next.id === pick.id) next = pool[(pool.indexOf(next) + 1) % pool.length]
    setPick(next)
  }

  return (
    <div className="random">
      <div className="random-constraints">
        <select className="select" value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Constrain genre">
          <option value="">Any genre</option>
          {genres.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select className="select" value={decade} onChange={(e) => setDecade(e.target.value)} aria-label="Constrain decade">
          <option value="">Any decade</option>
          {decades.map((d) => <option key={d} value={d}>{d}s</option>)}
        </select>
        <label className="toggle">
          <input type="checkbox" checked={unplayedOnly} onChange={(e) => setUnplayedOnly(e.target.checked)} />
          <span>Unplayed only</span>
        </label>
      </div>

      <p className="hint random-count">{pool.length} record{pool.length === 1 ? '' : 's'} in the pool</p>

      {pick ? (
        <div className="random-pick">
          <Cover record={pick} className="random-cover" />
          <h3>{pick.album || 'Untitled'}</h3>
          <p className="detail-artist">{pick.artist}{pick.year ? ` · ${pick.year}` : ''}</p>
          <div className="random-actions">
            <button className="btn btn-primary" onClick={() => onSelect(pick)}>Open it</button>
            <button className="btn btn-ghost" onClick={roll}><Icon name="dice" size={18} /> Pick again</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary random-roll" onClick={roll} disabled={!records.length}>
          <Icon name="dice" size={20} /> Pick a record
        </button>
      )}
      {empty && <p className="empty-note">Nothing matches those constraints — loosen them.</p>}
    </div>
  )
}
