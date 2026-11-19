#!/usr/bin/env bash
# The image runs with synthetic configuration and performs zero external writes.
set -euo pipefail
image="${1:?Usage: smoke-cloud-run.sh IMAGE}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
native_smoke="$script_dir/../../deploy/cloud-run/smoke-native.mjs"
docker run --rm --network=none --memory=1g --cpus=1 --interactive --entrypoint node "$image" \
  --input-type=module - < "$native_smoke"

scratch="$(mktemp -d)"
cidfile="$scratch/container-id"
cleanup() {
  local exit_code=$?
  if [[ "$exit_code" -ne 0 && -s "$cidfile" ]]; then
    echo '--- Container logs on smoke failure ---' >&2
    docker logs --tail 60 "$(cat "$cidfile")" >&2 || true
  fi
  if [[ -s "$cidfile" ]]; then docker rm --force "$(cat "$cidfile")" >/dev/null 2>&1 || true; fi
  find "$scratch" -depth -delete
}
trap cleanup EXIT

# Use a non-default external port to verify that the gateway honors Cloud Run's PORT.
port=9080
origin=https://staging-smoke.example.test
token=synthetic-smoke-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
started_at="$(date +%s%3N)"
docker run --detach --cidfile "$cidfile" --memory=1g --cpus=1 \
  --publish "127.0.0.1::$port" \
  --env "PORT=$port" \
  --env "BETTER_AUTH_URL=$origin" \
  --env "CLOUD_RUN_ORIGIN_TOKEN=$token" \
  --env DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused \
  --env BETTER_AUTH_SECRET=cloud-run-smoke-only-placeholder-32-characters \
  --env GOOGLE_CLIENT_ID=cloud-run-smoke \
  --env GOOGLE_CLIENT_SECRET=cloud-run-smoke \
  --env RESEND_API_KEY=cloud-run-smoke \
  --env GEMINI_API_KEY=cloud-run-smoke \
  --env INNGEST_EVENT_KEY=cloud-run-smoke \
  --env STORAGE_PROVIDER_MODE=neon \
  --env NEON_STORAGE_BUCKET=zyx-staging \
  --env AWS_ENDPOINT_URL_S3=https://storage.example.test \
  --env AWS_REGION=ap-southeast-1 \
  --env AWS_ACCESS_KEY_ID=cloud-run-smoke \
  --env AWS_SECRET_ACCESS_KEY=cloud-run-smoke \
  "$image" >/dev/null

container="$(cat "$cidfile")"
address="$(docker port "$container" "$port/tcp")"
auth=(-H "X-Zyx-Origin-Token: $token")
request=(curl --silent --show-error --max-time 10)
for attempt in {1..45}; do
  if "${request[@]}" --fail "${auth[@]}" "http://$address/coding/worker.js" --output /dev/null 2>/dev/null; then
    echo "Local container first HTTP response: $(( $(date +%s%3N) - started_at )) ms"
    break
  fi
  if [[ "$attempt" == 45 || "$(docker inspect --format '{{.State.Running}}' "$container")" != true ]]; then
    docker logs --tail 60 "$container"
    echo 'Container startup check failed.' >&2
    exit 1
  fi
  sleep 1
done

status() { "${request[@]}" --output /dev/null --write-out '%{http_code}' "$@"; }
assert_status() {
  local expected="$1" label="$2"
  shift 2
  local actual
  actual="$(status "$@")"
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected HTTP $expected for $label, got $actual." >&2
    exit 1
  fi
}
assert_status 403 "unauthenticated /coding/worker.js" "http://$address/coding/worker.js"
assert_status 403 "unauthenticated /api/auth/get-session" "http://$address/api/auth/get-session"
assert_status 200 "authenticated /api/auth/get-session" "${auth[@]}" "http://$address/api/auth/get-session"
assert_status 404 "private attachment path" "${auth[@]}" "http://$address/api/storage/file/zyx-attachments/2026-01-01/smoke.png"
assert_status 404 "protected diktat pdf path" "${auth[@]}" "http://$address/api/storage/file/overhaul/smoke/diktat-pdf/fixture.pdf"
assert_status 404 "missing page" "${auth[@]}" "http://$address/cloud-run-smoke-missing-page"
redirect="$("${request[@]}" "${auth[@]}" --output /dev/null --write-out '%{redirect_url}' \
  "http://$address/dashboard")"
if [[ "$redirect" != "$origin/sign-in?"* && "$redirect" != "http://$address/sign-in?"* ]]; then
  echo "Unexpected /dashboard redirect target: $redirect" >&2
  exit 1
fi
"${request[@]}" --fail "${auth[@]}" "http://$address/en" --output "$scratch/english.html"
if ! grep -q '<html lang="en"' "$scratch/english.html"; then
  echo 'Expected English HTML lang attribute on /en.' >&2
  exit 1
fi

"${request[@]}" --fail "${auth[@]}" "http://$address/" --output "$scratch/landing.html"
chunk="$(python3 - "$scratch/landing.html" <<'PY'
from pathlib import Path
import re
import sys

html = Path(sys.argv[1]).read_text()
if "<main" not in html:
    raise SystemExit("Expected SSR landing content")
chunk = re.search(r'/_next/static/[^?"\s<>]+\.js', html)
if not chunk:
    raise SystemExit("No JavaScript chunk referenced in landing markup")
print(chunk.group())
PY
)"
"${request[@]}" --fail "${auth[@]}" "http://$address$chunk" --output /dev/null
chunk_headers="$("${request[@]}" --fail --head "${auth[@]}" "http://$address$chunk")"
if ! grep -iq '^cache-control:.*immutable' <<<"$chunk_headers"; then
  echo "Expected immutable Cache-Control header on $chunk." >&2
  exit 1
fi
"${request[@]}" --fail "${auth[@]}" "http://$address/api/coding/runtime/314.0.7/pyodide-lock.json" --output /dev/null
"${request[@]}" --fail "${auth[@]}" "http://$address/v4/diktat.pdf" --output "$scratch/sample.pdf"
if [[ "$(head -c 5 "$scratch/sample.pdf")" != '%PDF-' ]]; then
  echo 'Expected PDF signature on /v4/diktat.pdf.' >&2
  exit 1
fi
media_type="$("${request[@]}" --fail "${auth[@]}" -H "Accept: image/webp" --write-out '%{content_type}' \
  "http://$address/_next/image?url=%2Fbrand%2Fzyx-app-180.png&w=128&q=75" --output /dev/null)"
if [[ "$media_type" != image/webp ]]; then
  echo "Expected image/webp from /_next/image, got $media_type." >&2
  exit 1
fi
docker stats --no-stream --format 'Local warm container memory: {{.MemUsage}}' "$container"
docker stop --time 9 "$container" >/dev/null
exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$container")"
if [[ "$exit_code" != 0 ]]; then
  echo "Expected container exit code 0 on graceful stop, got $exit_code." >&2
  exit 1
fi
echo 'Gateway, SSR, auth session endpoint, private-path denials, static bundles, public PDF, image optimization, and shutdown passed.'
