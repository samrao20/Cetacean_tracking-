#!/usr/bin/env python3
"""Sync Koamas sightings from the Drive Excel workbook into Supabase and the
local data/sightings.json fallback, and flag problem rows in the workbook
itself.

Source of truth: the "Koamas Atoll Sightings <year>" sheet(s) in
"Koamas ID and Sightings Data Sheet.xlsx" (the other sheets in that workbook
are photo-ID catalogues and are ignored here).

Pipeline:
  1. Fetch the workbook (from Drive, or a local --xlsx for testing).
  2. Parse every "Koamas Atoll Sightings *" sheet: normalise atoll names,
     parse DMS coordinates, resolve dates/times to UTC, resolve species
     labels to species.json slugs, parse pod size.
  3. Rows that fail coordinate parsing/validation or species resolution are
     quarantined into data/import-review.json and excluded from publishing.
  4. Highlight the offending cells directly in the workbook: red for
     unusable coordinates, yellow for an unresolved species — then push the
     highlighted workbook back to the same Drive file. Highlights are
     recomputed from scratch each run, so a row fixed by hand loses its
     highlight on the next sync.
  5. Publish the clean rows: upsert into Supabase (source='excel', keyed by
     a content hash so edits/deletions in the sheet reconcile correctly),
     and write a rounded, privacy-safe data/sightings.json mirror for the
     GitHub Pages fallback path.

Usage:
  # Local dry run against a downloaded copy of the sheet — no network writes:
  python3 scripts/import_sightings.py --dry-run --xlsx ./Koamas.xlsx \
      --highlighted-out /tmp/Koamas-highlighted.xlsx

  # Real run (as executed by .github/workflows/import-sightings.yml):
  python3 scripts/import_sightings.py
      # reads GDRIVE_FILE_ID / GDRIVE_SERVICE_ACCOUNT_JSON / SUPABASE_URL /
      # SUPABASE_SERVICE_ROLE_KEY from the environment
"""

import argparse
import hashlib
import io
import json
import os
import re
import sys
import datetime as dt
from pathlib import Path

import openpyxl
from openpyxl.styles import PatternFill

REPO_ROOT = Path(__file__).resolve().parent.parent

# Maldives is UTC+5 year-round (no DST) — the sheet's Date/Time columns are
# local island time, but data/sightings.json and Supabase both store UTC.
MALDIVES_OFFSET = dt.timedelta(hours=5)

# Coordinate sanity box for the Maldives archipelago. Anything parsed outside
# this is almost certainly a transcription error, not a real sighting.
LAT_RANGE = (-1.0, 8.0)
LNG_RANGE = (72.0, 74.5)

RED_FILL = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
YELLOW_FILL = PatternFill(start_color="FFEB9C", end_color="FFEB9C", fill_type="solid")
BOTH_FILL = PatternFill(start_color="FFC299", end_color="FFC299", fill_type="solid")  # coords + species
DATE_FILL = PatternFill(start_color="D9D2FF", end_color="D9D2FF", fill_type="solid")  # date issue, no coords/species issue
CLEAR_FILL = PatternFill(fill_type=None)

SHEET_NAME_RE = re.compile(r"koamas\s+atoll\s+sightings", re.I)

# Keyword used to *detect* a column, tolerant of the real sheet's typo
# ("Coorinates" — missing the second "d"). Match on a short, misspelling-safe
# prefix rather than the full word.
COLUMN_KEYWORDS = [
    ("atoll", ("atoll", "location")),
    ("coords", ("coor",)),       # "Coordinates" / "Coorinates" (sic)
    ("date", ("date",)),
    ("time", ("time",)),
    ("species", ("species",)),
    ("podsize", ("pod", "group")),
    ("verified", ("verified",)),
    ("photo", ("photo",)),
    ("observer", ("observer",)),
]
REQUIRED_HEADER_HITS = 7  # of len(COLUMN_KEYWORDS) == 9

COORD_RE = re.compile(
    r"(\d+)\s*°\s*(\d+)\s*'\s*([\d.]+)\s*\"?\s*([NS])"
    r"\s*[,]?\s*"
    r"(\d+)\s*°\s*(\d+)\s*'\s*([\d.]+)\s*\"?\s*([EW])",
    re.I,
)


