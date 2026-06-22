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

import { searchDiscogs } from './discogs.js'

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

/**
 * Best match for bulk import, using ONLY the keyless/unthrottled sources
 * (iTunes for cover+year+genre, MusicBrainz for label+catalog#). Deliberately
 * avoids Discogs so importing a big list can't blow the shared 60/min token —
 * Discogs enrichment happens later, on-demand, per record.
 */
export async function bestMatchFree(term, opts = {}) {
  // iTunes first (free, fast, has cover+year+genre). Only fall back to
  // MusicBrainz when iTunes misses — so a big bulk import doesn't fire MB on
  // every line and exceed its ~1 req/sec anonymous limit.
  const it = await searchAlbums(term, { ...opts, limit: 1 }).catch(() => [])
  if (it[0]) return it[0]
  const mb = await searchMusicBrainz(term, { ...opts, limit: 1 }).catch(() => [])
  return mb[0] || null
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
 * Combined autofill for the add-record flow. Discogs is the primary source —
 * the most pressing-accurate cover art + label/catalog #. MusicBrainz fills in
 * any gaps, iTunes backfills cover thumbnails + genre. Discogs needs the
 * server proxy (cloud / dev token); if it's unavailable it just falls back.
 * Results are deduped by album+artist, Discogs first.
 */
const FILL_FIELDS = ['album', 'artist', 'year', 'genre', 'label', 'catalogNo', 'coverUrl']

export async function searchAll(term, opts = {}) {
  const [discogs, mb, itunes] = await Promise.all([
    searchDiscogs(term, opts).catch(() => []),
    searchMusicBrainz(term, opts).catch(() => []),
    searchAlbums(term, opts).catch(() => []),
  ])
  // Merge the three sources per album+artist so a selected result autofills
  // EVERY field we can find: Discogs leads (best pressing data + display order),
  // iTunes fills cover/genre/year, MusicBrainz fills label/catalog#. Each source
  // only fills fields the earlier ones left empty — no field is ever blank if
  // any source has it (this is why year was missing before: the top match lacked
  // it while another source had it).
  const byKey = new Map()
  const order = []
  for (const list of [discogs, itunes, mb]) {
    for (const d of list) {
      if (!d.album && !d.artist) continue
      const k = matchKey(d)
      if (!byKey.has(k)) { byKey.set(k, { ...d }); order.push(k); continue }
      const cur = byKey.get(k)
      for (const f of FILL_FIELDS) { if (!cur[f] && d[f]) cur[f] = d[f] }
    }
  }
  return order.map((k) => byKey.get(k)).slice(0, 12)
}
