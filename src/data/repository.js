import { getDB, STORE_RECORDS, STORE_IMAGES, STORE_PLAYS, STORE_WANTS, STORE_CACHE } from './db.js'

/**
 * Repository contract (the seam that lets us swap backends later).
 *
 * Every method is async so a future network-backed implementation (Supabase,
 * a REST API, ...) is a drop-in replacement: build a module that exports the
 * same shape and change `getRepository()` below. No component or hook touches
 * IndexedDB directly — they all go through this interface.
 *
 * Record shape:
 *   { id, album, artist, year, genre, notes, coverUrl, coverSource, hasPhoto,
 *     label, catalogNo, tags[], createdAt, updatedAt }
 * Play:  { id, recordId, playedAt }
 * Want:  { id, album, artist, year, genre, notes, coverUrl, createdAt }
 */

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `id-${Date.now()}-${Math.round(Math.random() * 1e9)}`
}

function normalize(input) {
  const now = Date.now()
  return {
    id: input.id || newId(),
    album: (input.album || '').trim(),
    artist: (input.artist || '').trim(),
    year: input.year ? Number(input.year) : null,
    genre: (input.genre || '').trim(),
    notes: (input.notes || '').trim(),
    coverUrl: input.coverUrl || null,
    coverSource: input.coverSource || null,
    hasPhoto: Boolean(input.hasPhoto),
    label: (input.label || '').trim(),
    catalogNo: (input.catalogNo || '').trim(),
    tags: Array.isArray(input.tags) ? input.tags.filter(Boolean) : [],
    createdAt: input.createdAt || now,
    updatedAt: now,
  }
}

function normalizeWant(input) {
  const now = Date.now()
  return {
    id: input.id || newId(),
    album: (input.album || '').trim(),
    artist: (input.artist || '').trim(),
    year: input.year ? Number(input.year) : null,
    genre: (input.genre || '').trim(),
    notes: (input.notes || '').trim(),
    coverUrl: input.coverUrl || null,
    createdAt: input.createdAt || now,
  }
}

function createIndexedDbRepository() {
  return {
    // ---------- records ----------
    async list() {
      return (await getDB()).getAll(STORE_RECORDS)
    },
    async get(id) {
      return (await getDB()).get(STORE_RECORDS, id)
    },
    async add(record) {
      const db = await getDB()
      const full = normalize(record)
      await db.put(STORE_RECORDS, full)
      return full
    },
    async bulkAdd(records) {
      const db = await getDB()
      const tx = db.transaction(STORE_RECORDS, 'readwrite')
      const saved = records.map(normalize)
      await Promise.all([...saved.map((r) => tx.store.put(r)), tx.done])
      return saved
    },
    async update(id, patch) {
      const db = await getDB()
      const existing = await db.get(STORE_RECORDS, id)
      if (!existing) throw new Error(`Record ${id} not found`)
      const merged = normalize({ ...existing, ...patch, id, createdAt: existing.createdAt })
      await db.put(STORE_RECORDS, merged)
      return merged
    },
    async remove(id) {
      const db = await getDB()
      // also drop the photo and any play history for this record
      const playIds = await db.getAllKeysFromIndex(STORE_PLAYS, 'recordId', id)
      const tx = db.transaction([STORE_RECORDS, STORE_IMAGES, STORE_PLAYS], 'readwrite')
      await Promise.all([
        tx.objectStore(STORE_RECORDS).delete(id),
        tx.objectStore(STORE_IMAGES).delete(id),
        ...playIds.map((pid) => tx.objectStore(STORE_PLAYS).delete(pid)),
        tx.done,
      ])
    },

    // ---------- personal photos ----------
    async getPhoto(id) {
      return (await getDB()).get(STORE_IMAGES, id)
    },
    async setPhoto(id, blob) {
      const db = await getDB()
      await db.put(STORE_IMAGES, blob, id)
      const rec = await db.get(STORE_RECORDS, id)
      if (rec && !rec.hasPhoto) await db.put(STORE_RECORDS, { ...rec, hasPhoto: true, updatedAt: Date.now() })
    },
    async removePhoto(id) {
      const db = await getDB()
      await db.delete(STORE_IMAGES, id)
      const rec = await db.get(STORE_RECORDS, id)
      if (rec && rec.hasPhoto) await db.put(STORE_RECORDS, { ...rec, hasPhoto: false, coverSource: null, updatedAt: Date.now() })
    },

    // ---------- listening log ----------
    async listPlays() {
      return (await getDB()).getAll(STORE_PLAYS)
    },
    async logPlay(recordId, at) {
      const db = await getDB()
      const play = { id: newId(), recordId, playedAt: at || Date.now() }
      await db.put(STORE_PLAYS, play)
      return play
    },
    async removePlay(id) {
      await (await getDB()).delete(STORE_PLAYS, id)
    },

    // ---------- wishlist ----------
    async listWants() {
      return (await getDB()).getAll(STORE_WANTS)
    },
    async addWant(want) {
      const db = await getDB()
      const full = normalizeWant(want)
      await db.put(STORE_WANTS, full)
      return full
    },
    async updateWant(id, patch) {
      const db = await getDB()
      const existing = await db.get(STORE_WANTS, id)
      if (!existing) throw new Error(`Want ${id} not found`)
      const merged = normalizeWant({ ...existing, ...patch, id, createdAt: existing.createdAt })
      await db.put(STORE_WANTS, merged)
      return merged
    },
    async removeWant(id) {
      await (await getDB()).delete(STORE_WANTS, id)
    },

    // ---------- external-lookup cache (Discogs) ----------
    async cacheGet(key) {
      return (await getDB()).get(STORE_CACHE, key)
    },
    async cacheSet(key, data) {
      const db = await getDB()
      const entry = { key, data, fetchedAt: Date.now() }
      await db.put(STORE_CACHE, entry)
      return entry
    },

    async clear() {
      const db = await getDB()
      const stores = [STORE_RECORDS, STORE_IMAGES, STORE_PLAYS, STORE_WANTS, STORE_CACHE]
      const tx = db.transaction(stores, 'readwrite')
      await Promise.all([...stores.map((s) => tx.objectStore(s).clear()), tx.done])
    },
  }
}

let repo = null

/** Returns the singleton repository. Swap the implementation here to change backends. */
export function getRepository() {
  if (!repo) repo = createIndexedDbRepository()
  return repo
}
