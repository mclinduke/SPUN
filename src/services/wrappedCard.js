/**
 * Render a shareable "SPUN Wrapped" card to a PNG blob, then share/download it.
 * Text-only (no external cover images) so the canvas never taints and toBlob
 * always succeeds. Carries the SPUN wordmark (the free acquisition channel) but
 * no URL, per McLin's "no URL on the art" preference.
 */
const W = 1080
const H = 1350

function roundRect(x, ctx, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

export async function renderWrappedCard({ total = 0, uniq = 0, streak = 0, topRecords = [], topArtists = [], subtitle = 'My rotation' }) {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const x = c.getContext('2d')

  const g = x.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#8e6ce0'); g.addColorStop(1, '#3b2a78')
  x.fillStyle = g; x.fillRect(0, 0, W, H)

  // faint groove rings, top-right
  x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 3
  for (let r = 120; r <= 520; r += 46) { x.beginPath(); x.arc(W - 60, 120, r, 0, Math.PI * 2); x.stroke() }

  const sans = '-apple-system, system-ui, "Helvetica Neue", Arial, sans-serif'
  x.textBaseline = 'alphabetic'

  // brand + subtitle
  x.fillStyle = '#fff'; x.font = `800 64px ${sans}`; x.fillText('SPUN', 72, 150)
  x.fillStyle = 'rgba(255,255,255,0.7)'; x.font = `600 30px ${sans}`
  x.fillText(subtitle.toUpperCase(), 74, 196)

  // hero number
  x.fillStyle = '#fff'; x.font = `800 280px ${sans}`
  x.fillText(String(total), 64, 470)
  x.fillStyle = 'rgba(255,255,255,0.8)'; x.font = `700 44px ${sans}`
  x.fillText('spins logged', 74, 530)

  // quick stats row
  x.fillStyle = 'rgba(255,255,255,0.92)'; x.font = `700 40px ${sans}`
  x.fillText(`${uniq} records  ·  ${streak} day streak${streak > 0 ? '  🔥' : ''}`, 74, 612)

  // most played
  let y = 720
  if (topRecords.length) {
    x.fillStyle = 'rgba(255,255,255,0.65)'; x.font = `700 30px ${sans}`
    x.fillText('MOST PLAYED', 74, y); y += 56
    x.font = `600 38px ${sans}`
    topRecords.slice(0, 5).forEach((r, i) => {
      x.fillStyle = '#fff'
      const line = `${i + 1}.  ${r.album || 'Untitled'}`
      x.fillText(trunc(x, line, W - 260), 74, y)
      x.fillStyle = 'rgba(255,255,255,0.6)'; x.font = `600 30px ${sans}`
      x.fillText(trunc(x, r.artist || '', W - 160), 110, y + 38)
      x.font = `700 36px ${sans}`; x.fillStyle = 'rgba(255,255,255,0.85)'
      x.textAlign = 'right'; x.fillText(`${r.n}×`, W - 74, y); x.textAlign = 'left'
      y += 104
    })
  }

  // footer wordmark chip
  x.fillStyle = 'rgba(255,255,255,0.16)'; roundRect(74, x, H - 110, 220, 56, 28); x.fill()
  x.fillStyle = '#fff'; x.font = `800 30px ${sans}`; x.fillText('SPUN', 116, H - 72)

  return await new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render the card'))), 'image/png', 0.95))
}

function trunc(ctx, str, maxW) {
  if (ctx.measureText(str).width <= maxW) return str
  let s = str
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1)
  return s + '…'
}

/** Share the blob via the native sheet, falling back to a download. */
export async function shareCard(blob, filename = 'spun-wrapped.png') {
  const file = new File([blob], filename, { type: 'image/png' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'My SPUN' }); return 'shared' }
    catch { return 'cancelled' }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'downloaded'
}
