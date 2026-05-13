#!/usr/bin/env bash
# Download all species photos into assets/species/
# Run this on your local machine (requires internet access + curl).
# Usage: bash download_species_photos.sh
#
# After running, commit the downloaded files:
#   git add assets/species/*.jpg
#   git commit -m "Add real species photos"

set -euo pipefail
mkdir -p assets/species

MIN_BYTES=50000  # anything under 50KB is probably an error page, not a photo

download() {
  local slug="$1"
  local url="$2"
  local out="assets/species/${slug}.jpg"

  if [ -f "$out" ]; then
    local size
    size=$(wc -c < "$out")
    if [ "$size" -gt "$MIN_BYTES" ]; then
      echo "  already exists: $out (${size} bytes)"
      return
    else
      echo "  replacing bad file: $out (only ${size} bytes — likely an error page)"
      rm "$out"
    fi
  fi

  echo "  downloading $slug..."
  local http_code
  http_code=$(curl -L --silent --show-error --write-out "%{http_code}" \
    -A "Mozilla/5.0 (compatible; MaldivesCetaceans/1.0; citizen-science)" \
    -H "Accept: image/jpeg,image/*" \
    -o "$out" "$url")

  if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 400 ]; then
    echo "  ERROR: HTTP $http_code for $slug — deleting bad file"
    rm -f "$out"
    return 1
  fi

  local size
  size=$(wc -c < "$out")
  if [ "$size" -lt "$MIN_BYTES" ]; then
    echo "  ERROR: $slug is only ${size} bytes after download — likely a block/error page, deleting"
    rm -f "$out"
    return 1
  fi

  echo "  saved: $out (${size} bytes)"
}

echo "Downloading species photos into assets/species/ ..."
echo ""

# ── Dolphins ──────────────────────────────────────────────────────────────────
download "spinner-dolphin"                  "https://commons.wikimedia.org/wiki/Special:FilePath/Spinner_dolphins_in_the_Pacific_Ocean.jpg"
download "indo-pacific-bottlenose-dolphin"  "https://commons.wikimedia.org/wiki/Special:FilePath/CSIRO_ScienceImage_2992_Indo-Pacific_Bottlenose_Dolphin.jpg"
download "common-bottlenose-dolphin"        "https://commons.wikimedia.org/wiki/Special:FilePath/Bottlenose_Dolphin_KSC04pd0178.jpg"
download "pantropical-spotted-dolphin"      "https://commons.wikimedia.org/wiki/Special:FilePath/Pantropical_spotted_dolphins.jpg"
download "striped-dolphin"                  "https://commons.wikimedia.org/wiki/Special:FilePath/Stenella_coeruleoalba_cropped.jpg"
download "rissos-dolphin"                   "https://commons.wikimedia.org/wiki/Special:FilePath/Grampus_griseus_NOAA.jpg"
download "frasers-dolphin"                  "https://commons.wikimedia.org/wiki/Special:FilePath/Lagenodelphis_hosei_noaa.jpg"
download "rough-toothed-dolphin"            "https://commons.wikimedia.org/wiki/Special:FilePath/Steno_bredanensis_noaa.jpg"
download "killer-whale"                     "https://commons.wikimedia.org/wiki/Special:FilePath/Killerwhales_jumping.jpg"
download "short-finned-pilot-whale"         "https://commons.wikimedia.org/wiki/Special:FilePath/ShortFinnedPilotWhale.jpg"
download "false-killer-whale"               "https://commons.wikimedia.org/wiki/Special:FilePath/False_killer_whales_off_Kona,_Hawaii.jpg"
download "pygmy-killer-whale"               "https://commons.wikimedia.org/wiki/Special:FilePath/Feresa_attenuata_noaa.jpg"
download "melon-headed-whale"               "https://commons.wikimedia.org/wiki/Special:FilePath/Melon_headed_whale_noaa.jpg"

# ── Whales ────────────────────────────────────────────────────────────────────
download "blue-whale"                       "https://commons.wikimedia.org/wiki/Special:FilePath/Blue_whale_NOAA.jpg"
download "brydes-whale"                     "https://commons.wikimedia.org/wiki/Special:FilePath/Brydes_whale_blowing.jpg"
download "humpback-whale"                   "https://commons.wikimedia.org/wiki/Special:FilePath/Humpback_whale_NOAA.jpg"
download "sperm-whale"                      "https://commons.wikimedia.org/wiki/Special:FilePath/Sperm_whale3.jpg"
download "dwarf-sperm-whale"                "https://commons.wikimedia.org/wiki/Special:FilePath/Kogia_sima_noaa.jpg"
download "cuviers-beaked-whale"             "https://commons.wikimedia.org/wiki/Special:FilePath/Cuvier%27s_beaked_whale_noaa.jpg"
download "longmans-beaked-whale"            "https://commons.wikimedia.org/wiki/Special:FilePath/IndoPacificBeakedWhale_noaa.jpg"
download "blainvilles-beaked-whale"         "https://commons.wikimedia.org/wiki/Special:FilePath/Blainville%27s_beaked_whale_noaa.jpg"
download "deraniyagalas-beaked-whale"       "https://commons.wikimedia.org/wiki/Special:FilePath/Mesoplodon_hotaula.jpg"

echo ""
echo "Done. Check assets/species/ for results."
echo "Any slug not listed above failed — add photos manually (see assets/species/README.md)."
echo ""
echo "After verifying the images look correct in a browser, commit them:"
echo "  git add assets/species/*.jpg"
echo "  git commit -m 'Add real species photos from Wikimedia Commons (CC-BY/public domain)'"
