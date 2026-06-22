import { getRepository } from '../data/repository.js'

// Discogs API policy: you may NOT display marketplace/community data more than
// 6 hours staler than live. So we cache the whole payload (pressing data is
// stable + CC0, fine long-term), but the UI must hide rarity/price numbers once
// they cross this TTL and offer a refresh.
export const RARITY_TTL = 6 * 60 * 60 * 1000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(path) {
  let res
  try {
    res = await fetch(`/api/discogs/${path}`)
  } catch {
    throw new Error(navigator.onLine ? 'Discogs is unreachable right now' : "You're offline — connect to look up pressing data")
  }
  if (res.status === 503) throw new Error('Discogs not configured (set DISCOGS_TOKEN)')
  if (res.status === 429) throw new Error('Discogs rate limit — try again shortly')
  if (!res.ok) throw new Error(`Discogs error ${res.status}`)
  return res.json()
}

function bestResult(results) {
  return results.find((r) => (r.format || []).some((f) => /vinyl|lp/i.test(f))) || results[0] || null
}

const cacheKey = (id) => `discogs:${id}`

/** Cached Discogs lookup for a record. Returns the payload + fetchedAt. */
export async function lookupRecord(record, { force = false } = {}) {
  const repo = getRepository()
  if (!force) {
    const cached = await repo.cacheGet(cacheKey(record.id))
    if (cached) return { ...cached.data, fetchedAt: cached.fetchedAt, cached: true }
  }
  const term = `${record.artist} ${record.album}`.trim()
  const q = new URLSearchParams({ q: term, type: 'release', per_page: '8' })
  const search = await api(`database/search?${q}`)
  const top = bestResult(search.results || [])
  if (!top) {
    const data = { found: false }
    await repo.cacheSet(cacheKey(record.id), data)
    return { ...data, fetchedAt: Date.now() }
  }
  const rel = await api(`releases/${top.id}`)
  // The "master" groups every pressing of an album; its year is the original
  // release year. Comparing it to this release's year is our first-pressing read.
  let masterYear = null
  if (rel.master_id) {
    try { const m = await api(`masters/${rel.master_id}`); masterYear = m.year || null } catch { /* master is optional */ }
  }
  const data = {
    found: true,
    discogsId: top.id,
    masterId: rel.master_id || null,
    url: rel.uri ? `https://www.discogs.com${rel.uri.startsWith('/') ? '' : '/'}${rel.uri}` : `https://www.discogs.com/release/${top.id}`,
    title: rel.title || '',
    year: rel.year || null,
    country: rel.country || '',
    labels: (rel.labels || []).map((l) => ({ name: l.name, catno: l.catno })).filter((l) => l.name),
    formats: (rel.formats || []).flatMap((f) => [f.name, ...(f.descriptions || [])]).filter(Boolean),
    styles: [...(rel.genres || []), ...(rel.styles || [])],
    have: rel.community?.have ?? null,
    want: rel.community?.want ?? null,
    numForSale: rel.num_for_sale ?? null,
    lowestPrice: rel.lowest_price ?? null,
    // liner notes (stable data, safe to cache long-term)
    tracklist: (rel.tracklist || []).filter((t) => t.title && (!t.type_ || t.type_ === 'track')).map((t) => ({ pos: t.position || '', title: t.title, dur: t.duration || '' })),
    credits: (rel.extraartists || []).map((a) => ({ name: cleanArtist(a.name), role: a.role || '' })).filter((c) => c.name && c.role),
    recordedAt: (rel.companies || []).filter((c) => /(recorded|mixed|mastered|engineered)\s+at/i.test(c.entity_type_name || '')).map((c) => ({ kind: c.entity_type_name || '', name: c.name || '' })).filter((c) => c.name),
    // first-pressing evidence
    masterYear,
    matrix: (rel.identifiers || []).filter((i) => /matrix|runout/i.test(i.type || '')).map((i) => i.value).filter(Boolean),
    hasBarcode: (rel.identifiers || []).some((i) => /barcode/i.test(i.type || '')),
  }
  await repo.cacheSet(cacheKey(record.id), data)
  return { ...data, fetchedAt: Date.now(), cached: false }
}

// Discogs appends "(2)" style disambiguators to artist names — strip them.
const cleanArtist = (name) => (name || '').replace(/\s*\(\d+\)$/, '').trim()

/** Split a Discogs "Artist - Album" release title into {artist, album}. */
function splitTitle(title) {
  const t = (title || '').trim()
  const i = t.indexOf(' - ')
  if (i === -1) return { artist: '', album: t }
  return { artist: cleanArtist(t.slice(0, i)), album: t.slice(i + 3).trim() }
}

/** Map a Discogs search result to a record draft (cover-art + pressing fields). */
function searchResultToDraft(r) {
  const { artist, album } = splitTitle(r.title)
  return {
    album,
    artist,
    year: r.year ? Number(r.year) : null,
    genre: (r.style || [])[0] || (r.genre || [])[0] || '',
    label: Array.isArray(r.label) ? (r.label[0] || '') : (r.label || ''),
    catalogNo: r.catno || '',
    coverUrl: r.cover_image || r.thumb || null,
    _source: 'discogs',
    _sourceId: r.id,
  }
}

