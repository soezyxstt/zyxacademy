"""Sync guarded runtime settings only to zyxacademy's custom staging environment."""
import json
import os
import urllib.error
import urllib.request

from prepare_worker_runtime import prepare_worker_runtime

PROJECT = "prj_9wDdc36VFIH5wJT45jEXIHGst2pb"
TEAM = "team_rMFT8hSTCTObKzXirjJcbMFc"
ENVIRONMENT = "env_puSffSpNjRY4ZXuB03j0H5Davx0X"


def staging_env(secrets, variables):
    settings = prepare_worker_runtime("staging", secrets, variables)
    settings.pop("NODE_ENV", None)
    return [{"key": key, "value": value,
             "type": "encrypted" if key.startswith("NEXT_PUBLIC_") else "sensitive",
             "customEnvironmentIds": [ENVIRONMENT]} for key, value in sorted(settings.items())]


if __name__ == "__main__":
    try:
        if os.environ.get("VERCEL_PROJECT_ID") != PROJECT or os.environ.get("VERCEL_ORG_ID") != TEAM:
            raise ValueError("STAGING_VERCEL_TARGET_MISMATCH")
        payload = staging_env(json.loads(os.environ["GITHUB_RUNTIME_SECRETS"]),
                              json.loads(os.environ["GITHUB_RUNTIME_VARS"]))
        request = urllib.request.Request(
            f"https://api.vercel.com/v10/projects/{PROJECT}/env?teamId={TEAM}&upsert=true",
            data=json.dumps(payload).encode(), method="POST",
            headers={"Authorization": "Bearer " + os.environ["VERCEL_TOKEN"],
                     "Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.load(response)
        if result.get("error") or result.get("failed") or len(result.get("created", [])) != len(payload):
            raise ValueError("STAGING_VERCEL_ENV_SYNC_INCOMPLETE")
        print(f"Verified staging Vercel settings synchronized: {len(payload)} keys; values were not printed.")
    except (KeyError, ValueError, urllib.error.URLError):
        raise SystemExit("Staging Vercel configuration failed; no deployment authorized.") from None