# ── generic helpers ─────────────────────────────────────────────────────

def levenshtein(a, b):
    a, b = a.lower(), b.lower()
    dp = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, dp[0] = dp[0], i
        for j, cb in enumerate(b, 1):
            cur = dp[j]
            dp[j] = min(dp[j] + 1, dp[j - 1] + 1, prev + (ca != cb))
            prev = cur
    return dp[-1]


def normalise_atoll(raw):
    """Port of normaliseAtoll() in index.html/map.html/dashboard.html — keep
    these in lockstep; a divergence would make Excel-imported atoll names
    filter/display differently from Supabase-native ones."""
    if not raw:
        return ""
    s = re.sub(r"\s+", " ", str(raw).strip())
    while re.search(r"\batoll$", s, re.I):
        s = re.sub(r"\s*atoll$", "", s, flags=re.I).strip()
    if not s:
        return ""
    return re.sub(r"(^|\s)\S", lambda m: m.group(0).upper(), s.lower())


# ── field parsers ───────────────────────────────────────────────────────

def parse_coordinates(raw):
    """Returns ((lat, lng), None) on success or (None, reason) on failure."""
    if raw is None:
        return None, "missing"
    s = str(raw).strip()
    if not s or s.lower() in ("unk", "-", "?", "n/a", "na"):
        return None, "missing"
    m = COORD_RE.search(s)
    if not m:
        return None, "unparsed"
    d1, m1, s1, h1, d2, m2, s2, h2 = m.groups()
    m1, s1, m2, s2 = float(m1), float(s1), float(m2), float(s2)
    if m1 >= 60 or s1 >= 60 or m2 >= 60 or s2 >= 60:
        return None, "invalid_dms"
    lat = float(d1) + m1 / 60 + s1 / 3600
    if h1.upper() == "S":
        lat = -lat
    lng = float(d2) + m2 / 60 + s2 / 3600
    if h2.upper() == "W":
        lng = -lng
    if not (LAT_RANGE[0] <= lat <= LAT_RANGE[1] and LNG_RANGE[0] <= lng <= LNG_RANGE[1]):
        return None, "out_of_range"
    return (lat, lng), None


def _repair_time_text(s):
    # Observed typo: "11:oo" (letter O in place of zero).
    return re.sub(r"[oO]", "0", s.strip())


def parse_date_time(date_val, time_val):
    """Prefer the real datetime/time Excel already resolved over re-parsing
    display text — cells entered under different regional settings (DD/MM vs
    MM/DD) can't be reliably disambiguated from the formatted string alone,
    but Excel already resolved each one correctly at entry time."""
    if isinstance(date_val, dt.datetime):
        date_part = date_val.date()
    elif isinstance(date_val, dt.date):
        date_part = date_val
    elif isinstance(date_val, str) and date_val.strip():
        s = date_val.strip()
        date_part = None
        for fmt in ("%m/%d/%Y", "%m/%d/%y", "%d-%b-%Y", "%d-%b-%y"):
            try:
                date_part = dt.datetime.strptime(s, fmt).date()
                break
            except ValueError:
                continue
        if date_part is None:
            return None, "unparsed"
    else:
        return None, "missing"

    if not (2015 <= date_part.year <= 2100):
        return None, "implausible_year"

    time_part = dt.time(12, 0)  # default: midday local, if time is blank
    if isinstance(time_val, dt.time):
        time_part = time_val
    elif isinstance(time_val, dt.datetime):
        time_part = time_val.time()
    elif isinstance(time_val, str) and time_val.strip():
        s = _repair_time_text(time_val)
        parsed = None
        for fmt in ("%H:%M:%S", "%H:%M"):
            try:
                parsed = dt.datetime.strptime(s, fmt).time()
                break
            except ValueError:
                continue
        if parsed is None:
            return None, "time_unparsed"
        time_part = parsed

    local_dt = dt.datetime.combine(date_part, time_part)
    utc_dt = local_dt - MALDIVES_OFFSET
    return utc_dt.strftime("%Y-%m-%dT%H:%M:%SZ"), None


def parse_pod_size(raw):
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return int(raw)
    s = str(raw).strip()
    if not s or s in ("-", "?", "unk"):
        return None
    m = re.match(r"(\d+)", s)
    return int(m.group(1)) if m else None


