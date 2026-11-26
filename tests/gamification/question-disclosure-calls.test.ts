import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(path, 'utf8');
test('released analytics and list record before responding', () => {
 const analytics = source('app/api/quiz/attempts/[id]/analytics/route.ts');
 expect(analytics.indexOf('hasDisclosurePayload(analytics.computedMetrics)')).toBeLessThan(analytics.indexOf('recordAttemptDisclosures(tx'));
 expect(analytics.indexOf('recordAttemptDisclosures(tx')).toBeLessThan(analytics.indexOf('return NextResponse.json(analytics)'));
 const list = source('app/api/quiz/attempts/route.ts');
 expect(list.lastIndexOf('recordAttemptDisclosures(tx')).toBeLessThan(list.indexOf('return NextResponse.json(serializedAttempts.map(stripAnswerMarkers))'));
 expect(list).toContain('canViewAttemptDiscussion(templateById.get(attempt.templateId), attempt.status)');
});
test('authorized review and tutor disclosure precede output', () => {
 const review = source('app/(student)/courses/[id]/quiz/[quizId]/page.tsx');
 expect(review.indexOf('recordAuthorizedCourseDisclosures(tx')).toBeLessThan(review.indexOf('return <StudentQuizReview'));
 const tutor = source('app/actions/tutor.ts');
 expect(tutor.indexOf('recordAttemptDisclosures(tx')).toBeLessThan(tutor.indexOf('const result = await askTutorRag'));
 expect(tutor).toContain('.slice(0, 30)');
 const helper = source('lib/gamification/question-exposure.ts');
 expect(helper).toContain('resolveCourseAccess({ userId: input.userId, courseId: input.canonicalCourseId }, tx)');
 expect(helper).toContain("eq(soal.status, 'published')");
});
test('staff analytics, grading and bank responses record the viewer before release', () => {
 const analytics = source('app/api/quiz/attempts/[id]/analytics/route.ts');
 expect(analytics).toContain('attemptOwnerId: attempt.studentId');
 expect(analytics.indexOf('recordAuthorizedStaffAttemptDisclosures(tx')).toBeLessThan(analytics.indexOf('return NextResponse.json(analytics)'));
 const grading = source('lib/tutor/quiz-grading.ts');
 expect(grading.match(/recordAuthorizedStaffAttemptDisclosures\(tx/g)).toHaveLength(2);
 for (const path of ['app/(tutor)/tutor/[courseId]/quizzes/page.tsx', 'app/(tutor)/tutor/[courseId]/quizzes/new/page.tsx', 'app/(tutor)/tutor/[courseId]/quizzes/[templateId]/edit/page.tsx', 'lib/tutor/tryout-grading-read-model.ts', 'app/actions/tutor-management.ts']) {
  expect(source(path)).toContain('recordStaffCourseDisclosures(tx');
 }
 for (const path of ['app/(tutor)/tutor/[courseId]/grading/page.tsx', 'lib/native/academic/read-services.ts']) {
  expect(source(path)).toContain('await readAuthorizedTryoutGrading(');
 }
 const tryouts = source('lib/tutor/tryout-grading-read-model.ts');
 expect(tryouts.indexOf('await db.transaction(tx => recordStaffCourseDisclosures(tx')).toBeGreaterThan(0);
 expect(tryouts.indexOf('await db.transaction(tx => recordStaffCourseDisclosures(tx')).toBeLessThan(tryouts.indexOf('return { access, courseTitle, submissionsList }'));
 for (const path of ['app/(admin)/admin/(eval)/questions/page.tsx', 'app/(admin)/admin/(eval)/distractors/page.tsx', 'app/(admin)/admin/(academic)/courses/actions.ts', 'app/(admin)/admin/(academic)/courses/[slug]/tryouts/page.tsx', 'app/api/admin/questions/route.ts', 'app/api/admin/products/route.ts', 'lib/admin/quiz-insight-read-model.ts', 'app/api/admin/quiz-insights/[id]/attempts/route.ts', 'app/api/admin/quiz-insights/[id]/analyze/route.ts']) {
  expect(source(path)).toContain('recordAuthorizedGlobalDisclosures(tx');
 }
});
test('both score responses record disclosure after evidence inside the submission transaction', () => {
 for (const path of ['app/api/quiz/attempts/[id]/route.ts', 'app/api/quiz/daily/route.ts']) {
  const route = source(path);
  const evidence = route.indexOf('await writeQuestionRewards(tx');
  const disclosure = route.indexOf("requestId: 'submission-result'", evidence);
  expect(evidence).toBeGreaterThan(0);
  expect(disclosure).toBeGreaterThan(evidence);
  expect(disclosure).toBeLessThan(route.indexOf('await dualWriteQuizAttempt(tx', evidence));
 }
 expect(source('lib/gamification/processor.ts')).toContain('event.sourceId, fact.attemptId');
});
test('tutor final grading delegates to the same initial scoring rule', () => {
 const grading = source('lib/tutor/quiz-grading.ts');
 expect(grading).toContain('return checkAnswerCorrectness(q, submitted)');
 expect(source('app/api/quiz/attempts/[id]/route.ts')).toContain('checkAnswerCorrectness(q, submitted)');
 expect(grading).toContain('ESSAY_REVIEW_REQUIRED');
});
