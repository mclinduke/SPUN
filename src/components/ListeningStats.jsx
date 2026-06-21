import { useMemo } from 'react'
import Cover from './Cover.jsx'

const DAY = 86400000
const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10)

/** Spotify-Wrapped-style view of vinyl listening habits, driven by the play log. */
export default function ListeningStats({ records, plays, onSelect }) {
  const byId = useMemo(() => new Map(records.map((r) => [r.id, r])), [records])

  const stats = useMemo(() => {
    if (!plays.length) return null
    const counts = new Map()
    const artistCounts = new Map()
    const days = new Set()
    for (const p of plays) {
      counts.set(p.recordId, (counts.get(p.recordId) || 0) + 1)
      const rec = byId.get(p.recordId)
      if (rec?.artist) artistCounts.set(rec.artist, (artistCounts.get(rec.artist) || 0) + 1)
      days.add(dayKey(p.playedAt))
    }

    const topRecords = [...counts.entries()]
      .map(([id, n]) => ({ rec: byId.get(id), n }))
      .filter((x) => x.rec)
      .sort((a, b) => b.n - a.n)
      .slice(0, 5)

    const topArtists = [...artistCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

    // current streak: consecutive days with >=1 play, ending today (or yesterday)
    let streak = 0
    let cursor = Date.now()
    if (!days.has(dayKey(cursor)) && days.has(dayKey(cursor - DAY))) cursor -= DAY // count a streak that ended yesterday
    while (days.has(dayKey(cursor))) { streak++; cursor -= DAY }

    // last 8 weeks of play volume
    const weeks = []
    const now = Date.now()
    for (let w = 7; w >= 0; w--) {
      const start = now - (w + 1) * 7 * DAY
      const end = now - w * 7 * DAY
      weeks.push(plays.filter((p) => p.playedAt >= start && p.playedAt < end).length)
    }
    const weekMax = Math.max(...weeks, 1)

    return { total: plays.length, uniq: counts.size, streak, topRecords, topArtists, weeks, weekMax }
  }, [plays, byId])

  if (!stats) {
    return (
      <div className="empty-note">
        <p>No spins logged yet.</p>
        <p>Tap <strong>“I spun this”</strong> on any record and your listening habits build up here.</p>
      </div>
    )
  }

  return (
    <div className="listening">
      <div className="listen-headline">
        <div><span className="big-number">{stats.total}</span><span>spins</span></div>
        <div><span className="big-number">{stats.uniq}</span><span>records played</span></div>
        <div><span className="big-number">{stats.streak}</span><span>day streak {stats.streak > 0 ? '🔥' : ''}</span></div>
      </div>

      <div className="stat-block">
        <h4>Spins · last 8 weeks</h4>
        <div className="spark">
          {stats.weeks.map((n, i) => (
            <span key={i} className="spark-bar" style={{ height: `${(n / stats.weekMax) * 100}%` }} title={`${n} spins`} />
          ))}
        </div>
      </div>

      {stats.topRecords.length > 0 && (
        <div className="stat-block">
          <h4>Most played</h4>
          <ol className="top-records">
            {stats.topRecords.map(({ rec, n }, i) => (
              <li key={rec.id}>
                <span className="rank">{i + 1}</span>
                <button className="top-rec-btn" onClick={() => onSelect(rec)}>
                  <Cover record={rec} className="top-thumb" />
                  <span className="top-meta"><strong>{rec.album || 'Untitled'}</strong><small>{rec.artist}</small></span>
                </button>
                <span className="top-count">{n}×</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {stats.topArtists.length > 0 && (
        <div className="stat-block">
          <h4>Top artists by spins</h4>
          <ul className="stat-bars">
            {stats.topArtists.map(([artist, n]) => (
              <li key={artist}>
                <span className="stat-label">{artist}</span>
                <span className="stat-track"><span className="stat-fill" style={{ width: `${(n / stats.topArtists[0][1]) * 100}%` }} /></span>
                <span className="stat-count">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
