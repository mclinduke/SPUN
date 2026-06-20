import { useEffect, useState } from 'react'
import { getRepository } from '../data/repository.js'

/**
 * Resolves the image src for a record's cover.
 * Priority: personal photo (if any) -> official cover art -> null (placeholder).
 *
 * Personal photos live in IndexedDB as Blobs; we turn them into object URLs and
 * cache them by id so scrolling the grid doesn't re-read the DB or leak URLs.
 */
const objectUrlCache = new Map() // id -> objectURL

export function bustCover(id) {
  const url = objectUrlCache.get(id)
  if (url) {
    URL.revokeObjectURL(url)
    objectUrlCache.delete(id)
  }
}

export function useCoverSrc(record) {
  const [src, setSrc] = useState(() =>
    record?.hasPhoto ? objectUrlCache.get(record.id) || null : record?.coverUrl || null,
  )

  useEffect(() => {
    let active = true
    if (!record) { setSrc(null); return }

    if (record.hasPhoto) {
      const cached = objectUrlCache.get(record.id)
      if (cached) { setSrc(cached); return }
      getRepository().getPhoto(record.id).then((blob) => {
        if (!active) return
        if (blob) {
          const url = URL.createObjectURL(blob)
          objectUrlCache.set(record.id, url)
          setSrc(url)
        } else {
          setSrc(record.coverUrl || null)
        }
      })
    } else {
      bustCover(record.id) // a photo may have just been removed
      setSrc(record.coverUrl || null)
    }
    return () => { active = false }
  }, [record?.id, record?.hasPhoto, record?.coverUrl, record])

  return src
}