/** Cover-art + pressing autofill from Discogs (the most pressing-accurate source). */
export async function searchDiscogs(term, { limit = 8 } = {}) {
  const q = (term || '').trim()
  if (!q) return []
  const params = new URLSearchParams({ q, type: 'release', per_page: String(limit) })
  let data
  try { data = await api(`database/search?${params}`) } catch { return [] }
  return (data.results || []).map(searchResultToDraft).filter((d) => d.album || d.artist)
}

/** Look up a single release by scanned barcode (UPC/EAN). Returns a draft or null. */
export async function lookupByBarcode(code) {
  const bc = String(code || '').replace(/\s+/g, '')
  if (!bc) return null
  const params = new URLSearchParams({ barcode: bc, type: 'release', per_page: '5' })
  const data = await api(`database/search?${params}`)
  const top = bestResult(data.results || [])
  if (!top) return null
  return { ...searchResultToDraft(top), barcode: bc }
}

/** Every pressing of an album (Discogs master versions), oldest first. */
export async function getMasterVersions(masterId, { limit = 100 } = {}) {
  if (!masterId) return []
  const params = new URLSearchParams({ per_page: String(limit), sort: 'released', sort_order: 'asc' })
  const data = await api(`masters/${masterId}/versions?${params}`)
  return (data.versions || []).map((v) => ({
    id: v.id,
    year: (typeof v.released === 'string' ? Number(v.released.slice(0, 4)) : v.released) || null,
    country: v.country || '',
    label: v.label || '',
    catalogNo: v.catno || '',
    format: v.format || '',
    title: v.title || '',
    thumb: v.thumb || null,
    url: v.uri ? `https://www.discogs.com${v.uri.startsWith('/') ? '' : '/'}${v.uri}` : (v.resource_url || ''),
  })).filter((v) => v.id)
}

/**
 * Pull a user's PUBLIC Discogs collection (folder 0 = "All") into record drafts.
 * Paginates 100/page; reports progress. Maps cover art, year, genre, label, catno.
 */
export async function fetchDiscogsCollection(username, { onProgress } = {}) {
  const u = encodeURIComponent((username || '').trim())
  if (!u) throw new Error('Enter your Discogs username')
  const drafts = []
  let page = 1
  let pages = 1 // overwritten from pagination on the first page; guards the do/while if it's missing
  do {
    const q = new URLSearchParams({ per_page: '100', page: String(page), sort: 'added', sort_order: 'desc' })
    let data
    for (let attempt = 0; ; attempt++) {
      try { data = await api(`users/${u}/collection/folders/0/releases?${q}`); break }
      catch (e) {
        if (/40[34]/.test(e.message)) throw new Error(`Couldn't read "${username}". Check the username, and make sure your Discogs collection is set to public (Settings → Privacy).`, { cause: e })
        // Transient rate-limit: wait and retry the SAME page so we don't lose the import.
        if (/rate limit/i.test(e.message) && attempt < 4) { await sleep(2000 * (attempt + 1)); continue }
        throw e
      }
    }
    pages = data.pagination?.pages || 1
    for (const item of data.releases || []) {
      const bi = item.basic_information || {}
      const labels = bi.labels || []
      drafts.push({
        album: bi.title || '',
        artist: (bi.artists || []).map((a) => cleanArtist(a.name)).filter(Boolean).join(', '),
        year: bi.year && bi.year > 0 ? bi.year : null,
        genre: (bi.genres || [])[0] || (bi.styles || [])[0] || '',
        label: labels[0]?.name || '',
        catalogNo: labels[0]?.catno || '',
        coverUrl: bi.cover_image || null,
        notes: (bi.formats || []).flatMap((f) => [f.name, ...(f.descriptions || [])]).filter(Boolean).join(', '),
      })
    }
    onProgress?.({ page, pages, count: drafts.length })
    page += 1
    if (page <= pages) await sleep(700) // stay under the Discogs rate limit on big collections
  } while (page <= pages)
  // de-dupe within the batch (a release can sit in multiple Discogs folders)
  const seen = new Set()
  return drafts.filter((d) => {
    const k = `${d.artist}|${d.album}`.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k); return true
  })
}

/** Cached payload for a record without hitting the network (or null). */
export async function cachedRecord(id) {
  const c = await getRepository().cacheGet(cacheKey(id))
  return c ? { ...c.data, fetchedAt: c.fetchedAt } : null
}

export function rarityStale(fetchedAt) {
  return !fetchedAt || Date.now() - fetchedAt > RARITY_TTL
}

/**
 * Honest first-pressing read: compares this release's pressing year to the
 * album's original (master) year. Never claims certainty — only the deadwax
 * etchings on the physical record confirm a true first pressing.
 */
export function pressingVerdict({ year, masterYear } = {}) {
  if (!year || !masterYear) return { kind: 'unknown' }
  if (year <= masterYear) return { kind: 'original', year: masterYear }
  return { kind: 'reissue', pressingYear: year, originalYear: masterYear }
}

/** Honest rarity read from community counts — a signal, never a stored "score". */
export function rarityLabel(have, want) {
  if (have == null || want == null) return null
  if (have === 0) return want > 0 ? 'Highly sought after' : null // wanted but none owned = the rarest signal
  const ratio = want / have
  if (ratio >= 1.5) return 'Highly sought after'
  if (ratio >= 0.8) return 'In demand'
  if (ratio >= 0.3) return 'Moderately collected'
  return 'Common'
}
