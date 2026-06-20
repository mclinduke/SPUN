// Enrich parsed records with iTunes cover art (where a confident match exists),
// then build a Crate import file the owner can load via Settings -> Import.
//
//   node scripts/enrich-and-build.mjs
//
// Input:  data/parsed.json        — { records: [...] } from the parse workflow
// Output: data/vinyl-collection-import.json  — { app, version, records, photos }
//
// Notes:
//  - The iTunes Search API throttles bursts (HTTP 403). We pace requests and
//    back off + retry on throttle so mainstream titles aren't lost.
//  - Re-runs reuse art already found (keyed by artist::album), so only the
//    still-missing records are re-queried.
//  - Art matching is conservative: a wrong cover is worse than none.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const IN = resolve(root, 'data/parsed.json')
const OUT = resolve(root, 'data/vinyl-collection-import.json')

const STOP = new Set(['the', 'a', 'an', 'and', '&', 'of', 'to', 'in', 'live', 'at', 'vol', 'volume', 'records', 'record', 'deluxe', 'edition', 'anniversary', 'remastered', 'remaster', 'feat'])
const key = (r) => `${(r.artist || '').toLowerCase().trim()}::${(r.album || '').toLowerCase().trim()}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function tokens(s) { return new Set(norm(s).split(' ').filter((t) => t && !STOP.has(t))) }
function overlap(aSet, bStr) {
  const b = tokens(bStr)
  if (!aSet.size || !b.size) return 0
  let hits = 0
  for (const t of aSet) if (b.has(t)) hits++
  return hits / aSet.size
}
function hiRes(url, size = 600) { return url ? url.replace(/\/\d+x\d+bb\.(jpg|png)/, `/${size}x${size}bb.$1`) : null }

// Returns { results } on success, 'throttled' on 403/429, or null on other error.
async function query(term) {
  const params = new URLSearchParams({ term, media: 'music', entity: 'album', limit: '8' })
  try {
    const res = await fetch(`https://itunes.apple.com/search?${params}`)
    if (res.status === 403 || res.status === 429) return 'throttled'
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function findArt(rec) {
  const term = `${rec.artist} ${rec.album}`.trim()
  if (!term) return null
  let data = null
  const backoffs = [8000, 20000, 40000]
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    const r = await query(term)
    if (r === 'throttled') {
      if (attempt === backoffs.length) return null
      await sleep(backoffs[attempt])
      continue
    }
    data = r
    break
  }
  if (!data) return null

  const albumTokens = tokens(rec.album)
  const artistTokens = tokens(rec.artist)
  let best = null
  let bestScore = 0
  for (const r of data.results || []) {
    const artistOk = rec.artist
      ? overlap(artistTokens, r.artistName) >= 0.5 || norm(r.artistName).includes(norm(rec.artist)) || norm(rec.artist).includes(norm(r.artistName))
      : true
    if (!artistOk) continue
    const albumScore = overlap(albumTokens, r.collectionName)
    if (albumScore > bestScore) { bestScore = albumScore; best = r }
  }
  if (best && bestScore >= 0.6) {
    return {
      coverUrl: hiRes(best.artworkUrl100, 600),
      year: best.releaseDate ? String(new Date(best.releaseDate).getFullYear()) : '',
      genre: best.primaryGenreName || '',
    }
  }
  return null
}

async function main() {
  const parsed = JSON.parse(readFileSync(IN, 'utf8'))
  const input = Array.isArray(parsed) ? parsed : parsed.records || []

  // Reuse art already found on a previous run.
  const prevArt = new Map()
  if (existsSync(OUT)) {
    const prev = JSON.parse(readFileSync(OUT, 'utf8'))
    for (const r of prev.records || []) if (r.coverUrl) prevArt.set(key(r), r.coverUrl)
  }

  const base = Date.parse('2026-06-19T12:00:00Z')
  const out = []
  let withArt = 0
  let queried = 0

  for (let i = 0; i < input.length; i++) {
    const rec = input[i]
    let coverUrl = prevArt.get(key(rec)) || null
    let art = null
    if (!coverUrl) {
      art = await findArt(rec)
      if (art) coverUrl = art.coverUrl
      queried++
      await sleep(1500) // pace to stay under the iTunes throttle
    }
    if (coverUrl) withArt++
    out.push({
      id: randomUUID(),
      album: rec.album || '',
      artist: rec.artist || '',
      year: rec.year ? Number(rec.year) : (art && art.year ? Number(art.year) : null),
      genre: rec.genre || (art ? art.genre : '') || '',
      notes: rec.notes || '',
      coverUrl,
      hasPhoto: false,
      createdAt: base + i * 1000,
      updatedAt: base + i * 1000,
    })
    process.stdout.write(`\r${i + 1}/${input.length} done · ${withArt} with art · ${queried} queried`)
    // checkpoint every 20 so progress survives interruption
    if (i % 20 === 0) writeFileSync(OUT, JSON.stringify({ app: 'vinyl-collection', version: 1, exportedAt: '2026-06-19T12:00:00.000Z', count: out.length, records: out, photos: {} }, null, 2))
  }

  writeFileSync(OUT, JSON.stringify({ app: 'vinyl-collection', version: 1, exportedAt: '2026-06-19T12:00:00.000Z', count: out.length, records: out, photos: {} }, null, 2))
  console.log(`\n\nWrote ${out.length} records to ${OUT}`)
  console.log(`Cover art: ${withArt}/${out.length} (${Math.round((withArt / out.length) * 100)}%).`)
}

main()
