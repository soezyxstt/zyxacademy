#!/usr/bin/env bash
set -euo pipefail
output=artifacts/native-parity/ios
mkdir -p "$output" "$HOME/.expo"
device=$(xcrun simctl list devices available -j | python -c 'import json,sys; print(next(d["udid"] for devices in reversed(list(json.load(sys.stdin)["devices"].values())) for d in devices if d["name"] == "iPhone 17 Pro"))')
xcrun simctl boot "$device"
xcrun simctl bootstatus "$device" -b
cd apps/mobile-native
npx --no-install expo run:ios --configuration Release --device "$device" --no-bundler
cd ../..
for attempt in {1..45}; do
  xcrun simctl io "$device" screenshot "$output/frame.png"
  if python scripts/native-parity/compare.py "$output/frame.png" 3 --ready; then
    python scripts/native-parity/compare.py "$output/frame.png" 3
    exit 0
  fi
  sleep 2
done
exit 1
