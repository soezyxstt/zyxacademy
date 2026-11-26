#!/usr/bin/env bash
set -euo pipefail

device_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$device_dir/../../../../.." && pwd)
app_id=com.zyx.academy.nativeparity
requested_group=${SHARED_GROUP:-}
requested_app=${SHARED_IOS_APP:-}
requested_app=${requested_app%/}

dependencies=(xcrun python3 maestro)
if [[ -n "$requested_group" || -n "$requested_app" ]]; then
  case "$requested_group" in
    phone|tablet|wide) ;;
    *) echo 'Set SHARED_GROUP to phone, tablet, or wide for a prebuilt simulator app' >&2; exit 2 ;;
  esac
  if [[ "$requested_app" != /* || "$requested_app" != *.app || ! -d "$requested_app" ]]; then
    echo 'Set SHARED_IOS_APP to the absolute path of an existing simulator .app directory' >&2
    exit 2
  fi
else
  dependencies+=(npx)
fi
for dependency in "${dependencies[@]}"; do
  if ! command -v "$dependency" >/dev/null; then
    echo "Missing iOS device runner dependency: $dependency" >&2
    exit 2
  fi
done
export MAESTRO_CLI_NO_ANALYTICS=true
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

build_dir=
active_simulator=
stop_simulator() {
  if [[ -n "$active_simulator" ]]; then
    xcrun simctl shutdown "$active_simulator" || return
    active_simulator=
  fi
}
cleanup() {
  stop_simulator || true
  if [[ -n "$build_dir" ]]; then
    rm -rf -- "$build_dir"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

find_simulator() {
  local group=$1 model=$2 requested_udid=$3
  xcrun simctl list devices available -j | python3 -c '
import json
import re
import sys

group, model, requested_udid = sys.argv[1:]
default_names = {
    "phone": r"iPhone 17 Pro",
    "tablet": r"iPad.*11-inch.*",
    "wide": r"iPad.*13-inch.*",
}
devices_by_runtime = json.load(sys.stdin)["devices"]
for runtime in reversed(list(devices_by_runtime)):
    if ".SimRuntime.iOS-" not in runtime:
        continue
    for device in devices_by_runtime[runtime]:
        if requested_udid:
            matches = requested_udid.lower() == device["udid"].lower()
        elif model:
            matches = model == device["name"]
        else:
            matches = re.fullmatch(default_names[group], device["name"])
        if matches:
            print(device["udid"], device["state"])
            sys.exit(0)
description = requested_udid or model or default_names[group]
sys.exit(f"No available iOS simulator for {group} ({description})")
' "$group" "$model" "$requested_udid"
}

select_simulator() {
  local group=$1
  case "$group" in
    phone) find_simulator "$group" "${SHARED_IOS_MODEL:-}" "${SHARED_DEVICE:-}" ;;
    tablet) find_simulator "$group" "${SHARED_IOS_TABLET_MODEL:-}" "" ;;
    wide) find_simulator "$group" "${SHARED_IOS_WIDE_MODEL:-}" "" ;;
  esac
}

prepare_simulator() {
  local device=$1 state=$2
  if [[ "$state" != Booted ]]; then
    xcrun simctl boot "$device" || return
  fi
  active_simulator=$device
  xcrun simctl bootstatus "$device" -b || return
  xcrun simctl spawn "$device" defaults write com.apple.Accessibility ReduceMotionEnabled -bool true
}

check_fixture() {
  local group=$1 device=$2
  local diagnostic_dir="$repo_root/artifacts/native-parity/shared-ui/ios/$group/preflight"
  mkdir -p "$diagnostic_dir" || return
  echo "Checking the iOS $group fixture deep link and simulator ABI on $device"
  if PYTHONPATH="$device_dir${PYTHONPATH:+:$PYTHONPATH}" \
    python3 - "$device_dir/ci-evidence.py" "$group" "$device" "$diagnostic_dir" <<'PY'
from pathlib import Path
from types import SimpleNamespace
import os
import runpy
import subprocess
import sys
from evidence import device_info

script, group, device, diagnostics = sys.argv[1:]
evidence = runpy.run_path(script)
try:
    geometry = evidence["probe_geometry"](device, Path(diagnostics), platform="ios")
    evidence["require_group_width"](group, geometry["width"])
    simulator = device_info(SimpleNamespace(
        platform="ios", device=device,
        ios_executable_sha256=os.environ.get("SHARED_IOS_EXECUTABLE_SHA256"),
    ))
except (OSError, ValueError, subprocess.SubprocessError) as error:
    sys.exit(f"iOS {group} fixture preflight failed: {error}")
print(f'iOS {group} fixture measured {geometry["width"]}x{geometry["height"]} pt '
      f'at DPR {geometry["scale"]} on {simulator["abi"]}')
PY
  then
    return 0
  fi
  xcrun simctl io "$device" screenshot "$diagnostic_dir/screen.png" || true
  return 1
}

runs_group_interactions() {
  [[ "$1" != phone || "${SHARED_SHARD_INDEX:-0}" == 0 ]]
}

collect_evidence() {
  local group=$1 device=$2
  local flows="$repo_root/.maestro/native-parallel/shared-ui"
  local interactions="$repo_root/artifacts/native-parity/shared-ui/ios/$group/interactions"
  local group_status=0
  local -a group_flows
  case "$group" in
    phone) group_flows=("$flows"/*.yaml) ;;
    tablet) group_flows=("$flows"/data-wide/*.yaml) ;;
    wide) group_flows=("$flows"/layout-wide/*.yaml) ;;
  esac

  echo "Collecting iOS shared UI evidence for $group on $device"
  if runs_group_interactions "$group"; then
    mkdir -p "$interactions" || return
    maestro --platform ios --device "$device" test \
      --format junit --output "$interactions/report.xml" \
      --test-output-dir "$interactions/results" --debug-output "$interactions/logs" \
      "${group_flows[@]}" || group_status=1
  fi
  SHARED_GROUP="$group" SHARED_DEVICE="$device" SHARED_PLATFORM=ios \
    bash "$device_dir/ci-evidence.sh" || group_status=1
  return "$group_status"
}

verify_installed_group() {
  local group=$1 bundle=$2 selection device state
  selection=$(select_simulator "$group") || return
  read -r device state <<< "$selection"
  prepare_simulator "$device" "$state" || return
  xcrun simctl install "$device" "$bundle" || return
  xcrun simctl launch "$device" "$app_id" || return
  if runs_group_interactions "$group"; then
    check_fixture "$group" "$device" || return
  fi
  collect_evidence "$group" "$device"
}

cd "$repo_root"
if [[ -n "$requested_group" ]]; then
  verify_installed_group "$requested_group" "$requested_app"
  exit
fi

build_dir=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/zyx-shared-ios.XXXXXX")
phone=$(select_simulator phone)
read -r phone_device phone_state <<< "$phone"
prepare_simulator "$phone_device" "$phone_state"
mkdir -p "$build_dir/expo-home"
(
  cd apps/mobile-native
  CI=1 __UNSAFE_EXPO_HOME_DIRECTORY="$build_dir/expo-home" \
    npx --no-install expo run:ios --configuration Release --device "$phone_device" \
    --no-bundler --output "$build_dir"
)
app_bundle=
for candidate in "$build_dir"/*.app; do
  [[ -d "$candidate" ]] || continue
  if [[ -n "$app_bundle" ]]; then
    echo "Expected one simulator app bundle in $build_dir" >&2
    exit 1
  fi
  app_bundle=$candidate
done
if [[ -z "$app_bundle" ]]; then
  echo "Expo did not export a simulator app bundle in $build_dir" >&2
  exit 1
fi

status=0
if check_fixture phone "$phone_device"; then
  collect_evidence phone "$phone_device" || status=1
else
  status=1
fi
stop_simulator

# An 11-inch iPad exercises tablet layout. A 13-inch iPad reaches the wide
# layout in portrait without rotating the application between captures.
for group in tablet wide; do
  verify_installed_group "$group" "$app_bundle" || status=1
  stop_simulator
done

exit "$status"
