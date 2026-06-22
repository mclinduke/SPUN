import { useCallback, useEffect, useState } from 'react'
import { getRepository } from '../data/repository.js'
import { isCloud } from '../data/supabaseClient.js'

/**
 * Friends list + pending requests. Cloud-only: in local mode it stays empty.
 * If the friends SQL hasn't been run yet the RPCs 404 — we treat that as
 * "not set up" (ready:false) rather than surfacing a scary error on every load.
 */
export function useFriends() {
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(isCloud())
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(true)

  const reload = useCallback(async () => {
    if (!isCloud()) { setFriends([]); setLoading(false); return }
    try {
      setFriends(await getRepository().listFriends())
      setError(null); setReady(true)
    } catch (e) {
      const msg = e?.message || String(e)
      if (/function|does not exist|schema cache|not found|404|pgrst/i.test(msg)) setReady(false)
      else setError(msg)
      setFriends([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const incoming = friends.filter((f) => f.direction === 'incoming')
  const outgoing = friends.filter((f) => f.direction === 'outgoing')
  const accepted = friends.filter((f) => f.direction === 'friend')

  return { friends, accepted, incoming, outgoing, pendingCount: incoming.length, loading, error, ready, reload }
}
