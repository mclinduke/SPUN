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
  const today = new Date().toISOString().slice(0, 10)

  // One forgotten record per CALENDAR DAY: persist today's pick so it's stable
  // across opens, but re-roll automatically tomorrow. (Previously it only changed
  // when the collection changed, so you'd see the same record every night.)
  useEffect(() => {
    setCurrent(() => {
      let saved = null
      try { saved = JSON.parse(localStorage.getItem('spun-tonight') || 'null') } catch { /* private mode */ }
      if (saved && saved.day === today) {
        const r = records.find((x) => x.id === saved.id)
        if (r) return r
      }
      const p = pick(null) // new day / first run / saved pick gone → fresh rediscovery
      try { if (p) localStorage.setItem('spun-tonight', JSON.stringify({ day: today, id: p.id })) } catch { /* ignore */ }
      return p
    })
  }, [records]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null

  const shuffle = () => {
    setSpun(false)
    const p = pick(current)
    setCurrent(p)
    try { if (p) localStorage.setItem('spun-tonight', JSON.stringify({ day: today, id: p.id })) } catch { /* ignore */ }
  }
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
