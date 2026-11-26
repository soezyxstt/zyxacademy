#!/usr/bin/env bash
set -euo pipefail

device=$1
evidence=$2
destination=$3
app_id=com.zyx.academy.nativeparity
bundle="$(xcrun simctl get_app_container "$device" "$app_id" app)"
[[ "$bundle" == *.app && -f "$bundle/Info.plist" ]]
[[ "$(plutil -extract CFBundleIdentifier raw -o - "$bundle/Info.plist")" == "$app_id" ]]
[[ "$(plutil -extract DTPlatformName raw -o - "$bundle/Info.plist")" == iphonesimulator ]]
[[ "$(git rev-parse HEAD)" == "$ACADEMIC_REVISION" ]]

restricted="$(find "$bundle" -type f \( -iname '*.mobileprovision' -o -iname '*.provisionprofile' \
  -o -iname '*.p12' -o -iname '*.pfx' -o -iname '*.p8' -o -iname '*.keychain*' \
  -o -iname '*.pem' -o -iname '*.key' -o -iname '.env*' \) -print)"
if [[ -n "$restricted" ]]; then
  echo 'The simulator fixture contains a provisioning or credential file. Recovery artifact skipped.' >&2
  exit 1
fi

mkdir -p "$destination"
cp "$evidence/provenance.json" "$evidence/cases.json" "$evidence/ios-toolchain.txt" "$evidence/simulator-booted.json" \
  "$destination/"
printf '{"captureOutcome":"%s"}\n' "$ACADEMIC_CAPTURE_OUTCOME" > "$destination/recovery.json"
for file in status.json compiled-fixture.json; do
  if [[ -f "$evidence/$file" ]]; then
    cp "$evidence/$file" "$destination/"
  fi
done
ditto -c -k --keepParent "$bundle" "$destination/fixture.app.zip"
(
  cd "$destination"
  shasum -a 256 fixture.app.zip > fixture.app.zip.sha256
  shasum -a 256 -c fixture.app.zip.sha256
)
