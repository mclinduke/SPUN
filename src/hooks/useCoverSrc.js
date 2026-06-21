import { useEffect, useState } from 'react'
import { getRepository } from '../data/repository.js'

/**
 * Resolves the image src for a record's cover.
 * Priority:
 *   1. official art, when coverSource === 'official' (photo kept as fallback)
 *   2. personal photo (if any)
 *   3. official cover art
 *   4. null (placeholder)
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

/** Revoke and drop every cached object URL — call on Clear/Import (whole-store changes). */
export function bustAllCovers() {
  for (const url of objectUrlCache.values()) URL.revokeObjectURL(url)
  objectUrlCache.clear()
}

function preferOfficial(record) {
  return record?.coverSource === 'official' && record?.coverUrl
}

export function useCoverSrc(record) {
  const [src, setSrc] = useState(() => {
    if (!record) return null
    if (preferOfficial(record)) return record.coverUrl
    if (record.hasPhoto) return objectUrlCache.get(record.id) || null
    return record.coverUrl || null
  })

  useEffect(() => {
    let active = true
    if (!record) { setSrc(null); return }

    if (preferOfficial(record)) {
      setSrc(record.coverUrl)
      return
    }

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
      setSrc(record.coverUrl || null)
    }
    return () => { active = false }
  }, [record?.id, record?.hasPhoto, record?.coverUrl, record?.coverSource])

  return src
}
