import { useMemo } from 'react'

function tally(records, keyFn) {
  const map = new Map()
  for (const r of records) {
    const k = keyFn(r)
    if (!k) continue
    map.set(k, (map.get(k) || 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}

function BarList({ title, data, max }) {
  if (!data.length) return null
  return (
    <div className="stat-block">
      <h4>{title}</h4>
      <ul className="stat-bars">
        {data.map(([label, count]) => (
          <li key={label}>
            <span className="stat-label">{label}</span>
            <span className="stat-track"><span className="stat-fill" style={{ width: `${(count / max) * 100}%` }} /></span>
            <span className="stat-count">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Stats({ records }) {
  const { decades, genres, artists, artistCount, total } = useMemo(() => {
    const decades = tally(records, (r) => {
      const y = Number(r.year)
      return Number.isFinite(y) && y >= 1900 && y <= 2100 ? `${Math.floor(y / 10) * 10}s` : null
    }).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    const genres = tally(records, (r) => r.genre)
    const allArtists = tally(records, (r) => r.artist)
    return { decades, genres, artists: allArtists.slice(0, 10), artistCount: allArtists.length, total: records.length }
  }, [records])

  if (!total) return <p className="empty-note">Add some records to see stats.</p>

  return (
    <div className="stats">
      <div className="stat-headline">
        <span className="big-number">{total}</span>
        <span>record{total === 1 ? '' : 's'} · {genres.length} genres · {artistCount} artists</span>
      </div>
      <BarList title="By decade" data={decades} max={Math.max(...decades.map((d) => d[1]), 1)} />
      <BarList title="Top genres" data={genres.slice(0, 8)} max={Math.max(...genres.map((d) => d[1]), 1)} />
      <BarList title="Top artists" data={artists} max={Math.max(...artists.map((d) => d[1]), 1)} />
    </div>
  )
}
