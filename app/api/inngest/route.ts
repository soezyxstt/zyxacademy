import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import {
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
} from "@/lib/inngest-functions";

/**
 * Next.js App Router API Route Handler for Inngest webhooks.
 * Registers background functions for execution.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
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
  ],
});

