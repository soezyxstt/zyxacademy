#!/usr/bin/env bash
set -euo pipefail
output=artifacts/native-parity/android
mkdir -p "$output"
adb shell wm density 160
adb shell wm size 380x820
adb shell settings put system font_scale 1
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb install apps/mobile-native/android/app/build/outputs/apk/release/app-release.apk
adb shell am start -W -n com.zyx.academy.nativeparity/.MainActivity
if [[ ${1:-} == product ]]; then
  exec bash scripts/native-parity/check-interactions.sh android "$(adb get-serialno)" product
fi
status=0
python scripts/native-parity/capture-gallery.py android || status=1
bash scripts/native-parity/check-interactions.sh android "$(adb get-serialno)" || status=1
python scripts/native-parity/compare-directory.py android || status=1
if [[ ${EXPO_PUBLIC_PARITY_WEBVIEW:-} == 1 ]]; then
  python scripts/native-parity/capture-webview.py android || status=1
fi
exit "$status"
