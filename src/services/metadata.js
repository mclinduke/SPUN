/**
 * Album metadata + cover-art lookup.
 *
 * Uses the iTunes Search API: no API key, CORS-enabled (works from a static
 * site), and one request returns cover art + album + artist + year + genre.
 *
 * This module is the single seam for metadata. To add Discogs or MusicBrainz
 * later, add a function here and have `searchAlbums` merge/fall back — callers
 * don't change.
 */

const ENDPOINT = 'https://itunes.apple.com/search'

/** Bump iTunes' 100px thumbnail to a crisp hi-res cover. */
export function hiResArtwork(url, size = 600) {
  if (!url) return null
  return url.replace(/\/\d+x\d+bb\.(jpg|png)/, `/${size}x${size}bb.$1`)
}

function toRecordDraft(item) {
  const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : null
  return {
    album: item.collectionName || '',
    artist: item.artistName || '',
    year: Number.isFinite(year) ? year : null,
    genre: item.primaryGenreName || '',
    coverUrl: hiResArtwork(item.artworkUrl100, 600),
    // kept for de-duping / debugging, not persisted
    _source: 'itunes',
    _sourceId: item.collectionId,
  }
}

/**
 * Search albums. Returns an array of record-shaped drafts (best match first).
 * @param {string} term  free text, e.g. "Miles Davis Kind of Blue"
 * @param {object} opts  { limit, signal }
 */
export async function searchAlbums(term, { limit = 12, signal } = {}) {
  const q = term.trim()
  if (!q) return []
  const params = new URLSearchParams({
    term: q,
    media: 'music',
    entity: 'album',
    limit: String(limit),
  })
  const res = await fetch(`${ENDPOINT}?${params}`, { signal })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = await res.json()
  return (data.results || []).map(toRecordDraft)
}

/** Best single match for a query — used by bulk add. Returns a draft or null. */
export async function bestMatch(term, opts = {}) {
  const results = await searchAlbums(term, { ...opts, limit: 1 })
  return results[0] || null
}
