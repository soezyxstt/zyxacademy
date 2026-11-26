/** Source-level coverage index. Tool registration is authoritative; partial does not imply every action is exposed. */
export const operationsCatalog = [
  {
    "source": "app/api/native/context/route.ts",
    "actions": ["GET"],
    "tools": [],
    "status": "excluded",
    "reason": "The Expo client reads the active account's own role memberships and locale for routing. Each product API still enforces object permissions. MCP client identity, consent, scopes, discovery, playbooks, packaged skills and environment bindings are independent."
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
    "reason": "The native Admin UI reuses web monitoring behind canonical admin session authorization. Short link creation also checks the native request origin and input. Its MCP equivalent retains its existing scope and request-key contract. This adapter changes no MCP tools, scopes, consent, discovery, playbooks, packaged skills, host prompts or environment bindings."
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
