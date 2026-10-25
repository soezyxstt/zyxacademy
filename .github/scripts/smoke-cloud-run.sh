#!/usr/bin/env bash
# Exercise the runtime image using dummy credentials and a public static asset.
set -euo pipefail
image="${1:?Usage: smoke-cloud-run.sh IMAGE}"
container="zyx-cloud-run-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
cleanup() { docker rm --force "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Require native canvas, PDF fonts, authoring skills and the generated server.
docker run --rm --entrypoint node "$image" -e '
  const fs = require("node:fs");
  for (const file of ["server.js", "public/coding/worker.js", "dist/skills/manifest.json",
    "node_modules/pdfjs-dist/standard_fonts", "node_modules/katex/dist/fonts"]) {
    if (!fs.existsSync(file)) throw new Error("Missing runtime asset: " + file);
  }
  const { createCanvas } = require("@napi-rs/canvas");
  if (!createCanvas(2, 2).toBuffer("image/png").length) throw new Error("Native canvas failed");
  if (process.getuid() === 0) throw new Error("Runtime must not run as root");
  if (process.env.SKIP_ENV_VALIDATION) throw new Error("Build-only environment leaked");
'

docker run --detach --name "$container" --memory=1g --cpus=1 \
  --publish 127.0.0.1::8080 \
  --env DATABASE_URL=https://cloud-run-smoke.invalid \
  --env BETTER_AUTH_SECRET=cloud-run-smoke-only-placeholder-32-characters \
  --env GOOGLE_CLIENT_ID=cloud-run-smoke \
  --env GOOGLE_CLIENT_SECRET=cloud-run-smoke \
  --env RESEND_API_KEY=cloud-run-smoke \
  --env GEMINI_API_KEY=cloud-run-smoke \
  --env INNGEST_EVENT_KEY=cloud-run-smoke \
  "$image" >/dev/null
address="$(docker port "$container" 8080/tcp)"
for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 2 \
    "http://$address/coding/worker.js" --output /dev/null 2>/dev/null; then
    echo 'Container serves public assets on port 8080 with a 1 GiB memory limit.'
    exit 0
  fi
  if [ "$(docker inspect --format '{{.State.Running}}' "$container")" != true ]; then
    break
  fi
  sleep 2
done
docker logs --tail 60 "$container"
echo 'Container startup/static asset check failed.' >&2
exit 1
