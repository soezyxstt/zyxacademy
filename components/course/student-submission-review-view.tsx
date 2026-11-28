import type { ReactNode } from "react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Reveal } from "@/components/ui/reveal";
import { TranslatedText } from "@/components/i18n/translated-text";
import {
  ReviewClient,
  type ExtendedSubmissionReview,
} from "@/app/(student)/courses/[id]/my-results/[submissionId]/review-client";
import type { SubmissionListItem } from "@/lib/student-course-fixtures";

export function StudentSubmissionReviewView({
  courseId,
  backHref,
  backLabel,
  listItem,
  review,
  isDirectPreview = false,
  leaderboardEligible,
  startActionHref,
  defaultViewMode = "focused",
}: {
  courseId: string;
  backHref?: string;
  backLabel?: ReactNode;
  listItem: SubmissionListItem;
  review: ExtendedSubmissionReview;
  isDirectPreview?: boolean;
  leaderboardEligible?: boolean;
  startActionHref?: string;
  defaultViewMode?: "focused" | "all";
}) {
  return (
    <CoursePageShell
      title={<TranslatedText namespace="learning" messageKey="reviewPage.answerTitle" />}
      description={review.examTitle}
      backHref={backHref}
      backLabel={backLabel}
      hideHeader={!backHref}
    >
      <Reveal>
        <ReviewClient
          courseId={courseId}
          listItem={listItem}
          review={review}
          isDirectPreview={isDirectPreview}
          leaderboardEligible={leaderboardEligible}
          startActionHref={startActionHref}
          defaultViewMode={defaultViewMode}
        />
      </Reveal>
    </CoursePageShell>
  );
}
