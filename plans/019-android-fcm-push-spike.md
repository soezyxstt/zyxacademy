# Plan 019 (SPIKE): Finish Android native FCM push (Phase 5)

> **Executor instructions**: This is a DESIGN/SPIKE plan, not a build-everything plan. Its deliverable is a working token→backend handshake plus a written design note for the rest. Follow the steps, and where a step says "investigate/decide," record findings rather than over-building. STOP conditions apply. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- android/ lib/firebase components/notifications app/api/notifications/register-token`
> If changed, compare "Current state" to live code; on mismatch, STOP.

## Status

- **Priority**: P3 (direction)
- **Effort**: M (coarse — spike, not full productization)
- **Risk**: MED (touches native build config + a new backend route)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

The `android/` WebView wrapper is a working shell (native Google sign-in already wired), but native push is a stub: the app can ask for notification permission yet never registers a token, so no native push can ever be delivered. Push is a core re-engagement lever for a streak/reminder ed-tech product, and `firebase-admin` is already a server dependency (web FCM exists). IMPORTANT: the backend half of the handshake ALREADY EXISTS — `POST /api/notifications/register-token` and the `userPushTokens` table serve web push today. This plan wires the Android side to that existing endpoint and designs the rest; it does NOT build a new route or table.

## Current state

`android/app/build.gradle.kts:4,64` — push is explicitly deferred:
```kotlin
// TODO: add com.google.gms.google-services after dropping google-services.json in app/ (native FCM, Phase 5)
...
// TODO Phase 5: implementation(platform("com.google.firebase:firebase-bom:33.7.0")); firebase-messaging
```
- `android/app/src/main/java/com/zyx/academy/ui/WebViewActivity.kt:69-71` — `pushPermissionLauncher` with TODO "Phase 5: on grant, fetch native FCM token and POST to [backend]". The permission is requested (`:154`) but no token is registered.
- `build.gradle.kts:20` — `BASE_URL = "https://www.zyxacademy.com"`; `:23` — a hardcoded `GOOGLE_WEB_CLIENT_ID` (a public Android client ID, not a secret — do not treat as a credential leak, but do not duplicate the literal value into new files unnecessarily).
- **The backend endpoint exists (verified, read it before coding): `app/api/notifications/register-token/route.ts`.** Session-authed via `auth.api.getSession`; body `{ token: string (min 100, max 4096 chars), device: string (max 300, default "unknown") }`; on the unique `token` it updates `userId`/`device`/`updatedAt` (re-attributing a device that switches accounts), else inserts. Returns `{ success: true }`.
- **The token table exists: `userPushTokens` (`db/schema.ts:1736-1757`)** — `{ id, userId (FK), token (unique), device (text label), createdAt, updatedAt }`. There is no `platform` column; the `device` label is the discriminator — pass a recognizable prefix like `android:<Build.MODEL>` so sends can distinguish native devices later.
- The web caller to mirror: `lib/firebase/messaging.ts:105-113` `registerTokenToServer(token)` POSTs JSON to `/api/notifications/register-token` (invoked from `components/notifications/push-permission-init.tsx:78-92`).
- Server send path: `firebase-admin` via `lib/firebase/admin.ts` (used for web FCM; the same vehicle will send to native tokens).

## Commands you will need

| Purpose        | Command                                  | Expected              |
|----------------|------------------------------------------|-----------------------|
| App typecheck  | `bun run typecheck`                      | exit 0                |
| Lint           | `bun run lint`                           | exit 0                |
| Android build  | `cd android && ./gradlew assembleDebug`  | build succeeds (needs JDK 17 + Android SDK) |

If the Android toolchain is unavailable in the executor environment, the native steps become "write the code + design note"; do NOT block the backend route on the Android build.

## Scope

**In scope**:
- `android/app/build.gradle.kts` (add firebase-messaging + google-services plugin)
- `android/app/src/main/java/com/zyx/academy/ui/WebViewActivity.kt` and a new `FirebaseMessagingService` subclass (token fetch + POST)
- `android/app/google-services.json` (added by the human owner — see STOP; do not fabricate)
- A short design note `docs/android-push.md` (create) capturing the end-to-end flow + open questions

**Out of scope**:
- `app/api/notifications/register-token/route.ts` — it already does what is needed; do NOT create a parallel `app/api/push/register` route or modify this one unless the Android integration proves a contract gap (then STOP and report).
- `db/schema.ts` / any migration — `userPushTokens` already fits; no schema change.
- Actually sending campaign/streak pushes (that is a follow-on once registration works).
- Reworking the existing web push flow.
- iOS.

## Git workflow

- Branch: `advisor/019-android-fcm-push-spike`
- Commit style: conventional, e.g. `feat(push): register native FCM device tokens (Phase 5 spike)`
- No push/PR unless instructed.

## Steps

### Step 1: Write the design note documenting the reused contract

Create `docs/android-push.md` recording (from Current state, re-verified against the live files):
- Endpoint reused: `POST /api/notifications/register-token`, body `{ token, device }`, session-cookie auth. No new route, no schema change.
- Device labeling convention for Android: `device: "android:" + Build.MODEL` (fits the 300-char cap; distinguishes native tokens from web ones in `userPushTokens.device`).
- The auth question to answer in Step 3: how the native app attaches the user's session cookie to this POST (the sign-in token exchange already established an OkHttp + cookie approach — locate it in `AuthManager.kt` / `WebViewActivity.kt` and document it here).

**Verify**: `docs/android-push.md` exists with the endpoint contract + device-label convention + the cookie-auth mechanism named.

### Step 2: Wire the Android side (if toolchain available)

- In `build.gradle.kts`: uncomment/add the `com.google.gms.google-services` plugin and `firebase-bom` + `firebase-messaging` dependency (the TODOs at `:4` and `:64` name the exact coordinates).
- Add a `FirebaseMessagingService` subclass overriding `onNewToken` to POST the token to `${BASE_URL}/api/notifications/register-token` (reuse the existing OkHttp client + session cookie approach used by the sign-in token exchange — note the `build.gradle.kts:18-19` comment: the apex 301-redirects to www and OkHttp replays a redirected POST as GET, so POST to the exact www URL).
- In `WebViewActivity.kt`, after permission grant (the `pushPermissionLauncher` at `:69`), fetch the current FCM token and POST it (covers the already-installed case where `onNewToken` does not fire).
- Body constraint: the endpoint's Zod schema requires `token.length >= 100` — real FCM tokens satisfy this; do not send placeholder/test tokens.

**Verify**: `cd android && ./gradlew assembleDebug` succeeds (if toolchain present); otherwise the code is written and the design note flags the manual verification step.

### Step 3: Record open questions and the follow-on

In `docs/android-push.md`, list: how tokens are pruned when stale/invalid (FCM `Unregistered` responses), how a logout clears the device token (the endpoint re-attributes on account switch but nothing deletes on logout), and the plan for actually sending pushes (the send path is out of scope here). If web push already handles any of these, note where.

**Verify**: the design note has an "Open questions" section.

## Test plan

- Backend: none needed — the endpoint is untouched. Manual dev check only: an authenticated POST with a real token stores/updates a `userPushTokens` row.
- Android: manual — install debug build, grant permission, confirm a row with a `android:`-prefixed `device` appears. Record in PR.

## Done criteria

ALL must hold:
- [ ] No new API route and no schema change (`git status` shows no `app/api/**` or `db/schema.ts` modifications)
- [ ] Android FCM code written, POSTing to `/api/notifications/register-token` (built if toolchain available; otherwise code + design note)
- [ ] `docs/android-push.md` captures the reused contract, cookie-auth mechanism, device-label convention, and open questions
- [ ] `bun run typecheck` / `bun run lint` exit 0 (should be trivially true — no app-side TS changes)
- [ ] `plans/README.md` row updated

## STOP conditions

- `google-services.json` is not present and cannot be added by the executor (it comes from the Firebase console and is the owner's to provide) — write the Android code, but STOP before claiming the native build works; flag the missing config file.
- No Android SDK/JDK in the environment — do the code + design note; do NOT block on `./gradlew`.
- The native app has no workable way to attach the session cookie to the registration POST (the WebView session and OkHttp cookie store turn out not to be shared) — STOP and record the gap in the design note; bridging auth is a design decision (e.g. a short-lived registration token), not something to improvise.
- `app/api/notifications/register-token/route.ts` no longer matches the contract quoted in Current state — re-read it and adapt; if the contract genuinely cannot serve Android (e.g. token length bounds reject real tokens), STOP and report rather than modifying the route.

## Maintenance notes

- Reviewer: confirm tokens are bound to the session user (no client-supplied userId — same IDOR class as plan 005); the reused endpoint already does this.
- The send path (streak reminders, announcements) is the natural follow-on; the existing `firebase-admin` server code is the vehicle. Web and native tokens live in one table (`userPushTokens`), so a single send already fans out to all a user's devices; use the `device` prefix if platform-specific payloads become necessary.
- Token hygiene (pruning `Unregistered` tokens, logout cleanup) applies to web AND native; it belongs in the follow-on send-path work.
