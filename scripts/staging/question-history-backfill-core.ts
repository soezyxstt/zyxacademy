/** Offline, lock-protected backfill queries shared with the rollback fixture. */
export const LEGACY_INDEX_BACKFILL_SQL = `with attempts as materialized (
   select student_id, id, questions_snapshot from student_quiz_attempts
  ), elements as materialized (
   select student_id, id, q from attempts,
    lateral jsonb_array_elements(case when jsonb_typeof(questions_snapshot)='array' then questions_snapshot else '[]'::jsonb end) q
  ), entries as (
   select student_id, id, 'question:' || (q->>'id') as key from elements where jsonb_typeof(q)='object' and coalesce(q->>'id','') <> ''
   union all select student_id, id, 'question:' || (q->'gamificationProvenance'->>'canonicalQuestionId') from elements
    where jsonb_typeof(q->'gamificationProvenance'->'canonicalQuestionId')='string' and coalesce(q->'gamificationProvenance'->>'canonicalQuestionId','') <> ''
   union all select student_id, id, '__zyx_legacy_uncertain__' from attempts where jsonb_typeof(questions_snapshot) is distinct from 'array'
   union all select student_id, id, '__zyx_legacy_uncertain__' from elements where jsonb_typeof(q) is distinct from 'object' or jsonb_typeof(q->'id') is distinct from 'string' or coalesce(q->>'id','') = ''
  ) insert into gamification_question_legacy_index (user_id,question_id,first_attempt_id,last_attempt_id)
   select student_id,key,min(id),max(id) from entries group by student_id,key`;

export const PROJECTION_BACKFILL_SQL = `with events as (
   select user_id,course_id,question_id,attempt_identity,exposed_at from gamification_question_exposures
   union all
   select user_id,course_id,question_id,('["staff-bank",' || to_json(id)::text || ']'),exposed_at from gamification_question_bank_disclosures
  ), ranked as (
   select *, max(exposed_at) over (partition by user_id,course_id,question_id) latest_at from events
  ), latest as (
   select user_id,course_id,question_id,
    case when count(distinct attempt_identity)>1 then '__zyx_uncertain_exposure__' else min(attempt_identity) end attempt_identity,
    max(exposed_at) exposed_at
   from ranked where exposed_at=latest_at group by user_id,course_id,question_id
  ) insert into gamification_question_exposure_projection (user_id,course_id,question_id,attempt_identity,exposed_at,causal_order)
   select user_id,course_id,question_id,attempt_identity,exposed_at,-row_number() over (order by user_id,course_id,question_id) from latest`;
