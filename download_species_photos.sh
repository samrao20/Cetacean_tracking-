#!/usr/bin/env bash
# Download all species photos into assets/species/
# Requires: curl, python3 (both available in GitHub Codespaces)
# Usage: bash download_species_photos.sh
#
# After running, commit:
#   git add assets/species/*.jpg
#   git commit -m "Add real species photos from Wikimedia Commons (CC-BY/public domain)"
#   git push

set -euo pipefail
mkdir -p assets/species

MIN_BYTES=50000   # < 50KB = error page, not a real photo
DELAY=4           # seconds between downloads — avoids Wikimedia 429 rate limit

wikimedia_url() {
  local filename="$1"
  local encoded
  encoded=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$filename")
  curl -s --max-time 15 \
    -A "Mozilla/5.0 (compatible; MaldivesCetaceans/1.0; +https://github.com/samrao20/Cetacean_tracking-)" \
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
  local out="assets/species/${slug}.jpg"

  for attempt in 1 2 3; do
    local http_code
    http_code=$(curl -L --silent --show-error --max-time 90 \
      --write-out "%{http_code}" \
      -A "Mozilla/5.0 (compatible; MaldivesCetaceans/1.0)" \
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
  local out="assets/species/${slug}.jpg"

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

echo "Downloading species photos (${DELAY}s delay between each to avoid rate limits)..."
echo ""

# ── Dolphins ──────────────────────────────────────────────────────────────────
download "spinner-dolphin" \
  "Spinner dolphin edit.jpg" \
  "Stenella longirostris.jpg" \
  "Spinner Dolphin Stellwagen edit.jpg"

download "indo-pacific-bottlenose-dolphin" \
  "CSIRO ScienceImage 2992 Indo-Pacific Bottlenose Dolphin.jpg" \
  "Tursiops aduncus 01.jpg" \
  "Indo-pacific bottlenose dolphin cropped.jpg"

download "common-bottlenose-dolphin" \
  "Bottlenose Dolphin KSC04pd0178.jpg" \
  "Tursiops truncatus 01.jpg" \
  "Bottlenose dolphin size.jpg"

download "pantropical-spotted-dolphin" \
  "Pantropical spotted dolphin.jpg" \
  "Stenella attenuata.jpg" \
  "Pantropical Spotted Dolphins NOAA.jpg"

download "striped-dolphin" \
  "Stenella coeruleoalba.jpg" \
  "Striped dolphin.jpg" \
  "Stripedbody.jpg"

download "rissos-dolphin" \
  "Risso's dolphin.jpg" \
  "Grampus griseus.jpg" \
  "Risso dolphin pacific.jpg"

download "frasers-dolphin" \
  "Fraser's Dolphin noaa.jpg" \
  "Lagenodelphis hosei.jpg" \
  "Frasers dolphin noaa.jpg"

download "rough-toothed-dolphin" \
  "Steno bredanensis.jpg" \
  "Rough toothed dolphin.jpg" \
  "Rough-toothed dolphin noaa.jpg"

download "killer-whale" \
  "Killerwhales jumping.jpg" \
  "Orca breaching.jpg"

download "short-finned-pilot-whale" \
  "Globicephala macrorhynchus noaa.jpg" \
  "Shortfinnedpilotwhale.jpg" \
  "ShortFinnedPilotWhale.jpg" \
  "Globicephala macrorhynchus.jpg"

download "false-killer-whale" \
  "False killer whale noaa.jpg" \
  "False killer whale.jpg" \
  "Pseudorca crassidens noaa.jpg"

download "pygmy-killer-whale" \
  "Feresa attenuata.jpg" \
  "Pygmy killer whale noaa.jpg"

download "melon-headed-whale" \
  "Peponocephala electra.jpg" \
  "Melon-headed whale.jpg" \
  "Melonheadedwhale noaa.jpg"

# ── Whales ────────────────────────────────────────────────────────────────────
download "blue-whale" \
  "Balaenoptera musculus.jpg" \
  "Blue whale NOAA.jpg"

download "brydes-whale" \
  "Balaenoptera edeni.jpg" \
  "Brydes whale blowing.jpg"

download "humpback-whale" \
  "Humpback whale NOAA.jpg" \
  "Humpback Whale underwater.jpg" \
  "Megaptera novaeangliae.jpg"

download "sperm-whale" \
  "Physeter macrocephalus.jpg" \
  "Sperm whale noaa.jpg" \
  "Sperm whale3.jpg"

download "dwarf-sperm-whale" \
  "Kogia sima.jpg" \
  "Kogia sima noaa.jpg" \
  "Dwarf sperm whale noaa.jpg"

download "cuviers-beaked-whale" \
  "Ziphius cavirostris.jpg" \
  "Cuvier's beaked whale noaa.jpg"

download "longmans-beaked-whale" \
  "Indopacetus pacificus.jpg" \
  "IndoPacificBeakedWhale noaa.jpg"

download "blainvilles-beaked-whale" \
  "Mesoplodon densirostris.jpg" \
  "Blainville's beaked whale noaa.jpg"

download "deraniyagalas-beaked-whale" \
  "Mesoplodon hotaula noaa.jpg" \
  "Mesoplodon ginkgodens noaa.jpg"

echo ""
echo "─────────────────────────────────────────"
echo "Results:"
echo ""
ls -lh assets/species/*.jpg 2>/dev/null | awk '{print "  "$5, $9}' || echo "  (no .jpg files)"
echo ""
TOTAL=$(ls assets/species/*.jpg 2>/dev/null | wc -l || echo 0)
echo "  $TOTAL / 22 photos downloaded"
echo ""
echo "Next steps:"
echo "  git add assets/species/*.jpg"
echo "  git commit -m 'Add real species photos from Wikimedia Commons'"
echo "  git push"
