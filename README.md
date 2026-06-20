# Crate — Vinyl Collection

A personal, mobile-first PWA for cataloguing and browsing a vinyl record collection.
Cover-art-forward browsing (iPad-style Cover Flow + grid + list), live album search
to auto-fill metadata, offline support, and installable to your home screen.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

Deploy `dist/` to any static host (Netlify, Vercel, GitHub Pages, Cloudflare Pages).
No backend or API keys required.

## Features

- **Three browse views** — Cover Flow (3D carousel), grid, and list. The choice is remembered.
- **Add a record** — album, artist, year, genre, free-text notes, cover art. A **"Save & add another"** loop keeps the sheet open, holds artist + genre sticky, and refocuses Album so you can rip through a run of records without reopening the form. Album field is focused first; Enter advances field-to-field; genre quick-pick chips reuse genres already in your collection.
- **Search-to-autofill** — optional: type an album and pick a result; cover + metadata fill in automatically (iTunes). Most useful for mainstream titles.
- **Bulk add (no internet needed)** — paste a whole list, one record per line: `Artist - Album - Year - Genre` (year & genre optional, any order for the year), with a ` | ` tail for notes (pressing, condition). **Create from text** parses it all locally with zero network calls — ideal for live/jam/bootleg vinyl that isn't in any API. Or **Search covers** to auto-pull art from iTunes where it exists. Either way you review an editable grid before committing. Built for the first big load-in.
- **Photos** — official cover art by default; snap/upload a photo of your own copy to override it.
- **Search / filter / sort** — full-text search, genre filter, sort by recent / artist / album / year.
- **Edit & delete** with inline delete confirmation.
- **Backup & share** — export full JSON (incl. photos) or CSV (metadata); import either. Friends can import a CSV/JSON to start their own copy.
- **Stats** — totals, and breakdowns by decade / genre / artist.
- **Dark & light mode**, **offline**, **installable** (PWA).

## Architecture

The whole thing is a static client-side app. Three seams keep it simple now but easy to grow.

### 1. Data layer — swappable backend
`src/data/repository.js` defines an async repository interface (`list/get/add/update/remove/…`).
The current implementation stores data in **IndexedDB** (`src/data/db.js`) — chosen over
localStorage because 100+ records plus image blobs blow past localStorage's ~5MB limit.

Everything else in the app talks only to this interface. To move to a real backend later
(Supabase, a REST API, Firebase), write one module with the same method shape and change the
factory in `getRepository()`. No components or hooks change.

```
records  (object store)  — one record per row, indexed by createdAt/artist/album/year/genre
images   (object store)  — personal photos as Blobs, keyed by record id
```

### 2. Metadata — single source for cover art
`src/services/metadata.js` wraps the **iTunes Search API**: no API key, CORS-enabled (works
from a static site), and one request returns cover art + album + artist + year + genre.
The 100px thumbnail URL is rewritten to a 600px hi-res cover. To add Discogs or MusicBrainz
later, add a function here — callers don't change.

### 3. Backup — `src/services/importExport.js`
JSON (full fidelity, photos embedded as data URLs) and CSV (metadata, spreadsheet-friendly),
with a minimal RFC-4180 CSV parser. Import merges into the existing collection.

### UI
- `src/hooks/useRecords.js` — the in-memory mirror of the collection; the single source of truth for views.
- `src/hooks/useCoverSrc.js` — resolves a record's image (personal photo → official art → placeholder), caching photo object URLs.
- `src/components/` — `CoverFlowView`, `GridView`, `ListView`, `RecordForm` (with live search), `BulkAdd`, `RecordDetail`, `Stats`, `SettingsSheet`, plus `Sheet`/`Cover`/`Icon` primitives.
- Navigation is overlay-based (bottom sheets), so there's no router to maintain.

### PWA
`vite-plugin-pwa` (Workbox) generates the service worker and manifest. App-shell assets are
precached; iTunes cover art (`*.mzstatic.com`) is runtime-cached `CacheFirst` so the collection
still looks complete offline. Icons are generated from `public/icon.svg` via
`node scripts/gen-icons.mjs`.

## Notes on a couple of decisions

- **iTunes over Discogs/MusicBrainz** for a key-less, CORS-friendly client-only app. Discogs has
  the best vinyl data but needs a token that would be exposed in the browser; MusicBrainz is a
  two-step lookup with a 1 req/sec limit. iTunes is one fast keyless call.
- **Cover Flow snap fix** — CSS `scroll-snap-type: mandatory` fights programmatic smooth
  scrolling and gets stuck between snap points. The nav arrows turn snap off for the animation
  and restore it after landing (touch swipes keep snapping natively). See `CoverFlowView.jsx`.