def resolve_species(label, notes, aliases, species_by_slug):
    """Exact alias lookup first; for the ambiguous 'Bottlenose' label, allow
    a fuzzy match against species.json scientific-name epithets so a
    recorder's own annotation (even with a typo, e.g. "Tursiops Turcatus")
    can resolve it. Everything else is left for a human — see the
    'Ambiguous species are flagged, never guessed' decision."""
    key = str(label).strip() if label else ""
    if not key:
        return None, "missing"
    if key in aliases and aliases[key]:
        return aliases[key], None
    if key in aliases and aliases[key] is None and key.lower() == "bottlenose" and notes:
        words = re.findall(r"[A-Za-z]+", str(notes))
        best_slug, best_dist = None, 99
        for slug, sp in species_by_slug.items():
            epithet = sp["scientific_name"].split()[-1]
            for w in words:
                d = levenshtein(w, epithet)
                if d < best_dist:
                    best_dist, best_slug = d, slug
        if best_slug and best_dist <= 2:
            return best_slug, None
    return None, f"unresolved:{key}"


# ── workbook reading ────────────────────────────────────────────────────

def find_sightings_sheets(wb):
    return [ws for ws in wb.worksheets if SHEET_NAME_RE.search(ws.title)]


def find_header_row(ws, max_scan=10, max_col=12):
    for r in range(1, min(max_scan, ws.max_row) + 1):
        texts = []
        for c in range(1, max_col + 1):
            v = ws.cell(r, c).value
            if v is not None:
                texts.append(str(v).strip().lower())
        hits = 0
        for _, prefixes in COLUMN_KEYWORDS:
            if any(any(p in t for p in prefixes) for t in texts):
                hits += 1
        if hits >= REQUIRED_HEADER_HITS:
            return r
    return None


def build_column_map(ws, header_row, max_col=12):
    colmap = {}
    for c in range(1, max_col + 1):
        v = ws.cell(header_row, c).value
        if v is None:
            continue
        t = str(v).strip().lower()
        for name, prefixes in COLUMN_KEYWORDS:
            if name in colmap:
                continue
            if any(p in t for p in prefixes):
                colmap[name] = c
                break
    if "observer" in colmap:
        colmap["notes"] = colmap["observer"] + 1
    return colmap


def iter_raw_rows(ws, header_row, colmap):
    def cell(r, key):
        c = colmap.get(key)
        return ws.cell(r, c).value if c else None

    for r in range(header_row + 1, ws.max_row + 1):
        atoll_val = cell(r, "atoll")
        if atoll_val in (None, ""):
            continue
        yield {
            "sheet": ws.title,
            "row": r,
            "atoll_raw": atoll_val,
            "coords_raw": cell(r, "coords"),
            "date_raw": cell(r, "date"),
            "time_raw": cell(r, "time"),
            "species_raw": cell(r, "species"),
            "podsize_raw": cell(r, "podsize"),
            "verified_raw": cell(r, "verified"),
            "observer_raw": cell(r, "observer"),
            "notes_raw": cell(r, "notes"),
        }


# ── row -> record/review ────────────────────────────────────────────────

