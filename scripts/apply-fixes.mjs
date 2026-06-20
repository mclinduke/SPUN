// Apply owner-confirmed + web-verified corrections to data/parsed.json,
// matching each record by a substring of its original transcribed phrase.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = resolve(root, 'data/parsed.json')

const patches = [
  { match: 'rome as you are', set: { album: 'Live in Rome 1994', artist: 'Nirvana', year: '2021', genre: 'Alternative', notes: "Unofficial bootleg of the 22 Feb 1994 Palaghiaccio (Rome) show, In Utero tour. Owner's nickname 'Rome As You Are.' Exact pressing TBD — confirm vs sleeve.", confidence: 'medium' } },
  { match: 'mutiny after midnight', set: { album: 'Mutiny After Midnight', artist: 'Johnny Blue Skies', year: '2026', genre: 'Country', notes: "2nd Johnny Blue Skies (Sturgill Simpson) album, Mar 2026. Cover billed 'Johnny Blue Skies & the Dark Clouds'.", confidence: 'high' } },
  { match: 'john hartford housing project', set: { album: 'Housing Project', artist: 'John Hartford', year: '1968', genre: 'Folk', notes: "John Hartford's 4th studio album (RCA Victor).", confidence: 'high' } },
  { match: 'phil lawrence sauce picante', set: { album: 'Sauce Piquante', artist: 'Theo Lawrence', year: '2019', genre: 'Country', notes: 'French Americana / country-soul; partly produced by Mark Neill.', confidence: 'high' } },
  { match: 'catfish for supper', set: { album: 'Catfish for Supper', artist: 'Jon Sholle', year: '1979', genre: 'Bluegrass', notes: 'Rounder Records; guests incl. Tony Rice, David Grisman, David Bromberg.', confidence: 'high' } },
  { match: 'speaker currents lonerism', set: { album: 'InnerSpeaker', artist: 'Tame Impala', year: '2010', genre: 'Alternative', notes: 'Debut album (owner confirmed).', confidence: 'high' } },
  { match: 'regularly scheduled programming', set: { confidence: 'high', notes: 'Self-titled (2021); owner confirmed.' } },
]

const data = JSON.parse(readFileSync(FILE, 'utf8'))
const records = data.records
let applied = 0
for (const p of patches) {
  const rec = records.find((r) => (r.original || '').toLowerCase().includes(p.match))
  if (!rec) { console.log('NO MATCH for:', p.match); continue }
  console.log(`Patched: "${rec.artist} - ${rec.album}" -> "${p.set.artist || rec.artist} - ${p.set.album || rec.album}"`)
  Object.assign(rec, p.set)
  applied++
}
writeFileSync(FILE, JSON.stringify(data, null, 2))
console.log(`\nApplied ${applied}/${patches.length} patches to ${FILE}`)
