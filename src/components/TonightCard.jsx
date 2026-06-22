import { useEffect, useMemo, useState } from 'react'
import Cover from './Cover.jsx'
import Icon from './Icon.jsx'

function sinceLabel(ts) {
  if (!ts) return 'You’ve never spun this'
  const days = Math.floor((Date.now() - ts) / 86400000)
  if (days < 1) return 'Last spun today'
  if (days < 30) return `Last spun ${days} day${days === 1 ? '' : 's'} ago`
  if (days < 365) return `Haven’t spun this in ${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? '' : 's'}`
  return 'Haven’t spun this in over a year'
}

/** "What do I play tonight?" hero — surfaces a record you've forgotten you own
 *  (never-played first, then longest-unplayed) with a one-tap spin. The shown
 *  record is held in state so logging a spin (which shrinks the pool) never
 *  swaps the card out from under you. */
export default function TonightCard({ records, lastPlayed, onSpin, onOpen }) {
  const pool = useMemo(() => {
    if (!records.length) return []
    const never = records.filter((r) => !lastPlayed.has(r.id))
    if (never.length) return never
    return [...records].sort((a, b) => (lastPlayed.get(a.id) || 0) - (lastPlayed.get(b.id) || 0)).slice(0, 40)
  }, [records, lastPlayed])

  const pick = (exclude) => {
    if (!pool.length) return null
    if (pool.length === 1) return pool[0]
    let r
    do { r = pool[Math.floor(Math.random() * pool.length)] } while (exclude && r.id === exclude.id)
    return r
  }

  const [current, setCurrent] = useState(null)
  const [spun, setSpun] = useState(false)

  // Keep the current record if it still exists; only re-pick when the collection
  // itself changes (add/delete/import). Logging a spin changes plays, not records,
  // so the shown card stays put until the user shuffles.
  useEffect(() => {
    setCurrent((cur) => (cur && records.some((r) => r.id === cur.id) ? cur : pick(null)))
  }, [records]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null

  const shuffle = () => { setSpun(false); setCurrent(pick(current)) }
  const spin = async () => { await onSpin(current.id); setSpun(true) }

  return (
    <section className="tonight" aria-label="What to play tonight">
      <button className="tonight-cover" onClick={() => onOpen(current)} aria-label={`Open ${current.album}`}>
        <Cover record={current} />
      </button>
      <div className="tonight-body">
        <span className="tonight-kicker"><Icon name="sparkle" size={13} /> Play something tonight</span>
        <strong className="tonight-album">{current.album || 'Untitled'}</strong>
        <span className="tonight-artist">{current.artist}</span>
        <span className="tonight-since">{sinceLabel(lastPlayed.get(current.id))}</span>
        <div className="tonight-actions">
          <button className={`btn btn-primary btn-sm ${spun ? 'spun' : ''}`} onClick={spin} disabled={spun}>
            <Icon name={spun ? 'check' : 'play'} size={15} /> {spun ? 'Logged!' : 'Spin it'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={shuffle}><Icon name="dice" size={15} /> Another</button>
        </div>
      </div>
    </section>
  )
}
