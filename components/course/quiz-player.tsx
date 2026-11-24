"use client";

import { StudentAccountBoundary } from "@/components/student-account-boundary";
import { useHideMobileBottomNav } from "@/components/navigation/mobile-chrome-context";
import { ViewportSwitch } from "@/components/navigation/viewport-switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuizPlayer } from "@/hooks/use-quiz-player";
import { useQuizSubmission } from "@/hooks/use-quiz-submission";
import type { QuizPlayerProps, QuizSubmission } from "@/lib/quiz/player-state";
import { QuizSubmitConfirmDialog } from "@/features/student-assessment/ui/shared/quiz-player-parts";
import { QuizPlayerDesktop } from "@/features/student-assessment/ui/desktop/quiz-player-desktop";
import { QuizPlayerMobile } from "@/features/student-assessment/ui/mobile/quiz-player-mobile";

export type { QuizPlayerProps } from "@/lib/quiz/player-state";

function QuizPlayerLoading() {
  return (
    <div aria-busy="true" data-quiz-pending="" className="space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
    </div>
  );
}

/** The demo adapter never mounts an authenticated query or mutation. */
export function QuizPlayer(props: QuizPlayerProps) {
  useHideMobileBottomNav();

  if (props.transport) {
    const transport = props.transport;
    return (
      <QuizPlayerContent
        key={props.attemptId}
        {...props}
        submit={({ answers, durationSeconds }) =>
          transport.submit(answers, durationSeconds)
        }
      />
    );
  }
  return (
    <StudentAccountBoundary>
      {({ data }) =>
        data?.user && (!props.expectedUserId || data.user.id === props.expectedUserId) ? (
          <LiveQuizPlayer
            key={`${data.user.id}:${props.attemptId}`}
            {...props}
            userId={data.user.id}
          />
        ) : (
          <QuizPlayerLoading />
        )
      }
    </StudentAccountBoundary>
  );
}

function LiveQuizPlayer(props: QuizPlayerProps & { userId: string }) {
  const mutation = useQuizSubmission(props.userId, props.attemptId, props.courseId);
  return <QuizPlayerContent {...props} submit={mutation.mutateAsync} />;
}

/**
 * Shared controller lifted above ViewportSwitch so answers, flags, timers,
 * uploads, and active question index survive 767px <-> 768px viewport transitions.
 */
function QuizPlayerContent(
  props: QuizPlayerProps & { submit: (payload: QuizSubmission) => Promise<unknown> }
) {
  const controller = useQuizPlayer(props, props.submit);
  const q = controller.sorted[controller.index];

  if (!q) {
    return (
      <div className="py-4 text-center">
        <p className="text-body-sm text-muted-foreground">
          {controller.t("quiz.noQuestions")}
        </p>
      </div>
    );
  }

  return (
    <>
      <ViewportSwitch
        desktop={() => <QuizPlayerDesktop props={props} controller={controller} />}
        mobile={() => <QuizPlayerMobile props={props} controller={controller} />}
        fallback={<QuizPlayerLoading />}
      />
      <QuizSubmitConfirmDialog controller={controller} />
    </>
  );
}
