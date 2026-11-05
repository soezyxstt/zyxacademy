import Link from "next/link";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Reveal } from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";
import { TranslatedText } from "@/components/i18n/translated-text";
import { ReviewClient } from "@/app/(student)/courses/[id]/my-results/[submissionId]/review-client";
import type { SubmissionListItem, SubmissionReviewFixture } from "@/lib/student-course-fixtures";
export function StudentSubmissionReviewView({ courseId, backHref, listItem, review }: { courseId: string; backHref: string; listItem: SubmissionListItem; review: SubmissionReviewFixture }) {
 return <CoursePageShell title={<TranslatedText namespace="learning" messageKey="reviewPage.answerTitle" />} description={review.examTitle} hideHeader><Reveal>
  <div className="mb-4"><Button asChild variant="outline" className="interactive rounded-md border-border/80 text-muted-foreground hover:text-foreground"><Link href={backHref}><TranslatedText namespace="learning" messageKey="reviewPage.backToResults" /></Link></Button></div>
  <ReviewClient courseId={courseId} listItem={listItem} review={review} />
 </Reveal></CoursePageShell>;
}
