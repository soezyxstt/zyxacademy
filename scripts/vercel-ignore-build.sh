#!/usr/bin/env bash
# Vercel Ignored Build Step for Zyx Academy.
# Exit 0 = skip the Vercel build.
# Exit 1 = continue with the Vercel build.

set -u

BASE_SHA="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"

# Fail safe: if the comparison base is unavailable, build instead of skipping.
if ! git rev-parse --verify "${BASE_SHA}^{commit}" >/dev/null 2>&1; then
  echo "Vercel build required: comparison base is unavailable (${BASE_SHA})."
  exit 1
fi

mapfile -t CHANGED_FILES < <(git diff --name-only "${BASE_SHA}" HEAD)

# An empty/unknown diff should build rather than risk serving stale code.
if [ "${#CHANGED_FILES[@]}" -eq 0 ]; then
  echo "Vercel build required: no changed files were detected."
  exit 1
fi

for file in "${CHANGED_FILES[@]}"; do
  case "${file}" in
    docs/*|plans/*|.github/*|.claude-plugin/*|plugins/zyx-authoring-mcp/skills/*|README.md|AGENTS.md|CLAUDE.md)
      ;;
    *)
      echo "Vercel build required: runtime-relevant path changed: ${file}"
      exit 1
      ;;
  esac
done

echo "Skipping Vercel build: only documentation or non-runtime tooling metadata changed."
exit 0
