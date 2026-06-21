import { getRepository } from '../data/repository.js'

// Discogs API policy: you may NOT display marketplace/community data more than
// 6 hours staler than live. So we cache the whole payload (pressing data is
// stable + CC0, fine long-term), but the UI must hide rarity/price numbers once
// they cross this TTL and offer a refresh.
export const RARITY_TTL = 6 * 60 * 60 * 1000

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
  const data = {
    found: true,
    discogsId: top.id,
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
  }
  await repo.cacheSet(cacheKey(record.id), data)
  return { ...data, fetchedAt: Date.now(), cached: false }
}

/** Cached payload for a record without hitting the network (or null). */
export async function cachedRecord(id) {
  const c = await getRepository().cacheGet(cacheKey(id))
  return c ? { ...c.data, fetchedAt: c.fetchedAt } : null
}

export function rarityStale(fetchedAt) {
  return !fetchedAt || Date.now() - fetchedAt > RARITY_TTL
}

/** Honest rarity read from community counts — a signal, never a stored "score". */
export function rarityLabel(have, want) {
  if (!have || !want) return null
  const ratio = want / have
  if (ratio >= 1.5) return 'Highly sought after'
  if (ratio >= 0.8) return 'In demand'
  if (ratio >= 0.3) return 'Moderately collected'
  return 'Common'
}
