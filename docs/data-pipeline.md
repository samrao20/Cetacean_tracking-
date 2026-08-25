# Data pipeline: Drive Excel → Supabase / site

Sightings are logged by hand into **`Koamas ID and Sightings Data Sheet.xlsx`**
in the shared **KOAMAS** Drive folder — specifically the
**`Koamas Atoll Sightings <year>`** sheet (the other sheets in that workbook
are photo-ID catalogues and are not touched by this pipeline). A GitHub
Action (`.github/workflows/import-sightings.yml`) runs
`scripts/import_sightings.py` every 3 hours to:

1. Parse that sheet, validate coordinates/dates/species.
2. Publish clean rows to Supabase (`source = 'excel'`) and to
   `data/sightings.json` (the GitHub Pages fallback — coordinates rounded to
   the 0.05° privacy grid before being committed).
3. Flag problem rows **in the workbook itself** — red fill for a row whose
   coordinates can't be trusted, yellow for a row whose species label
   couldn't be resolved, orange for both, purple for a bad/unparseable date
   — and push that highlighted workbook back to the same Drive file.
   Highlights are recomputed from scratch every run, so fixing a row in
   Excel clears its highlight on the next sync automatically. A **"QA
   Legend"** sheet explaining these colors is rebuilt the same way each run
   and inserted just before the workbook's last sheet.
4. Commit `data/sightings.json` / `data/import-review.json` if they changed.

Rows that fail validation are excluded from the site and Supabase entirely —
they sit in `data/import-review.json` until fixed in the sheet.

## One-time setup

### 1. Google service account (read the sheet, write highlights back)

1. In a GCP project, create a service account and enable the **Google Drive
   API**.
2. Create a JSON key for it.
3. In Drive, share the **KOAMAS** folder (or just the workbook) with the
   service account's email address as **Editor** — Viewer is not enough,
   since the importer writes highlights back into the same file.
4. Add two repo secrets:
   - `GDRIVE_SERVICE_ACCOUNT_JSON` — the full JSON key file contents.
   - `GDRIVE_FILE_ID` — `1LCZlPvdscPmChLw9TQ5PWATUW59bI5uz` (from the
     workbook's Drive URL: `drive.google.com/file/d/<this part>/view`).

A service account is used instead of a personal OAuth token because it
doesn't expire or need interactive re-consent for an unattended cron job.

### 2. Supabase schema

Run `supabase/migration_add_excel_source.sql` once in the Supabase SQL
Editor (Dashboard → SQL Editor → paste → Run). It adds `source`,
`source_key`, and `observer` columns to `sightings` and a couple of unique
indexes the importer's upserts rely on. Safe to re-run.

Add two more repo secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — **service role**, not the anon key used by
  the site — the importer needs write access and RLS normally blocks writes.
  Never expose this key client-side.

### 3. Run it

- On schedule: every 3 hours, or manually via the Actions tab →
  "Sync sightings from Drive" → **Run workflow**.
- Locally, without touching Drive or Supabase:
  ```bash
  pip install -r scripts/requirements.txt
  python3 scripts/import_sightings.py --dry-run \
    --xlsx /path/to/downloaded/Koamas.xlsx \
    --highlighted-out /tmp/preview.xlsx
  ```
  This writes `data/sightings.json` / `data/import-review.json` locally and
  a highlighted copy of the workbook to `/tmp/preview.xlsx`, without pushing
  anything to Drive or Supabase.

## Resolving a flagged row

Check `data/import-review.json` (or just look for colored rows in the
sheet) for the reason:

- **`coords:missing`** — the Coordinates cell is blank or `unk`/`-`. Fill in
  a real DMS pair.
- **`coords:unparsed`** — the cell has *something* but it didn't match the
  expected `D°M'S"H, D°M'S"H` pattern. Check for stray characters.
- **`coords:invalid_dms`** — minutes or seconds ≥ 60 somewhere (e.g.
  `73°65'78.7"E`) — a transcription slip. Fix the digits.
- **`coords:out_of_range`** — parsed fine but lands outside the Maldives
  (lat −1..8, lng 72..74.5) — likely a swapped digit.
- **`species:unresolved:<label>`** — see below.
- **`date:*`** — the Date cell isn't a real date Excel could store (e.g. no
  year) or falls outside 2015–2100.

Once fixed, the row publishes and its highlight clears on the next sync —
no other action needed.

### Adding a species alias

The sheet's Species column is a fixed dropdown
(`Spinner, Bottlenose, Risso, Pilot, Orca, Cuviers, Unkown Dolphin, Unkown
Whale`). `data/species-aliases.json` maps each exact label to a
`species.json` slug. A label mapped to `null` always goes to review.

`species.json` has both *Tursiops aduncus* (Indo-Pacific) and
*Tursiops truncatus* (Common), and the sheet's `Bottlenose` dropdown option
doesn't distinguish them — they can't reliably be told apart in the field
either. Rather than flag every such row forever, `"Bottlenose"` maps to
`bottlenose-dolphin`, a genus-level `species.json` entry
(`"rank": "genus"`, *Tursiops sp.*) that groups the two. Publishing at genus
level isn't a guess — it's the recorder's own dropdown choice, published at
the precision it was made — so it stays consistent with the "ambiguous
species are flagged, never guessed" rule below. `resolve_species()` in
`scripts/import_sightings.py` still prefers a specific species over the
genus bucket when one is available: if the recorder types a scientific name
in the notes column (typos tolerated up to an edit distance of 2 — this is
how the two existing `Tursiop Aduncus` / `Tursiops Turcatus` notes resolve
to their specific species), that wins. Genus-level entries are excluded
from the species-guide count and grid on the site (see `rank` in the
`species.json` schema in `CLAUDE.md`) and from the map/dashboard's
species-color palette, which group both bottlenose slugs into one category
— see the `SPECIES_GROUPS` table in `map.html` and `dashboard.html`.

`Unkown Dolphin` / `Unkown Whale` have no matching `species.json` entry.
Either add an "unidentified" species entry, or leave them mapped to `null`
so they stay out of the public map.

If a genuinely new label appears in the sheet (someone edits the dropdown),
the importer will flag it as `species:unresolved:<label>` — add it here.

Note: `supabase_upsert_species()` only ever inserts/updates species rows, it
never deletes any. If a genus-level entry like `bottlenose-dolphin` is ever
removed from `species.json`, the matching Supabase row (and any sightings
still pointing at it) would be orphaned rather than cleaned up — delete it
manually in that case.

## Rotating the service account

Generate a new key in GCP, update the `GDRIVE_SERVICE_ACCOUNT_JSON` secret,
delete the old key from GCP. No changes needed on the Drive-sharing side
(the service account's email/identity stays the same across key rotations).
