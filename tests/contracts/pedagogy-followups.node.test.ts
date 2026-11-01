import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPedagogyContext } from '@/lib/zyra/pedagogy/context';
import { selectTeachingPlan } from '@/lib/zyra/pedagogy/state-machine';
import { buildPedagogyPromptInput } from '@/lib/zyra/pedagogy/prompt-input';
import { composeSafeTeachingResponse, teachingResponseToTutorAnswer } from '@/lib/zyra/pedagogy/composer';
import { validateTeachingResponse } from '@/lib/zyra/pedagogy/validators';
import { parseFollowupAnswer, followupEvent } from '@/lib/zyra/followups';

const source = { id: 'v2:idea:idea-1:2', version: 2, kind: 'ko', title: 'Turunan', content: 'Turunan mengukur perubahan fungsi.', href: '/material' };
function context(active = false) {
  return buildPedagogyContext({ courseId: 'course-1', chapterId: 'chapter-1', question: 'jelaskan turunan', action: 'follow_up', activityKind: active ? 'quiz' : 'study', attemptState: active ? 'in_progress' : 'none', answerReleaseState: active ? 'hidden' : 'released', matchState: active ? 'strong' : 'none', allowDirectAnswerReveal: !active, assessmentReasonCode: 'TEST', evidenceSufficiency: 'sufficient' });
}
const suggestions = [{ label: 'Contoh', prompt: 'Berikan contoh turunan', icon: 'example', intent: 'explain' }];
test('guidance is limited to unprotected study', () => {
  for (const active of [false, true]) {
    const ctx = context(active);
    const rules = buildPedagogyPromptInput(ctx, selectTeachingPlan(ctx), 'jelaskan', [source]).outputRules.join('\n');
    assert.equal(rules.includes('<zyra-followups>'), !active);
  }
});
test('validated suggestions survive composition and produce an event', () => {
  const ctx = context(); const plan = selectTeachingPlan(ctx);
  const response = composeSafeTeachingResponse(ctx, plan, [source], 'TEST');
  response.learnerFacingText += `\n<zyra-followups>${JSON.stringify(suggestions)}</zyra-followups>`;
  const checked = validateTeachingResponse(response, ctx, plan, new Map([[source.id, source.version]]));
  assert.equal(checked.valid, true);
  const answer = teachingResponseToTutorAnswer(checked.response!, [source]);
  const parsed = parseFollowupAnswer(answer.answer);
  assert.deepEqual(parsed.followups, suggestions);
  assert.deepEqual(followupEvent(parsed.followups), { type: 'data-followups', followups: suggestions });
  assert.doesNotMatch(parsed.text, /zyra-followups|"prompt"/);
});
test('malformed and protected metadata never reaches visible text or suggestions', () => {
  for (const active of [false, true]) {
    const ctx = context(active); const plan = selectTeachingPlan(ctx);
    const response = composeSafeTeachingResponse(ctx, plan, [source], 'TEST');
    response.learnerFacingText += active ? `\n<zyra-followups>${JSON.stringify(suggestions)}</zyra-followups>` : '\n<zyra-followups>{bad';
    const checked = validateTeachingResponse(response, ctx, plan, new Map([[source.id, source.version]]));
    const parsed = parseFollowupAnswer(teachingResponseToTutorAnswer(checked.response!, [source]).answer);
    assert.deepEqual(parsed.followups, []);
    assert.doesNotMatch(parsed.text, /zyra-followups|\{bad|"prompt"/);
  }
});
