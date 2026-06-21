// Fill the last cover-less records via Discogs (pressing-level DB incl.
// soundtracks/bootlegs). Token read from .dev.vars (never committed). Strict
// title matching; embeds the image as a data URI to avoid hotlink/referrer
// issues. Leaves anything uncertain blank rather than attach a wrong cover.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = resolve(root, 'data/vinyl-collection-import.json')
const TOKEN = readFileSync(resolve(root, '.dev.vars'), 'utf8').match(/DISCOGS_TOKEN=(\S+)/)[1]
const H = { 'User-Agent': 'Crate/1.0 +https://mclinduke.com', Authorization: `Discogs token=${TOKEN}` }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

// find-substring -> { q, must: tokens that MUST appear in the Discogs release title }
const targets = [
  { find: 'a space odyssey', q: '2001 A Space Odyssey soundtrack', must: ['2001', 'odyssey'] },
  { find: 'live in rome', q: 'Nirvana Live in Rome 1994', must: ['rome'] },
  { find: 'third man', q: 'Sierra Ferrell Live at Third Man Records', must: ['third', 'man'] },
  { find: 'psychedelic beatles', q: 'Beatles Psychedelic', must: ['psychedelic'] },
  { find: "i'm blue inside", q: "Hank Williams I'm Blue Inside", must: ['blue', 'inside'] },
]

async function search(q) {
  const p = new URLSearchParams({ q, type: 'release', per_page: '15' })
  const res = await fetch(`https://api.discogs.com/database/search?${p}`, { headers: H })
  if (!res.ok) return []
  return (await res.json()).results || []
}

async function dataUri(url) {
  const res = await fetch(url, { headers: { 'User-Agent': H['User-Agent'] }, redirect: 'follow' })
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  return `data:${res.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`
}

const bundle = JSON.parse(readFileSync(FILE, 'utf8'))
const report = []
for (const t of targets) {
  const r = bundle.records.find((x) => x.album.toLowerCase().includes(t.find) && !x.coverUrl && !x.hasPhoto)
  if (!r) { console.log('skip (already covered):', t.find); continue }
  const results = await search(t.q)
  // Discogs result.title is "Artist - Album"; require the must-tokens and a cover image.
  const cand = results.find((x) => t.must.every((m) => norm(x.title).includes(m)) && (x.cover_image || x.thumb))
  if (cand) {
    const img = cand.cover_image || cand.thumb
    const uri = await dataUri(img)
    if (uri) {
      r.coverUrl = uri
      console.log(`+ ${r.artist} — ${r.album}  [Discogs: ${cand.title} (${cand.year || '?'}, ${(cand.format || []).join('/')}) id=${cand.id}]`)
    } else {
      console.log(`- image fetch failed: ${r.album}`)
    }
  } else {
    console.log(`- flag (no confident Discogs match): ${r.artist} — ${r.album}`)
  }
  report.push({ album: r.album, filled: !!r.coverUrl })
  await sleep(1200) // Discogs 60/min
}

writeFileSync(FILE, JSON.stringify(bundle, null, 2))
const withCover = bundle.records.filter((r) => r.coverUrl || r.hasPhoto).length
console.log(`\nTotal with a cover: ${withCover}/${bundle.records.length}`)
const missing = bundle.records.filter((r) => !r.coverUrl && !r.hasPhoto)
if (missing.length) { console.log('Still none:'); missing.forEach((m) => console.log('  -', m.artist, '—', m.album)) }
