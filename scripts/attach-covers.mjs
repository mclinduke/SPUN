// Embed the owner's actual sleeve photos as personal cover art (authoritative),
// and clear the wrong auto-fetched covers that iTunes can't supply correctly.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = resolve(root, 'data/vinyl-collection-import.json')
const SQ = '/private/tmp/claude-501/-Users-mclinsanders/f39cea62-dfea-48e3-bf2e-24bd9c2a8194/scratchpad/covers/sq'

// photo file (square crop) -> a distinctive substring of "artist album"
const photoMap = [
  ['IMG_7722', 'emperor'],
  ['IMG_7723', 'guitar boogie'],
  ['IMG_7724', 'memorial album'],
  ['IMG_7727', 'mr. 12 string'],
  ['IMG_7728', 'guitars that destroyed'],
  ['IMG_7729', 'mello-kings'],
  ['IMG_7730', "roy orbison's greatest"],
  ['IMG_7731', 'his family and friends'],
  ['IMG_7733', 'jimmy murphy electricity'],
  ['IMG_7734', 'shenandoah cut'],
  ['IMG_7735', 'ruby'],
  ['IMG_7736', 'theobald'],
  ['IMG_7737', "cuttin' the grass"],
  ['IMG_7738', 'bill harrell'],
  ['IMG_7741', 'reach for the sky'],
  ['IMG_7740', 'roots and branches'],
]

// wrong covers iTunes can't fix -> clear to placeholder (owner can photograph later)
const clearArt = ['goats head soup', 'urban cowboy', 'live from austin']

const bundle = JSON.parse(readFileSync(FILE, 'utf8'))
const find = (key) => bundle.records.find((r) => `${r.artist} ${r.album}`.toLowerCase().includes(key))

let embedded = 0
for (const [file, key] of photoMap) {
  const rec = find(key)
  if (!rec) { console.log('NO MATCH (photo):', key); continue }
  const b64 = readFileSync(`${SQ}/${file}.jpg`).toString('base64')
  bundle.photos[rec.id] = `data:image/jpeg;base64,${b64}`
  rec.hasPhoto = true
  rec.coverUrl = null
  embedded++
  console.log(`photo -> ${rec.artist} — ${rec.album}`)
}

let cleared = 0
for (const key of clearArt) {
  const rec = find(key)
  if (!rec) { console.log('NO MATCH (clear):', key); continue }
  rec.coverUrl = null
  if (key === 'live from austin') rec.notes = 'Live ACL taping, Halloween (Oct 31, 2000); New West. Needs a cover photo.'
  cleared++
  console.log(`cleared art -> ${rec.artist} — ${rec.album}`)
}

bundle.count = bundle.records.length
writeFileSync(FILE, JSON.stringify(bundle, null, 2))
const withArt = bundle.records.filter((r) => r.coverUrl || r.hasPhoto).length
console.log(`\nEmbedded ${embedded} photos, cleared ${cleared} wrong covers.`)
console.log(`Records with a cover (art or photo): ${withArt}/${bundle.records.length}.`)
console.log(`File size: ${(JSON.stringify(bundle).length / 1024 / 1024).toFixed(2)} MB`)
