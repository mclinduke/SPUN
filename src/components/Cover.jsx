import { useCoverSrc } from '../hooks/useCoverSrc.js'
import Icon from './Icon.jsx'

/** A square album cover with graceful fallback when there's no art. */
export default function Cover({ record, className = '' }) {
  const src = useCoverSrc(record)
  return (
    <div className={`cover ${className}`}>
      {src ? (
        <img src={src} alt={`${record.album} cover`} loading="lazy" draggable="false" />
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
