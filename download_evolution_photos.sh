#!/usr/bin/env bash
# Download the Evolution-page photos into assets/img/evolution/ and write a
# credits.json with the required CC attribution for each one.
# Requires: curl, python3 (both available in GitHub Codespaces)
# Usage: bash download_evolution_photos.sh
#
# NOTE: this must be run somewhere that can reach Wikimedia (a local machine or
# Codespaces). The Claude Code cloud environment is blocked from Wikimedia
# (HTTP 403), which is why the images are fetched here rather than committed by
# the assistant — same workflow as download_species_photos.sh.
#
# After running, commit:
#   git add assets/img/evolution/
#   git commit -m "Add Evolution-page photos from Wikimedia Commons (CC-BY/CC-BY-SA)"
#   git push

set -euo pipefail

OUT_DIR="assets/img/evolution"
mkdir -p "$OUT_DIR"

MIN_BYTES=20000   # < 20KB = error page, not a real photo (line-art originals can be small)
DELAY=4           # seconds between downloads — avoids Wikimedia 429 rate limit
UA="Mozilla/5.0 (compatible; MaldivesCetaceans/1.0; +https://github.com/samrao20/Cetacean_tracking-)"

# ── slug → Wikimedia Commons filename ──────────────────────────────────────
# These slugs match the <img src="assets/img/evolution/<slug>.jpg"> paths
# already wired into evolution.html. The 4 remaining slots (baleen-vs-teeth,
# echolocation, blubber, maldives-today) intentionally keep their inline-SVG
# fallback for now — add a line below to fill one in later.
PAIRS=(
  "pakicetus|Pakicetus BW.jpg"
  "indohyus|Indohyus BW.jpg"
  "ambulocetus|Ambulocetus BW.jpg"
  "basilosaurus|Basilosaurus.jpg"
  "tail-fluke|Humpback whale (Megaptera novaeangliae) Eyjafjordur fluke 14 of 23.jpg"
  "blowhole|Dusky Dolphin on the surface.jpg"
  # "baleen-vs-teeth|<Commons filename>.jpg"
  # "echolocation|<Commons filename>.jpg"
  # "blubber|<Commons filename>.jpg"
  # "maldives-today|<Commons filename>.jpg"
)

wikimedia_url() {
  local filename="$1"
  local encoded
  encoded=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$filename")
  curl -s --max-time 15 -A "$UA" \
    "https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encoded}&prop=imageinfo&iiprop=url&format=json" \
  | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    page = list(d['query']['pages'].values())[0]
    print(page.get('imageinfo', [{}])[0].get('url', ''))
except Exception:
    print('')
"
}

download_url() {
  local slug="$1"
  local img_url="$2"
  local out="${OUT_DIR}/${slug}.jpg"

  for attempt in 1 2 3; do
    local http_code
    http_code=$(curl -L --silent --show-error --max-time 90 \
      --write-out "%{http_code}" \
      -A "$UA" \
      -o "$out" "$img_url")

    if [ "$http_code" -eq 429 ]; then
      echo "    rate limited (429), waiting 15s before retry $attempt/3..."
      rm -f "$out"
      sleep 15
      continue
    fi

    if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 400 ]; then
      rm -f "$out"; return 1
    fi

    local size; size=$(wc -c < "$out")
    if [ "$size" -lt "$MIN_BYTES" ]; then
      rm -f "$out"; return 1
    fi

    echo "  ✓ saved: $slug ($(( size / 1024 ))KB)"
    return 0
  done

  rm -f "$out"; return 1
}

download() {
  local slug="$1"; shift
  local out="${OUT_DIR}/${slug}.jpg"

  if [ -f "$out" ]; then
    local size; size=$(wc -c < "$out")
    if [ "$size" -gt "$MIN_BYTES" ]; then
      echo "  ✓ already exists: $slug ($(( size / 1024 ))KB)"
      return 0
    fi
    rm "$out"
  fi

  for filename in "$@"; do
    echo "  looking up: $filename"
    local img_url
    img_url=$(wikimedia_url "$filename")

    if [ -z "$img_url" ]; then
      continue
    fi

    echo "  downloading: $img_url"
    if download_url "$slug" "$img_url"; then
      sleep "$DELAY"
      return 0
    fi
    echo "    download failed, trying next filename..."
  done

  echo "  ✗ FAILED: $slug"
  return 0
}

