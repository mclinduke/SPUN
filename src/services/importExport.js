import { getRepository } from '../data/repository.js'

/**
 * Backup / restore. Two formats:
 *  - JSON: full fidelity (every field + embedded personal photos as data URLs).
 *          Use this to back up or move your whole collection between devices.
 *  - CSV:  metadata only (spreadsheet-friendly). Good for seeding and sharing.
 */

const FILE_VERSION = 1

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function dataURLToBlob(dataURL) {
  const res = await fetch(dataURL)
  return res.blob()
}

// ---------- JSON ----------

export async function exportJSON({ includePhotos = true } = {}) {
  const repo = getRepository()
  const records = await repo.list()
  const photos = {}
  if (includePhotos) {
    for (const r of records) {
      if (r.hasPhoto) {
        const blob = await repo.getPhoto(r.id)
        if (blob) photos[r.id] = await blobToDataURL(blob)
      }
    }
  }
  return {
    app: 'vinyl-collection',
    version: FILE_VERSION,
    exportedAt: new Date().toISOString(),
    count: records.length,
    records,
    photos,
  }
}

export async function importJSON(json, { merge = true } = {}) {
  const repo = getRepository()
  // Validate the shape BEFORE clearing, so a malformed file can never wipe the
  // collection and then fail half-way through.
  const raw = json && typeof json === 'object' ? (Array.isArray(json) ? json : json.records) : null
  const records = Array.isArray(raw) ? raw.filter((r) => r && typeof r === 'object') : []
  if (!records.length) throw new Error('Unrecognized backup file — no records found.')

  if (!merge) await repo.clear()
  await repo.bulkAdd(records)

  const photos = json && json.photos && typeof json.photos === 'object' ? json.photos : {}
  for (const [id, dataURL] of Object.entries(photos)) {
    if (typeof dataURL !== 'string' || !dataURL.startsWith('data:image/')) continue // only embedded images
    try {
      const blob = await dataURLToBlob(dataURL)
      await repo.setPhoto(id, blob)
    } catch {
      /* skip a bad photo, keep the record */
    }
  }
  return records.length
}

// ---------- CSV ----------

const CSV_COLUMNS = ['album', 'artist', 'year', 'genre', 'notes', 'coverUrl']

function csvEscape(value) {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function exportCSV() {
  const repo = getRepository()
  const records = await repo.list()
  const header = CSV_COLUMNS.join(',')
  const rows = records.map((r) => CSV_COLUMNS.map((c) => csvEscape(r[c])).join(','))
  return [header, ...rows].join('\n')
}

/** Minimal RFC-4180-ish parser: handles quoted fields, commas, newlines, "" escapes. */
export function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else field += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field); field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

export async function importCSV(text) {
  const rows = parseCSV(text)
  if (!rows.length) return 0
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const drafts = rows.slice(1).map((cols) => {
    const obj = {}
    header.forEach((h, i) => { obj[h] = cols[i] })
    return {
      album: obj.album || obj.title || '',
      artist: obj.artist || '',
      year: obj.year || null,
      genre: obj.genre || '',
      notes: obj.notes || '',
      coverUrl: obj.coverurl || obj.cover || null,
    }
  }).filter((d) => d.album || d.artist)
  const repo = getRepository()
  await repo.bulkAdd(drafts)
  return drafts.length
}

// ---------- download helper ----------

export function downloadFile(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
