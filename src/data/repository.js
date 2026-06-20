import { getDB, STORE_RECORDS, STORE_IMAGES } from './db.js'

/**
 * Repository contract (the seam that lets us swap backends later).
 *
 * Every method is async so a future network-backed implementation (Supabase,
 * a REST API, Firebase, ...) is a drop-in replacement: build a module that
 * exports the same shape and change `getRepository()` below. No component or
 * hook touches IndexedDB directly — they all go through this interface.
 *
 *   list(): Promise<Record[]>
 *   get(id): Promise<Record | undefined>
 *   add(record): Promise<Record>
 *   update(id, patch): Promise<Record>
 *   remove(id): Promise<void>
 *   bulkAdd(records[]): Promise<Record[]>
 *   getPhoto(id): Promise<Blob | undefined>
 *   setPhoto(id, blob): Promise<void>
 *   removePhoto(id): Promise<void>
 *   clear(): Promise<void>
 *
 * Record shape:
 *   { id, album, artist, year, genre, notes, coverUrl, hasPhoto, createdAt, updatedAt }
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
    hasPhoto: Boolean(input.hasPhoto),
    createdAt: input.createdAt || now,
    updatedAt: now,
  }
}

function createIndexedDbRepository() {
  return {
    async list() {
      const db = await getDB()
      return db.getAll(STORE_RECORDS)
    },

    async get(id) {
      const db = await getDB()
      return db.get(STORE_RECORDS, id)
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
      const tx = db.transaction([STORE_RECORDS, STORE_IMAGES], 'readwrite')
      await Promise.all([
        tx.objectStore(STORE_RECORDS).delete(id),
        tx.objectStore(STORE_IMAGES).delete(id),
        tx.done,
      ])
    },

    async getPhoto(id) {
      const db = await getDB()
      return db.get(STORE_IMAGES, id)
    },

    async setPhoto(id, blob) {
      const db = await getDB()
      await db.put(STORE_IMAGES, blob, id)
      const rec = await db.get(STORE_RECORDS, id)
      if (rec && !rec.hasPhoto) {
        await db.put(STORE_RECORDS, { ...rec, hasPhoto: true, updatedAt: Date.now() })
      }
    },

    async removePhoto(id) {
      const db = await getDB()
      await db.delete(STORE_IMAGES, id)
      const rec = await db.get(STORE_RECORDS, id)
      if (rec && rec.hasPhoto) {
        await db.put(STORE_RECORDS, { ...rec, hasPhoto: false, updatedAt: Date.now() })
      }
    },

    async clear() {
      const db = await getDB()
      const tx = db.transaction([STORE_RECORDS, STORE_IMAGES], 'readwrite')
      await Promise.all([
        tx.objectStore(STORE_RECORDS).clear(),
        tx.objectStore(STORE_IMAGES).clear(),
        tx.done,
      ])
    },
  }
}

let repo = null

/** Returns the singleton repository. Swap the implementation here to change backends. */
export function getRepository() {
  if (!repo) repo = createIndexedDbRepository()
  return repo
}
