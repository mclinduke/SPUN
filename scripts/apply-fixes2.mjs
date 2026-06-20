// Round 2 corrections — from the owner's 20 cover photos.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = resolve(root, 'data/parsed.json')

const patches = [
  // --- real data corrections ---
  { match: 'concerto for clavier', set: { album: 'Piano Concerto No. 5 in E♭ "Emperor", Op. 73', artist: 'Ludwig van Beethoven', year: '', genre: 'Classical', notes: 'Claudio Arrau (piano), Concertgebouw Orchestra Amsterdam, Bernard Haitink. Eterna 8 25 564.', confidence: 'high' } },
  { match: 'mr 12 string guitar', set: { album: 'Mr. 12 String Guitar', artist: 'Glen Campbell', year: '1965', genre: 'Folk Rock', notes: "Instrumental 12-string covers of '60s folk-rock hits (Dylan etc.); sleeve credited 'Mr. 12 String Guitar' (World Pacific). Performer: Glen Campbell.", confidence: 'medium' } },
  { match: 'guitars that destroyed', set: { year: '1972', genre: 'Rock', notes: 'Columbia guitar-rock sampler (C 31299).', confidence: 'high' } },
  { match: 'stone man', set: { artist: 'The Stonemans', album: "Cuttin' the Grass", year: '1976', genre: 'Bluegrass', notes: 'CMH Records.', confidence: 'high' } },

  // --- photo-confirmed; bump confidence + add detail ---
  { match: 'theobald', set: { album: 'Jack and Mike Theobald with Bluegrass Country', genre: 'Bluegrass', confidence: 'medium', notes: 'Private bluegrass press (self-titled act credit).' } },
  { match: 'bill harrell', set: { confidence: 'high', notes: 'Bill Harrell & the Virginians; featuring the Dobro of Mike Auldridge.' } },
  { match: 'shenandoah cut', set: { artist: 'The Shenandoah Cut-Ups', album: 'Shenandoah Cut-Ups', confidence: 'high', notes: 'Rebel Records SLP-1026 (self-titled).' } },
  { match: 'mac wiseman golden', set: { confidence: 'high', notes: 'Gusto/GT GT-0049 (Golden Classics).' } },
  { match: 'jimmy murphy electricity', set: { confidence: 'high' } },
  { match: 'guitar boogie', set: { confidence: 'high', notes: 'Beck/Clapton/Page comp (Springboard/Pickwick).' } },
  { match: 'mello', set: { confidence: 'high', notes: 'Doo-wop comp (Relic Records).' } },
  { match: 'memorial album for jfk', set: { confidence: 'high' } },
  { match: 'reach for the sky', set: { confidence: 'high', notes: 'Arista, 1980.' } },
  { match: 'buck owens', set: { confidence: 'high' } },
]

const data = JSON.parse(readFileSync(FILE, 'utf8'))
let applied = 0
for (const p of patches) {
  const rec = data.records.find((r) => (r.original || '').toLowerCase().includes(p.match))
  if (!rec) { console.log('NO MATCH:', p.match); continue }
  const before = `${rec.artist} - ${rec.album}`
  Object.assign(rec, p.set)
  console.log(`${before}  ->  ${rec.artist} - ${rec.album}`)
  applied++
}
writeFileSync(FILE, JSON.stringify(data, null, 2))
console.log(`\nApplied ${applied}/${patches.length} patches.`)
