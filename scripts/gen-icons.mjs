// Renders public/icon.svg into the PNG icon sizes the PWA manifest references.
// Run with: node scripts/gen-icons.mjs
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(resolve(root, 'public/icon.svg'))

const targets = [
  { file: 'public/pwa-192.png', size: 192 },
  { file: 'public/pwa-512.png', size: 512 },
  { file: 'public/apple-touch-icon.png', size: 180 },
]

for (const { file, size } of targets) {
  await sharp(svg).resize(size, size).png().toFile(resolve(root, file))
  console.log(`✓ ${file} (${size}px)`)
}
