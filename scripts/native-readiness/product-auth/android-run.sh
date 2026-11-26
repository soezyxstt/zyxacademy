#!/usr/bin/env bash
set -euo pipefail
if [[ ${GITHUB_ACTIONS:-} != true || ${RUNNER_ENVIRONMENT:-} != github-hosted ||
  ${NATIVE_PRODUCT_AUTH_FIXTURE:-} != 1 || -z ${RUNNER_TEMP:-} ]]; then
  echo "Authenticated emulator checks require the isolated GitHub-hosted job." >&2
  exit 2
fi
root=$(git rev-parse --show-toplevel)
private="$RUNNER_TEMP/native-auth-preview"
test -s "$private/preview.apk"
test -s "$private/cert.pem"
device=$(adb devices | awk '$1 ~ /^emulator-[0-9]+$/ && $2 == "device" { print $1 }')
[[ $device =~ ^emulator-[0-9]+$ ]]
emulator() { adb -s "$device" "$@"; }
trap 'emulator reverse --remove tcp:9443 >/dev/null 2>&1 || true; rm -rf -- "$private"' EXIT

reboot_emulator() {
  emulator reboot
  emulator wait-for-device
  timeout 90 bash -c 'until [[ $(adb -s "$1" shell getprop sys.boot_completed | tr -d "\r") == 1 ]]; do sleep 2; done' _ "$device"
  emulator root
  emulator wait-for-device
}

emulator root
emulator wait-for-device
emulator remount || true
if ! emulator shell test -w /system/etc/security/cacerts; then
  emulator disable-verity
  reboot_emulator
  emulator remount
fi
[[ $(emulator shell id -u | tr -d "\r") == 0 ]]
emulator shell test -w /system/etc/security/cacerts
hash=$(openssl x509 -in "$private/cert.pem" -noout -subject_hash_old)
cert="/system/etc/security/cacerts/$hash.0"
emulator push "$private/cert.pem" "$cert" >/dev/null
emulator shell chown root:root "$cert"
emulator shell chmod 644 "$cert"
emulator shell restorecon "$cert"
reboot_emulator
emulator shell test -r "$cert"
emulator shell input keyevent 224
emulator shell input keyevent 82
emulator shell wm dismiss-keyguard
emulator shell settings put system screen_off_timeout 2147483647

# ADB reverse carries fixture traffic. Block app and isolated-process egress
# while the Android network service can still validate the emulator network.
emulator reverse tcp:9443 tcp:9443
emulator shell iptables -I OUTPUT 1 -m owner --uid-owner 10000-99999 '!' -o lo -j REJECT
emulator shell ip6tables -I OUTPUT 1 -m owner --uid-owner 10000-99999 '!' -o lo -j REJECT
emulator shell am force-stop com.android.chrome
emulator install "$private/preview.apk" >/dev/null
mkdir "$private/maestro"
bash "$root/scripts/native-parity/install-maestro.sh" "$private/maestro"
roles=(student)
if [[ ${NATIVE_PRODUCT_AUTH_STAFF:-} == true ]]; then roles=(tutor admin); fi
case ${NATIVE_PRODUCT_AUTH_OFFLINE:-} in
  only) roles=(offline) ;;
  also) roles+=(offline) ;;
esac
if [[ " ${roles[*]} " == *" student "* ]]; then
  if ! command -v ffmpeg >/dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq ffmpeg
  fi
  ffmpeg -nostdin -hide_banner -loglevel error -f lavfi -i testsrc2=size=160x90:rate=12 -t 2 \
    -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$private/preview.mp4"
fi
status=0
for role in "${roles[@]}"; do
  NODE_EXTRA_CA_CERTS="$private/cert.pem" NATIVE_PRODUCT_AUTH_ROLE="$role" bun --no-env-file "$root/scripts/native-readiness/product-auth/android-smoke.ts" \
    "$private/cert.pem" "$private/key.pem" "$private/maestro/maestro/bin/maestro" "$device" || status=1
done
exit "$status"
