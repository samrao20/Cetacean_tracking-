# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Public-facing citizen science website for tracking dolphin and whale sightings across the Maldives. Sightings are submitted via a WhatsApp bot (separate repo) and stored in Supabase. This repo is the static website only.

**Hosted on GitHub Pages — must work as static files with no server or build step.**

## Tech Stack

- Plain HTML + vanilla JS (no framework, no build tool)
- Tailwind CSS via CDN
- Leaflet.js + Leaflet.markercluster for the map (OpenStreetMap tiles, no API key needed)
- Chart.js for dashboard charts
- Supabase JS client (browser-side, read-only via anon key + RLS)

## Development

No build step. Open HTML files directly in a browser, or use any static file server:

```bash
# Python (any machine)
python3 -m http.server 8080

# Node (if available)
npx serve .
```

There are no tests, linters, or CI configured. Validate by opening pages in a browser.

## Architecture

### File Structure (intended)

```
/
├── config.js           # Supabase URL + anon key (placeholder, not committed)
├── index.html          # Home — hero, latest sightings, WhatsApp CTA
├── map.html            # Full-screen Leaflet map with filter sidebar
├── dashboard.html      # Stats cards + Chart.js visualisations + CSV download
├── species.html        # Species guide rendered from species.json
├── about.html          # Project description, methodology, privacy
├── submit.html         # How-to guide + WhatsApp link + QR placeholder
├── species.json        # Static species data (edit by hand)
└── assets/
    ├── css/            # Any hand-written CSS additions
    ├── js/             # Shared JS modules (supabase-client.js, etc.)
    └── img/            # Placeholder images, partner logos, species photos
```

### Data Flow

All data comes from Supabase over HTTPS from the browser. `config.js` (not committed) exports `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Pages import it with a `<script src="config.js">` tag before other scripts.

RLS guarantees: anon can `SELECT` only `verified` sightings and all species rows; no writes.

Supabase tables:
- `sightings(id, submitter_phone_hash, species_id, lat, lng, atoll, count_range, sighting_date, status, notes, created_at)` — filter `status = 'verified'`
- `photos(id, sighting_id, storage_path, taken_at)`
- `species(id, slug, common_name, scientific_name, …)`

### Key Decisions

- **Coordinate precision**: Public map pins are rounded to ~0.05° (~5 km) to protect exact cetacean locations from harassment. Round at query/render time, never store rounded values.
- **Privacy**: Submitter phone numbers (`submitter_phone_hash`) are never rendered anywhere on the public site.
- **species.json**: All species content lives here. `species.html` reads and renders it client-side. This keeps species data editable without touching HTML.
- **URL params for map filters**: Species, date range, and atoll filters are reflected in the URL query string so links are shareable.
- **Empty-state friendly**: Map and dashboard must render gracefully when Supabase returns zero rows (no data yet, or connection failure).

### Design System

- Fonts: Fraunces (headings, serif) + Inter (body, sans) — loaded from Google Fonts
- Palette: deep navy (`#0a1628`), sand (`#e8dcc8`), coral accent (`#c4614a`)
- Scientific-publication aesthetic — restrained, editorial, not SaaS-flashy
- Mobile-first; sidebar on map collapses to bottom sheet on small screens

### Species Covered (minimum)

Spinner dolphin, Bottlenose dolphin, Indo-Pacific bottlenose dolphin, Pantropical spotted dolphin, Risso's dolphin, Fraser's dolphin, Striped dolphin, Rough-toothed dolphin, Short-finned pilot whale, False killer whale, Melon-headed whale, Sperm whale, Bryde's whale, Blue whale, Dwarf sperm whale, Pygmy killer whale.

Uncertain species facts are marked `// TODO: verify` in `species.json`. Do not remove these markers without checking an authoritative source.
