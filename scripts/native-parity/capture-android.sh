#!/usr/bin/env bash
set -euo pipefail
output=artifacts/native-parity/android
mkdir -p "$output"
adb shell wm density 160
adb shell wm size 380x820
adb shell settings put system font_scale 1
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
adb install apps/mobile-native/android/app/build/outputs/apk/release/app-release.apk
adb shell am start -W -n com.zyx.academy.nativeparity/.MainActivity
for attempt in {1..45}; do
  adb exec-out screencap -p > "$output/frame.png"
  if python scripts/native-parity/compare.py "$output/frame.png" 1 --ready; then
    python scripts/native-parity/compare.py "$output/frame.png" 1
    exit 0
  fi
  sleep 2
done
adb logcat -d -s ReactNativeJS AndroidRuntime | tail -80
exit 1
