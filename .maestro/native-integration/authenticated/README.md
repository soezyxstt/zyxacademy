# Authenticated device preview

The dedicated hosted preview first exercises the unchanged native authentication endpoints over a runner-local HTTPS listener and disposable PostgreSQL. A synthetic browser page replaces Google for the fixture only. The signed session must pass the native client session and Student context checks before logout.

The installed-device flow belongs in this directory and runs separately from the guest product flows. It requires an ephemeral test build, loopback network access, and trust for the runner certificate. The regular app remains bound to staging and uses its Google browser handoff.
