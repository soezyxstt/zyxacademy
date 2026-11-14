import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Private profile statistics. Course IDs must come from the server-resolved enrollment list. */
export async function getPrivateProfileAggregates(userId: string, courseIds: readonly string[]) {
  const ids = sql.join(courseIds.map((id) => sql`${id}`), sql`, `);
  const courseFilter = courseIds.length
    ? sql`(a.mata_kuliah_id in (${ids}) or m.legacy_course_id in (${ids}))`
    : sql`false`;
  const result = await db.execute<{ completed_count: number; submission_count: number; average_score: number | null }>(sql`
    with section_counts as (
      select a.id, a.version, count(s.id) as section_count
      from artikel a
      join mata_kuliah m on m.id = a.mata_kuliah_id
      join bagian_artikel s on s.artikel_id = a.id and s.version = a.version and s.status = 'published'
      where a.status = 'published' and ${courseFilter}
        and exists (select 1 from enrollments e where e.user_id = ${userId} and e.expires_at > now() and (e.course_id = m.legacy_course_id or e.course_id = a.mata_kuliah_id))
      group by a.id, a.version
    ), completed_articles as (
      select sc.id
      from section_counts sc
      join bagian_artikel s on s.artikel_id = sc.id and s.version = sc.version and s.status = 'published'
      left join kemajuan_baca_artikel p on p.artikel_id = sc.id and p.artikel_version = sc.version and p.bagian_artikel_id = s.id and p.pengguna_id = ${userId}
      group by sc.id, sc.section_count
      having count(*) filter (where p.max_read_percent >= 90 or p.completed_at is not null) >= sc.section_count
        or round(coalesce(sum(p.max_read_percent), 0)::numeric / sc.section_count) >= 90
    ), completed_ids as (
      select id from completed_articles
      union
      select w.id from website_materials w
      join progress p on p.material_id = w.id and p.user_id = ${userId} and p.status = 'completed'
      join enrollments e on e.course_id = w.course_id and e.user_id = ${userId} and e.expires_at > now()
      where w.status = 'published' and ${courseIds.length ? sql`w.course_id in (${ids})` : sql`false`}
    )
    select (select count(*) from completed_ids)::integer as completed_count,
      count(*)::integer as submission_count, round(avg(sub.score))::integer as average_score
    from submissions sub join exams ex on ex.id = sub.exam_id
    where sub.user_id = ${userId} and ${courseIds.length ? sql`ex.course_id in (${ids})` : sql`false`}
      and exists (select 1 from enrollments e where e.user_id = ${userId} and e.course_id = ex.course_id and e.expires_at > now())
  `);
  const row = result.rows[0];
  return { completedCount: Number(row?.completed_count ?? 0), submissionCount: Number(row?.submission_count ?? 0), averageScore: row?.average_score == null ? null : Number(row.average_score) };
}
