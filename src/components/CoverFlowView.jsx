import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Cover from './Cover.jsx'
import Icon from './Icon.jsx'

/**
 * iPad-style Cover Flow. A horizontal scroll-snap track where each cover is
 * rotated/scaled in 3D based on its distance from the visual center, recomputed
 * on every scroll frame (rAF-throttled).
 */
// Only render real covers (image + 3D layer) within this many items of the active
// one; everything else is a flat, empty placeholder. Keeps GPU layers ~2*WINDOW+1
// instead of one-per-record, which is what was crashing the page on mobile.
const WINDOW = 10

export default function CoverFlowView({ records, onSelect }) {
  const trackRef = useRef(null)
  const itemsRef = useRef([])
  const frame = useRef(0)
  const snapTimer = useRef(0)
  const [active, setActive] = useState(0)
  const geom = useRef([]) // cached {center,width} per item so apply() never forces reflow

  // Read layout ONCE (items are fixed-width, so geometry is stable until resize/record-set change).
  const measure = useCallback(() => {
    geom.current = itemsRef.current.map((el) => (el ? { center: el.offsetLeft + el.offsetWidth / 2, width: el.offsetWidth } : null))
  }, [])

  const apply = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const center = track.scrollLeft + track.clientWidth / 2
    const g = geom.current
    // 1) find the centred item (cheap math over cached geometry — no layout reads)
    let nearest = 0
    let nearestDist = Infinity
    for (let i = 0; i < g.length; i++) {
      if (!g[i]) continue
      const dist = Math.abs(g[i].center - center)
      if (dist < nearestDist) { nearestDist = dist; nearest = i }
    }
    // 2) only transform items inside the window; clear the rest so far placeholders
    //    drop their 3D transform (and thus their compositor layer).
    for (let i = 0; i < g.length; i++) {
      const el = itemsRef.current[i]
      if (!el) continue
      if (Math.abs(i - nearest) > WINDOW) {
        if (el.style.transform) { el.style.transform = ''; el.style.opacity = ''; el.style.zIndex = '' }
        continue
      }
      const o = g[i]
      if (!o) continue
      const delta = (o.center - center) / o.width
      const clamped = Math.max(-3, Math.min(3, delta))
      const rotateY = Math.max(-58, Math.min(58, -clamped * 50))
      const scale = Math.max(0.62, 1 - Math.abs(clamped) * 0.16)
      const translateZ = -Math.abs(clamped) * 110
      const translateX = -clamped * o.width * 0.42
      const opacity = Math.max(0.32, 1 - Math.abs(clamped) * 0.28)
      el.style.transform = `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`
      el.style.opacity = String(opacity)
      el.style.zIndex = String(100 - Math.round(Math.abs(delta) * 10))
    }
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
    const id = requestAnimationFrame(() => { scrollToIndex(0, 'auto'); measure(); apply() })
    return () => cancelAnimationFrame(id)
  }, [records, apply, scrollToIndex, measure])

  useEffect(() => {
    const onResize = () => { measure(); apply() }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      clearTimeout(snapTimer.current)
    }
  }, [apply, measure])

  // When the window shifts, transform the covers that just mounted (no flicker).
  useLayoutEffect(() => { apply() }, [active, apply])

  const current = records[Math.min(active, records.length - 1)] // clamp when the list shrinks under filter

  const onItemClick = (i, record) => {
    if (i === active) onSelect(record)
    else scrollToIndex(i)
  }

  // Keyboard navigation so off-screen covers are reachable without the mouse.
  const onKey = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); scrollToIndex(Math.max(0, active - 1)) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); scrollToIndex(Math.min(records.length - 1, active + 1)) }
    else if (e.key === 'Home') { e.preventDefault(); scrollToIndex(0) }
    else if (e.key === 'End') { e.preventDefault(); scrollToIndex(records.length - 1) }
    else if ((e.key === 'Enter' || e.key === ' ') && current) { e.preventDefault(); onSelect(current) }
  }

  return (
    <div className="coverflow-wrap">
      <button className="cf-nav cf-prev" onClick={() => scrollToIndex(Math.max(0, active - 1))} aria-label="Previous">
        <Icon name="chevronLeft" size={26} />
      </button>
      <div
        className="coverflow"
        ref={trackRef}
        onScroll={onScroll}
        onKeyDown={onKey}
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={`Cover flow, ${records.length} records. Use arrow keys to browse, Enter to open.`}
      >
        {records.map((r, i) => {
          const near = Math.abs(i - active) <= WINDOW
          return (
          <div
            key={r.id}
            ref={(el) => { itemsRef.current[i] = el }}
            className={`coverflow-item ${i === active ? 'is-active' : ''} ${near ? '' : 'cf-far'}`}
          >
            {near && (
            <button className="cf-cover-btn" onClick={() => onItemClick(i, r)} tabIndex={i === active ? 0 : -1}>
              <Cover record={r} />
            </button>
            )}
          </div>
          )
        })}
      </div>
      <button className="cf-nav cf-next" onClick={() => scrollToIndex(Math.min(records.length - 1, active + 1))} aria-label="Next">
        <Icon name="chevronRight" size={26} />
      </button>
      {current && (
        <div className="cf-caption" key={current.id} aria-live="polite">
          <span className="cf-album">{current.album || 'Untitled'}</span>
          <span className="cf-artist">{current.artist}{current.year ? ` · ${current.year}` : ''}</span>
          <button className="btn btn-ghost cf-details" onClick={() => onSelect(current)}>View details</button>
        </div>
      )}
    </div>
  )
}
