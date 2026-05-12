#!/usr/bin/env bash
# Run this once to download all species photos into assets/img/species/
# Requires: curl
# Usage: bash download_species_photos.sh

set -e
mkdir -p assets/img/species

download() {
  local slug="$1"
  local url="$2"
  local out="assets/img/species/${slug}.jpg"
  if [ -f "$out" ]; then
    echo "  already exists: $out"
    return
  fi
  echo "  downloading $slug..."
  curl -L --silent --show-error \
    -A "MaldivesCetaceans/1.0 (citizen science; contact via GitHub)" \
    -o "$out" "$url"
  echo "  saved: $out"
}

echo "Downloading species photos..."

download "spinner-dolphin"              "https://commons.wikimedia.org/wiki/Special:FilePath/Spinner_dolphins_in_the_Pacific_Ocean.jpg"
download "bottlenose-dolphin"           "https://commons.wikimedia.org/wiki/Special:FilePath/Bottlenose_Dolphin_KSC04pd0178.jpg"
download "indo-pacific-bottlenose-dolphin" "https://commons.wikimedia.org/wiki/Special:FilePath/CSIRO_ScienceImage_2992_Indo-Pacific_Bottlenose_Dolphin.jpg"
download "pantropical-spotted-dolphin"  "https://commons.wikimedia.org/wiki/Special:FilePath/Pantropical_spotted_dolphins.jpg"
download "rissos-dolphin"               "https://commons.wikimedia.org/wiki/Special:FilePath/Grampus_griseus_NOAA.jpg"
download "frasers-dolphin"              "https://commons.wikimedia.org/wiki/Special:FilePath/Lagenodelphis_hosei_noaa.jpg"
download "striped-dolphin"              "https://commons.wikimedia.org/wiki/Special:FilePath/Stenella_coeruleoalba_cropped.jpg"
download "rough-toothed-dolphin"        "https://commons.wikimedia.org/wiki/Special:FilePath/Steno_bredanensis_noaa.jpg"
download "short-finned-pilot-whale"     "https://commons.wikimedia.org/wiki/Special:FilePath/ShortFinnedPilotWhale.jpg"
download "false-killer-whale"           "https://commons.wikimedia.org/wiki/Special:FilePath/False_killer_whales_off_Kona,_Hawaii.jpg"
download "melon-headed-whale"           "https://commons.wikimedia.org/wiki/Special:FilePath/Melon_headed_whale_noaa.jpg"
download "sperm-whale"                  "https://commons.wikimedia.org/wiki/Special:FilePath/Sperm_whale3.jpg"
download "brydes-whale"                 "https://commons.wikimedia.org/wiki/Special:FilePath/Brydes_whale_blowing.jpg"
download "blue-whale"                   "https://commons.wikimedia.org/wiki/Special:FilePath/Blue_whale_NOAA.jpg"
download "dwarf-sperm-whale"            "https://commons.wikimedia.org/wiki/Special:FilePath/Kogia_sima_noaa.jpg"
download "pygmy-killer-whale"           "https://commons.wikimedia.org/wiki/Special:FilePath/Feresa_attenuata_noaa.jpg"

echo ""
echo "Done. Check assets/img/species/ for downloaded files."
echo "If any file is tiny (<5KB) it probably failed — check the URL manually on Wikimedia Commons."
