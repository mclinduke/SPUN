// Cloudflare Pages Function: server-side Discogs proxy.
// The Discogs token lives ONLY here (env var, never in the client bundle), and
// this also sidesteps Discogs' lack of browser CORS. Any /api/discogs/* request
// is forwarded to api.discogs.com with the token + a descriptive User-Agent.
//
// Set the secret once:  npx wrangler pages secret put DISCOGS_TOKEN
export async function onRequest(context) {
  const { request, env, params } = context
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path || '')
  const search = new URL(request.url).search
  const target = `https://api.discogs.com/${path}${search}`

  // Only the read-only endpoints the app uses — the token can't be turned into
  // a general authenticated Discogs proxy by anyone who finds the URL.
  // (search, a release by id, a master by id for original-year lookup, and a
  // user's public collection folder listing)
  if (!/^(database\/search|releases\/\d+|masters\/\d+|masters\/\d+\/versions|users\/[^/]+\/collection\/folders\/\d+\/releases)$/.test(path)) {
    return new Response(JSON.stringify({ error: 'path not allowed' }), {
      status: 403, headers: { 'content-type': 'application/json' },
    })
  }

  if (!env.DISCOGS_TOKEN) {
    return new Response(JSON.stringify({ error: 'DISCOGS_TOKEN not configured' }), {
      status: 503, headers: { 'content-type': 'application/json' },
    })
  }

  // Releases/masters are IMMUTABLE Discogs metadata — cache them at the edge so
  // one upstream call serves every user (the single shared token stops being the
  // bottleneck). Search + collection change, so they stay uncached. The token is
  // in the Authorization header, never the URL, so cached entries are safe to
  // share across users (the data is public CC0 metadata).
  const immutable = /^(releases\/\d+|masters\/\d+|masters\/\d+\/versions)$/.test(path)
  const cache = caches.default
  // Key on the PATH only (no query string): immutable release/master responses
  // are identical regardless of query params, so `releases/123?anything` must
  // not fragment the cache or trigger fresh token-burning fetches.
  const cacheKey = new Request(`https://discogs-cache/${path}`, { method: 'GET' })

  if (immutable) {
    const hit = await cache.match(cacheKey)
    if (hit) return hit
  }

  // Prefer the caller's OWN Discogs token (their personal 60/min budget) when
  // they've connected one — falls back to the shared token. Format-validated so
  // the header can't inject anything; it's only ever forwarded to Discogs.
  const userTok = request.headers.get('x-discogs-token')
  const token = (userTok && /^[A-Za-z0-9]{20,80}$/.test(userTok)) ? userTok : env.DISCOGS_TOKEN

  const upstream = await fetch(target, {
    headers: {
      'User-Agent': 'SPUN/1.0 +https://mclinduke.com',
      Authorization: `Discogs token=${token}`,
      Accept: 'application/json',
    },
  })
  const body = await upstream.text()
  const res = new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/json',
      'cache-control': immutable && upstream.ok ? 'public, max-age=2592000, immutable' : 'no-store',
    },
  })
  // Pass Discogs' rate-limit backoff hint through so the client can wait the
  // right amount and retry instead of failing.
  const retryAfter = upstream.headers.get('retry-after')
  if (retryAfter) res.headers.set('retry-after', retryAfter)
  if (immutable && upstream.ok) context.waitUntil(cache.put(cacheKey, res.clone()))
  return res
}
