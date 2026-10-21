export { inngest } from "./client";

export {
  vectorSyncWorker,
  vectorSyncCronWorker,
  mapConcurrent,
  processBatch,
} from "./vector-sync";

export {
  bulkChapterGenerator,
  questionGenerationWorker,
} from "./generation";

export {
  masteryRecomputeWorker,
  ideaMasteryRecomputeWorker,
  masterySnapshotCron,
} from "./mastery";

export {
  courseAnalyticsSnapshotCron,
  studentQuizAnalyticsWorker,
} from "./analytics";

export { feedbackWorker } from "./feedback";
export { weeklyReflectionCron } from "./reflection";
export { assessmentIngestWorker } from "./assessment";
export { contentQualityAuditCron } from "./audit";
export { syncSearchDocuments } from "./search-sync";
export { productDiktatPdfWorker } from "./pdf";
export { adminOpsKnowledgeSyncWorker } from "./admin-knowledge";
export { diktatPdfWorker } from "./diktat-pdf";
export { pdfThumbnailWorker } from "./pdf-thumbnail";

import { vectorSyncWorker, vectorSyncCronWorker } from "./vector-sync";
import { bulkChapterGenerator, questionGenerationWorker } from "./generation";
import {
  masteryRecomputeWorker,
  ideaMasteryRecomputeWorker,
  masterySnapshotCron,
} from "./mastery";
import {
  courseAnalyticsSnapshotCron,
  studentQuizAnalyticsWorker,
} from "./analytics";
import { feedbackWorker } from "./feedback";
import { weeklyReflectionCron } from "./reflection";
import { assessmentIngestWorker } from "./assessment";
import { contentQualityAuditCron } from "./audit";
import { syncSearchDocuments } from "./search-sync";
import { productDiktatPdfWorker } from "./pdf";
import { adminOpsKnowledgeSyncWorker } from "./admin-knowledge";
import { diktatPdfWorker } from "./diktat-pdf";
import { pdfThumbnailWorker } from "./pdf-thumbnail";
import { sourceReadPageWorker } from "./source-read";
import { sourceFigureWorker } from "./source-figure";
import { productVerificationWorker } from "./product-verification";

/**
 * All background functions for Deno/compute Inngest execution.
 */
export const computeFunctions = [
  sourceReadPageWorker,
  sourceFigureWorker,
  productVerificationWorker,
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
  diktatPdfWorker,
  pdfThumbnailWorker,
];
