// Revert the bad 2001 match, then one careful MusicBrainz-first attempt for the
// last stragglers. Canonical release-group art only; strict title+artist gate.
// Leave blank rather than attach anything uncertain.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = resolve(root, 'data/vinyl-collection-import.json')
const UA = 'Crate/1.0 ( https://mclinduke.com )'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

const targets = [
  { find: 'a space odyssey', mustTitle: ['2001', 'odyssey'], artist: '' },          // Various Artists soundtrack
  { find: 'third man', mustTitle: ['third', 'man'], artist: 'sierra ferrell' },
  { find: "i'm blue inside", mustTitle: ['blue', 'inside'], artist: 'hank williams' },
]

async function mb(path, query) {
  const data = await (await fetch(`https://musicbrainz.org/ws/2/${path}/?query=${encodeURIComponent(query)}&fmt=json&limit=12`, { headers: { 'User-Agent': UA, Accept: 'application/json' } })).json()
  return data['release-groups'] || data.releases || []
}
async function caa(kind, id) {
  const r = await fetch(`https://coverartarchive.org/${kind}/${id}/front-500`, { redirect: 'follow' })
  return r.ok ? `https://coverartarchive.org/${kind}/${id}/front-500` : null
}
const credit = (x) => norm((x['artist-credit'] || []).map((a) => a.name).join(' '))
const titleHit = (title, must) => { const t = norm(title); return must.every((m) => t.includes(m)) }

const bundle = JSON.parse(readFileSync(FILE, 'utf8'))

// Revert the known-bad 2001 cover-version-single match.
const odyssey = bundle.records.find((r) => r.album.toLowerCase().includes('a space odyssey'))
if (odyssey && odyssey.coverUrl && /Single|Hit Lab|Theme/i.test(odyssey.coverUrl)) { odyssey.coverUrl = null }
if (odyssey) odyssey.coverUrl = null // ensure we re-decide it cleanly below

for (const t of targets) {
  const r = bundle.records.find((x) => x.album.toLowerCase().includes(t.find) && !x.coverUrl && !x.hasPhoto)
  if (!r) { console.log('skip:', t.find); continue }
  let url = null, via = null
  // release-group (canonical album art)
  for (const rg of await mb('release-group', `releasegroup:"${r.album.replace(/["\\]/g, ' ')}"`).catch(() => [])) {
    if (!titleHit(rg.title, t.mustTitle)) continue
    if (t.artist && credit(rg).indexOf(t.artist.split(' ')[t.artist.split(' ').length - 1]) === -1 && !credit(rg).includes(t.artist)) continue
    url = await caa('release-group', rg.id); if (url) { via = `MB rg: ${rg.title}`; break }
  }
  if (!url) {
    await sleep(1100)
    for (const rel of (await mb('release', `release:"${r.album.replace(/["\\]/g, ' ')}"`).catch(() => [])).slice(0, 8)) {
      if (!titleHit(rel.title, t.mustTitle)) continue
      if (t.artist && !credit(rel).includes(t.artist.split(' ').pop())) continue
      url = await caa('release', rel.id); if (url) { via = `MB rel: ${rel.title}`; break }
    }
  }
  if (url) { r.coverUrl = url; console.log(`+ ${r.artist} — ${r.album}  [${via}]`) }
  else console.log(`- flag (no clean official art): ${r.artist} — ${r.album}`)
  await sleep(1100)
}

writeFileSync(FILE, JSON.stringify(bundle, null, 2))
const withCover = bundle.records.filter((r) => r.coverUrl || r.hasPhoto).length
const missing = bundle.records.filter((r) => !r.coverUrl && !r.hasPhoto)
console.log(`\nTotal with a cover: ${withCover}/${bundle.records.length}`)
console.log('Still no cover (flagged):')
missing.forEach((m) => console.log(`  - ${m.artist} — ${m.album}`))
