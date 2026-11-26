#!/usr/bin/env bash
set -euo pipefail

device_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$device_dir/../../../../.." && pwd)
platform=${SHARED_PLATFORM:?Set SHARED_PLATFORM to android or ios}
device=${SHARED_DEVICE:?Set SHARED_DEVICE to a booted emulator serial or simulator UDID}
app_id=com.zyx.academy.nativeparity
out="$repo_root/artifacts/native-parity/shared-ui/$platform/phone/accessibility"

case "$platform" in
  android) dependencies=(adb maestro) ;;
  ios) dependencies=(xcrun maestro) ;;
  *) printf 'Unsupported SHARED_PLATFORM: %s\n' "$platform" >&2; exit 2 ;;
esac
for dependency in "${dependencies[@]}"; do
  if ! command -v "$dependency" >/dev/null; then
    printf 'Missing dependency: %s\n' "$dependency" >&2
    exit 2
  fi
done

export MAESTRO_CLI_NO_ANALYTICS=true
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
maestro_device=(maestro --platform "$platform" --device "$device")
adb_device=(adb -s "$device")

android_locale() {
  local result
  result=$("${adb_device[@]}" shell cmd locale get-app-locales "$app_id" --user "$android_user")
  if [[ "$result" =~ \[([[:alnum:],-]*)\] ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  else
    printf 'Could not read Android application locale: %s\n' "$result" >&2
    return 1
  fi
}

ios_text_size() {
  local setting
  setting=$(xcrun simctl ui "$device" content_size)
  setting=$(printf '%s\n' "$setting" | awk 'NF { value = $NF } END { print tolower(value) }')
  case "$setting" in
    extra-small|small|medium|large|extra-large|extra-extra-large|extra-extra-extra-large|accessibility-medium|accessibility-large|accessibility-extra-large|accessibility-extra-extra-large|accessibility-extra-extra-extra-large)
      printf '%s\n' "$setting"
      ;;
    *) printf 'Could not read the simulator Dynamic Type category: %s\n' "$setting" >&2; return 1 ;;
  esac
}

restore_settings() {
  local status=$? failure=0
  trap - EXIT
  if [[ "$platform" == android ]]; then
    if [[ "$original_scale" == null ]]; then
      "${adb_device[@]}" shell settings --user "$android_user" delete system font_scale || failure=1
    else
      "${adb_device[@]}" shell settings --user "$android_user" put system font_scale "$original_scale" || failure=1
    fi
    if [[ -n "$original_locale" ]]; then
      "${adb_device[@]}" shell cmd locale set-app-locales "$app_id" --user "$android_user" --locales "$original_locale" || failure=1
    else
      "${adb_device[@]}" shell cmd locale set-app-locales "$app_id" --user "$android_user" || failure=1
    fi
    [[ $(android_locale) == "$original_locale" ]] || failure=1
    [[ $("${adb_device[@]}" shell settings --user "$android_user" get system font_scale | tr -d '\r') == "$original_scale" ]] || failure=1
    "${adb_device[@]}" shell am force-stop --user "$android_user" "$app_id" || failure=1
  else
    # The locale override belongs to the app process, so the next launch inherits the simulator locale.
    if [[ "${ios_launched:-0}" == 1 ]]; then
      xcrun simctl launch --terminate-running-process "$device" "$app_id" || failure=1
    fi
    xcrun simctl ui "$device" content_size "$original_scale" || failure=1
    [[ $(ios_text_size) == "$original_scale" ]] || failure=1
  fi
  if ((failure != 0)); then
    printf 'Could not verify restoration of the original device settings.\n' >&2
    exit 1
  fi
  exit "$status"
}

if [[ "$platform" == android ]]; then
  if [[ "$device" != emulator-* || $("${adb_device[@]}" get-state) != device ]]; then
    printf 'Select a running Android emulator by serial.\n' >&2
    exit 2
  fi
  android_user=$("${adb_device[@]}" shell am get-current-user | tr -d '\r')
  [[ "$android_user" =~ ^[0-9]+$ ]]
  original_scale=$("${adb_device[@]}" shell settings --user "$android_user" get system font_scale | tr -d '\r')
  [[ "$original_scale" == null || "$original_scale" =~ ^[0-9]+(\.[0-9]+)?$ ]]
  original_locale=$(android_locale)
else
  if [[ ! "$device" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$ ]]; then
    printf 'Select a booted iOS simulator by explicit UDID.\n' >&2
    exit 2
  fi
  original_scale=$(ios_text_size)
fi

trap restore_settings EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$out"
rm -f -- "$out/report.xml" "$out/hierarchy.json" "$out/large-text.png" "$out/configuration.txt"
if [[ "$platform" == android ]]; then
  "${adb_device[@]}" shell settings --user "$android_user" put system font_scale 1.3
  "${adb_device[@]}" shell cmd locale set-app-locales "$app_id" --user "$android_user" --locales id-ID
  text_size=$("${adb_device[@]}" shell settings --user "$android_user" get system font_scale | tr -d '\r')
  locale=$(android_locale)
  [[ "$text_size" == 1.3 && "$locale" == id-ID ]]
  "${adb_device[@]}" shell am force-stop --user "$android_user" "$app_id"
  launch=$("${adb_device[@]}" shell am start -W --user "$android_user" -n "$app_id/.MainActivity")
  if [[ ! "$launch" =~ Status:[[:space:]]+ok ]]; then
    printf '%s\n' "$launch" >&2
    exit 1
  fi
else
  text_size=extra-extra-extra-large
  locale=id_ID
  xcrun simctl ui "$device" content_size "$text_size"
  [[ $(ios_text_size) == "$text_size" ]]
  ios_launched=1
  xcrun simctl launch --terminate-running-process "$device" "$app_id" -AppleLanguages '(id)' -AppleLocale "$locale"
fi

printf 'Platform: %s\nDevice: %s\nOriginal text size: %s\nTest text size: %s\nApplication locale override: %s\n' \
  "$platform" "$device" "$original_scale" "$text_size" "$locale" > "$out/configuration.txt"

status=0
"${maestro_device[@]}" test --format junit --output "$out/report.xml" \
  --test-output-dir "$out/results" --debug-output "$out/logs" "$device_dir/ci-accessibility.yaml" || status=1
"${maestro_device[@]}" hierarchy > "$out/hierarchy.json" || status=1
if [[ "$platform" == android ]]; then
  "${adb_device[@]}" exec-out screencap -p > "$out/large-text.png" || status=1
else
  xcrun simctl io "$device" screenshot "$out/large-text.png" || status=1
fi
exit "$status"
