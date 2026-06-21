# SPUN — vinyl collection

A fast, installable PWA for cataloguing and browsing a vinyl collection. Cover-art-forward
(Cover Flow / grid / list), works offline, local-first, with optional multi-user cloud accounts.

## Stack
- **React 19 + Vite 8**, plain JSX, PWA via `vite-plugin-pwa` (Workbox).
- **IndexedDB** behind an async repository seam (`src/data/repository.js`) — swap in a backend
  later without touching the UI. Stores: records, photos, plays, wishlist, Discogs cache.
- **Metadata:** MusicBrainz + Cover Art Archive + iTunes (keyless, browser-direct).
- **Discogs** (pressing / rarity / value) via a token-holding serverless proxy.

## Features
Add (with MusicBrainz autofill + duplicate detection) · bulk add · 3 views · search / genre /
crate-tag filters / sort · edit/delete · official cover art (with personal-photo fallback) ·
**listening tracker** (one-tap spins → streaks, most-played, Wrapped-style) · **random picker**
(by genre / decade / unplayed) · **pressing & rarity** + **collection value** (Discogs) ·
**wishlist** · **crates/tags** · JSON/CSV import-export · light/dark.

## Develop
```bash
npm install
npm run dev          # http://localhost:5173
```
Optional, for Discogs pressing/rarity/value locally — create `.dev.vars` (gitignored):
```
DISCOGS_TOKEN=your_personal_access_token
```
Get a token at https://www.discogs.com/settings/developers → “Generate new token”.

## Deploy (Cloudflare Pages — free)
Cloudflare is the fit: unlimited bandwidth, a free Function for the Discogs proxy, custom domain
+ HTTPS, and room to add a DB later. The Discogs token lives only as an encrypted env var.

**One-off direct upload:**
```bash
npx wrangler login                              # opens browser, your Cloudflare account
npm run deploy                                  # builds + uploads dist/
npx wrangler pages secret put DISCOGS_TOKEN     # paste the token (server-side only)
```
**Or Git-connected (auto-deploy on push):** push to GitHub, then in the Cloudflare dashboard →
Pages → Create → connect the repo with build command `npm run build`, output dir `dist`, and add
`DISCOGS_TOKEN` under Settings → Environment variables.

Without a `DISCOGS_TOKEN` the app runs fine — only pressing/rarity/value degrade gracefully
(everything else, including MusicBrainz/iTunes cover art, is keyless).

## Multi-user (optional — cloud accounts + sync)
With the Supabase env vars **unset**, the app stays local-first (IndexedDB per device). Set them and
it switches to account mode: sign in (Google or email/password) and the collection syncs via
Supabase, scoped per-user by row-level security (each person's collection is private).

1. Create a free Supabase project. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql)
   — creates `records` / `plays` / `wants` with owner-only RLS policies.
2. Add to `.env` (both are browser-safe, publishable values):
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   ```
   For Cloudflare, set the same two as Pages env vars (or they bake in at local build time).
3. **Authentication → URL Configuration:** set **Site URL** to your app URL and add it to
   **Redirect URLs** (e.g. `https://spun-3zc.pages.dev/**`, `http://localhost:5173/**`).
4. **Authentication → Providers → Email:** turn **Confirm email** off for instant signups.
5. **Google sign-in (optional):** create a Google Cloud OAuth *web* client; add the Supabase
   callback `https://<project>.supabase.co/auth/v1/callback` as an authorized redirect URI and your
   app origins as JS origins; paste the client ID + secret into Supabase → Providers → Google.

## Data & backup
Your collection lives in the browser. **Menu → Export full backup (JSON)** saves everything
(including photos); Import restores or seeds a friend’s copy. Disk snapshots live in `data/`
(`vinyl-collection-import.json` is the current backup; `data/backups/` holds dated copies).
