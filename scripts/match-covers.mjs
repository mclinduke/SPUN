// DRY RUN: find official cover art via MusicBrainz + Cover Art Archive for the
// records that currently have a phone photo or no cover. Writes a review report
// (data/cover-matches.json) — applies NOTHING. A wrong cover is worse than none,
// so unmatched/uncertain records are flagged, not guessed.
//
//   node scripts/match-covers.mjs
//
// MusicBrainz: ~1 req/sec, descriptive User-Agent required (Node can set it).
// Cover Art Archive: no key, no rate limit; 404 when no front image exists.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const IN = resolve(root, 'data/vinyl-collection-import.json')
const OUT = resolve(root, 'data/cover-matches.json')

const UA = 'Crate/1.0 ( https://mclinduke.com )' // MusicBrainz requires a real contact
const MB = 'https://musicbrainz.org/ws/2'
const CAA = 'https://coverartarchive.org'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const STOP = new Set(['the', 'a', 'an', 'and', '&', 'of', 'to', 'in', 'vol', 'volume', 'deluxe', 'edition', 'anniversary', 'remastered', 'remaster', 'original', 'motion', 'picture', 'soundtrack'])
const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
const toks = (s) => new Set(norm(s).split(' ').filter((t) => t && !STOP.has(t)))
function overlap(aStr, bStr) {
  const a = toks(aStr), b = toks(bStr)
  if (!a.size || !b.size) return 0
  let hit = 0
  for (const t of a) if (b.has(t)) hit++
  return hit / a.size
}

async function mbSearch(artist, album) {
  const esc = (s) => s.replace(/["\\]/g, ' ').trim()
  const q = `artist:"${esc(artist)}" AND releasegroup:"${esc(album)}"`
  const url = `${MB}/release-group/?query=${encodeURIComponent(q)}&fmt=json&limit=6`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`MB ${res.status}`)
  const data = await res.json()
  return data['release-groups'] || []
}

// Verify a front cover actually exists for this MBID (follows the 307 to the image).
async function caaHasFront(mbid) {
  try {
    const res = await fetch(`${CAA}/release-group/${mbid}/front-500`, { method: 'GET', redirect: 'follow' })
    return res.ok
  } catch {
    return false
  }
}

function pickBest(candidates, artist, album) {
  let best = null, bestScore = -1
  for (const rg of candidates) {
    const artistCredit = (rg['artist-credit'] || []).map((a) => a.name).join(' ')
    const aOverlap = artist ? Math.max(overlap(artist, artistCredit), overlap(artistCredit, artist)) : 1
    const tOverlap = Math.max(overlap(album, rg.title), overlap(rg.title, album))
    const mbScore = (rg.score || 0) / 100
    // require decent artist + title agreement; weight title and MB score
    if (aOverlap < 0.5 || tOverlap < 0.5) continue
    const score = tOverlap * 0.5 + aOverlap * 0.3 + mbScore * 0.2
    if (score > bestScore) { bestScore = score; best = { rg, score } }
  }
  return best
}

async function main() {
  const bundle = JSON.parse(readFileSync(IN, 'utf8'))
  const targets = bundle.records.filter((r) => r.hasPhoto || !r.coverUrl)
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null
  const cache = new Map((prev?.all || []).map((x) => [x.id, x]))

  const report = { generatedAt: new Date().toISOString(), total: targets.length, matched: [], flaggedNoCover: [], noMatch: [], errors: [], all: [] }

  for (let i = 0; i < targets.length; i++) {
    const r = targets[i]
    const oldCover = r.hasPhoto ? 'your-photo' : 'placeholder'
    if (cache.has(r.id) && cache.get(r.id).status === 'matched') {
      const c = cache.get(r.id); report.all.push(c); report.matched.push(c)
      process.stdout.write(`\r${i + 1}/${targets.length} (cached)`); continue
    }
    let entry = { id: r.id, artist: r.artist, album: r.album, oldCover, status: 'no-match' }
    try {
      const candidates = await mbSearch(r.artist, r.album)
      const best = pickBest(candidates, r.artist, r.album)
      if (best) {
        const mbid = best.rg.id
        const hasArt = await caaHasFront(mbid)
        if (hasArt) {
          entry = { ...entry, status: 'matched', mbid, mbTitle: best.rg.title, coverUrl: `${CAA}/release-group/${mbid}/front-500`, confidence: best.score.toFixed(2) }
          report.matched.push(entry)
        } else {
          entry = { ...entry, status: 'no-cover', mbid, mbTitle: best.rg.title }
          report.flaggedNoCover.push(entry)
        }
      } else {
        report.noMatch.push(entry)
      }
    } catch (e) {
      entry = { ...entry, status: 'error', error: String(e.message || e) }
      report.errors.push(entry)
    }
    report.all.push(entry)
    process.stdout.write(`\r${i + 1}/${targets.length} · matched ${report.matched.length} · noCover ${report.flaggedNoCover.length} · noMatch ${report.noMatch.length}`)
    if (i % 10 === 0) writeFileSync(OUT, JSON.stringify(report, null, 2))
    await sleep(1100) // MusicBrainz ~1 req/sec
  }

  writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log(`\n\nDRY RUN complete -> ${OUT}`)
  console.log(`Targets (photo or no cover): ${report.total}`)
  console.log(`  Matched official art:   ${report.matched.length}`)
  console.log(`  Matched but no CAA art: ${report.flaggedNoCover.length} (flagged)`)
  console.log(`  No MusicBrainz match:   ${report.noMatch.length} (flagged)`)
  console.log(`  Errors:                 ${report.errors.length}`)
}

main()
