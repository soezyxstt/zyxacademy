"""Read the production worker's rollback identity without exporting secret values."""
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

HOST = "zyx-background.soezyxst.deno.net"


def summarize_revision(revision):
    values = {item["key"]: item.get("value", "") for item in revision.get("env_vars", [])}
    return {
        "id": revision["id"], "status": revision["status"],
        "createdAt": revision.get("created_at"),
        "hostnames": [host for timeline in revision.get("timelines", []) for host in timeline.get("hostnames", [])],
        "databaseHost": urlparse(values.get("DATABASE_URL", "")).hostname,
        "storageProvider": "neon" if values.get("STORAGE_PROVIDER_MODE") == "neon" else "r2",
        "environmentKeys": sorted(values),
    }


def main():
    token = os.environ["DENO_DEPLOY_TOKEN"]

    def get(path):
        request = Request("https://api.deno.com/v2" + path, headers={"Authorization": "Bearer " + token})
        with urlopen(request, timeout=30) as response:
            return json.load(response)

    app = get("/apps/zyx-background")
    if app.get("slug") != "zyx-background":
        raise RuntimeError("Production worker identity mismatch")
    revisions = get("/apps/" + app["id"] + "/revisions?limit=20&status=succeeded")
    summaries = [summarize_revision(get("/revisions/" + item["id"])) for item in revisions[:5]]
    live = [item for item in summaries if HOST in item["hostnames"]]
    if len(live) != 1:
        raise RuntimeError("Production worker live revision was not uniquely identified")
    report = {"appId": app["id"], "slug": app["slug"], "liveRevision": live[0],
              "appEnvironment": [{key: item.get(key) for key in ("key", "secret", "contexts")} for item in app.get("env_vars", [])]}
    output = Path("artifacts/neon-production/deno-before.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"appId": app["id"], "revisionId": live[0]["id"], "databaseHost": live[0]["databaseHost"], "secretValuesExported": False}))


if __name__ == "__main__":
    main()
