import { useCallback, useEffect, useState } from 'react'
import { getRepository } from '../data/repository.js'

/**
 * Single source of truth for the collection in the UI. Wraps the repository
 * and keeps an in-memory mirror so views re-render instantly while writes
 * persist in the background.
 */
export function useRecords() {
  const repo = getRepository()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setError(null)
    const all = await repo.list()
    setRecords(all)
  }, [repo])

  useEffect(() => {
    let active = true
    repo.list()
      .then((all) => { if (active) { setRecords(all); setLoading(false) } })
      // Without this, a failed cloud fetch (offline / Supabase down) leaves the
      // app stuck on "Loading…" forever. Surface it so the UI can offer Retry.
      .catch((e) => { if (active) { setError(e?.message || 'Could not load your collection'); setLoading(false) } })
    return () => { active = false }
  }, [repo])

  const add = useCallback(async (draft) => {
    const saved = await repo.add(draft)
    setRecords((prev) => [...prev, saved])
    return saved
  }, [repo])

  const bulkAdd = useCallback(async (drafts) => {
    const saved = await repo.bulkAdd(drafts)
    setRecords((prev) => [...prev, ...saved])
    return saved
  }, [repo])

  const update = useCallback(async (id, patch) => {
    const saved = await repo.update(id, patch)
    setRecords((prev) => prev.map((r) => (r.id === id ? saved : r)))
    return saved
  }, [repo])

  const remove = useCallback(async (id) => {
    await repo.remove(id)
    setRecords((prev) => prev.filter((r) => r.id !== id))
  }, [repo])

  const setPhoto = useCallback(async (id, blob) => {
    await repo.setPhoto(id, blob)
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, hasPhoto: true } : r)))
  }, [repo])

  const removePhoto = useCallback(async (id) => {
    await repo.removePhoto(id)
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, hasPhoto: false } : r)))
  }, [repo])

  return { records, loading, error, reload, add, bulkAdd, update, remove, setPhoto, removePhoto }
}
