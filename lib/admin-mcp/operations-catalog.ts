/** Source-level coverage index. Tool registration is authoritative; partial does not imply every action is exposed. */
export const operationsCatalog = [
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
  }
] as const;
