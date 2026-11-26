import { aiModelCatalogCron } from "./ai-model-catalog";
export { aiModelCatalogCron } from "./ai-model-catalog";
import { googleCalendarSyncCron, googleCalendarSyncWorker } from "./google-calendar";
export { googleCalendarSyncCron, googleCalendarSyncWorker } from "./google-calendar";
import { gamificationMissionsCron, gamificationMissionsPage } from './gamification-missions';
export { gamificationMissionsCron, gamificationMissionsPage } from './gamification-missions';
import { gamificationOutboxCron } from "./gamification";
export { gamificationOutboxCron } from "./gamification";
import { offlineChangeRetentionCron } from "./offline";
export { offlineChangeRetentionCron } from "./offline";
import { adminOperationsWorker } from "./admin-operations";
export { adminOperationsWorker } from "./admin-operations";
import { pkaDeliveryWorker } from "./pka-delivery";
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
import { discussionAiCron } from "./discussion-ai";
import { discussionNotificationsWorker } from "./discussion-notifications";
import { discussionImageSweepCron } from "./discussion-image-sweep";
import { discussionThreadTitleWorker } from "./discussion-title";

export { discussionAiCron } from "./discussion-ai";
export { discussionNotificationsWorker } from "./discussion-notifications";
export { discussionImageSweepCron } from "./discussion-image-sweep";
export { discussionThreadTitleWorker } from "./discussion-title";
import {
  studyReengagementCron,
  flashcardReminderCron,
  upcomingSessionReminderCron,
  tutorDailyDigestCron,
} from "./notification-intervals";
export {
  studyReengagementCron,
  flashcardReminderCron,
  upcomingSessionReminderCron,
  tutorDailyDigestCron,
} from "./notification-intervals";

/**
 * All background functions for Deno/compute Inngest execution.
 */
import { quietNotificationWorker } from "./notification-quiet";
import { tutorAvailabilityReminderCron, tutorialSessionEmailCron, tutorialSessionEmailWorker } from "./tutorial-reminders";
export { tutorAvailabilityReminderCron, tutorialSessionEmailCron, tutorialSessionEmailWorker } from "./tutorial-reminders";

export const computeFunctions = [
  tutorAvailabilityReminderCron,
  tutorialSessionEmailCron,
  tutorialSessionEmailWorker,
  offlineChangeRetentionCron,
  quietNotificationWorker,
  aiModelCatalogCron,
  googleCalendarSyncCron,
  googleCalendarSyncWorker,
  discussionAiCron,
  discussionThreadTitleWorker,
  discussionNotificationsWorker,
  discussionImageSweepCron,
  gamificationOutboxCron,
  gamificationMissionsCron,
  gamificationMissionsPage,
  adminOperationsWorker,
  pkaDeliveryWorker,
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
  studyReengagementCron,
  flashcardReminderCron,
  upcomingSessionReminderCron,
  tutorDailyDigestCron,
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
