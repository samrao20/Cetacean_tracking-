#!/usr/bin/env bash
# Downloads a free public-domain ocean/cetacean video for the hero background.
# Requires: curl
# Usage: bash download_hero_video.sh

set -e
mkdir -p assets/video

OUT="assets/video/hero.mp4"

if [ -f "$OUT" ]; then
  echo "Hero video already exists at $OUT — delete it first to re-download."
  exit 0
fi

echo "Downloading hero video from Wikimedia Commons..."

# Blue whale surfacing — NOAA, public domain
# Source: https://commons.wikimedia.org/wiki/File:Blue_whale_-_NOAA.webm
curl -L --silent --show-error \
  -A "MaldivesCetaceans/1.0 (citizen science; contact via GitHub)" \
  -o "assets/video/hero.webm" \
  "https://commons.wikimedia.org/wiki/Special:FilePath/Blue_whale_-_NOAA.webm"

echo "Saved: assets/video/hero.webm"
echo ""
echo "The site will use hero.webm automatically."
echo ""
echo "If you prefer an MP4 and have ffmpeg installed, convert with:"
echo "  ffmpeg -i assets/video/hero.webm -c:v libx264 -crf 23 -an assets/video/hero.mp4"
echo ""
echo "────────────────────────────────────────────────────────────────"
echo "ALTERNATIVE: Better-looking footage from free stock sites"
echo "────────────────────────────────────────────────────────────────"
echo "  Pexels (free, no account needed for download):"
echo "    https://www.pexels.com/search/videos/ocean%20dolphin/"
echo "  Pixabay (free, no account needed):"
echo "    https://pixabay.com/videos/search/whale/"
echo ""
echo "Download any video, rename it to 'hero.mp4' and put it in assets/video/"
echo "The hero will switch to it automatically on next page load."
