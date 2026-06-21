import { useCallback, useEffect, useMemo, useState } from 'react'
import { getRepository } from '../data/repository.js'

/** Listening log: one-tap play logging + derived per-record counts and stats. */
export function usePlays() {
  const repo = getRepository()
  const [plays, setPlays] = useState([])

  useEffect(() => {
    let active = true
    repo.listPlays().then((p) => { if (active) setPlays(p) })
    return () => { active = false }
  }, [repo])

  const logPlay = useCallback(async (recordId) => {
    const play = await repo.logPlay(recordId)
    setPlays((prev) => [...prev, play])
    return play
  }, [repo])

  const undoPlay = useCallback(async (id) => {
    await repo.removePlay(id)
    setPlays((prev) => prev.filter((p) => p.id !== id))
  }, [repo])

  const { counts, lastPlayed } = useMemo(() => {
    const counts = new Map()
    const lastPlayed = new Map()
    for (const p of plays) {
      counts.set(p.recordId, (counts.get(p.recordId) || 0) + 1)
      if (!lastPlayed.has(p.recordId) || p.playedAt > lastPlayed.get(p.recordId)) lastPlayed.set(p.recordId, p.playedAt)
    }
    return { counts, lastPlayed }
  }, [plays])

  return { plays, totalPlays: plays.length, counts, lastPlayed, logPlay, undoPlay }
}
