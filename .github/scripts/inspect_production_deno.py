"""Read the production worker's rollback identity without exporting secret values."""
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

HOST = "zyx-background.soezyxst.deno.net"
ROLLBACK_REVISION = "gysznbeq1tqt"
ROLLBACK_DATABASE = "libsql://zyx-soezyxstt.aws-ap-south-1.turso.io"


def rollback_changes(app, revisions):
    if app.get("id") != "b9601da7-4854-457a-b30e-0bffdf30420c" or not any(item["id"] == ROLLBACK_REVISION and item["status"] == "succeeded" for item in revisions):
        raise RuntimeError("Verified rollback worker revision is unavailable")
    database = [item for item in app.get("env_vars", []) if item["key"] == "DATABASE_URL" and item.get("contexts") == "all"]
    if len(database) != 1:
        raise RuntimeError("Production worker database setting is ambiguous")
    owned = {"STORAGE_PROVIDER_MODE", "NEON_STORAGE_BUCKET", "AWS_ENDPOINT_URL_S3", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"}
    return [{"id": database[0]["id"], "value": ROLLBACK_DATABASE}] + [{"id": item["id"], "delete": True} for item in app.get("env_vars", []) if item["key"] in owned]


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

    def request_api(path, method="GET", body=None):
        request = Request("https://api.deno.com/v2" + path, method=method,
                          data=json.dumps(body).encode() if body is not None else None,
                          headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
        with urlopen(request, timeout=30) as response:
            return json.load(response) if response.status != 204 else None

    app = request_api("/apps/zyx-background")
    if app.get("slug") != "zyx-background":
        raise RuntimeError("Production worker identity mismatch")
    revisions = request_api("/apps/" + app["id"] + "/revisions?limit=100&status=succeeded")
    if sys.argv[1:] == ["--restore-turso"]:
        request_api("/apps/" + app["id"], "PATCH", {"env_vars": rollback_changes(app, revisions)})
        request_api("/revisions/" + ROLLBACK_REVISION + "/promote", "POST")
        print(json.dumps({"appId": app["id"], "restoredRevision": ROLLBACK_REVISION, "unrelatedSecretsChanged": False}))
        return
    if sys.argv[1:]:
        raise RuntimeError("Unknown production runtime operation")
    summaries = [summarize_revision(request_api("/revisions/" + item["id"])) for item in revisions[:5]]
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
