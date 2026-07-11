# Android WebView Wrapper Migration Checklist

Target: wrap the Zyx Academy Next.js app in a native Android shell with a Material 3 navigation grid, while keeping the web app as the single source of UI truth.

Last audited: 2026-07-07 (branch `android`).

---

## Part 1. Audit results

### 1.1 Browser-only APIs in use

| API | Where | WebView impact |
|---|---|---|
| `localStorage` | `components/course/quiz-player.tsx` (in-progress quiz answers), `components/course/material-viewer.tsx` (reader prefs), `components/sidebar-shell.tsx` (collapse state), `components/dashboard/weekly-reflection.tsx`, `components/course/daily-quiz-popup.tsx`, `components/notifications/push-permission-init.tsx`, `app/(student)/courses/[id]/tryout/tryout-list-client.tsx`, `app/(student)/courses/[id]/my-results/[submissionId]/review-client.tsx`, plus `next-themes` (theme) | Works, but only after `setDomStorageEnabled(true)`. Data is wiped if the user clears app storage; quiz progress depends on it. |
| `sessionStorage` | `app/template.tsx` (page transition state) | Same flag as above. |
| Web Push: `Notification`, `navigator.serviceWorker`, FCM web SDK | `lib/firebase/messaging.ts`, `components/notifications/push-permission-init.tsx`, `public/firebase-messaging-sw.js` | **Broken in WebView.** Service workers and the Notification API are unavailable; the existing guards make it silently return "denied". Must be replaced with native FCM plus a JS bridge. |
| `navigator.clipboard.writeText` | `components/course/markdown-renderer.tsx` (copy code button), `components/admin/tokens-dashboard.tsx`, admin AST inspector | Works on modern WebView over https; verify on API 26 to 29, add bridge fallback if needed. |
| `element.requestFullscreen` | `components/course/material-viewer.tsx:965` | Requires `WebChromeClient.onShowCustomView` / `onHideCustomView`; no-op otherwise. |
| `window.open` | `components/admin/drive-explorer.tsx` (3 call sites) | Silently dropped unless `setSupportMultipleWindows` + `onCreateWindow` are handled, or links are intercepted. Admin-only surface. |
| `WebSocket` | `components/live/use-live-quiz-socket.ts` (live quiz, connects to `workers/realtime` on Cloudflare) | Supported natively by WebView. Needs correct `wss://` URL and reconnect behavior when the app resumes from background. |
| `matchMedia` | `components/ui/reveal.tsx`, `components/animated-ornament-canvas.tsx`, landing demos (reduced motion, color scheme) | Works. Dark mode follows `prefers-color-scheme`; force it via `setAlgorithmicDarkeningAllowed` or leave to the site's `next-themes` toggle. |
| `navigator.userAgent` sniffing | `components/sidebar-shell.tsx` (shortcut hint), `lib/firebase/messaging.ts` (device label) | Harmless, but the custom UA string you set becomes the stored device label. |
| `<input type="file">` | `components/admin/drive-explorer.tsx`, admin AST inspector | Dead without `WebChromeClient.onShowFileChooser`. Admin-only. |
| Blob download (`URL.createObjectURL` + `a.download`) | admin AST inspector (`ast-inspector-client.tsx:172`) | `DownloadListener` cannot handle `blob:` URLs; needs a JS bridge if admin flows must work in-app. Can be deferred. |
| WebGL / canvas | `three`, `@react-three/fiber` (landing ornaments), `reactflow`, `recharts`, KaTeX | Works with hardware acceleration enabled (default); test low-end devices, consider hiding heavy landing ornaments in app mode. |

### 1.2 Authentication flow

- **Better Auth** (`lib/auth.ts`) with Drizzle/SQLite adapter; sessions are **http-only cookies** issued by `/api/auth/*` routes.
- **Google OAuth is the only sign-in method** (`components/auth/google-sign-in-button.tsx` calls `signIn.social({ provider: "google" })`; no email/password flow exists).
- Route protection lives in `proxy.ts`: unauthenticated requests to `/dashboard`, `/courses`, `/profile`, `/settings`, `/admin` are redirected to `/sign-in?next=...` by fetching `/api/auth/get-session` with the request cookie.
- Client session state comes from `useSession()` in `lib/auth-client.ts`.

**Critical constraint:** Google blocks OAuth inside embedded WebViews (`disallowed_useragent` / 403). The web redirect flow cannot run inside the WebView. The wrapper must sign in natively (Credential Manager) and exchange the Google ID token with Better Auth, or use a Custom Tab plus cookie handoff. The ID token exchange is the recommended path (see Phase 3).

