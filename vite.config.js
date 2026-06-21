import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Dev-only mirror of the Cloudflare Pages Discogs proxy so /api/discogs/* works
// with `npm run dev` too. Token comes from .dev.vars (gitignored) — never bundled.
function discogsDevProxy() {
  let token = process.env.DISCOGS_TOKEN
  if (!token) { try { token = readFileSync('.dev.vars', 'utf8').match(/DISCOGS_TOKEN=(\S+)/)?.[1] } catch { /* none */ } }
  return {
    name: 'discogs-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/discogs', async (req, res) => {
        try {
          if (!token) { res.statusCode = 503; res.end(JSON.stringify({ error: 'DISCOGS_TOKEN not set in .dev.vars' })); return }
          const path = (req.url || '').replace(/^\/+/, '').split('?')[0]
          if (!/^(database\/search|releases\/\d+|users\/[^/]+\/collection\/folders\/\d+\/releases)$/.test(path)) { res.statusCode = 403; res.end(JSON.stringify({ error: 'path not allowed' })); return }
          const upstream = await fetch(`https://api.discogs.com${req.url}`, {
            headers: { 'User-Agent': 'SPUN/1.0 +https://mclinduke.com', Authorization: `Discogs token=${token}`, Accept: 'application/json' },
          })
          const body = await upstream.text()
          res.statusCode = upstream.status
          res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json')
          res.end(body)
        } catch (e) {
          res.statusCode = 502; res.end(JSON.stringify({ error: String(e) }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    discogsDevProxy(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'SPUN — Vinyl Collection',
        short_name: 'SPUN',
        description: 'Catalog and browse your vinyl record collection.',
        theme_color: '#15140f',
        background_color: '#15140f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//], // never serve the SPA shell for the Discogs proxy
        runtimeCaching: [
          {
            // Cover art (iTunes + Cover Art Archive/Discogs) — cache so the collection looks complete offline.
            urlPattern: /^https:\/\/(.*\.mzstatic\.com|coverartarchive\.org|.*\.archive\.org|i\.discogs\.com)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cover-art',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
