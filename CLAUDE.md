# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Koamas** — a public-facing citizen science website for tracking dolphin and whale sightings across the Maldives. "Koamas" means *dolphin* in Dhivehi. Sightings are submitted via a WhatsApp bot (separate repo) and stored in Supabase. This repo is the static website only.

**Hosted on GitHub Pages — must work as static files with no server or build step.**

## Guardrails — load-bearing, do not alter

These are safe to restyle but must not change in behaviour. UI/redesign work has full freedom over markup, CSS, and animation, but must leave the following intact:

- **WhatsApp routing.** Every `https://wa.me/...?text=...` link and its pre-filled message. The number is now the live bot number `9607257743` (`+960 7257743`) — preserve it verbatim; do not revert to the old `00000000000` placeholder or substitute a different number without explicit instruction. Sightings are submitted only through this bot, never through a form on this site.
- **Informational text.** The species guide content (`species.json`; on-page species counts are read from this file's length at render time, not hardcoded — do not hardcode a count anywhere), the "How it works" steps, and the About-page copy are the dataset, not filler. Restyle freely; do not reword, summarise, or drop entries. After any redesign, the rendered text must be byte-identical (extract page text and diff against the previous commit to confirm).
- **Data layer.** Supabase query shapes, the `status = 'verified'` filter, the Supabase→local field normalisation, and the local-JSON fallback path. Breaking any of these silently empties the map/dashboard.
- **Coordinate rounding** to 0.05 at render time (privacy — see Key Decisions), and the **`submitter_phone_hash` never rendered** rule.

When in doubt, treat anything under Data Flow, JavaScript Conventions, and Key Decisions below as behaviour to preserve, and confine changes to presentation.

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
├── data/maldives-islands.geojson # Island polygons drawn as a map overlay (geoBoundaries, CC BY 4.0 — keep the attribution in map.html)
├── data/maldives-atolls.geojson  # Atoll polygons + names: rings, labels, click-to-zoom on the map
├── index.html          # Built — hero video, recent sightings, how-it-works, species teaser
├── species.html        # Built — species guide rendered from species.json
├── about.html          # Built — "What does Koamas mean?", methodology, privacy
├── map.html            # Built — full-screen MapLibre map with filter sidebar
├── dashboard.html      # Built — stats cards + Chart.js visualisations
├── submit.html         # Built — how-to guide + WhatsApp link + QR code + "Koamas Code" guidelines
├── guidelines.html     # Redirect stub only — content merged into submit.html#koamas-code
├── news.html           # Built — News & Events, rendered from data/news.json
├── species.json        # Static species data (edit by hand — see schema below)
├── data/news.json      # News & Events entries (see News & Events section below)
└── assets/
    ├── koamas.css      # Shared design system: tokens (:root), nav, footer, buttons, cards, reveal + reduced-motion guard
    ├── koamas.js       # Shared JS: mobile nav toggle, scroll/reveal helpers
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
- CSS custom properties (`--navy`, `--sand`, `--coral`, `--bg`, `--text`, `--muted`, `--rule`, plus `--teal`, `--green`, `--lagoon`) are defined in `:root` in the shared `assets/koamas.css` and used alongside Tailwind classes.

### species.json Schema

Top-level key is `"species"` (array). Each entry:

```
slug                    string   URL-safe identifier, matches photo filename in assets/species/
common_name             string
scientific_name         string
type                    "dolphin" | "whale"
rank                    string   optional; omitted (or "species") for a real species entry.
                                  "genus" marks a grouping entry (e.g. bottlenose-dolphin,
                                  Tursiops sp.) used when field ID can't be resolved to one
                                  species. Excluded from species-guide counts/grid (see
                                  species.html) and from the map/dashboard's per-species color —
                                  those show one combined category via each page's
                                  SPECIES_GROUPS table instead. Publishing at genus level is not
                                  a guess: it's the sighting recorded at the precision it was
                                  actually identified.
members                 string[] optional; only on a "rank": "genus" entry — the specific
                                  species.json slugs it groups
family                  string   taxonomic family, e.g. "Delphinidae"
iwc_link                string   URL to the IWC Whale & Dolphin Handbook entry
iucn_status             string   code e.g. "LC", "VU", "DD", "NE" (genus entries use "NE" —
                                  Not Evaluated, since a genus grouping has no Red List
                                  assessment of its own)
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

The hero (`index.html`) is a full-bleed drone clip (`#hero-video`) that plays as the
background and fades in/out with scroll. The scroll behaviour is vanilla JS in the page
`<script>` (reduced-motion / no-JS fall back to the fully-visible resting state).

The clip is hosted on GitHub Releases (not in the repo — too large to commit). Current
source (release tag `v.05_hero_release`):
- https://github.com/samrao20/Cetacean_tracking-/releases/download/v.05_hero_release/dji_fly_20260612_185316_0270_1781935792216_video.mp4

To replace: upload the new file as an asset on a new release tag (use `.mp4` —
QuickTime `.mov` exports aren't reliably playable inline outside Safari), then update
the `<source src>` inside `<video id="hero-video">` in `index.html`.

Helper scripts (run once if needed):
- `bash download_species_photos.sh` — downloads species photos from Wikimedia Commons into `assets/img/species/`
- `bash download_hero_video.sh` — downloads a fallback public-domain hero video

### News & Events

`news.html` replaced the old Evolution page. It renders entirely from `data/news.json`
(top-level key `"items"`, fetched client-side same as `species.html` does for `species.json`).
Each item: `slug, title, kicker, type ("event"|"news"), status ("upcoming"|"past"), date (ISO
or ""), date_note, location, summary, body (string[]), image, image_credit, links[{label,url}]`.
An empty `body` renders a "coming soon" note instead of breaking; an empty `image` falls back to
a gradient panel. Upcoming entries render soonest-first, past entries newest-first. Add new
entries directly to the array — no other file needs to change.

### The Koamas Code

The condensed responsible-watching guidelines live in `submit.html` at `#koamas-code` as five
cards (Calm, Course, Clearance, Calves, Choice) plus "Contribute" as the bridge into the WhatsApp
CTA. The full original guidelines text (all rules, the distance table, the Golden Rule) is
preserved verbatim underneath in a `<details id="full-guidelines">` — do not reword it, per the
informational-text guardrail above. `guidelines.html` is now only a redirect stub to
`submit.html#koamas-code`, kept because the URL is linked from elsewhere on the web and GitHub
Pages has no server-side redirects.

### Key Decisions

- Coordinate precision: Public map pins are rounded to ~0.05 (~5 km) to protect exact cetacean locations. Round at query/render time, never store rounded values.
- Privacy: `submitter_phone_hash` is never rendered on the public site.
- URL params for map filters: Species, date range, and atoll filters must be reflected in URL query string for shareable links.
- Empty-state friendly: Every page must render gracefully when Supabase returns zero rows or fails entirely.

### Design System

- Brand name: Koamas (use in nav logo, page titles, footer)
- Fonts: Fraunces (headings, serif) + Outfit (body, sans) — loaded from Google Fonts. **Not Inter.**
- Palette ("Abyss" — blue + grey): deep ocean navy `#0b1f33` (nav/footer/hero/headings), cyan-blue accent `#0ea5e9` (hover `#0284c7`), bright lagoon-cyan pop `#38bdf8`, cool light accent / avatar grey `#d8e6f0`, background `#f5f8fb`, text `#0f1c2b`, muted text `#5b6b7d`, rule `#dbe4ec`. Tokens live in `:root` in `assets/koamas.css`; legacy variable names (`--navy`, `--sand`, `--coral`, `--teal`, `--green`, `--lagoon`) are retained but now hold the Abyss values. **Not part of the brand palette — do not recolour:** the IUCN status badges in `species.html` (semantic conservation-status colours) and the map's categorical species-pin colours (a functional rainbow that must stay mutually distinguishable).
- 3px cyan-blue gradient brand bar at top of every page (`<div class="brand-bar">`)
- Nav logo: Koamas in Fraunces (not italic) with "Maldives Cetacean Watch" tagline
- Scientific-publication aesthetic — restrained, editorial, not SaaS-flashy
- Mobile-first; map sidebar collapses to bottom sheet on small screens
- Each page shares the same nav and footer markup (no templating — copy manually). A change to nav or footer must be applied to all built pages (index, species, about, map, dashboard, submit, news) by hand, or they drift. Note: `map.html` has no `<footer>` (full-screen map). `guidelines.html` is a redirect stub only and carries no nav/footer.

### Interactivity conventions

The shared design system (tokens, nav, footer, buttons, cards, the reveal system, and the reduced-motion guard) lives in `assets/koamas.css`, loaded by every page after the Tailwind CDN script; `assets/koamas.js` handles the mobile nav toggle. Page-specific animation/interaction styles live in each page's own `<style>` block — keep those in sync the same way nav/footer are:

- Nav links use a sliding cyan-blue underline (`::after` scaleX). Map and Dashboard links carry an inline `.nav-ico` SVG (`.nav-ico-map` pin / `.nav-ico-chart` bars) that slides in and animates on hover; the icon also shows on the active page as a "you are here" marker.
- Buttons and cards lift on hover (`translateY`) with a soft cyan glow; species cards zoom their photo and tint their border. JS-rendered lists (sightings, species teaser/grid) fade in with a staggered `.reveal` → `.reveal.in` class toggle applied in the render callback.
- Every page ends its style block with a `prefers-reduced-motion: reduce` guard that neutralises animations and transitions. Any new animation must remain covered by it.

### Skills

`Skills/Taste Skill` — custom design system rules for UI work; review before making visual changes.  
`Skills/Redesign UI skill` — audit and upgrade checklist; use when improving existing pages.
