import { openDB } from 'idb'

// Bump this when the object-store shape changes.
const DB_NAME = 'vinyl-collection'
const DB_VERSION = 1

export const STORE_RECORDS = 'records'
export const STORE_IMAGES = 'images' // personal photos, keyed by record id

let dbPromise = null

/**
 * Open (and lazily cache) the IndexedDB connection.
 * IndexedDB is used instead of localStorage because we may store image blobs
 * and 100+ records — well past localStorage's ~5MB ceiling.
 */
export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_RECORDS)) {
          const store = db.createObjectStore(STORE_RECORDS, { keyPath: 'id' })
          store.createIndex('createdAt', 'createdAt')
          store.createIndex('artist', 'artist')
          store.createIndex('album', 'album')
          store.createIndex('year', 'year')
          store.createIndex('genre', 'genre')
        }
        if (!db.objectStoreNames.contains(STORE_IMAGES)) {
          db.createObjectStore(STORE_IMAGES) // value = Blob, key = record id
        }
      },
    })
  }
  return dbPromise
}
