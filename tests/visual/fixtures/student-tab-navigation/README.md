# Student tab return fixture

Run this from the repository root with dependencies installed. The build uses
only the generated fixture routes and fixture data. It does not access the
application database or deployed services.

```sh
fixture=$(python3 tests/visual/fixtures/student-tab-navigation/setup.py)
(cd "$fixture" && NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build --webpack)
(cd "$fixture" && NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3197)
```

Run the browser check in a second terminal. Set `fixture` to the generated directory from the first terminal. Set `CHROMIUM_EXECUTABLE` if using
system Chromium in place of the Playwright browser.

```sh
node tests/visual/fixtures/student-tab-navigation/check.cjs "$fixture" http://127.0.0.1:3197
```

The fixture copies the production Dashboard page and loading component, student
mobile navigation and tab policy. The sections, session and workspace data are
fixtures. Inspect RSC requests by phase. Next can issue full prefetch requests
without a `next-router-prefetch` header, so the timestamp relative to the click
matters. Stop the fixture server when finished.
