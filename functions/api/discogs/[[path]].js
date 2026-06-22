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

  const upstream = await fetch(target, {
    headers: {
      'User-Agent': 'SPUN/1.0 +https://mclinduke.com',
      Authorization: `Discogs token=${env.DISCOGS_TOKEN}`,
      Accept: 'application/json',
    },
  })
  const body = await upstream.text()
  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/json',
      'cache-control': 'no-store',
    },
  })
}
