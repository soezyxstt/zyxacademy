/**
 * Inngest Background Functions for Zyx Academy.
 * All functions have been modularized into @/jobs/*.
 * Re-exported here for backwards compatibility during migration cutover.
 */

export {
  vectorSyncWorker,
  vectorSyncCronWorker,
  bulkChapterGenerator,
  masteryRecomputeWorker,
  ideaMasteryRecomputeWorker,
  feedbackWorker,
  courseAnalyticsSnapshotCron,
  weeklyReflectionCron,
  masterySnapshotCron,
  assessmentIngestWorker,
  contentQualityAuditCron,
  questionGenerationWorker,
  studentQuizAnalyticsWorker,
  syncSearchDocuments,
  productDiktatPdfWorker,
  adminOpsKnowledgeSyncWorker,
  mapConcurrent,
  processBatch,
  allFunctions,
} from "@/jobs";