echo "Downloading Evolution photos into ${OUT_DIR}/ (${DELAY}s delay between each)..."
echo ""

for pair in "${PAIRS[@]}"; do
  slug="${pair%%|*}"
  fname="${pair#*|}"
  download "$slug" "$fname"
done

# ── Write credits.json (required CC attribution) ────────────────────────────
# evolution.html reads this to render the credit caption under each photo. We
# pull Artist / LicenseShortName / LicenseUrl + the file page URL straight from
# the Commons API so the attribution is authoritative rather than hand-typed.
echo ""
echo "Fetching attribution → ${OUT_DIR}/credits.json ..."
printf '%s\n' "${PAIRS[@]}" | python3 - "$OUT_DIR" <<'PY' || echo "  ! credits.json generation failed (run again when Wikimedia is reachable)"
import sys, os, re, json, urllib.parse, urllib.request

out_dir = sys.argv[1]
pairs = []
for line in sys.stdin:
    line = line.strip()
    if not line or line.startswith('#'):
        continue
    slug, _, fname = line.partition('|')
    pairs.append((slug.strip(), fname.strip()))

# Only credit images that actually downloaded.
pairs = [(s, f) for (s, f) in pairs if os.path.exists(os.path.join(out_dir, s + '.jpg'))]
if not pairs:
    print("  (no downloaded images to credit)")
    raise SystemExit(0)

UA = "Mozilla/5.0 (compatible; MaldivesCetaceans/1.0; +https://github.com/samrao20/Cetacean_tracking-)"
titles = "|".join("File:" + f for f in (f for _, f in pairs))
api = ("https://commons.wikimedia.org/w/api.php?action=query&titles="
       + urllib.parse.quote(titles)
       + "&prop=imageinfo&iiprop=url|extmetadata&format=json")
req = urllib.request.Request(api, headers={"User-Agent": UA})
data = json.load(urllib.request.urlopen(req, timeout=30))

def norm(t):
    return t.replace("File:", "").replace("_", " ").strip()

def strip_html(s):
    s = re.sub(r"<[^>]+>", "", s or "")
    return re.sub(r"\s+", " ", s).strip()

by_title = {}
for page in data.get("query", {}).get("pages", {}).values():
    ii = (page.get("imageinfo") or [{}])[0]
    by_title[norm(page.get("title", ""))] = ii

credits = {}
for slug, fname in pairs:
    ii = by_title.get(norm("File:" + fname), {})
    em = ii.get("extmetadata", {})
    def g(k):
        return (em.get(k, {}) or {}).get("value", "")
    credits[slug] = {
        "author": strip_html(g("Artist")) or "Unknown",
        "license": strip_html(g("LicenseShortName")) or "see source",
        "license_url": g("LicenseUrl") or "",
        "source_url": ii.get("descriptionurl", "")
                      or ("https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(fname.replace(" ", "_"))),
    }

with open(os.path.join(out_dir, "credits.json"), "w") as fh:
    json.dump(credits, fh, indent=2, ensure_ascii=False)
    fh.write("\n")

for slug, c in credits.items():
    print(f"  {slug}: {c['author']} — {c['license']}")
PY

echo ""
echo "─────────────────────────────────────────"
echo "Results:"
echo ""
ls -lh "${OUT_DIR}"/*.jpg 2>/dev/null | awk '{print "  "$5, $9}' || echo "  (no .jpg files)"
echo ""
TOTAL=$(ls "${OUT_DIR}"/*.jpg 2>/dev/null | wc -l || echo 0)
echo "  $TOTAL photos downloaded"
echo ""
echo "Next steps:"
echo "  git add ${OUT_DIR}/"
echo "  git commit -m 'Add Evolution-page photos from Wikimedia Commons'"
echo "  git push"