### 1.3 State management systems

| Layer | Mechanism | Notes for the wrapper |
|---|---|---|
| Server state | Next.js RSC + server actions (e.g. `app/(student)/dashboard/actions.ts`) and **TanStack React Query** (`components/providers/query-provider.tsx`) | All cookie-authenticated; survives as long as the session cookie is present in the WebView cookie store. |
| Client UI state | React Context: `CommandMenuContext`, `NavScrollContext`, `TutorContext` (tutor drawer), carousel context | In-page only; no wrapper impact. |
| Persisted client state | `localStorage` (quiz progress, reader prefs, sidebar collapse, theme via `next-themes`) | Needs DOM storage enabled; document that "clear app data" wipes in-progress quizzes. |
| Realtime state | `useLiveQuizSocket` WebSocket state machine (lobby / question / reveal / ended) with backoff reconnect | Test lifecycle: WebView pause/resume must trigger its reconnect path. |
| Notifications | FCM web tokens stored via `POST /api/notifications/register-token` into `user_push_tokens` | Reuse the same endpoint from native; the native FCM token replaces the web token, `device` label distinguishes them. |

### 1.4 Student navigation surface (source for the native grid)

From `app/(student)/` and `components/student-sidebar.tsx`: Dashboard, Courses (with per-course subtree: materials, quizzes, tryouts, my results, study path, mastery, live), Calendar, Leaderboard, Profile, Settings, Feedback, plus the AI Tutor drawer and command menu (Ctrl+K; keyboard-centric, hide on mobile).

---

## Part 2. Migration checklist

### Phase 0. Decisions and prerequisites

- [ ] Confirm production origin (HTTPS) the app will load, and that `NEXT_PUBLIC_APP_URL` matches it.
- [ ] Decide wrapper scope: **student app only** (recommended); admin and tutor surfaces stay browser-only, which defers `window.open`, file chooser, and blob download work.
- [ ] Decide native UI depth: native Material 3 **home grid + top app bar + WebView content**, versus grid-only launcher. Recommended: native scaffold with the grid as the app home screen.
- [ ] Register an Android OAuth client (package name + SHA-1) **and** reuse the existing **web client ID** for ID token audience in Google Cloud Console.
- [ ] Add the Android app to the existing Firebase project (`google-services.json`) for native FCM.

### Phase 1. Android project scaffold

- [ ] Create a Kotlin project (min SDK 26, target latest) with Jetpack Compose and Material 3 dependencies.
- [ ] Define the Material theme from Zyx brand tokens in `app/globals.css`: primary = brand blue, secondary = brand orange, plus light/dark color schemes mapped from the semantic tokens (`background`, `surface` = card, `outline` = border). Do not enable dynamic color; brand palette is fixed.
- [ ] Bundle Inter (body) and Lexend (headings/display) as downloadable or packaged fonts and wire them into the Compose `Typography`.
- [ ] Respect the design rules that carry over: no pill shapes (use 8 to 16 dp corner radii, never stadium buttons), no em/en dashes in any UI copy, sentence case labels.
- [ ] Add a splash screen (AndroidX SplashScreen API) with the Zyx logo on `background`.

### Phase 2. WebView container

- [ ] Build a single-Activity architecture: Compose scaffold hosting an `AndroidView`-wrapped `WebView` (or a `WebViewFragment`), kept as a singleton so navigation between native screens does not reload the page.
- [ ] Configure `WebSettings`:
  - [ ] `javaScriptEnabled = true`
  - [ ] `domStorageEnabled = true` (required by quiz progress, reader prefs, theme)
  - [ ] `mediaPlaybackRequiresUserGesture = false` if course videos should autoplay
  - [ ] Append an app marker to the UA: `settings.userAgentString += " ZyxApp/1.0 (Android)"`. Keep the Chrome UA prefix intact.
- [ ] Cookies: `CookieManager.getInstance().setAcceptCookie(true)` and `acceptThirdPartyCookies(webView, true)`; call `CookieManager.flush()` in `onPause` so the Better Auth session survives process death.
- [ ] `WebViewClient.shouldOverrideUrlLoading`:
  - [ ] Same-origin URLs load in the WebView.
  - [ ] External links (Google Drive, socials, mailto) open via Custom Tabs / ACTION_VIEW.
  - [ ] Block navigation to `/admin` and `/tutor` in the student app (open externally instead).
