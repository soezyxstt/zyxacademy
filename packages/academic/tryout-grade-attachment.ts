export const tryoutGradeAttachmentPolicy = {
  mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  maxBytes: 10 * 1024 * 1024,
} as const;

export const TRYOUT_GRADE_ATTACHMENT_ACCOUNT = "x-native-tryout-grade-account";
export const TRYOUT_GRADE_ATTACHMENT_SESSION = "x-native-tryout-grade-session";

export type TryoutGradeAttachment = { courseId: string; submissionId: string; questionId: string };

export function tryoutGradeAttachmentPath({ courseId, submissionId, questionId }: TryoutGradeAttachment) {
  const ids = [courseId, submissionId, questionId];
  if (ids.some(id => !/^[A-Za-z0-9:_-][A-Za-z0-9._:-]{0,255}$/.test(id))) return null;
  const [course, submission, question] = ids.map(encodeURIComponent);
  return `/api/native/academic/tutor-support/courses/${course}/grading/${submission}/attachment/${question}`;
}
