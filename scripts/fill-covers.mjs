// 1) Apply the 32 reviewed MusicBrainz/CAA matches (photos kept as fallback via
//    coverSource:'official'). 2) For every record STILL without a cover, dig
//    harder across MusicBrainz (release-group + release level) and iTunes,
//    preferring the original cover. Flags anything genuinely unfindable.
//
//   node scripts/fill-covers.mjs
//
// Writes the updated data/vinyl-collection-import.json + data/cover-fill-report.json.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = resolve(root, 'data/vinyl-collection-import.json')
const MATCHES = resolve(root, 'data/cover-matches.json')
const REPORT = resolve(root, 'data/cover-fill-report.json')

const UA = 'Crate/1.0 ( https://mclinduke.com )'
const MB = 'https://musicbrainz.org/ws/2'
const CAA = 'https://coverartarchive.org'
const ITUNES = 'https://itunes.apple.com/search'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const STOP = new Set(['the', 'a', 'an', 'and', '&', 'of', 'to', 'in', 'vol', 'volume', 'deluxe', 'edition', 'anniversary', 'remastered', 'remaster', 'original', 'motion', 'picture', 'soundtrack', 'music', 'from'])
const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
const toks = (s) => new Set(norm(s).split(' ').filter((t) => t && !STOP.has(t)))
function overlap(aStr, bStr) {
  const a = toks(aStr), b = toks(bStr)
  if (!a.size || !b.size) return 0
  let hit = 0; for (const t of a) if (b.has(t)) hit++
  return hit / a.size
}
const artistOk = (recArtist, candArtist) => !recArtist || Math.max(overlap(recArtist, candArtist), overlap(candArtist, recArtist)) >= 0.5
const titleOk = (recAlbum, candTitle) => Math.max(overlap(recAlbum, candTitle), overlap(candTitle, recAlbum)) >= 0.5

async function caaFront(kind, mbid) {
  try {
    const res = await fetch(`${CAA}/${kind}/${mbid}/front-500`, { redirect: 'follow' })
    return res.ok ? `${CAA}/${kind}/${mbid}/front-500` : null
  } catch { return null }
}

// MusicBrainz: try release-group, then release (release-level can carry art a
// release-group lacks). Returns {url, source} or null. One MB call each (throttled by caller).
async function mbCover(artist, album) {
  const esc = (s) => (s || '').replace(/["\\]/g, ' ').trim()
  // release-group
  try {
    const q = `releasegroup:"${esc(album)}"${artist ? ` AND artist:"${esc(artist)}"` : ''}`
    const data = await (await fetch(`${MB}/release-group/?query=${encodeURIComponent(q)}&fmt=json&limit=8`, { headers: { 'User-Agent': UA, Accept: 'application/json' } })).json()
    for (const rg of (data['release-groups'] || [])) {
      const cand = (rg['artist-credit'] || []).map((a) => a.name).join(' ')
      if (artistOk(artist, cand) && titleOk(album, rg.title)) {
        const url = await caaFront('release-group', rg.id)
        if (url) return { url, source: 'musicbrainz-rg', mbTitle: rg.title }
      }
    }
  } catch { /* fall through */ }
  await sleep(1100)
  // release level (prefer earliest year = closest to original)
  try {
    const q = `release:"${esc(album)}"${artist ? ` AND artist:"${esc(artist)}"` : ''}`
    const data = await (await fetch(`${MB}/release/?query=${encodeURIComponent(q)}&fmt=json&limit=12`, { headers: { 'User-Agent': UA, Accept: 'application/json' } })).json()
    const cands = (data.releases || [])
      .filter((r) => artistOk(artist, (r['artist-credit'] || []).map((a) => a.name).join(' ')) && titleOk(album, r.title))
      .sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999'))) // earliest first
    for (const r of cands) {
      const url = await caaFront('release', r.id)
      if (url) return { url, source: 'musicbrainz-release', mbTitle: r.title, year: (r.date || '').slice(0, 4) }
    }
  } catch { /* fall through */ }
  return null
}

function hiRes(url) { return url ? url.replace(/\/\d+x\d+bb\.(jpg|png)/, '/600x600bb.$1') : null }
async function itunesCover(artist, album) {
  try {
    const p = new URLSearchParams({ term: `${artist} ${album}`.trim(), media: 'music', entity: 'album', limit: '8' })
    const data = await (await fetch(`${ITUNES}?${p}`)).json()
    let best = null, score = 0
    for (const r of (data.results || [])) {
      if (!artistOk(artist, r.artistName)) continue
      const s = overlap(album, r.collectionName)
      if (s > score) { score = s; best = r }
    }
    if (best && score >= 0.6) return { url: hiRes(best.artworkUrl100), source: 'itunes', mbTitle: best.collectionName }
  } catch { /* ignore */ }
  return null
}

async function main() {
  const bundle = JSON.parse(readFileSync(FILE, 'utf8'))
  const matches = JSON.parse(readFileSync(MATCHES, 'utf8'))
  const byId = new Map(bundle.records.map((r) => [r.id, r]))

  // 1) Apply the reviewed matches.
  let applied = 0, photoKept = 0
  for (const m of matches.matched) {
    const r = byId.get(m.id)
    if (!r) continue
    r.coverUrl = m.coverUrl
    if (r.hasPhoto) { r.coverSource = 'official'; photoKept++ } // keep the photo blob as fallback
    applied++
  }

  // 2) Deep-retry everything still bare (no official art AND no personal photo).
  const missing = bundle.records.filter((r) => !r.coverUrl && !r.hasPhoto)
  const filled = [], stillMissing = []
  for (let i = 0; i < missing.length; i++) {
    const r = missing[i]
    let hit = await mbCover(r.artist, r.album)
    if (!hit) hit = await itunesCover(r.artist, r.album)
    if (hit) {
      r.coverUrl = hit.url
      filled.push({ artist: r.artist, album: r.album, source: hit.source, via: hit.mbTitle })
    } else {
      stillMissing.push({ artist: r.artist, album: r.album })
    }
    process.stdout.write(`\rretry ${i + 1}/${missing.length} · filled ${filled.length}`)
    await sleep(1100)
  }

  bundle.count = bundle.records.length
  writeFileSync(FILE, JSON.stringify(bundle, null, 2))
  const withCover = bundle.records.filter((r) => r.coverUrl || r.hasPhoto).length
  const report = { appliedMatches: applied, photosKeptAsFallback: photoKept, deepFilled: filled, stillMissing, totalWithCover: withCover, total: bundle.records.length }
  writeFileSync(REPORT, JSON.stringify(report, null, 2))

  console.log(`\n\nApplied ${applied} reviewed matches (${photoKept} photos kept as fallback).`)
  console.log(`Deep-retry filled ${filled.length}/${missing.length} previously-bare records:`)
  filled.forEach((f) => console.log(`  + ${f.artist} — ${f.album}  [${f.source}]`))
  console.log(`Still no cover (${stillMissing.length}):`)
  stillMissing.forEach((m) => console.log(`  - ${m.artist} — ${m.album}`))
  console.log(`\nTotal with a cover: ${withCover}/${bundle.records.length}`)
}

main()
