# Expo account entry

The Expo sign-in and sign-up routes reuse the localized web copy and the existing staging Google flow. The callback finishes through the existing verifier exchange. The application stores the validated return intent with the attempt and then with the verified session, so the matching callback can resume after a cold start. The optional destination stays on the device. The URLs sent to the staging login bridge and code-exchange endpoints retain their existing contract.

The return allowlist comes from `routes.tsv`. The account context must match the verified session and have the role required for the concrete destination. Course, enrollment and record access remain server-authorized. The Expo sitemap must contain a matching page. A missing page leaves the signed-in continuation visible and the intent pending. If the role dashboard is mounted, the user can choose it from that screen. Production, Capacitor and Tauri have separate entry paths.

Sign-out revokes the verified session and clears its app data through the existing session controller. A failed revocation offers retry and keeps sign-in disabled while cleanup is pending. The Home action targets `/`. It reaches the current internal entry until the Operations public home is integrated. The callback and sign-out do not use the internal session diagnostics as a destination.

## Visual references for hosted CI

**Unverified on Android, iOS and the web reference.** Use the actual marketing route and the corresponding Expo route. Capture 380 px and a wide viewport where supported, with the application fonts and both themes. Record OS, density, locale, reference commit, image and verdict for each case. Hold async transitions with test intercepts or controlled fixtures on hosted infrastructure.

| Route | Case 1 | Case 2 | Case 3 |
| --- | --- | --- | --- |
| `/sign-in` | Indonesian, light, Google control and sign-up link. [Web source](../../app/(marketing)/sign-in/page.tsx) | English, dark, hold browser launch. Verify busy semantics and cancel. | Indonesian, light, `?error=access_denied`. Verify translated recovery and a retry. |
| `/sign-up` | English, light, creation title, Google control and sign-in link. [Web source](../../app/(marketing)/sign-up/page.tsx) | Indonesian, dark, hold Google launch. Verify busy semantics and cancel. | English, dark, `?error=configuration`. Check wrapped error text and preserve locale plus safe `next` when moving between entries. |
| `/sign-out` | Indonesian, light, hold revocation and check the pending message. [Web source](../../app/(marketing)/sign-out/page.tsx) | English, dark, complete revocation and return to sign-in. | Indonesian, dark, fail revocation, activate retry and verify eventual completion. |
| `/auth/native-finish` | Indonesian, light, hold session verification and inspect progress. [Web callback reference](../../app/auth/native-finish/page.tsx) | English, dark, sign in with a safe destination that is pending integration and inspect the continuation. | Indonesian, dark, open an expired or invalid callback and inspect retry. |

Test behavior separately on Android and iOS with an authorized staging account. Cover denied provider access, browser dismissal, cold and warm callbacks, an expired code, an account with the wrong role, an unmounted destination, a mounted dynamic route with query and fragment, logout on an intermittent connection, Back and focus. The public app root can use `AuthContinuation` after verifying the current account to resume any unconsumed signed-in intent.

## MCP

These screens use the staged, interactive end-user session already covered by the native browser exchange and account controls in the [operations catalog](../../lib/admin-mcp/operations-catalog.ts). Expo does not change MCP tools, scopes, consent, discovery, playbooks, packaged skills, host prompts or client bindings. Consent and connection management continue in their own system-browser session. Hosting, device behavior, live OAuth and published packages still need separate verification.
