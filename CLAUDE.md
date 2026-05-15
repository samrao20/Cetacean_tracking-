# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Koamas** — a public-facing citizen science website for tracking dolphin and whale sightings across the Maldives. "Koamas" means *dolphin* in Dhivehi. Sightings are submitted via a WhatsApp bot (separate repo) and stored in Supabase. This repo is the static website only.

**Hosted on GitHub Pages — must work as static files with no server or build step.**

## Tech Stack

- Plain HTML + vanilla JS (no framework, no build tool)
- Tailwind CSS via CDN
- MapLibre GL (not Leaflet) for the map (OpenStreetMap-compatible tiles, no API key needed)
- Chart.js for dashboard charts
- Supabase JS client (browser-side, read-only via anon key + RLS)

## Development

No build step. Open HTML files directly in a browser, or use any static file server:

```bash
python3 -m http.server 8080
```

No tests, linters, or CI. Validate by opening pages in a browser.

There is also an unfinished Next.js app under `web/` that is not deployed. Do not modify it unless explicitly asked.

## Architecture

### File Structure

```
/
├── config.js           # Supabase URL + anon key (NOT committed — create locally)
├── data/sightings.json # Static fallback sighting data for development/offline use
├── index.html          # Built — hero video, recent sightings, how-it-works, species teaser
├── species.html        # Built — species guide rendered from species.json
├── about.html          # Built — "What does Koamas mean?", methodology, privacy
├── map.html            # Built — full-screen MapLibre map with filter sidebar
├── dashboard.html      # Built — stats cards + Chart.js visualisations
├── submit.html         # Planned — how-to guide + WhatsApp link + QR placeholder
├── species.json        # Static species data (edit by hand — see schema below)
└── assets/
    ├── img/species/    # Species photos (.jpg) used by index.html and map.html
    └── species/        # Species photos (.jpg) used by species.html (separate duplicate tree)
```

### config.js

Not committed. Pages load it before all other scripts with a fallback guard:

```html
<script src="config.js" onerror="void 0"></script>
<script>
  window.SUPABASE_URL      = window.SUPABASE_URL      || null;
  window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || null;
</script>
```

If absent, all pages fall back gracefully to empty/placeholder states — never break. The `data/sightings.json` file provides static fallback data when Supabase is unconfigured.

### Data Flow

All live data comes from Supabase over HTTPS from the browser. RLS guarantees: anon can SELECT only verified sightings and all species rows; no writes.

Supabase tables:
- `sightings(id, submitter_phone_hash, species_id, lat, lng, atoll, count_range, sighting_date, status, notes, created_at)` — always filter `status = 'verified'`
- `photos(id, sighting_id, storage_path, taken_at)`
- `species(id, slug, common_name, scientific_name, ...)`

`data/sightings.json` is the local static fallback. Its schema differs from Supabase: it uses `species` (slug string), `speciesCommon`, `date`, `groupSize`, `behaviour`, `observer` rather than the Supabase column names. Normalise at load time.

### JavaScript Conventions

- No ES modules — all scripts are plain `<script>` tags; globals are used for shared state.
- `config.js` must appear before any script that reads `window.SUPABASE_URL`.
- All Supabase calls are async with explicit empty-state and error handling.
- Coordinate rounding happens at render time: round lat/lng to the nearest 0.05 before displaying on the map. Never store rounded values.
- CSS custom properties (`--navy`, `--sand`, `--coral`, `--bg`, `--text`, `--muted`, `--rule`) are defined in each page's `<style>` block and used alongside Tailwind classes.

### species.json Schema

Top-level key is `"species"` (array). Each entry:

```
slug                    string   URL-safe identifier, matches photo filename in assets/species/
common_name             string
scientific_name         string
type                    "dolphin" | "whale"
iucn_status             string   code e.g. "LC", "VU", "DD"
iucn_label              string   full label e.g. "Least Concern"
photo                   string   relative path e.g. "assets/species/spinner-dolphin.jpg"
photo_credit            string   attribution string
pod_size                string   human-readable range
length_m                string   range e.g. "1.3-2.1"
weight_kg               string   range
diet                    string
behaviour               string[] bullet-point list of observed behaviours
maldives_distribution   string
best_months             number[] month integers (1=Jan 12=Dec); empty = year-round
best_months_note        string
distinguishing_features string
similar_species         string[] confusion species with brief differentiators
unverified              string[] field names whose values need expert verification
```

Fields in `unverified` have uncertain data. Do not remove a field from `unverified` without checking an authoritative source.

### Hero Video

The hero video is hosted on GitHub Releases (not in the repo). Current source:
https://github.com/samrao20/Cetacean_tracking-/releases/download/v0.2-assets/WhatsApp.Video.2026-05-15.at.10.41.51.mp4

To replace: upload a new file to a new release tag, then update the `<source src>` in `index.html`.

Helper scripts (run once if needed):
- `bash download_species_photos.sh` — downloads species photos from Wikimedia Commons into `assets/img/species/`
- `bash download_hero_video.sh` — downloads a fallback public-domain hero video

### Key Decisions

- Coordinate precision: Public map pins are rounded to ~0.05 (~5 km) to protect exact cetacean locations. Round at query/render time, never store rounded values.
- Privacy: `submitter_phone_hash` is never rendered on the public site.
- URL params for map filters: Species, date range, and atoll filters must be reflected in URL query string for shareable links.
- Empty-state friendly: Every page must render gracefully when Supabase returns zero rows or fails entirely.

### Design System

- Brand name: Koamas (use in nav logo, page titles, footer)
- Fonts: Fraunces (headings, serif) + Outfit (body, sans) — loaded from Google Fonts. **Not Inter.**
- Palette: deep navy `#0a1628`, sand `#e8dcc8`, coral accent `#c4614a`, background `#f5f0e8`, muted text `#6b7a8d`, rule `#d4c9b4`
- 3px coral brand bar at top of every page (`<div class="brand-bar">`)
- Nav logo: Koamas in italic Fraunces with "Maldives Cetacean Watch" tagline
- Scientific-publication aesthetic — restrained, editorial, not SaaS-flashy
- Mobile-first; map sidebar collapses to bottom sheet on small screens
- Each page shares the same nav and footer markup (no templating — copy manually)

### Skills

`Skills/Taste Skill` — custom design system rules for UI work; review before making visual changes.  
`Skills/Redesign UI skill` — audit and upgrade checklist; use when improving existing pages.
