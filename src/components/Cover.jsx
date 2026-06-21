import { useEffect, useState } from 'react'
import { useCoverSrc } from '../hooks/useCoverSrc.js'
import Icon from './Icon.jsx'

/** A square album cover with graceful fallback when there's no art (or it fails to load). */
export default function Cover({ record, className = '' }) {
  const src = useCoverSrc(record)
  const [failed, setFailed] = useState(false)
  // A dead/expired cover URL (iTunes art rots, offline, 404) should fall back to
  // the placeholder instead of the browser's broken-image glyph.
  useEffect(() => setFailed(false), [src])
  return (
    <div className={`cover ${className}`}>
      {src && !failed ? (
        <img src={src} alt={`${record.album || 'Untitled'} cover`} loading="lazy" draggable="false" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <div className="cover-fallback">
          <Icon name="disc" size={28} />
          <span className="cover-fallback-album">{record.album || 'Untitled'}</span>
          <span className="cover-fallback-artist">{record.artist}</span>
        </div>
      )}
    </div>
  )
}
