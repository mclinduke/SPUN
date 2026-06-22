import { useEffect, useMemo, useState } from 'react'
import { getRepository } from '../data/repository.js'
import GridView from './GridView.jsx'
import ListeningStats from './ListeningStats.jsx'
import RecordDetail from './RecordDetail.jsx'
import PressingInfo from './PressingInfo.jsx'
import Sheet from './Sheet.jsx'
import Icon from './Icon.jsx'

/** Read-only browser for an accepted friend's collection + listening stats.
 *  All data comes from gated server functions; nothing here can mutate it. */
export default function FriendCollection({ friend }) {
  const [records, setRecords] = useState(null)
  const [plays, setPlays] = useState([])
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('records')
  const [tagFilter, setTagFilter] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    let active = true
    setRecords(null); setError(null)
    const repo = getRepository()
    Promise.all([repo.friendRecords(friend.otherId), repo.friendPlays(friend.otherId)])
      .then(([recs, pl]) => { if (active) { setRecords(recs); setPlays(pl) } })
      .catch((e) => { if (active) setError(e.message || String(e)) })
    return () => { active = false }
  }, [friend.otherId])

  const counts = useMemo(() => {
    const m = new Map()
    for (const p of plays) m.set(p.recordId, (m.get(p.recordId) || 0) + 1)
    return m
  }, [plays])

  const tags = useMemo(() => [...new Set((records || []).flatMap((r) => r.tags || []))].sort(), [records])
  const visible = useMemo(() => {
    if (!records) return []
    const list = tagFilter ? records.filter((r) => (r.tags || []).includes(tagFilter)) : records
    return [...list].sort((a, b) =>
      (a.artist || '').localeCompare(b.artist || '', undefined, { sensitivity: 'base' }) ||
      (a.album || '').localeCompare(b.album || '', undefined, { sensitivity: 'base' }))
  }, [records, tagFilter])

  if (error) return <p className="empty-note">Couldn’t load {friend.name}’s collection: {error}</p>
  if (!records) return <p className="empty-note">Loading {friend.name}’s collection…</p>
  if (!records.length) return <p className="empty-note">{friend.name} hasn’t added any records yet.</p>

  return (
    <div className="friend-collection">
      <div className="segmented friend-tabs">
        <button className={tab === 'records' ? 'active' : ''} onClick={() => setTab('records')} aria-pressed={tab === 'records'}>
          <Icon name="grid" size={16} /> Records
        </button>
        <button className={tab === 'listening' ? 'active' : ''} onClick={() => setTab('listening')} aria-pressed={tab === 'listening'}>
          <Icon name="headphones" size={16} /> Listening
        </button>
      </div>

      {tab === 'records' ? (
        <>
          {tags.length > 0 && (
            <div className="crate-chips">
              <button className={`chip ${!tagFilter ? 'on' : ''}`} onClick={() => setTagFilter('')}>All crates</button>
              {tags.map((t) => (
                <button key={t} className={`chip ${tagFilter === t ? 'on' : ''}`} onClick={() => setTagFilter(tagFilter === t ? '' : t)}>
                  <Icon name="tag" size={13} /> {t}
                </button>
              ))}
            </div>
          )}
          <p className="hint">{visible.length} record{visible.length === 1 ? '' : 's'}</p>
          <GridView records={visible} onSelect={setSelected} />
        </>
      ) : (
        <ListeningStats records={records} plays={plays} onSelect={setSelected} />
      )}

      {selected && (
        <Sheet title="Record" onClose={() => setSelected(null)}>
          <RecordDetail record={selected} readOnly playCount={counts.get(selected.id) || 0}>
            <PressingInfo record={selected} />
          </RecordDetail>
        </Sheet>
      )}
    </div>
  )
}