def process_row(raw, species_by_slug, aliases):
    reasons = []

    atoll_norm = normalise_atoll(raw["atoll_raw"])

    coords, coord_reason = parse_coordinates(raw["coords_raw"])
    if coord_reason:
        reasons.append(f"coords:{coord_reason}")

    date_iso, date_reason = parse_date_time(raw["date_raw"], raw["time_raw"])
    if date_reason:
        reasons.append(f"date:{date_reason}")

    species_label = str(raw["species_raw"]).strip() if raw["species_raw"] is not None else ""
    slug, species_reason = resolve_species(species_label, raw["notes_raw"], aliases, species_by_slug)
    if species_reason:
        reasons.append(f"species:{species_reason}")

    if reasons:
        return None, {
            "sheet": raw["sheet"],
            "row": raw["row"],
            "reasons": reasons,
            "raw": {
                "atoll": raw["atoll_raw"],
                "coordinates": raw["coords_raw"],
                "date": str(raw["date_raw"]),
                "time": str(raw["time_raw"]),
                "species": raw["species_raw"],
                "pod_size": raw["podsize_raw"],
                "observer": raw["observer_raw"],
                "notes": raw["notes_raw"],
            },
        }

    lat, lng = coords
    sp = species_by_slug[slug]
    verified = str(raw["verified_raw"]).strip().lower() == "yes" if raw["verified_raw"] else False
    observer = str(raw["observer_raw"]).strip() if raw["observer_raw"] else ""
    notes = str(raw["notes_raw"]).strip() if raw["notes_raw"] else ""

    source_key_basis = "|".join([
        raw["sheet"], str(raw["atoll_raw"]), str(raw["coords_raw"]),
        str(raw["date_raw"]), str(raw["time_raw"]), species_label,
        str(raw["podsize_raw"]), observer,
    ])

    record = {
        "species": slug,
        "speciesCommon": sp["common_name"],
        "speciesScientific": sp["scientific_name"],
        "date": date_iso,
        "lat": lat,
        "lng": lng,
        "atoll": f"{atoll_norm} Atoll" if atoll_norm else "",
        "observer": observer or "Community observer",
        "groupSize": parse_pod_size(raw["podsize_raw"]),
        "behaviour": notes or None,
        "photoUrl": None,
        "_status": "verified" if verified else "pending",
        "_source_key_basis": source_key_basis,
        "_sheet": raw["sheet"],
        "_row": raw["row"],
    }
    return record, None


def assign_source_keys(records):
    seen = {}
    for rec in records:
        h = hashlib.sha256(rec["_source_key_basis"].encode("utf-8")).hexdigest()[:20]
        n = seen.get(h, 0)
        seen[h] = n + 1
        rec["source_key"] = f"{h}-{n}" if n else h
        rec["id"] = "x" + rec["source_key"][:10]


# ── output builders ─────────────────────────────────────────────────────

def round_coord(v, grid=0.05):
    return round(round(v / grid) * grid, 2)


def build_mirror(records):
    out = []
    for rec in sorted(records, key=lambda r: r["date"], reverse=True):
        out.append({
            "id": rec["id"],
            "species": rec["species"],
            "speciesCommon": rec["speciesCommon"],
            "speciesScientific": rec["speciesScientific"],
            "date": rec["date"],
            "lat": round_coord(rec["lat"]),
            "lng": round_coord(rec["lng"]),
            "atoll": rec["atoll"],
            "observer": rec["observer"],
            "groupSize": rec["groupSize"],
            "behaviour": rec["behaviour"],
            "photoUrl": None,
        })
    return out


def build_review(review_records):
    return sorted(review_records, key=lambda r: (r["sheet"], r["row"]))


# ── highlighting ────────────────────────────────────────────────────────

def apply_highlights(sheets_meta, coord_flagged, species_flagged, date_flagged):
    # A row can fail for more than one reason (see process_row). coords/
    # species get dedicated colors (and their combination a third); a
    # date-only failure — no coords or species problem — still needs a
    # visible flag or it would drop off the site with no signal in the
    # sheet explaining why, so it gets its own color rather than falling
    # through to "looks clean".
    for ws, header_row, last_row, ncols in sheets_meta:
        for r in range(header_row + 1, last_row + 1):
            key = (ws.title, r)
            in_coord, in_species, in_date = key in coord_flagged, key in species_flagged, key in date_flagged
            if in_coord and in_species:
                fill = BOTH_FILL
            elif in_coord:
                fill = RED_FILL
            elif in_species:
                fill = YELLOW_FILL
            elif in_date:
                fill = DATE_FILL
            else:
                fill = CLEAR_FILL
            for c in range(1, ncols + 1):
                ws.cell(r, c).fill = fill


# ── Drive (lazy imports — not needed for --xlsx/--dry-run local use) ────

def get_drive_service():
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    info = json.loads(os.environ["GDRIVE_SERVICE_ACCOUNT_JSON"])
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/drive"]
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def fetch_workbook_bytes(service, file_id):
    from googleapiclient.http import MediaIoBaseDownload

    meta = service.files().get(fileId=file_id, fields="mimeType").execute()
    if meta["mimeType"] == "application/vnd.google-apps.spreadsheet":
        request = service.files().export_media(fileId=file_id, mimeType=XLSX_MIME)
    else:
        request = service.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buf.getvalue()


