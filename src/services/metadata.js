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

// ---------- MusicBrainz (pressing-aware: label + catalog number) ----------
// No key; CORS-enabled, so callable from the browser (anonymous UA, ~1 req/sec).
const MB_RELEASE = 'https://musicbrainz.org/ws/2/release'

function mbToDraft(r) {
  const li = (r['label-info'] || [])[0] || {}
  return {
    album: r.title || '',
    artist: (r['artist-credit'] || []).map((a) => `${a.name}${a.joinphrase || ''}`).join('').trim(),
    year: (r.date || '').slice(0, 4) || null,
    genre: '',
    label: li.label?.name || '',
    catalogNo: li['catalog-number'] || '',
    coverUrl: `https://coverartarchive.org/release/${r.id}/front-250`, // may 404; UI falls back
    _source: 'musicbrainz',
    _sourceId: r.id,
  }
}

export async function searchMusicBrainz(term, { limit = 8, signal } = {}) {
  const q = term.trim()
  if (!q) return []
  const params = new URLSearchParams({ query: q, fmt: 'json', limit: String(limit) })
  const res = await fetch(`${MB_RELEASE}?${params}`, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`MusicBrainz search failed (${res.status})`)
  const data = await res.json()
  return (data.releases || []).map(mbToDraft)
}

const matchKey = (d) => `${(d.album || '').toLowerCase().trim()}::${(d.artist || '').toLowerCase().trim()}`

/**
 * Combined autofill for the add-record flow. MusicBrainz brings the pressing
 * data (label, catalog number); iTunes contributes reliable cover thumbnails and
 * genre. Results are merged (MB first), deduped by album+artist.
 */
export async function searchAll(term, opts = {}) {
  const [mb, itunes] = await Promise.all([
    searchMusicBrainz(term, opts).catch(() => []),
    searchAlbums(term, opts).catch(() => []),
  ])
  const itByKey = new Map(itunes.map((d) => [matchKey(d), d]))
  const seen = new Set()
  const merged = []
  for (const d of mb) {
    const k = matchKey(d)
    seen.add(k)
    const it = itByKey.get(k)
    merged.push({ ...d, coverUrl: it?.coverUrl || d.coverUrl, genre: it?.genre || d.genre })
  }
  for (const d of itunes) {
    if (!seen.has(matchKey(d))) merged.push(d)
  }
  return merged.slice(0, 12)
}
