# Authenticated device preview

The hosted preview exercises the real native authentication endpoints over a runner-local HTTPS listener and disposable PostgreSQL. A synthetic browser form replaces Google for this fixture. The signed session must pass the native client’s session and Student context checks before logout.

The optional Android job compiles a separate Expo APK with the fixture’s exact HTTPS origin and certificate. It installs the certificate on a disposable emulator and keeps app and browser network traffic on loopback. The flow uses the real browser session, native challenge and verifier, real Student dashboard, notification acknowledgement and logout. It checks the selected notification and another learner’s unread notification in PostgreSQL, confirms revocation, and rejects the dashboard after sign-out. The workflow discards the APK, TLS key, browser claim and Maestro output instead of uploading them.

The normal Expo build uses the existing staging origin and Google flow. This fixture adds no production route, account or MCP operation.
