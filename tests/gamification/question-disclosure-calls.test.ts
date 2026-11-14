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
