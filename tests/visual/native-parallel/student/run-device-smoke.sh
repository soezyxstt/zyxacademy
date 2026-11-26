#!/usr/bin/env bash
set -euo pipefail
platform=$1
device=$2
scripts=$(dirname "${BASH_SOURCE[0]}")

status=0
bash "$scripts/run-maestro.sh" "$platform" "$device" || status=1
if [[ "$platform" == android ]]; then
  timeout 45s adb -s "$device" wait-for-device
fi
bash "$scripts/run-generated-smoke.sh" "$platform" "$device" || status=1
exit "$status"
