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

for dependency in adb maestro python3 timeout; do
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

run_maestro() {
  local attempt_dir=$1
  shift
  mkdir -p "$attempt_dir" || return
  maestro --platform android --device "$SHARED_DEVICE" test \
    --format junit --output "$attempt_dir/report.xml" \
    --test-output-dir "$attempt_dir/results" --debug-output "$attempt_dir/logs" \
    "$@" 2>&1 | tee "$attempt_dir/console.log"
}

retryable_flows() {
  python3 - "$@" <<'PY'
import os
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

attempt = Path(sys.argv[1])
serial = re.escape(os.environ["SHARED_DEVICE"])
adb_transport = re.compile(
    rf"Command failed \(host:transport:{serial}\): device (?:offline|'{serial}' not found)"
)
command_error = "[ERROR] maestro.orchestra.Orchestra.executeCommands: [Command execution] "
driver_death = "maestro.android.DeviceServerDiedException"

try:
    report = ET.parse(attempt / "report.xml")
except (OSError, ET.ParseError) as error:
    sys.exit(f"Cannot classify failed Maestro flows: {error}")


def transport_failure(case, failure):
    message = failure.get("message") or (failure.text or "")
    first_line = message.strip().partition("\n")[0]
    if failure.get("type") == driver_death or first_line.startswith(driver_death + ":"):
        return True
    if adb_transport.match(first_line.removeprefix("CommandFailed: ")):
        return True
    if first_line != "Unknown error":
        return False

    # Maestro omits the cause from JUnit when an earlier flow lost the driver.
    # Use the failed command in this flow's log, excluding screenshot and hierarchy warnings.
    for log in (attempt / "results").glob("*/*/logs/maestro.log"):
        if log.parent.parent.name == case.get("name"):
            with log.open(encoding="utf-8", errors="replace") as stream:
                for line in stream:
                    if command_error in line:
                        error = line.partition(command_error)[2].removeprefix("CommandFailed: ")
                        return adb_transport.match(error) is not None
    return False


cases = {}
for case in report.iter("testcase"):
    cases.setdefault(Path(case.get("file", "")).resolve(), []).append(case)

unresolved = False
retry_count = 0
for flow in sys.argv[2:]:
    matches = cases.get(Path(flow).resolve(), [])
    if len(matches) != 1:
        print(f"Expected one Maestro outcome for {flow}, found {len(matches)}", file=sys.stderr)
        unresolved = True
        continue
    case = matches[0]
    failures = case.findall("failure") + case.findall("error")
    if case.get("status") == "SUCCESS" and not failures:
        continue
    if len(failures) == 1 and transport_failure(case, failures[0]):
        print(flow)
        retry_count += 1
        continue
    print(f"Maestro failure remains for {flow}", file=sys.stderr)
    unresolved = True

sys.exit(unresolved or retry_count == 0)
PY
}

run_interactions() {
  local interactions=$1 attempt_dir retries flow result=0
  shift
  mkdir -p "$interactions" || return
  attempt_dir=$(mktemp -d "$interactions/run-XXXXXX") || return
  if run_maestro "$attempt_dir" "$@"; then
    return 0
  fi

  retries=$(retryable_flows "$attempt_dir" "$@") || result=1
  while IFS= read -r flow; do
    [[ -n "$flow" ]] || continue
    printf 'Retrying Android interaction after a Maestro transport failure: %s\n' "$flow"
    if ! timeout 30s "${adb_device[@]}" wait-for-device; then
      echo "Android emulator did not reconnect for the Maestro retries." >&2
      return 1
    fi
    if run_maestro "$attempt_dir/retries/$(basename "$flow" .yaml)" "$flow"; then
      printf 'Android interaction passed after reconnecting: %s\n' "$flow"
    else
      result=1
    fi
  done <<< "$retries"

  return "$result"
}

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
  run_interactions "$interactions" "${group_flows[@]}" || status=1
  SHARED_GROUP=$group bash "$device_dir/ci-evidence.sh" || status=1
done

exit "$status"
