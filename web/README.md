# Koamas Web

Next.js web app for the Koamas Maldives cetacean sightings platform.

## Getting started

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll land on the map.

## MapTiler API key

Create `web/.env.local` (already gitignored):

```
NEXT_PUBLIC_MAPTILER_KEY=your_key_here
```

Without it the map style will fail to load. The key only needs read access to MapTiler's hosted styles.

## Routes

| Route | Description |
|-------|-------------|
| `/map` | Full-screen interactive sightings map |
| `/species/[slug]` | Species detail page (e.g. `/species/spinner-dolphin`) |

## Data

Mock data lives in `data/`:

- `sightings.json` — 40 mock sightings across Maldivian atolls
- `species.json` — 19 species with colours, ID features, and behaviour notes

To connect a real database, replace the JSON imports in `app/map/page.tsx` and `app/species/[slug]/page.tsx` with async data-fetching calls. The `Sighting` and `Species` types in `lib/types.ts` define the expected schema.

## Coordinate note

Mock sighting coordinates are already approximate (~0.05° precision). When connecting real data, round coordinates at render time — never store rounded values.
