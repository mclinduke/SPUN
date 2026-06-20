import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Cover from './Cover.jsx'
import Icon from './Icon.jsx'

/**
 * iPad-style Cover Flow. A horizontal scroll-snap track where each cover is
 * rotated/scaled in 3D based on its distance from the visual center, recomputed
 * on every scroll frame (rAF-throttled).
 */
export default function CoverFlowView({ records, onSelect }) {
  const trackRef = useRef(null)
  const itemsRef = useRef([])
  const frame = useRef(0)
  const snapTimer = useRef(0)
  const [active, setActive] = useState(0)

  const apply = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const center = track.scrollLeft + track.clientWidth / 2
    let nearest = 0
    let nearestDist = Infinity
    itemsRef.current.forEach((el, i) => {
      if (!el) return
      const itemCenter = el.offsetLeft + el.offsetWidth / 2
      const delta = (itemCenter - center) / el.offsetWidth // in item-widths
      const clamped = Math.max(-3, Math.min(3, delta))
      const rotateY = Math.max(-58, Math.min(58, -clamped * 50))
      const scale = Math.max(0.62, 1 - Math.abs(clamped) * 0.16)
      const translateZ = -Math.abs(clamped) * 110
      const translateX = -clamped * el.offsetWidth * 0.42
      const opacity = Math.max(0.32, 1 - Math.abs(clamped) * 0.28)
      el.style.transform = `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`
      el.style.opacity = String(opacity)
      el.style.zIndex = String(100 - Math.round(Math.abs(delta) * 10))
      const dist = Math.abs(itemCenter - center)
      if (dist < nearestDist) { nearestDist = dist; nearest = i }
    })
    setActive(nearest)
  }, [])

  const onScroll = useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(apply)
  }, [apply])

  const scrollToIndex = useCallback((i, behavior = 'smooth') => {
    const el = itemsRef.current[i]
    const track = trackRef.current
    if (!el || !track) return
    const left = el.offsetLeft + el.offsetWidth / 2 - track.clientWidth / 2
    if (behavior === 'smooth') {
      // CSS mandatory snap fights programmatic smooth scrolling and leaves it
      // stuck between snap points. Turn snap off for the animation, then
      // restore it once we've landed exactly on a snap point.
      track.style.scrollSnapType = 'none'
      track.scrollTo({ left, behavior: 'smooth' })
      clearTimeout(snapTimer.current)
      snapTimer.current = setTimeout(() => { track.style.scrollSnapType = '' }, 500)
    } else {
      track.scrollTo({ left, behavior })
    }
  }, [])

  // Center the first item on mount / when the set changes, then paint.
  useLayoutEffect(() => {
    itemsRef.current = itemsRef.current.slice(0, records.length)
    const id = requestAnimationFrame(() => { scrollToIndex(0, 'auto'); apply() })
    return () => cancelAnimationFrame(id)
  }, [records, apply, scrollToIndex])

  useEffect(() => {
    const onResize = () => apply()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      clearTimeout(snapTimer.current)
    }
  }, [apply])

  const current = records[active]

  const onItemClick = (i, record) => {
    if (i === active) onSelect(record)
    else scrollToIndex(i)
  }

  return (
    <div className="coverflow-wrap">
      <button className="cf-nav cf-prev" onClick={() => scrollToIndex(Math.max(0, active - 1))} aria-label="Previous">
        <Icon name="chevronLeft" size={26} />
      </button>
      <div className="coverflow" ref={trackRef} onScroll={onScroll}>
        {records.map((r, i) => (
          <div
            key={r.id}
            ref={(el) => { itemsRef.current[i] = el }}
            className={`coverflow-item ${i === active ? 'is-active' : ''}`}
          >
            <button className="cf-cover-btn" onClick={() => onItemClick(i, r)} tabIndex={i === active ? 0 : -1}>
              <Cover record={r} />
            </button>
          </div>
        ))}
      </div>
      <button className="cf-nav cf-next" onClick={() => scrollToIndex(Math.min(records.length - 1, active + 1))} aria-label="Next">
        <Icon name="chevronRight" size={26} />
      </button>
      {current && (
        <div className="cf-caption" key={current.id}>
          <span className="cf-album">{current.album}</span>
          <span className="cf-artist">{current.artist}{current.year ? ` · ${current.year}` : ''}</span>
          <button className="btn btn-ghost cf-details" onClick={() => onSelect(current)}>View details</button>
        </div>
      )}
    </div>
  )
}