- [ ] `WebChromeClient`:
  - [ ] `onShowCustomView` / `onHideCustomView` for the material viewer fullscreen button (`components/course/material-viewer.tsx`); enter immersive mode and allow landscape.
  - [ ] `onShowFileChooser` wired to the photo picker / SAF (needed later if admin or profile uploads arrive).
  - [ ] `onProgressChanged` driving a top `LinearProgressIndicator`.
- [ ] Add `DownloadListener` that hands `https` downloads (diktat PDFs) to `DownloadManager` with the cookie header attached.
- [ ] Error UX: intercept `onReceivedError` for the main frame and show a native offline screen with a Retry button (matches the web error pattern: icon + message + retry).
- [ ] Handle back: predictive-back / `OnBackPressedCallback` that calls `webView.goBack()` when `canGoBack()`, otherwise navigates to the native grid, and only then exits.
- [ ] Keyboard: `android:windowSoftInputMode="adjustResize"` and edge-to-edge insets so the tutor chat input is not covered.

### Phase 3. Authentication (the critical path)

- [ ] **Native Google sign-in:** use Credential Manager (`GetGoogleIdOption`) with the **web client ID** as `serverClientId` to obtain a Google **ID token**. Do not attempt the OAuth redirect inside the WebView; Google returns `disallowed_useragent`.
- [ ] **Server: enable ID token sign-in.** Better Auth's Google provider accepts ID token sign-in via `POST /api/auth/sign-in/social` with `{ provider: "google", idToken: { token } }`. Verify the installed `better-auth@1.6.x` handles this and that the token audience (web client ID) is accepted; add the Android client ID to accepted audiences if needed.
- [ ] **Cookie handoff:** perform the sign-in request natively (OkHttp) against the production origin, read the `Set-Cookie` session cookie from the response, and write it into `CookieManager` for the app origin before loading `/dashboard`.
- [ ] Native sign-in screen: Zyx logo, one "Lanjutkan dengan Google" Material button (reuse copy and error messages from `components/auth/google-sign-in-button.tsx`, including the network failure toast text).
- [ ] Session lifecycle:
  - [ ] On app start, call `/api/auth/get-session` with the stored cookie; route to grid or sign-in accordingly.
  - [ ] Detect in `shouldOverrideUrlLoading` when the WebView lands on `/sign-in` (session expired per `proxy.ts` redirect) and bounce to the native sign-in screen instead of showing the web page.
  - [ ] Sign out: call `/api/auth/sign-out`, clear `CookieManager` for the origin, clear WebView storage, return to native sign-in.
- [ ] Optional hardening: adopt Better Auth's `expo`/bearer-style token plugin later if cookie handoff proves brittle across WebView updates.

### Phase 4. JS bridge (native ↔ web)

- [ ] Add `webView.addJavascriptInterface(ZyxBridge(), "ZyxNative")` exposing, at minimum:
  - [ ] `getPlatform(): "android"` and app version
  - [ ] `requestPushPermission()` → native `POST_NOTIFICATIONS` runtime permission (API 33+)
  - [ ] `share(text, url)` → native share sheet (replaces any future `navigator.share` use)
  - [ ] `copyToClipboard(text)` fallback for older WebViews
  - [ ] `openExternal(url)` → Custom Tab
- [ ] **Web-side app mode** (small PR to this repo):
  - [ ] Add a `lib/native-app.ts` helper: `isNativeApp()` checks `window.ZyxNative` or the `ZyxApp/` UA marker.
  - [ ] `components/notifications/push-permission-init.tsx`: when in app mode, skip the web Notification flow entirely and call `ZyxNative.requestPushPermission()` instead (native side registers the FCM token; see Phase 5).
  - [ ] Hide the theme-independent web chrome that native replaces: student sidebar and command menu in app mode (layout-level conditional), keeping in-course sub-navigation.
  - [ ] Suppress heavy landing/marketing ornaments (`three.js` canvas) in app mode; the app should boot straight to sign-in or dashboard, not the marketing homepage.
  - [ ] Add CSS safe-area padding (`env(safe-area-inset-*)`) for edge-to-edge.
- [ ] Keep every bridge method defensive on the web side (`typeof window.ZyxNative !== "undefined"`), so the site remains fully functional in normal browsers.

### Phase 5. Push notifications (replace web FCM)

