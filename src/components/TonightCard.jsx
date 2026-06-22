import { useMemo, useState } from 'react'
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
 *  (never-played first, then longest-unplayed) with a one-tap spin. The heart of
 *  SPUN: help you actually play the records you have. */
export default function TonightCard({ records, lastPlayed, onSpin, onOpen }) {
  // Neglected pool: records never played, else the longest-since-last-played.
  const pool = useMemo(() => {
    if (!records.length) return []
    const never = records.filter((r) => !lastPlayed.has(r.id))
    if (never.length) return never
    return [...records].sort((a, b) => (lastPlayed.get(a.id) || 0) - (lastPlayed.get(b.id) || 0)).slice(0, 40)
  }, [records, lastPlayed])

  const [i, setI] = useState(() => Math.floor(Math.random() * 100000))
  const [spun, setSpun] = useState(false)
  if (!pool.length) return null

  const rec = pool[i % pool.length]
  const shuffle = () => { setSpun(false); setI((n) => n + 1 + Math.floor(Math.random() * Math.max(1, pool.length - 1))) }
  const spin = async () => { await onSpin(rec.id); setSpun(true) }

  return (
    <section className="tonight" aria-label="What to play tonight">
      <button className="tonight-cover" onClick={() => onOpen(rec)} aria-label={`Open ${rec.album}`}>
        <Cover record={rec} />
      </button>
      <div className="tonight-body">
        <span className="tonight-kicker"><Icon name="sparkle" size={13} /> Play something tonight</span>
        <strong className="tonight-album">{rec.album || 'Untitled'}</strong>
        <span className="tonight-artist">{rec.artist}</span>
        <span className="tonight-since">{sinceLabel(lastPlayed.get(rec.id))}</span>
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
