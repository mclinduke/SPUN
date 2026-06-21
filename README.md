# Crate — vinyl collection

A fast, installable PWA for cataloguing and browsing a vinyl collection. Cover-art-forward
(Cover Flow / grid / list), works offline, single-user, local-first.

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

## Data & backup
Your collection lives in the browser. **Menu → Export full backup (JSON)** saves everything
(including photos); Import restores or seeds a friend’s copy. Disk snapshots live in `data/`
(`vinyl-collection-import.json` is the current backup; `data/backups/` holds dated copies).
