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

### File Structure

```
/
├── config.js           # Supabase URL + anon key (NOT committed — create locally)
├── index.html          # ✅ Built — hero, latest sightings, WhatsApp CTA
├── species.html        # ✅ Built — species guide rendered from species.json
├── about.html          # ✅ Built — project description, methodology, privacy
├── map.html            # 🔲 Planned — full-screen Leaflet map with filter sidebar
├── dashboard.html      # 🔲 Planned — stats cards + Chart.js visualisations + CSV download
├── submit.html         # 🔲 Planned — how-to guide + WhatsApp link + QR placeholder
├── species.json        # Static species data (edit by hand — see schema below)
└── assets/
    ├── css/            # Hand-written CSS additions
    ├── js/             # Shared JS utilities
    └── species/        # Species photos (.jpg, public domain/CC — see README there)
```

### config.js

This file is not committed. Pages load it with `<script src="config.js">` before all other scripts. It must set globals (not ES module exports):

```js
window.SUPABASE_URL = "https://xxxx.supabase.co";
window.SUPABASE_ANON_KEY = "eyJ...";
```

### Data Flow

All data comes from Supabase over HTTPS from the browser. RLS guarantees: anon can `SELECT` only `verified` sightings and all species rows; no writes.

Supabase tables:
- `sightings(id, submitter_phone_hash, species_id, lat, lng, atoll, count_range, sighting_date, status, notes, created_at)` — filter `status = 'verified'`
- `photos(id, sighting_id, storage_path, taken_at)`
- `species(id, slug, common_name, scientific_name, …)`

### JavaScript Conventions

- No ES modules — all scripts are plain `<script>` tags; globals are used for shared state.
- `config.js` must appear before any script that reads `window.SUPABASE_URL`.
- All Supabase calls are async with explicit empty-state and error handling (show a message, never silently fail).
- Coordinate rounding happens at render time: round `lat`/`lng` to the nearest 0.05° before displaying on the map or in the UI. Never store rounded values.
- CSS custom properties (`--navy`, `--sand`, `--coral`, `--bg`, `--text`, `--muted`, `--rule`) are defined in each page's `<style>` block and used alongside Tailwind classes.

### species.json Schema

Top-level key is `"species"` (array). Each entry:

```
slug                  string   — URL-safe identifier, matches photo filename
common_name           string
scientific_name       string
type                  "dolphin" | "whale"
family                string   — e.g. "Delphinidae"
iwc_link              string   — authoritative species page URL
iucn_status           string   — code, e.g. "LC", "VU", "DD"
iucn_label            string   — full label, e.g. "Least Concern"
photo                 string   — relative path, e.g. "assets/species/spinner-dolphin.jpg"
photo_credit          string   — attribution string
pod_size              string   — human-readable range
length_m              string   — range, e.g. "1.3–2.1"
weight_kg             string   — range
diet                  string
behaviour             string[] — bullet-point list of observed behaviours
maldives_distribution string
best_months           number[] — month integers (1=Jan … 12=Dec); empty = year-round
best_months_note      string
distinguishing_features string
similar_species       string[] — confusion species with brief differentiators
unverified            string[] — field names whose values need expert verification
```

Fields listed in `unverified` have uncertain data. Do not remove a field from `unverified` without checking an authoritative source. Do not add guessed values to unverified fields — leave existing markers in place.

### Asset Management

`assets/species/` contains one `.jpg` per species, named to match the `photo` field in `species.json` (e.g. `spinner-dolphin.jpg`). All images are public domain or permissively licensed. `assets/species/README.md` records per-file attribution.

`download_species_photos.sh` batch-downloads photos from Wikimedia Commons. Run it to refresh or add images; it includes rate-limit retry logic.

### Key Decisions

- **Coordinate precision**: Public map pins are rounded to ~0.05° (~5 km) to protect exact cetacean locations from harassment. Round at query/render time, never store rounded values.
- **Privacy**: Submitter phone numbers (`submitter_phone_hash`) are never rendered anywhere on the public site.
- **species.json**: All species content lives here. `species.html` reads and renders it client-side. This keeps species data editable without touching HTML.
- **URL params for map filters**: Species, date range, and atoll filters are reflected in the URL query string so links are shareable.
- **Empty-state friendly**: Map and dashboard must render gracefully when Supabase returns zero rows (no data yet, or connection failure).

### Design System

- Fonts: Fraunces (headings, serif) + Inter (body, sans) — loaded from Google Fonts
- Palette: deep navy (`#0a1628`), sand (`#e8dcc8`), coral accent (`#c4614a`), background (`#f5f0e8`)
- Scientific-publication aesthetic — restrained, editorial, not SaaS-flashy
- Mobile-first; sidebar on map collapses to bottom sheet on small screens

### Species Covered

27 species in `species.json`: spinner dolphin, Indo-Pacific bottlenose, common bottlenose, pantropical spotted, striped, Risso's, Fraser's, rough-toothed, killer whale, short-finned pilot whale, false killer whale, pygmy killer whale, melon-headed whale, blue whale, Bryde's whale, humpback whale, sperm whale, dwarf sperm whale, Cuvier's beaked whale, Longman's beaked whale, Blainville's beaked whale, Deraniyagala's beaked whale, and others.
