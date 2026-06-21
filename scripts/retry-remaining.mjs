// Final lenient pass for a few specific stragglers where strict artist-matching
// (esp. "Various Artists" soundtracks) blocked an otherwise-correct cover.
// iTunes-first, then MusicBrainz. Title must still clearly match — we'd rather
// leave it blank than attach a wrong cover.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = resolve(root, 'data/vinyl-collection-import.json')
const UA = 'Crate/1.0 ( https://mclinduke.com )'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'music', 'from', 'motion', 'picture', 'soundtrack', 'original', 'records', 'at', 'live'])
const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
const toks = (s) => new Set(norm(s).split(' ').filter((t) => t && !STOP.has(t)))
function overlap(aStr, bStr) { const a = toks(aStr), b = toks(bStr); if (!a.size || !b.size) return 0; let h = 0; for (const t of a) if (b.has(t)) h++; return h / a.size }
const hiRes = (u) => (u ? u.replace(/\/\d+x\d+bb\.(jpg|png)/, '/600x600bb.$1') : null)

// Each: a match substring + the search term + the key tokens the result MUST contain.
const targets = [
  { find: 'a space odyssey', term: '2001 A Space Odyssey soundtrack', must: ['2001'] },
  { find: 'third man', term: 'Sierra Ferrell Live at Third Man Records', must: ['ferrell'] },
  { find: "i'm blue inside", term: 'Hank Williams I\'m Blue Inside', must: ['blue', 'inside'] },
]

async function itunes(term, must, album) {
  const p = new URLSearchParams({ term, media: 'music', entity: 'album', limit: '10' })
  const data = await (await fetch(`https://itunes.apple.com/search?${p}`)).json()
  let best = null, score = 0
  for (const r of (data.results || [])) {
    const name = norm(r.collectionName)
    if (!must.every((m) => name.includes(m))) continue
    const s = overlap(album, r.collectionName)
    if (s > score) { score = s; best = r }
  }
  return best ? { url: hiRes(best.artworkUrl100), via: `iTunes: ${best.artistName} — ${best.collectionName}` } : null
}

async function mbRg(album, must) {
  const q = `releasegroup:"${album.replace(/["\\]/g, ' ')}"`
  const data = await (await fetch(`https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(q)}&fmt=json&limit=10`, { headers: { 'User-Agent': UA, Accept: 'application/json' } })).json()
  for (const rg of (data['release-groups'] || [])) {
    if (!must.every((m) => norm(rg.title).includes(m))) continue
    const res = await fetch(`https://coverartarchive.org/release-group/${rg.id}/front-500`, { redirect: 'follow' })
    if (res.ok) return { url: `https://coverartarchive.org/release-group/${rg.id}/front-500`, via: `MB: ${rg.title}` }
  }
  return null
}

const bundle = JSON.parse(readFileSync(FILE, 'utf8'))
for (const t of targets) {
  const r = bundle.records.find((x) => x.album.toLowerCase().includes(t.find) && !x.coverUrl && !x.hasPhoto)
  if (!r) { console.log('skip (already covered or not found):', t.find); continue }
  let hit = await itunes(t.term, t.must, r.album).catch(() => null)
  if (!hit) { await sleep(1100); hit = await mbRg(r.album, t.must).catch(() => null) }
  if (hit) { r.coverUrl = hit.url; console.log(`+ ${r.artist} — ${r.album}  [${hit.via}]`) }
  else console.log(`- still none: ${r.artist} — ${r.album}`)
  await sleep(300)
}
writeFileSync(FILE, JSON.stringify(bundle, null, 2))
const withCover = bundle.records.filter((r) => r.coverUrl || r.hasPhoto).length
console.log(`\nTotal with a cover: ${withCover}/${bundle.records.length}`)
