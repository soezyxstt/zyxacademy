import type { QueryClient } from "@tanstack/react-query";
import { isQueryAccountCurrent } from "./client";
import { queryKeys } from "./keys";

type LearningChange = { courseId?: string; attemptId?: string; articleId?: string; cardId?: string };

/** Refresh live summaries while preserving local attempt and study-session state. */
export async function invalidateLearningQueries(client: QueryClient, userId: string, change: LearningChange = {}): Promise<void> {
  if (!isQueryAccountCurrent(client, userId)) return;
  const todayPending = client.isMutating({ mutationKey: queryKeys.student.completeToday(userId), exact: true }) > 0;
  const keys = [
    queryKeys.student.studyPaths(userId),
    queryKeys.student.interventions(userId),
    queryKeys.flashcards.all(userId),
    ...(change.attemptId ? [queryKeys.quizzes.attempt(userId, change.attemptId), queryKeys.quizzes.analytics(userId, change.attemptId)] : []),
  ];
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.student.today(userId), exact: true, refetchType: todayPending ? "none" : "active" }),
    ...keys.map(queryKey => client.invalidateQueries({ queryKey })),
  ]);
}
