import sharp from 'sharp'
const SRC = 'public/icon.svg'
const jobs = [
  ['public/pwa-192.png', 192],
  ['public/pwa-512.png', 512],
  ['public/apple-touch-icon.png', 180],
]
for (const [out, size] of jobs) {
  await sharp(SRC, { density: 512 }).resize(size, size).png().toFile(out)
  console.log('wrote', out, size)
}