def push_workbook_bytes(service, file_id, content_bytes):
    from googleapiclient.http import MediaIoBaseUpload

    media = MediaIoBaseUpload(io.BytesIO(content_bytes), mimetype=XLSX_MIME, resumable=False)
    service.files().update(fileId=file_id, media_body=media).execute()


# ── Supabase (lazy imports) ─────────────────────────────────────────────

def _supabase_headers(service_key):
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }


def supabase_upsert_species(base_url, service_key, species_list):
    import requests

    headers = _supabase_headers(service_key)
    headers["Prefer"] = "resolution=merge-duplicates"
    payload = [
        {"slug": s["slug"], "common_name": s["common_name"], "scientific_name": s["scientific_name"]}
        for s in species_list
    ]
    resp = requests.post(
        f"{base_url}/rest/v1/species", headers=headers, json=payload,
        params={"on_conflict": "slug"}, timeout=30,
    )
    resp.raise_for_status()


def supabase_upsert_sightings(base_url, service_key, records):
    import requests

    headers = _supabase_headers(service_key)
    sp_resp = requests.get(
        f"{base_url}/rest/v1/species", headers=_supabase_headers(service_key),
        params={"select": "id,slug"}, timeout=30,
    )
    sp_resp.raise_for_status()
    slug_to_id = {row["slug"]: row["id"] for row in sp_resp.json()}

    payload = []
    for rec in records:
        payload.append({
            "source": "excel",
            "source_key": rec["source_key"],
            "species_id": slug_to_id.get(rec["species"]),
            "lat": rec["lat"],
            "lng": rec["lng"],
            "atoll": rec["atoll"],
            "count_range": str(rec["groupSize"]) if rec["groupSize"] is not None else None,
            "sighting_date": rec["date"],
            "status": rec["_status"],
            "notes": rec["behaviour"],
            "observer": rec["observer"],
        })

    headers["Prefer"] = "resolution=merge-duplicates"
    CHUNK = 200
    for i in range(0, len(payload), CHUNK):
        resp = requests.post(
            f"{base_url}/rest/v1/sightings", headers=headers,
            json=payload[i:i + CHUNK], params={"on_conflict": "source_key"}, timeout=60,
        )
        resp.raise_for_status()


def supabase_reconcile(base_url, service_key, current_source_keys):
    """Delete excel-sourced rows whose source_key no longer appears in the
    sheet, so deletions/corrections made in Excel propagate. Never touches
    rows with a different `source` (e.g. future WhatsApp-bot submissions)."""
    import requests

    headers = _supabase_headers(service_key)
    resp = requests.get(
        f"{base_url}/rest/v1/sightings", headers=headers,
        params={"select": "id,source_key", "source": "eq.excel"}, timeout=30,
    )
    resp.raise_for_status()
    stale_ids = [row["id"] for row in resp.json() if row["source_key"] not in current_source_keys]

    for i in range(0, len(stale_ids), 100):
        chunk = stale_ids[i:i + 100]
        ids_filter = ",".join(str(x) for x in chunk)
        del_resp = requests.delete(
            f"{base_url}/rest/v1/sightings", headers=headers,
            params={"id": f"in.({ids_filter})"}, timeout=30,
        )
        del_resp.raise_for_status()
    return len(stale_ids)