- [ ] Add `firebase-messaging` (native) to the Android app; request `POST_NOTIFICATIONS` permission with a pre-permission explainer screen.
- [ ] On token refresh / first grant, POST the **native** FCM token to the existing endpoint `POST /api/notifications/register-token` with the session cookie, sending a device label like `Android <model> ZyxApp/1.0` (endpoint already stores arbitrary device strings in `user_push_tokens`).
- [ ] Verify the server send path treats native tokens identically (plain FCM tokens; the sender does not depend on web push VAPID).
- [ ] Notification taps: put the target route in the FCM `data` payload and deep-link the WebView to it (`/dashboard`, `/courses/{id}`, etc.).
- [ ] Create notification channels (e.g. "Study reminders", "Live quiz") and map payload types to channels.
- [ ] Delete the web token registration for this device when signing out (existing unregister endpoint, or accept server-side pruning of stale tokens).

### Phase 6. Material navigation grid (native home)

- [ ] Build the home screen as a Compose `LazyVerticalGrid` (2 columns on phones, 3 on ≥ 600 dp) of destination tiles, mirroring the student sidebar:

  | Tile | Route | Icon (Material Symbols equivalent) |
  |---|---|---|
  | Dashboard | `/dashboard` | `space_dashboard` |
  | Courses | `/courses` (or dashboard course list) | `menu_book` |
  | Calendar | `/calendar` | `calendar_month` |
  | Leaderboard | `/leaderboard` | `trophy` |
  | AI Tutor | `/dashboard?tutor=open` (or bridge call to open the tutor drawer) | `neurology` |
  | Feedback | `/feedback` | `rate_review` |
  | Profile | `/profile` | `person` |
  | Settings | `/settings` | `settings` |

- [ ] Tile design per Zyx rules: `Card` with 16 dp corner radius, `surface` container, icon in a circular 1:1 container (circles allowed), label in Lexend semibold, subtle pressed-state color transition; **no pill shapes, no gradients**.
- [ ] Add a compact header above the grid: greeting + streak count fetched from the existing `/api/student/today` endpoint (same one the sidebar uses) using the session cookie.
- [ ] Optional bottom `NavigationBar` (Dashboard, Courses, Grid/Home, Leaderboard, Profile) for one-tap switching once inside the WebView screen; keep grid as the hub either way.
- [ ] Selecting a tile pushes the WebView screen loading that route; re-selecting the current destination triggers a reload.
- [ ] Show native top app bar with the page title (from `WebChromeClient.onReceivedTitle`) and an up-arrow returning to the grid.

### Phase 7. Realtime, media, and edge cases

- [ ] Live quiz: confirm the `wss://` realtime worker URL is reachable from the app; test that `useLiveQuizSocket`'s backoff reconnect recovers after the device sleeps mid-session, and keep the screen on (`FLAG_KEEP_SCREEN_ON`) during an active live quiz page.
- [ ] Verify KaTeX rendering, `reactflow` graphs, and `recharts` on a low-end device with hardware acceleration on.
- [ ] Test `localStorage`-backed quiz resume across process death (start quiz, kill app, reopen).
- [ ] Confirm theme: `next-themes` toggle works in-app, and native scaffold colors follow the same choice (bridge the current theme value, or follow system for both).
- [ ] Disable text selection long-press only where it fights the UI (quiz options), not globally.
- [ ] Audit `app/template.tsx` transition animations in WebView; disable in app mode if they jank.

### Phase 8. Hardening and release

- [ ] Network security config: HTTPS only, no cleartext.
- [ ] Restrict the WebView to the production origin allowlist; everything else goes external.
- [ ] Do not expose bridge methods that return secrets; annotate all bridge methods `@JavascriptInterface` and validate inputs.
- [ ] Sentry Android SDK for the native shell (web side already has `@sentry/nextjs`).
- [ ] Test matrix: API 26, 29, 33, 35; light/dark; offline start; token expiry mid-session; Play Store WebView beta.
- [ ] Play listing: privacy policy URL, data safety form (account data, FCM), app signing, internal testing track first.

---

## Suggested implementation order

1. Phase 1 + 2 (scaffold + WebView loading production, browse as guest) ; 1 to 2 days.
2. Phase 3 (native Google sign-in + cookie handoff) ; the riskiest piece, prototype early.
3. Phase 6 (grid + navigation) once authenticated browsing works.
4. Phase 4 + 5 (bridge + push) ; requires the small web-side PR.
5. Phase 7 + 8 (polish, hardening, release).
