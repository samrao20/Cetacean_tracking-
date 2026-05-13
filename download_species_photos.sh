#!/usr/bin/env bash
# Download all species photos into assets/species/
# Requires: curl, python3 (both available in GitHub Codespaces)
# Usage: bash download_species_photos.sh
#
# Uses the Wikimedia Commons API to resolve direct CDN URLs — more reliable
# than Special:FilePath redirects.
#
# After running, commit the downloaded files:
#   git add assets/species/*.jpg
#   git commit -m "Add real species photos from Wikimedia Commons (CC-BY/public domain)"

set -euo pipefail
mkdir -p assets/species

MIN_BYTES=50000  # anything under 50KB is almost certainly an error page

# Resolve a Wikimedia Commons filename to its direct CDN URL via the API.
# Prints the URL, or empty string if not found.
wikimedia_url() {
  local filename="$1"
  local encoded
  encoded=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$filename")
  local api="https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encoded}&prop=imageinfo&iiprop=url&format=json"
  curl -s --max-time 15 \
    -A "Mozilla/5.0 (compatible; MaldivesCetaceans/1.0; +https://github.com/samrao20/Cetacean_tracking-)" \
    "$api" \
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

# Download a species photo.
# $1 = output slug  $2... = Wikimedia Commons filenames to try (in order)
download() {
  local slug="$1"; shift
  local out="assets/species/${slug}.jpg"

  # Skip if a real file already exists
  if [ -f "$out" ]; then
    local size; size=$(wc -c < "$out")
    if [ "$size" -gt "$MIN_BYTES" ]; then
      echo "  ✓ already exists: $slug (${size} bytes)"
      return 0
    fi
    echo "  replacing bad file: $slug (${size} bytes)"
    rm "$out"
  fi

  # Try each candidate filename in order
  for filename in "$@"; do
    echo "  looking up: $filename"
    local img_url
    img_url=$(wikimedia_url "$filename")

    if [ -z "$img_url" ]; then
      echo "    not found via API, trying next..."
      continue
    fi

    echo "  downloading from: $img_url"
    local http_code
    http_code=$(curl -L --silent --show-error --max-time 60 \
      --write-out "%{http_code}" \
      -A "Mozilla/5.0 (compatible; MaldivesCetaceans/1.0)" \
      -o "$out" "$img_url")

    if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 400 ]; then
      echo "    HTTP $http_code — trying next filename..."
      rm -f "$out"
      continue
    fi

    local size; size=$(wc -c < "$out")
    if [ "$size" -lt "$MIN_BYTES" ]; then
      echo "    only ${size} bytes — likely an error page, trying next..."
      rm -f "$out"
      continue
    fi

    echo "  ✓ saved: $slug (${size} bytes)"
    return 0
  done

  echo "  ✗ FAILED: $slug — no working source found. Add manually (see assets/species/README.md)"
  return 0  # don't abort the whole script for one missing photo
}

echo "Downloading species photos into assets/species/ ..."
echo "(Using Wikimedia Commons API — this may take a minute)"
echo ""

# ── Dolphins ──────────────────────────────────────────────────────────────────
download "spinner-dolphin" \
  "Spinner dolphins in the Pacific Ocean.jpg" \
  "Spinner_dolphin_jump.jpg"

download "indo-pacific-bottlenose-dolphin" \
  "CSIRO ScienceImage 2992 Indo-Pacific Bottlenose Dolphin.jpg" \
  "Tursiops aduncus.jpg"

download "common-bottlenose-dolphin" \
  "Bottlenose Dolphin KSC04pd0178.jpg" \
  "Tursiops truncatus 01.jpg"

download "pantropical-spotted-dolphin" \
  "Pantropical spotted dolphins.jpg" \
  "Stenella attenuata.jpg"

download "striped-dolphin" \
  "Stenella coeruleoalba cropped.jpg" \
  "Striped dolphin 1.jpg"

download "rissos-dolphin" \
  "Grampus griseus NOAA.jpg" \
  "Risso's dolphin (Grampus griseus).jpg"

download "frasers-dolphin" \
  "Lagenodelphis hosei noaa.jpg" \
  "Fraser's dolphin.jpg"

download "rough-toothed-dolphin" \
  "Steno bredanensis noaa.jpg" \
  "Rough-toothed dolphin.jpg"

download "killer-whale" \
  "Killerwhales jumping.jpg" \
  "Orca breaching.jpg" \
  "Killer whale NOAA.jpg"

download "short-finned-pilot-whale" \
  "ShortFinnedPilotWhale.jpg" \
  "Pilot whale short-finned noaa.jpg"

download "false-killer-whale" \
  "False killer whales off Kona, Hawaii.jpg" \
  "False killer whale noaa.jpg"

download "pygmy-killer-whale" \
  "Feresa attenuata noaa.jpg" \
  "Pygmy killer whale.jpg"

download "melon-headed-whale" \
  "Melon headed whale noaa.jpg" \
  "Peponocephala electra noaa.jpg"

# ── Whales ────────────────────────────────────────────────────────────────────
download "blue-whale" \
  "Blue whale NOAA.jpg" \
  "Balaenoptera musculus.jpg"

download "brydes-whale" \
  "Brydes whale blowing.jpg" \
  "Balaenoptera edeni.jpg"

download "humpback-whale" \
  "Humpback whale NOAA.jpg" \
  "Megaptera novaeangliae breaching.jpg"

download "sperm-whale" \
  "Sperm whale3.jpg" \
  "Sperm whale noaa.jpg" \
  "Physeter macrocephalus.jpg"

download "dwarf-sperm-whale" \
  "Kogia sima noaa.jpg" \
  "Dwarf sperm whale.jpg"

download "cuviers-beaked-whale" \
  "Cuvier's beaked whale noaa.jpg" \
  "Ziphius cavirostris.jpg"

download "longmans-beaked-whale" \
  "IndoPacificBeakedWhale noaa.jpg" \
  "Indopacetus pacificus.jpg"

download "blainvilles-beaked-whale" \
  "Blainville's beaked whale noaa.jpg" \
  "Mesoplodon densirostris.jpg"

download "deraniyagalas-beaked-whale" \
  "Mesoplodon hotaula.jpg" \
  "Deraniyagala's beaked whale.jpg"

echo ""
echo "─────────────────────────────────────────"
echo "Done. Results in assets/species/"
ls -lh assets/species/*.jpg 2>/dev/null || echo "(no .jpg files yet)"
echo ""
echo "Any species marked ✗ FAILED need photos added manually."
echo "See assets/species/README.md for the expected filenames."
echo ""
echo "When happy with the results:"
echo "  git add assets/species/*.jpg"
echo "  git commit -m 'Add real species photos from Wikimedia Commons'"
echo "  git push"
