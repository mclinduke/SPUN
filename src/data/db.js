import { openDB } from 'idb'

// Bump this when the object-store shape changes.
const DB_NAME = 'vinyl-collection'
const DB_VERSION = 2

export const STORE_RECORDS = 'records'
export const STORE_IMAGES = 'images' // personal photos, keyed by record id
export const STORE_PLAYS = 'plays'   // listening log: { id, recordId, playedAt }
export const STORE_WANTS = 'wants'   // wishlist records (not owned yet)
export const STORE_CACHE = 'cache'   // external lookups (Discogs), keyed by string

let dbPromise = null

/**
 * Open (and lazily cache) the IndexedDB connection.
 * IndexedDB is used instead of localStorage because we store image blobs and
 * 100+ records — well past localStorage's ~5MB ceiling.
 *
 * v1 -> v2 adds plays (listening tracker), wants (wishlist), and a generic
 * cache store (Discogs pressing/rarity). Existing records/images are untouched.
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
        if (!db.objectStoreNames.contains(STORE_PLAYS)) {
          const plays = db.createObjectStore(STORE_PLAYS, { keyPath: 'id' })
          plays.createIndex('recordId', 'recordId')
          plays.createIndex('playedAt', 'playedAt')
        }
        if (!db.objectStoreNames.contains(STORE_WANTS)) {
          const wants = db.createObjectStore(STORE_WANTS, { keyPath: 'id' })
          wants.createIndex('createdAt', 'createdAt')
        }
        if (!db.objectStoreNames.contains(STORE_CACHE)) {
          db.createObjectStore(STORE_CACHE, { keyPath: 'key' })
        }
      },
    })
  }
  return dbPromise
}