# ── main ─────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--xlsx", help="Use a local .xlsx file instead of fetching from Drive.")
    parser.add_argument("--file-id", default=os.environ.get("GDRIVE_FILE_ID"),
                         help="Drive file id (defaults to $GDRIVE_FILE_ID).")
    parser.add_argument("--dry-run", action="store_true",
                         help="Skip all writes to Supabase and Drive; only write local files.")
    parser.add_argument("--out", default=str(REPO_ROOT / "data" / "sightings.json"))
    parser.add_argument("--review-out", default=str(REPO_ROOT / "data" / "import-review.json"))
    parser.add_argument("--species-json", default=str(REPO_ROOT / "species.json"))
    parser.add_argument("--aliases", default=str(REPO_ROOT / "data" / "species-aliases.json"))
    parser.add_argument("--highlighted-out", help="Always write the highlighted workbook to this local path.")
    parser.add_argument("--no-drive-writeback", action="store_true")
    parser.add_argument("--no-supabase", action="store_true")
    args = parser.parse_args()

    species_list = json.load(open(args.species_json))["species"]
    species_by_slug = {s["slug"]: s for s in species_list}
    aliases = json.load(open(args.aliases)) if os.path.exists(args.aliases) else {}

    drive_service = None
    if args.xlsx:
        wb_bytes = open(args.xlsx, "rb").read()
    else:
        if not args.file_id:
            sys.exit("No --xlsx given and no --file-id/$GDRIVE_FILE_ID set.")
        drive_service = get_drive_service()
        wb_bytes = fetch_workbook_bytes(drive_service, args.file_id)

    wb = openpyxl.load_workbook(io.BytesIO(wb_bytes), data_only=True)
    sheets = find_sightings_sheets(wb)
    if not sheets:
        sys.exit('No sheet matching "Koamas Atoll Sightings" found in the workbook.')

    all_published, all_review, sheets_meta = [], [], []
    for ws in sheets:
        header_row = find_header_row(ws)
        if header_row is None:
            print(f'WARNING: could not find a header row in sheet "{ws.title}" — skipping it.', file=sys.stderr)
            continue
        colmap = build_column_map(ws, header_row)
        last_row = header_row
        for raw in iter_raw_rows(ws, header_row, colmap):
            last_row = max(last_row, raw["row"])
            record, review = process_row(raw, species_by_slug, aliases)
            (all_published if record else all_review).append(record or review)
        sheets_meta.append((ws, header_row, last_row, max(colmap.values()) if colmap else 9))

    assign_source_keys(all_published)

    mirror = build_mirror([r for r in all_published if r["_status"] == "verified"])
    review_out = build_review(all_review)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(mirror, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.makedirs(os.path.dirname(args.review_out) or ".", exist_ok=True)
    with open(args.review_out, "w") as f:
        json.dump(review_out, f, indent=2, ensure_ascii=False)
        f.write("\n")

    coord_flagged, species_flagged, date_flagged = set(), set(), set()
    for rev in all_review:
        key = (rev["sheet"], rev["row"])
        for reason in rev["reasons"]:
            if reason.startswith("coords:"):
                coord_flagged.add(key)
            elif reason.startswith("species:"):
                species_flagged.add(key)
            elif reason.startswith("date:"):
                date_flagged.add(key)
    apply_highlights(sheets_meta, coord_flagged, species_flagged, date_flagged)

    buf = io.BytesIO()
    wb.save(buf)
    highlighted_bytes = buf.getvalue()

    if args.highlighted_out:
        os.makedirs(os.path.dirname(args.highlighted_out) or ".", exist_ok=True)
        with open(args.highlighted_out, "wb") as f:
            f.write(highlighted_bytes)

    total = len(all_published) + len(all_review)
    print(f"Parsed {total} rows across {len(sheets)} sheet(s).")
    print(f"  published : {len(all_published)}  (verified/public: {len(mirror)})")
    print(f"  review    : {len(all_review)}  (coords: {len(coord_flagged)}, species: {len(species_flagged)})")

    if args.dry_run:
        print("Dry run — skipping Drive write-back and Supabase sync.")
        return

    if not args.no_drive_writeback:
        if os.environ.get("GDRIVE_SERVICE_ACCOUNT_JSON") and args.file_id:
            if drive_service is None:
                drive_service = get_drive_service()
            push_workbook_bytes(drive_service, args.file_id, highlighted_bytes)
            print("Pushed highlighted workbook back to Drive.")
        else:
            print("Skipping Drive write-back (no service account / file id configured).")

    if not args.no_supabase:
        base_url = os.environ.get("SUPABASE_URL")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if base_url and service_key:
            supabase_upsert_species(base_url, service_key, species_list)
            supabase_upsert_sightings(base_url, service_key, all_published)
            deleted = supabase_reconcile(base_url, service_key, {r["source_key"] for r in all_published})
            print(f"Supabase sync complete. Reconcile removed {deleted} stale row(s).")
        else:
            print("Skipping Supabase sync (no URL / service role key configured).")


if __name__ == "__main__":
    main()
