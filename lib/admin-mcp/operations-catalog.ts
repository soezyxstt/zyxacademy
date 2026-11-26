/** Source-level coverage index. Tool registration is authoritative; partial does not imply every action is exposed. */
export const operationsCatalog = [
  {
    "source": "app/api/native/student/zyra/route.ts",
    "actions": ["GET"],
    "tools": [],
    "status": "excluded",
    "reason": "Learner Zyra history and receipts are bound to the verified Student account and course. The interactive chat reuses the existing course authorization, usage limits and private conversation history."
  },
  {
    "source": "app/api/zyra/chat/route.ts",
    "actions": ["POST"],
    "tools": [],
    "status": "excluded",
    "reason": "Course tutoring streams use the learner's own session, active course policy and usage limits. Native clients request history persistence with the verified Student identity. The separate administrative Zyra tooling keeps its own authorization."
  },
  {
    "source": "app/api/student/navigation/route.ts",
    "actions": ["GET"],
    "tools": [],
    "status": "excluded",
    "reason": "The interactive Student course switcher uses authenticated enrollment and course title metadata. Navigation does not grant access or bypass course and material authorization."
  },
  {
    "source": "app/api/native/student/courses/route.ts",
    "actions": ["GET", "POST"],
    "tools": [],
    "status": "excluded",
    "reason": "The Expo course views return metadata and Diktat PDF download eligibility for the signed-in learner under the existing course policy. Activation is the learner's existing group token redemption flow, with live Student authorization and a bound account. Admin MCP tools retain their own enrollment and group permissions."
  },
  {
    "source": "app/api/native/student/learning/route.ts",
    "actions": ["GET", "POST"],
    "tools": [],
    "status": "excluded",
    "reason": "Expo learning reads, recall grades and PKA announcement acknowledgements are bound to the current Student account and use existing course or campaign authorization. PKA remains outside Admin MCP. Existing tools, OAuth consent and scopes, discovery, playbooks, packaged skills, host prompts and environment bindings are unchanged."
  },
  {
    "source": "app/api/videos/[videoId]/playback-url/route.ts",
    "actions": ["GET"],
    "tools": [],
    "status": "excluded",
    "reason": "Interactive playback mints a temporary source after the existing course and chapter access checks. Expo plays the source within the signed-in session. Administrative video tools continue to manage course content under their own scopes and consent."
  },
  {
    "source": "app/api/native/student/learning/live/route.ts",
    "actions": ["POST"],
    "tools": [],
    "status": "excluded",
    "reason": "Joining a live room requires an interactive Student session, an active course enrollment and a valid room code. The short-lived token is specific to the learner and room. Tutor hosting remains independently authorized."
  },
  {
    "source": "app/api/native/student/material-pdf/route.ts",
    "actions": ["GET", "HEAD"],
    "tools": [],
    "status": "excluded",
    "reason": "The authenticated Student PDF reader checks assigned chapter scope, current file revision and PKA registration before serving inline bytes or renewing access. It uses app-private temporary files and never exposes storage links or an MCP reader credential."
  },
  {
    "source": "app/api/native/student/reading/route.ts",
    "actions": ["GET"],
    "tools": [],
    "status": "excluded",
    "reason": "Published learner reading uses the current Student session, course and chapter authorization, and Tutorial PKA registration where applicable. Admitted image bytes are bound to the same authorized revision. Native reading does not accept MCP credentials or change authoring permissions."
  },
  {
    "source": "app/api/native/student/community/[operation]/route.ts",
    "actions": ["GET", "POST"],
    "tools": [],
    "status": "excluded",
    "reason": "Native Student community requests bind the verified learner session to existing ranking, profile, privacy, schedule, discussion, group, rewards, feedback and personal notification operations. These participant and device choices retain existing authorization and OAuth consent. Administrative MCP scopes, discovery, tools, playbooks, packaged skills, host prompts and environment bindings stay as registered."
  },
  {
    "source": "app/api/native/student/assessment/[courseId]/[...segments]/route.ts",
    "actions": ["readStudentAssessment", "startQuizAttempt", "submitQuizAttempt", "submitTryout", "manageAssessmentAttachment", "regenerateQuizAnalytics", "completeSolutionCollection"],
    "tools": [],
    "status": "excluded",
    "reason": "Learner assessment requires the native Student session, course eligibility and attempt ownership. Tryout submission checks publication under the same exam lock as Admin lifecycle writes. The learner API uses existing academic services through app HTTPS and does not accept MCP credentials."
  },
  {
    "source": "app/api/native/academic/[...resource]/route.ts",
    "actions": ["GET", "POST", "PATCH", "DELETE"],
    "tools": [],
    "status": "excluded",
    "reason": "Course and roster reads use the signed-in role and course assignment. Course and chapter management, settings and PDF titles use shared projections and authorized retry receipts. Confirmed course and chapter archives check revisions and connected records. Chapter reorder checks the whole course chapter set and revision. MCP courses.*, chapters.* and materials.update_metadata retain their registered authorization and input contracts."
  },
  {
    "source": "app/api/native/academic/tutor-support/[...resource]/route.ts",
    "actions": ["GET", "POST", "PATCH"],
    "tools": [],
    "status": "excluded",
    "reason": "Schedule, live class, materials and discussions use the current Tutor session. Availability edits apply the web schedule rules and verify slot ownership and revision. Replies reuse the signed-in discussion service. Tryout grades use the web grading operation and the stored answer revision. The writes use durable receipts scoped to the active Tutor session."
  },
  {
    "source": "app/api/native/academic/tutor-support/courses/[courseId]/live/host/route.ts",
    "actions": ["GET", "POST"],
    "tools": [],
    "status": "excluded",
    "reason": "Live quiz hosting requires a verified Tutor session, active course assignment and current room ownership. HTTPS commands use the web live room service and host state uses its signed realtime socket. MCP credentials cannot open or control a room."
  },
  {
    "source": "app/api/native/academic-assessment/[...resource]/route.ts",
    "actions": ["GET", "POST", "PATCH", "DELETE"],
    "tools": [],
    "status": "excluded",
    "reason": "Interactive assessment reads and manual grading use the signed-in role, disclosure checks and course access. Tutor attachment downloads resolve the exact submitted answer and use protected storage. Grading retries are bound to the active Tutor session. Tryout drafts, explicit metadata and lifecycle saves, and bank selection require active Admin authority and course-scoped revisions. The status-aware route binds retry receipts to the original Admin session. Tutor bank edits require the active Tutor session and an assigned course. Source references remain immutable. Existing MCP authoring tools keep their registered scopes, consent and service contracts."
  },
  {
    "source": "app/api/native/academic-administration/[...resource]/route.ts",
    "actions": ["GET", "POST", "PATCH"],
    "tools": [],
    "status": "excluded",
    "reason": "The Expo adapter reads administrative data and uses active Admin sessions for study groups, enrollment tokens, user status, PKA and Idea item review. Idea item review uses the staged artifact and the canonical reviewer decision operation with a session-scoped receipt. Native notification broadcasts require a live Admin session and a confirmed audience snapshot, with receipts isolated from MCP jobs. MCP operations retain their registered scopes and consent."
  },
  {
    "source": "app/api/admin/bundles/product/[id]/pdf/route.ts",
    "actions": ["GET", "POST"],
    "tools": [],
    "status": "excluded",
    "reason": "The V2/V3 draft PDF queue uses the signed-in Admin UI and an exact Diktat, revision and request identity. V4 uses its separate trusted verification workflow and scoped authoring tools."
  },
  {
    "source": "app/api/forms/[idOrSlug]/route.ts",
    "actions": ["GET", "POST"],
    "tools": [],
    "status": "excluded",
    "reason": "Public form links resolve published respondent content. Live submissions use the respondent session or the form's anonymous policy. Admin MCP forms preview and simulation use separate read scopes and never submit live responses."
  },
  {
    "source": "app/api/forms/upload/route.ts",
    "actions": ["POST"],
    "tools": [],
    "status": "excluded",
    "reason": "Public file uploads attach files to a live respondent form under its current upload and authentication policy. Respondents opening an Expo link choose and submit files on the website under their browser session. Admin MCP preview and simulation do not upload respondent files."
  },
  {
    "source": "app/api/meet/[slug]/route.ts",
    "actions": ["GET"],
    "tools": [],
    "status": "excluded",
    "reason": "The public lookup reports the title behind one exact Zyx meeting link. The canonical web route rechecks availability before Google Meet applies its own admission policy. Administrative meeting operations and MCP authorization, scopes, consent and environment bindings are independent."
  },
  {
    "source": "app/api/tautan/route.ts",
    "actions": ["GET"],
    "tools": [],
    "status": "excluded",
    "reason": "Public clients read the same published link fields as the public directory. Existing administrative links tools retain their scopes, consent, environment and ability to manage unpublished entries."
  },
  {
    "source": "app/api/auth/native/expo/exchange/route.ts",
    "actions": ["POST"],
    "tools": [],
    "status": "excluded",
    "reason": "The internal staging Expo app exchanges a browser login code bound to its own verifier. This is an interactive end-user session. MCP clients keep their separate OAuth registration, consent, scopes, discovery, playbooks, packaged skills and environment bindings."
  },
  {
    "source": "components/admin/offline-cache-settings.tsx",
    "actions": ["save", "refresh"],
    "tools": [],
    "status": "excluded",
    "reason": "Offline cache policy and manual invalidation currently use the authenticated admin UI with origin checks and revision conflicts. Existing publication, revision, withdrawal, enrollment, course and video services record durable offline changes for their existing Admin and MCP callers. This adds no MCP tools or changes to scopes, consent, discovery, skills, host prompts or staging/production bindings. Device download and storage choices remain local to the signed-in user."
  },
  {
    "source": "apps/mobile-native/offline/lifecycle-provider.tsx",
    "actions": ["foregroundSync"],
    "tools": [],
    "status": "excluded",
    "reason": "Foreground recovery rechecks the current Expo session and Student role before fetching its offline metadata on the configured origin. The native lifecycle and connectivity state are device-local. Existing MCP authorization and environment bindings still apply to the server operations that change offline content."
  },
  {
    "source": "apps/mobile-native/app/offline.tsx",
    "actions": ["download", "read", "forget", "revalidateSaved", "purgeUnavailable"],
    "tools": [],
    "status": "excluded",
    "reason": "Expo manages the signed-in learner's local downloads. Refresh reads existing authenticated offline endpoints on the configured app origin. MCP tools, scopes, consent, discovery, playbooks, packaged skills, host prompts and environment bindings are unchanged."
  },
  {
    "source": "app/(student)/feedback/feedback-form.tsx",
    "actions": ["handleSubmit"],
    "tools": [],
    "status": "excluded",
    "reason": "Signed-in learner feedback uses the existing server action. Browser form validation and restored-draft recovery do not add admin MCP access or change authorization, scopes, consent, discovery, playbooks, packaged skills or host prompts."
  },
  {
    "source": "apps/desktop/dist/index.html",
    "actions": ["probeServerReachable", "handleReturnOnline"],
    "tools": [],
    "status": "excluded",
    "reason": "Installed-device launch and offline reading use the existing native origin and reading commands. Connection state and retry behavior do not change MCP tools, scopes, consent, discovery, playbooks, packaged skills, host prompts or environment bindings."
  },
  {
    "source": "app/(student)/settings/settings-client.tsx",
    "actions": ["setLocale", "setPreference", "setHapticsEnabled", "restoreDisplayDefaults"],
    "tools": [],
    "status": "excluded",
    "reason": "Personal interface language and device display, vibration and alert choices require the signed-in UI or local device. Preference grouping and reset do not change MCP tools, scopes, consent, discovery, playbooks, packaged skills, host prompts or environment bindings."
  },
  {
    "source": "apps/mobile-native/device/preferences.ts",
    "actions": ["setTheme", "setHaptics"],
    "tools": [],
    "status": "excluded",
    "reason": "Expo appearance and haptics are personal device preferences. The host uses the existing verified account locale, session and origin for app copy. MCP tools, scopes, consent, discovery, playbooks, packaged skills, host prompts and environment bindings are unchanged."
  },
  {
    "source": "apps/mobile-native/features/site-search/results.ts",
    "actions": ["readSearchHits"],
    "tools": [],
    "status": "excluded",
    "reason": "The authenticated app reads the existing role-filtered site search on its current origin. Result selection opens an installed role route or the public website. Search does not delegate an admin operation or change MCP authorization."
  },
  {
    "source": "apps/mobile-native/routing/route-history.ts",
    "actions": ["remember", "restore", "clear"],
    "tools": [],
    "status": "excluded",
    "reason": "The app remembers a local navigation destination for the verified session. Installed routes, roles and product authorization still apply. MCP tools, scopes, consent, discovery, playbooks, packaged skills, host prompts and environment bindings are unchanged."
  },
  {
    "source": "components/onboarding/guided-tour.tsx",
    "actions": ["start", "progress", "skip", "restart"],
    "tools": [],
    "status": "excluded",
    "reason": "First-use student and tutor tours guide the user's real browser or native app controls. Progress belongs to the signed-in account and role. Notification permission requires the user's direct browser or device action and does not change email preferences. Admin MCP tools, scopes, consent, discovery, playbooks, packaged skills, host prompts and environment bindings are unchanged; agents must not complete a user's tour for them."
  },
  {
    "source": "app/(student)/settings/notifications/actions.ts",
    "actions": ["updateNotificationPreferencesAction", "updateActivityNotificationPreferenceAction"],
    "tools": [],
    "status": "excluded",
    "reason": "Personal notification choices are account-owned, signed-in UI preferences. No administrative MCP scope or tool changes."
  },
  {
    "source": "components/native/app-update-control.tsx",
    "actions": ["checkForUpdates", "triggerInstall"],
    "tools": [],
    "status": "excluded",
    "reason": "Installed-device version checks and installer launch require the native app. MCP tokens, scopes, consent, discovery, playbooks, packaged skills and host prompts cannot install or update a user's device."
  },
  {
    "source": "app/api/native/context/route.ts",
    "actions": ["GET"],
    "tools": [],
    "status": "excluded",
    "reason": "The Expo client reads the active account's own role memberships and locale for routing. Each product API still enforces object permissions. MCP client identity, consent, scopes, discovery, playbooks, packaged skills and environment bindings are independent."
  },
  {
    "source": "apps/mobile-native/routing/BrowserHandoff.tsx",
    "actions": ["open"],
    "tools": [],
    "status": "excluded",
    "reason": "The app opens the staging Next consent or account connections URL in the system browser. The browser owns the session. Consent, registration, scopes, redirect validation, revocation and environment binding stay on their existing server paths."
  },
  {
    "source": "apps/mobile-native/routing/PublicWebsiteRoute.tsx",
    "actions": ["open"],
    "tools": [],
    "status": "excluded",
    "reason": "The Expo client opens public marketing, blog, form, short-link and meeting URLs in the browser on the configured website origin. Each browser request follows the website's session and permissions. Administrative MCP tools use their existing scopes and consent."
  },
  {
    "source": "apps/mobile-native/app/meet/[slug].tsx",
    "actions": ["open"],
    "tools": [],
    "status": "excluded",
    "reason": "The app opens the canonical public meeting link on its configured staging origin. Browser and Google accounts handle admission independently of the Expo session. No MCP or OAuth credential is passed."
  },
  {
    "source": "app/api/notifications/history/route.ts",
    "actions": ["resolveOwnNotificationTap"],
    "status": "excluded",
    "tools": [],
    "reason": "An OS push tap resolves one visible inbox notification owned by the active app session. This personal device interaction cannot query another account. Administrative notification history has a separate authorized operation."
  },
  {
    "source": "apps/mobile-native/device/remote-response.ts",
    "actions": ["consume"],
    "tools": [],
    "status": "excluded",
    "reason": "Expo handles an interactive device tap within its verified origin, account and session. Session revalidation can retry the personal visibility lookup once. The read acknowledgement has no automatic replay. Administrative MCP tools, scopes, consent and environment bindings are unchanged."
  },
  {
    "source": "apps/mobile-native/features/notification-inbox/client.ts",
    "actions": ["loadInbox", "markInboxRead"],
    "tools": [],
    "status": "excluded",
    "reason": "The account holder opens their own notification history and acknowledges visible notifications through their interactive session. Administrative notification history and sending retain their existing MCP authorization."
  },
  {
    "source": "apps/mobile-native/features/notification-inbox/staff-device-push.tsx",
    "actions": ["requestPermission", "openSettings"],
    "tools": [],
    "status": "excluded",
    "reason": "A verified Tutor or Admin explicitly chooses a device notification action from an open inbox on a supported build. The OS manages user consent and app settings. Existing registration uses the same verified account session and app origin. Administrative MCP tools and bindings remain unchanged."
  },
  {
    "source": "apps/mobile-native/device/reminder-controller.ts",
    "actions": ["updateSettings", "refreshTutorSessions"],
    "tools": [],
    "status": "excluded",
    "reason": "The Student notification settings screen schedules local study and tutorial reminders for the verified account on its device. The OS handles permission and delivery. Tutorial schedules and quiet hours use existing authorized reads."
  },
  {
    "source": "apps/mobile-native/device/file-controller.ts",
    "actions": ["pickDocument", "shareDocument", "shareAuthorizedDownload"],
    "tools": [],
    "status": "excluded",
    "reason": "The signed-in user selects a local document or downloads using an existing authorized route. Student Diktat PDF downloads use the learner's verified session and the existing download permission. The OS sheet controls sharing on the device. MCP authorization and publication are independent."
  },
  {
    "source": "apps/mobile-native/device/audio-controller.ts",
    "actions": ["play", "pause", "seekBy", "seekTo"],
    "tools": [],
    "status": "excluded",
    "reason": "Playback controls operate on local media on the device, with no server mutation, recording permission or MCP operation."
  },
  {
    "source": "apps/mobile-native/device/photo-controller.ts",
    "actions": ["pick", "recover"],
    "tools": [],
    "status": "excluded",
    "reason": "A signed-in user chooses a photo for one local device draft. Camera consent and Android picker recovery are device actions. Upload authorization stays with the consuming domain. This adds no MCP operation, scope or environment binding."
  },
  {
    "source": "apps/mobile-native/device/notifications-controller.ts",
    "actions": ["requestPermission", "sync", "setAccount"],
    "tools": [],
    "status": "excluded",
    "reason": "Push permission requires direct device consent. Registration, rotation and removal use the authenticated app session on its own origin and do not change admin notification operations or MCP bindings."
  },
  {
    "source": "components/course/material-viewer.tsx",
    "actions": ["navigateToSection"],
    "tools": [],
    "status": "excluded",
    "reason": "Browser-only Diktat reading layout and position. Bundle payloads, download permissions, completion persistence and MCP contracts are unchanged."
  },
  {
    "source": "components/course/structured-article-reader.tsx",
    "actions": ["toggleReadingFocus", "toggleFormativeCheck", "navigateToSection"],
    "tools": [],
    "status": "excluded",
    "reason": "Browser-only reading presentation and session checkpoint indicators. Authoring content, assessment authorization, scopes and environment bindings are unchanged."
  },
  {
    "source": "app/(admin)/admin/(academic)/authoring-context/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/(academic)/bundles/idea/page.tsx",
    "actions": [],
    "tools": [
      "authoring.list_imports",
      "authoring.get_import",
      "authoring.review_idea_bundle",
      "authoring.review_product_bundle"
    ],
    "status": "existing-authoring",
    "reason": "Existing authoring tools cover related workflows only, not necessarily every page action."
  },
  {
    "source": "app/(admin)/admin/(academic)/bundles/product/page.tsx",
    "actions": [],
    "tools": [
      "authoring.list_imports",
      "authoring.get_import",
      "authoring.review_idea_bundle",
      "authoring.review_product_bundle"
    ],
    "status": "existing-authoring",
    "reason": "Existing authoring tools cover related workflows only, not necessarily every page action."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/analytics/[quizId]/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/analytics/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/documents/[materialId]/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/documents/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/flashcards/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/leaderboard/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/questions/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/quizzes/[id]/edit/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/quizzes/new/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/quizzes/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/results/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/review/idea/[bundleId]/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/review/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/review/product/[bundleId]/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/settings/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/tryouts/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/[slug]/videos/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/actions.ts",
    "actions": [
      "getCourses",
      "getCoursesWithStats",
      "saveCourse",
      "deleteCourse",
      "setDemoCourse",
      "getCourseDetailData",
      "getCourseChapters",
      "getAllChapters",
      "saveChapter",
      "deleteChapter",
      "reorderChapters",
      "getUploadedMaterials",
      "saveCourseMaterial",
      "deleteCourseMaterial",
      "updateCourseMaterial",
      "updateDocumentStatusAction",
      "updateArticleContentAction",
      "getCourseNavContext",
      "standardizeDocumentTitleAction",
      "batchStandardizeDocumentsAction"
    ],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/flashcard-actions.ts",
    "actions": [
      "getCourseFlashcardsData",
      "createFlashcardSetAction",
      "updateFlashcardSetAction",
      "deleteFlashcardSetAction",
      "createFlashcardAction",
      "updateFlashcardAction",
      "deleteFlashcardAction"
    ],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/import-actions.ts",
    "actions": [
      "importCourseBundleAction",
      "importAssessmentBundleAction"
    ],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/courses/page.tsx",
    "actions": [],
    "tools": [
      "chapters.archive",
      "chapters.create",
      "chapters.get",
      "chapters.list",
      "chapters.order",
      "chapters.reorder",
      "chapters.update",
      "courses.archive",
      "courses.create",
      "courses.get",
      "courses.list",
      "courses.update",
      "generation.scope",
      "generation.start",
      "materials.get",
      "materials.list",
      "materials.update_metadata",
      "videos.create",
      "videos.delete",
      "videos.get",
      "videos.list",
      "videos.playlists.create",
      "videos.playlists.list",
      "videos.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/groups/actions.ts",
    "actions": [
      "getAdminStudyGroups",
      "getAdminGroupDetail",
      "createStudyGroup",
      "updateStudyGroup",
      "deleteStudyGroup",
      "addGroupMember",
      "removeGroupMember",
      "adjustGroupQuota",
      "searchStudents"
    ],
    "tools": [
      "groups.adjust_quota",
      "groups.create",
      "groups.get",
      "groups.inspect",
      "groups.list",
      "groups.members.add",
      "groups.members.list",
      "groups.members.remove",
      "groups.set_status",
      "groups.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/groups/page.tsx",
    "actions": [],
    "tools": [
      "groups.adjust_quota",
      "groups.create",
      "groups.get",
      "groups.inspect",
      "groups.list",
      "groups.members.add",
      "groups.members.list",
      "groups.members.remove",
      "groups.set_status",
      "groups.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/materials/manual/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/(academic)/materials/page.tsx",
    "actions": [],
    "tools": [
      "materials.list"
    ],
    "status": "implemented",
    "reason": "Listed tools cover bounded metadata reads only; other actions remain excluded."
  },
  {
    "source": "app/(admin)/admin/(academic)/materials/review/idea/[slug]/page.tsx",
    "actions": [],
    "tools": [
      "authoring.list_imports",
      "authoring.get_import",
      "authoring.review_idea_bundle",
      "authoring.review_product_bundle"
    ],
    "status": "existing-authoring",
    "reason": "Existing authoring tools cover related workflows only, not necessarily every page action."
  },
  {
    "source": "app/(admin)/admin/(academic)/materials/review/page.tsx",
    "actions": [],
    "tools": [
      "authoring.list_imports",
      "authoring.get_import",
      "authoring.review_idea_bundle",
      "authoring.review_product_bundle"
    ],
    "status": "existing-authoring",
    "reason": "Existing authoring tools cover related workflows only, not necessarily every page action."
  },
  {
    "source": "app/(admin)/admin/(academic)/materials/review/product/[slug]/page.tsx",
    "actions": [],
    "tools": [
      "authoring.list_imports",
      "authoring.get_import",
      "authoring.review_idea_bundle",
      "authoring.review_product_bundle"
    ],
    "status": "existing-authoring",
    "reason": "Existing authoring tools cover related workflows only, not necessarily every page action."
  },
  {
    "source": "app/(admin)/admin/(academic)/notifications/actions.ts",
    "actions": [
      "sendBroadcastAction",
      "getNotificationHistoryAction",
      "getCoursesForTargetingAction"
    ],
    "tools": [
      "notifications.audience",
      "notifications.history",
      "notifications.send"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/notifications/page.tsx",
    "actions": [],
    "tools": [
      "notifications.audience",
      "notifications.history",
      "notifications.send"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/schedules/actions.ts",
    "actions": [
      "getAdminScheduleData",
      "executeAdminCreateTutorAvailability",
      "executeAdminDeleteTutorAvailability",
      "executeAdminAssignTutorialSession",
      "executeAdminMoveTutorialSession",
      "executeAdminCancelTutorialSession",
      "adminCreateTutorAvailability",
      "adminAssignTutorialSession",
      "adminMoveTutorialSession",
      "adminCancelTutorialSession",
      "adminDeleteTutorAvailability",
      "updateTutorCourses",
      "createAcademicSchedule",
      "updateAcademicSchedule",
      "deleteAcademicSchedule",
      "adminBatchGenerateMeet"
    ],
    "tools": [
      "schedules.create",
      "schedules.delete",
      "schedules.get",
      "schedules.list",
      "schedules.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/schedules/page.tsx",
    "actions": [],
    "tools": [
      "schedules.create",
      "schedules.delete",
      "schedules.get",
      "schedules.list",
      "schedules.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/tokens/actions.ts",
    "actions": [
      "getEnrollmentTokens",
      "generateEnrollmentToken",
      "deleteEnrollmentToken"
    ],
    "tools": [
      "tokens.create",
      "tokens.get",
      "tokens.list",
      "tokens.reveal",
      "tokens.revoke"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/tokens/page.tsx",
    "actions": [],
    "tools": [
      "tokens.create",
      "tokens.get",
      "tokens.list",
      "tokens.reveal",
      "tokens.revoke"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/tutorial-pka/actions.ts",
    "actions": [
      "createAndSendPkaAnnouncementAction",
      "getPkaAnnouncementsAction",
      "archivePkaAnnouncementAction",
      "togglePinPkaAnnouncementAction",
      "editPkaAnnouncementAction",
      "createPkaScheduleAction",
      "updatePkaScheduleAction",
      "deletePkaScheduleAction",
      "getPkaSchedulesAction",
      "getPkaRegistrationsAction"
    ],
    "tools": [],
    "status": "excluded",
    "reason": "PKA is explicitly excluded from the Admin MCP expansion by product decision; existing PKA behavior is unchanged."
  },
  {
    "source": "app/(admin)/admin/(academic)/tutorial-pka/announcements/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "PKA is explicitly excluded from the Admin MCP expansion by product decision; existing PKA behavior is unchanged."
  },
  {
    "source": "app/(admin)/admin/(academic)/tutorial-pka/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "PKA is explicitly excluded from the Admin MCP expansion by product decision; existing PKA behavior is unchanged."
  },
  {
    "source": "app/(admin)/admin/(academic)/tutorial-pka/registrations/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "PKA is explicitly excluded from the Admin MCP expansion by product decision; existing PKA behavior is unchanged."
  },
  {
    "source": "app/(admin)/admin/(academic)/tutorial-pka/schedules/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "PKA is explicitly excluded from the Admin MCP expansion by product decision; existing PKA behavior is unchanged."
  },
  {
    "source": "app/(admin)/admin/(academic)/users/actions.ts",
    "actions": [
      "getAdminUsersData",
      "updateUserRolesAction",
      "updateUserStatusAction"
    ],
    "tools": [
      "users.get",
      "users.list",
      "users.set_roles",
      "users.set_status"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(academic)/users/page.tsx",
    "actions": [],
    "tools": [
      "users.get",
      "users.list",
      "users.set_roles",
      "users.set_status"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/(content)/assessments/[id]/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/(content)/assessments/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/(content)/ast-inspector/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/(content)/diktats/actions.ts",
    "actions": [
      "createDiktatDraftAction",
      "compileDiktatAction",
      "deleteDiktatAction"
    ],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/(content)/diktats/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/(eval)/distractors/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/(eval)/jobs/page.tsx",
    "actions": [],
    "tools": [
      "jobs.list"
    ],
    "status": "implemented",
    "reason": "Bounded metadata read only; other actions remain excluded."
  },
  {
    "source": "app/(admin)/admin/(eval)/leaderboard/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/(eval)/questions/page.tsx",
    "actions": [],
    "tools": [
      "assessment.list_questions",
      "assessment.get_question",
      "assessment.update_question"
    ],
    "status": "existing-authoring",
    "reason": "Existing authoring tools cover related workflows only, not necessarily every page action."
  },
  {
    "source": "app/(admin)/admin/(eval)/quiz-insights/[id]/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/(eval)/quiz-insights/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/(eval)/quizzes/[id]/edit/page.tsx",
    "actions": [],
    "tools": [
      "quiz.list",
      "quiz.get",
      "quiz.create",
      "quiz.update",
      "quiz.set_questions"
    ],
    "status": "existing-authoring",
    "reason": "Existing authoring tools cover related workflows only, not necessarily every page action."
  },
  {
    "source": "app/(admin)/admin/(eval)/quizzes/new/page.tsx",
    "actions": [],
    "tools": [
      "quiz.list",
      "quiz.get",
      "quiz.create",
      "quiz.update",
      "quiz.set_questions"
    ],
    "status": "existing-authoring",
    "reason": "Existing authoring tools cover related workflows only, not necessarily every page action."
  },
  {
    "source": "app/(admin)/admin/(eval)/quizzes/page.tsx",
    "actions": [],
    "tools": [
      "quiz.list",
      "quiz.get",
      "quiz.create",
      "quiz.update",
      "quiz.set_questions"
    ],
    "status": "existing-authoring",
    "reason": "Existing authoring tools cover related workflows only, not necessarily every page action."
  },
  {
    "source": "app/(admin)/admin/blog/[id]/edit/page.tsx",
    "actions": [],
    "tools": [
      "blog.create",
      "blog.get",
      "blog.list",
      "blog.set_publication",
      "blog.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/blog/actions.ts",
    "actions": [
      "saveArticle"
    ],
    "tools": [
      "blog.create",
      "blog.get",
      "blog.list",
      "blog.set_publication",
      "blog.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/blog/new/page.tsx",
    "actions": [],
    "tools": [
      "blog.create",
      "blog.get",
      "blog.list",
      "blog.set_publication",
      "blog.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/blog/page.tsx",
    "actions": [],
    "tools": [
      "blog.create",
      "blog.get",
      "blog.list",
      "blog.set_publication",
      "blog.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/api/blog/upload/route.ts",
    "actions": ["POST"],
    "tools": [],
    "status": "excluded",
    "reason": "Interactive blog media upload uses the authenticated web tutor or Admin session, or the bound native Admin session for thumbnails. Blog MCP article tools can reference accepted media URLs under their existing scopes and consent."
  },
  {
    "source": "app/(admin)/admin/forms/[id]/page.tsx",
    "actions": [],
    "tools": [
      "forms.archive",
      "forms.create",
      "forms.get",
      "forms.list",
      "forms.presets.create",
      "forms.presets.delete",
      "forms.presets.get",
      "forms.presets.list",
      "forms.presets.update",
      "forms.preview",
      "forms.responses.export",
      "forms.responses.export_sheet",
      "forms.responses.get",
      "forms.responses.list",
      "forms.responses.sheet_state",
      "forms.responses.summarize",
      "forms.set_acceptance",
      "forms.simulate_submission",
      "forms.update",
      "forms.validate_answers"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/forms/page.tsx",
    "actions": [],
    "tools": [
      "forms.archive",
      "forms.create",
      "forms.get",
      "forms.list",
      "forms.presets.create",
      "forms.presets.delete",
      "forms.presets.get",
      "forms.presets.list",
      "forms.presets.update",
      "forms.preview",
      "forms.responses.export",
      "forms.responses.export_sheet",
      "forms.responses.get",
      "forms.responses.list",
      "forms.responses.sheet_state",
      "forms.responses.summarize",
      "forms.set_acceptance",
      "forms.simulate_submission",
      "forms.update",
      "forms.validate_answers"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/media/page.tsx",
    "actions": [],
    "tools": [
      "media.list",
      "media.upload"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/meet/[id]/page.tsx",
    "actions": [],
    "tools": [
      "meet.create",
      "meet.end",
      "meet.get",
      "meet.list"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/meet/page.tsx",
    "actions": [],
    "tools": [
      "meet.create",
      "meet.end",
      "meet.get",
      "meet.list"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/ops/analytics/page.tsx",
    "actions": [],
    "tools": [
      "analytics.courses",
      "analytics.overview"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/ops/feature-usage/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/ops/flags/page.tsx",
    "actions": [],
    "tools": [
      "settings.feature_flags"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/ops/keys/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/ops/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/ops/short-links/page.tsx",
    "actions": [],
    "tools": [
      "shortlinks.create",
      "shortlinks.delete",
      "shortlinks.get",
      "shortlinks.list",
      "shortlinks.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/ops/tutor-activity/actions.ts",
    "actions": [
      "getTutorActivityLogsAction",
      "getTutorActivityStatsAction",
      "getTutorActivityFilterOptionsAction",
      "getTutorActivityDetailAction"
    ],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/ops/tutor-activity/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/api/admin/native-monitoring/route.ts",
    "actions": ["GET", "POST"],
    "tools": ["shortlinks.create"],
    "status": "partial",
    "reason": "The native Admin UI reuses web monitoring behind canonical admin session authorization. Native writes validate origin and input, including short links, analytics sync, versioned model changes, latency scheduling and read-only report proposal creation/review/confirmation. Its MCP equivalent retains its existing scope and request-key contract. This adapter changes no MCP tools, scopes, consent, discovery, playbooks, packaged skills, host prompts or environment bindings."
  },
  {
    "source": "app/(admin)/admin/ops/web-analytics/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/pricing/actions.ts",
    "actions": [
      "getDiscountVouchers",
      "getActiveDiscountVouchers",
      "createDiscountVoucher",
      "toggleDiscountVoucherStatus",
      "deleteDiscountVoucher"
    ],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/pricing/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "No operations tool implemented for this source; mutations require service invariants and concurrency review."
  },
  {
    "source": "app/(admin)/admin/tautan/page.tsx",
    "actions": [],
    "tools": [
      "links.create",
      "links.delete",
      "links.get",
      "links.list",
      "links.update"
    ],
    "status": "partial",
    "reason": "Related MCP operations are implemented; this source may contain additional UI actions. See docs/operations/admin-mcp.md for exact supported boundaries."
  },
  {
    "source": "app/(admin)/admin/docs/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "Documentation navigation is available in the Admin UI."
  },
  {
    "source": "app/(admin)/admin/docs/[slug]/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "Documentation reading is available in the Admin UI."
  },
  {
    "source": "app/api/native/operations/management/route.ts",
    "actions": ["GET", "POST"],
    "tools": [],
    "status": "excluded",
    "reason": "The native Admin workspace uses the verified Admin account. Discussion links, targeted message reads and paginated report reads use the existing role and channel authorization. Management writes retain their interactive authorization and retry rules. No new MCP capability or scope is granted."
  },
  {
    "source": "app/(admin)/admin/discussions/page.tsx",
    "actions": [],
    "tools": [],
    "status": "excluded",
    "reason": "Discussion moderation and replies use the Admin UI."
  },
  {
    "source": "app/(admin)/admin/ops/models/page.tsx",
    "actions": ["listAiModelSettingsAction", "updateAiModelSettingAction", "resetAiModelSettingAction", "refreshAiModelLatenciesAction"],
    "tools": [],
    "status": "excluded",
    "reason": "Model assignments, Gateway catalog observations and billed latency refresh use the Admin UI. Feature flag reads do not expose these actions or authorize provider probes."
  },
  {
    "source": "app/api/admin/ops-ai/execute/route.ts",
    "actions": ["confirmAdminOperation", "revokeChatOperationGrants"],
    "tools": [],
    "status": "excluded",
    "reason": "Ops AI chat approvals require the active browser admin session and specific chat. Shared domain operations retain the MCP signed-plan and consent contracts."
  },
  {
    "source": "components/auth/sidebar-account-menu.tsx",
    "actions": ["switchAccount", "addAccount", "removeAccount", "logout"],
    "tools": [],
    "status": "excluded",
    "reason": "Saved-account selection, Google sign-in and device session removal require the user's browser or native app. MCP bearer tokens retain their authorized user, session, scopes and environment; account switching cannot retarget them."
  }
] as const;
