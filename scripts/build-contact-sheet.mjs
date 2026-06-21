// Build a visual review page of the cover-match dry run: downloads each matched
// CAA cover and embeds it as a data URI (so it renders anywhere, incl. a CSP'd
// artifact), shows old-photo vs new-art for records where we'd replace a photo,
// and lists the flagged/failed ones. Review BEFORE applying anything.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const report = JSON.parse(readFileSync(resolve(root, 'data/cover-matches.json'), 'utf8'))
const bundle = JSON.parse(readFileSync(resolve(root, 'data/vinyl-collection-import.json'), 'utf8'))
const photoById = bundle.photos || {}
const OUT = '/private/tmp/claude-501/-Users-mclinsanders/f39cea62-dfea-48e3-bf2e-24bd9c2a8194/scratchpad/cover-review.html'

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

async function dataUri(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const type = res.headers.get('content-type') || 'image/jpeg'
    return `data:${type};base64,${buf.toString('base64')}`
  } catch { return null }
}

const cards = []
for (let i = 0; i < report.matched.length; i++) {
  const m = report.matched[i]
  const newArt = await dataUri(m.coverUrl)
  const oldPhoto = m.oldCover === 'your-photo' ? photoById[m.id] : null
  cards.push({ ...m, newArt, oldPhoto })
  process.stdout.write(`\rfetched ${i + 1}/${report.matched.length} covers`)
}

const wasPhoto = cards.filter((c) => c.oldCover === 'your-photo')
const wasPlaceholder = cards.filter((c) => c.oldCover !== 'your-photo')

const tile = (c, showOld) => `
  <figure class="tile">
    <div class="imgs">
      ${showOld && c.oldPhoto ? `<div class="old"><img src="${c.oldPhoto}" alt=""><span>your photo</span></div><div class="arrow">→</div>` : ''}
      <div class="new">${c.newArt ? `<img src="${c.newArt}" alt="">` : '<div class="miss">image failed</div>'}<span>official art</span></div>
    </div>
    <figcaption><strong>${esc(c.album)}</strong><span>${esc(c.artist)}</span></figcaption>
  </figure>`

const list = (items) => items.length
  ? `<ul class="flagged">${items.map((m) => `<li><strong>${esc(m.artist)}</strong> — ${esc(m.album)} <em>(${m.oldCover === 'your-photo' ? 'keeps your photo' : 'stays placeholder'})</em></li>`).join('')}</ul>`
  : '<p class="none">None.</p>'

const html = `<title>Crate — Cover Match Review</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#15140f; color:#ece7df; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 28px 20px 60px; }
  h1 { font-size: 1.7rem; margin:0 0 4px; }
  .sub { color:#a59f95; margin:0 0 24px; }
  .stat-row { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:28px; }
  .stat { background:#21201a; border:1px solid #322f27; border-radius:12px; padding:12px 16px; }
  .stat b { display:block; font-size:1.5rem; }
  .stat.ok b { color:#8fd49b } .stat.warn b { color:#e8c170 } .stat.no b { color:#e09a9a }
  h2 { font-size:1.15rem; margin:34px 0 14px; border-bottom:1px solid #322f27; padding-bottom:8px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:18px; }
  .tile { margin:0; background:#1c1b15; border:1px solid #2c2a22; border-radius:12px; padding:12px; }
  .imgs { display:flex; align-items:center; gap:8px; }
  .imgs .new, .imgs .old { flex:1; text-align:center; }
  .imgs img { width:100%; aspect-ratio:1; object-fit:cover; border-radius:8px; background:#000; }
  .imgs span { display:block; font-size:.72rem; color:#a59f95; margin-top:5px; }
  .imgs .arrow { color:#6b8f71; font-size:1.3rem; flex:0 0 auto; }
  .miss { aspect-ratio:1; display:grid; place-items:center; background:#2c2a22; border-radius:8px; color:#e09a9a; font-size:.8rem; }
  figcaption { margin-top:10px; } figcaption strong { display:block; font-size:.92rem; }
  figcaption span { color:#a59f95; font-size:.82rem; }
  .flagged { columns: 2; gap:24px; padding-left:18px; } .flagged li { margin-bottom:6px; } .flagged em { color:#a59f95; }
  .none { color:#a59f95; }
  @media (max-width:640px){ .flagged{columns:1} }
</style>
<div class="wrap">
  <h1>Cover match review</h1>
  <p class="sub">MusicBrainz + Cover Art Archive dry run · ${report.total} records (those with a phone photo or no cover) · nothing applied yet</p>
  <div class="stat-row">
    <div class="stat ok"><b>${report.matched.length}</b>matched official art</div>
    <div class="stat warn"><b>${report.flaggedNoCover.length + report.noMatch.length}</b>flagged (kept as-is)</div>
    <div class="stat no"><b>${wasPhoto.length}</b>would replace a photo</div>
  </div>

  <h2>Replacing a phone photo → official art (${wasPhoto.length}) — check these closely</h2>
  <div class="grid">${wasPhoto.map((c) => tile(c, true)).join('')}</div>

  <h2>Filling a placeholder → official art (${wasPlaceholder.length})</h2>
  <div class="grid">${wasPlaceholder.map((c) => tile(c, false)).join('')}</div>

  <h2>Flagged — no cover found, kept as-is (${report.flaggedNoCover.length + report.noMatch.length})</h2>
  ${list([...report.flaggedNoCover, ...report.noMatch])}
</div>`

writeFileSync(OUT, html)
console.log(`\nWrote ${OUT} (${(html.length / 1024 / 1024).toFixed(1)} MB)`)
