import { CoursePageShell } from "@/components/course/course-page-shell";
import { Reveal } from "@/components/ui/reveal";
import { TranslatedText } from "@/components/i18n/translated-text";
import { ReviewClient } from "@/app/(student)/courses/[id]/my-results/[submissionId]/review-client";
import type { SubmissionListItem, SubmissionReviewFixture } from "@/lib/student-course-fixtures";
export function StudentSubmissionReviewView({ courseId, listItem, review }: { courseId: string; backHref?: string; listItem: SubmissionListItem; review: SubmissionReviewFixture }) {
 return <CoursePageShell title={<TranslatedText namespace="learning" messageKey="reviewPage.answerTitle" />} description={review.examTitle} hideHeader><Reveal>
  <ReviewClient courseId={courseId} listItem={listItem} review={review} />
 </Reveal></CoursePageShell>;
}
