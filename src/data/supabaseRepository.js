import { getDB, STORE_CACHE } from './db.js'
import { newId } from './repository.js'

// Cloud implementation of the repository seam (same shape as the IndexedDB one),
// backed by Supabase + row-level security. Photos ride along as base64 in a
// `photo` column (kept out of list payloads). The Discogs cache stays device-local.

const RECORD_COLS = 'id,album,artist,year,genre,notes,cover_url,cover_source,has_photo,label,catalog_no,tags,created_at,updated_at'

const rowToRecord = (r) => ({
  id: r.id,
  album: r.album || '',
  artist: r.artist || '',
  year: r.year ?? null,
  genre: r.genre || '',
  notes: r.notes || '',
  coverUrl: r.cover_url || null,
  coverSource: r.cover_source || null,
  hasPhoto: Boolean(r.has_photo),
  label: r.label || '',
  catalogNo: r.catalog_no || '',
  tags: Array.isArray(r.tags) ? r.tags : [],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

function recordToRow(rec, userId) {
  const now = Date.now()
  return {
    id: rec.id || newId(),
    user_id: userId,
    album: (rec.album || '').trim(),
    artist: (rec.artist || '').trim(),
    year: rec.year ? Number(rec.year) : null,
    genre: (rec.genre || '').trim(),
    notes: (rec.notes || '').trim(),
    cover_url: rec.coverUrl || null,
    cover_source: rec.coverSource || null,
    has_photo: Boolean(rec.hasPhoto),
    label: (rec.label || '').trim(),
    catalog_no: (rec.catalogNo || '').trim(),
    tags: Array.isArray(rec.tags) ? rec.tags.filter(Boolean) : [],
    created_at: rec.createdAt || now,
    updated_at: now,
  }
}

const blobToDataURL = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = reject
  r.readAsDataURL(blob)
})

export function createSupabaseRepository(supabase, userId) {
  const must = (res) => { if (res.error) throw new Error(res.error.message); return res.data }

  return {
    async list() {
      const data = must(await supabase.from('records').select(RECORD_COLS).order('created_at', { ascending: true }))
      return data.map(rowToRecord)
    },
    async get(id) {
      const { data } = await supabase.from('records').select(RECORD_COLS).eq('id', id).maybeSingle()
      return data ? rowToRecord(data) : undefined
    },
    async add(record) {
      const data = must(await supabase.from('records').insert(recordToRow(record, userId)).select(RECORD_COLS).single())
      return rowToRecord(data)
    },
    async bulkAdd(records) {
      if (!records.length) return []
      const rows = records.map((r) => recordToRow(r, userId))
      const data = must(await supabase.from('records').insert(rows).select(RECORD_COLS))
      return data.map(rowToRecord)
    },
    async update(id, patch) {
      const row = recordToRow({ ...patch, id }, userId)
      delete row.created_at // never reset creation time on update
      const data = must(await supabase.from('records').update(row).eq('id', id).select(RECORD_COLS).single())
      return rowToRecord(data)
    },
    async remove(id) {
      must(await supabase.from('plays').delete().eq('record_id', id))
      must(await supabase.from('records').delete().eq('id', id))
    },

    // ---- personal photos (base64 in the photo column) ----
    async getPhoto(id) {
      const { data } = await supabase.from('records').select('photo').eq('id', id).maybeSingle()
      if (!data?.photo) return undefined
      try { return await (await fetch(data.photo)).blob() } catch { return undefined }
    },
    async setPhoto(id, blob) {
      const dataUrl = await blobToDataURL(blob)
      must(await supabase.from('records').update({ photo: dataUrl, has_photo: true, updated_at: Date.now() }).eq('id', id))
    },
    async removePhoto(id) {
      must(await supabase.from('records').update({ photo: null, has_photo: false, cover_source: null, updated_at: Date.now() }).eq('id', id))
    },

    // ---- listening log ----
    async listPlays() {
      const data = must(await supabase.from('plays').select('id,record_id,played_at'))
      return data.map((p) => ({ id: p.id, recordId: p.record_id, playedAt: p.played_at }))
    },
    async logPlay(recordId, at) {
      const data = must(await supabase.from('plays').insert({ user_id: userId, record_id: recordId, played_at: at || Date.now() }).select('id,record_id,played_at').single())
      return { id: data.id, recordId: data.record_id, playedAt: data.played_at }
    },
    async removePlay(id) { must(await supabase.from('plays').delete().eq('id', id)) },

    // ---- wishlist ----
    async listWants() {
      const data = must(await supabase.from('wants').select('*').order('created_at', { ascending: true }))
      return data.map((w) => ({ id: w.id, album: w.album || '', artist: w.artist || '', year: w.year ?? null, genre: w.genre || '', notes: w.notes || '', coverUrl: w.cover_url || null, createdAt: w.created_at }))
    },
    async addWant(want) {
      const row = { id: want.id || newId(), user_id: userId, album: (want.album || '').trim(), artist: (want.artist || '').trim(), year: want.year ? Number(want.year) : null, genre: (want.genre || '').trim(), notes: (want.notes || '').trim(), cover_url: want.coverUrl || null, created_at: want.createdAt || Date.now() }
      const data = must(await supabase.from('wants').insert(row).select('*').single())
      return { id: data.id, album: data.album, artist: data.artist, year: data.year, genre: data.genre, notes: data.notes, coverUrl: data.cover_url, createdAt: data.created_at }
    },
    async updateWant(id, patch) {
      const data = must(await supabase.from('wants').update({ album: patch.album, artist: patch.artist, year: patch.year ? Number(patch.year) : null, genre: patch.genre, notes: patch.notes, cover_url: patch.coverUrl }).eq('id', id).select('*').single())
      return { id: data.id, album: data.album, artist: data.artist, year: data.year, genre: data.genre, notes: data.notes, coverUrl: data.cover_url, createdAt: data.created_at }
    },
    async removeWant(id) { must(await supabase.from('wants').delete().eq('id', id)) },

    // ---- Discogs cache stays device-local (just a perf cache) ----
    async cacheGet(key) { return (await getDB()).get(STORE_CACHE, key) },
    async cacheSet(key, data) {
      const entry = { key, data, fetchedAt: Date.now() }
      await (await getDB()).put(STORE_CACHE, entry)
      return entry
    },

    async clear() {
      must(await supabase.from('plays').delete().eq('user_id', userId))
      must(await supabase.from('wants').delete().eq('user_id', userId))
      must(await supabase.from('records').delete().eq('user_id', userId))
    },
  }
}
