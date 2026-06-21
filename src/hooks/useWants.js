import { useCallback, useEffect, useState } from 'react'
import { getRepository } from '../data/repository.js'

/** Wishlist — records you're hunting for, separate from the owned collection. */
export function useWants() {
  const repo = getRepository()
  const [wants, setWants] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => { setWants(await repo.listWants()) }, [repo])

  useEffect(() => {
    let active = true
    repo.listWants().then((w) => { if (active) { setWants(w); setLoading(false) } }).catch(() => { if (active) { setWants([]); setLoading(false) } })
    return () => { active = false }
  }, [repo])

  const addWant = useCallback(async (draft) => {
    const saved = await repo.addWant(draft)
    setWants((prev) => [...prev, saved])
    return saved
  }, [repo])

  const updateWant = useCallback(async (id, patch) => {
    const saved = await repo.updateWant(id, patch)
    setWants((prev) => prev.map((w) => (w.id === id ? saved : w)))
    return saved
  }, [repo])

  const removeWant = useCallback(async (id) => {
    await repo.removeWant(id)
    setWants((prev) => prev.filter((w) => w.id !== id))
  }, [repo])

  return { wants, loading, addWant, updateWant, removeWant, reload }
}
