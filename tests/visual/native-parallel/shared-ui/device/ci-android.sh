#!/usr/bin/env bash
set -euo pipefail

device_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
root=$(cd -- "$device_dir/../../../../.." && pwd)

apk=${1:-${SHARED_APK:-"$root/apps/mobile-native/android/app/build/outputs/apk/release/app-release.apk"}}
app_id=com.zyx.academy.nativeparity
if [[ "$apk" != /* ]]; then
  apk="$PWD/$apk"
fi
if [[ $# -gt 1 || ! -f "$apk" ]]; then
  printf 'Usage: %s [path-to-release.apk]\nAPK not available: %s\n' "$0" "$apk" >&2
  exit 2
fi

for dependency in adb maestro python3; do
  if ! command -v "$dependency" >/dev/null; then
    echo "Missing Android device runner dependency: $dependency" >&2
    exit 2
  fi
done

if ! SHARED_DEVICE=${SHARED_DEVICE:-${ANDROID_SERIAL:-$(adb -e get-serialno)}} \
  || [[ "$SHARED_DEVICE" != emulator-* || $(adb -s "$SHARED_DEVICE" get-state) != device ]]; then
  printf 'Select a running Android emulator with SHARED_DEVICE. Received: %s\n' "$SHARED_DEVICE" >&2
  exit 2
fi
export SHARED_DEVICE
export SHARED_PLATFORM=android
export MAESTRO_CLI_NO_ANALYTICS=true
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

cd "$root"
adb_device=(adb -s "$SHARED_DEVICE")
"${adb_device[@]}" shell wm user-rotation lock 0
"${adb_device[@]}" shell settings put system font_scale 1
"${adb_device[@]}" shell input keyevent KEYCODE_WAKEUP
"${adb_device[@]}" shell wm dismiss-keyguard
"${adb_device[@]}" shell settings put global window_animation_scale 0
"${adb_device[@]}" shell settings put global transition_animation_scale 0
"${adb_device[@]}" shell settings put global animator_duration_scale 0
"${adb_device[@]}" install -r "$apk"
"${adb_device[@]}" shell cmd locale set-app-locales "$app_id" --user 0 --locales id-ID

flows="$root/.maestro/native-parallel/shared-ui"
status=0
for group in phone tablet wide; do
  case "$group" in
    phone)
      physical_size=760x1600
      density=320
      group_flows=("$flows"/*.yaml)
      ;;
    tablet)
      physical_size=1536x1680
      density=320
      group_flows=("$flows"/data-wide/*.yaml)
      ;;
    wide)
      # Android clamps overrides above the emulator's maximum display width.
      physical_size=1024x840
      density=160
      group_flows=("$flows"/layout-wide/*.yaml)
      ;;
  esac

  echo "Android shared UI: $group ($physical_size at $density dpi)"
  if ! "${adb_device[@]}" shell wm density "$density" \
    || ! "${adb_device[@]}" shell wm size "$physical_size" \
    || ! "${adb_device[@]}" shell am force-stop "$app_id" \
    || ! launch=$("${adb_device[@]}" shell am start -W -n "$app_id/.MainActivity"); then
    echo "Could not start the Android build for $group." >&2
    status=1
    continue
  fi
  printf '%s\n' "$launch"
  if [[ ! "$launch" =~ Status:[[:space:]]+ok ]]; then
    echo "Android did not report a successful launch for $group." >&2
    status=1
    continue
  fi

  if ! density_output=$("${adb_device[@]}" shell wm density) \
    || [[ $(awk '/^(Physical|Override) density:/ { density = $3 } END { print density }' \
      <<< "${density_output//$'\r'/}") != "$density" ]]; then
    printf 'Unexpected Android density for %s (expected %s dpi):\n%s\n' "$group" "$density" "$density_output" >&2
    status=1
    continue
  fi

  actual_size=
  for ((attempt = 0; attempt < 10; attempt++)); do
    actual_size=$("${adb_device[@]}" exec-out screencap -p \
      | python3 -c 'import sys; from PIL import Image; print("{}x{}".format(*Image.open(sys.stdin.buffer).size))') \
      || actual_size=
    if [[ "$actual_size" == "$physical_size" ]]; then
      break
    fi
    sleep 1
  done
  if [[ "$actual_size" != "$physical_size" ]]; then
    printf 'Unexpected Android screenshot size for %s (expected %s, received %s).\n' \
      "$group" "$physical_size" "${actual_size:-none}" >&2
    status=1
    continue
  fi

  interactions="$root/artifacts/native-parity/shared-ui/android/$group/interactions"
  mkdir -p "$interactions"
  maestro --platform android --device "$SHARED_DEVICE" test \
    --format junit --output "$interactions/report.xml" \
    --test-output-dir "$interactions/results" --debug-output "$interactions/logs" \
    "${group_flows[@]}" || status=1
  SHARED_GROUP=$group bash "$device_dir/ci-evidence.sh" || status=1
done

exit "$status"
