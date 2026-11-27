#!/usr/bin/env bash
set -euo pipefail

destination=$1
# Use the official release archive without modifying the runner's shell profiles.
version=2.12.1
sha256=54dbb0716425626604973cbb374c585ca30272375d9ce15177a1152765ddd9d7
(
  cd "$destination"
  curl --fail --silent --show-error --location --retry 3 --connect-timeout 10 --max-time 300 \
    --output maestro.zip "https://github.com/mobile-dev-inc/maestro/releases/download/cli-$version/maestro.zip"
  printf '%s  maestro.zip\n' "$sha256" | shasum -a 256 -c -
  unzip -q maestro.zip
)
