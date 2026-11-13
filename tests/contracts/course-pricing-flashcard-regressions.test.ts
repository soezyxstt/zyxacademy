import { afterAll, afterEach, expect, mock, setSystemTime, test } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
const { getReviewQueue } = await import("@/lib/flashcard-actions");
const { getDueFlashcardCounts } = await import("@/lib/student/due-flashcards");
const { getDashboardReviewSummary } = await import("@/lib/student/dashboard-review-summary");
const { getOrBuildTodayRecommendation } = await import("@/lib/recommendation-service");
afterEach(() => setSystemTime());
afterAll(() => client.close());

test("pricing flashcard queues, dashboard counts and recommendations agree across scope and mastery", async () => {
  const now = new Date("2026-12-01T00:00:00Z");
  setSystemTime(now);
  await client.exec(`
    INSERT INTO "user" (id,name,email,role) VALUES ('fc-student','Student','fc-student@test.local','student'), ('fc-other','Other','fc-other@test.local','student'), ('fc-suspended','Suspended','fc-suspended@test.local','student');
    INSERT INTO pengguna (id,status) VALUES ('fc-student','active'), ('fc-other','active'), ('fc-suspended','suspended');
    INSERT INTO peran (id,code) VALUES ('fc-role','murid');
    INSERT INTO pengguna_peran (id,pengguna_id,peran_id,source) VALUES ('fc-member','fc-student','fc-role','test'), ('fc-other-member','fc-other','fc-role','test'), ('fc-suspended-member','fc-suspended','fc-role','test');
    INSERT INTO courses (id,title,category) VALUES ('fc-legacy','Course','Test'), ('fc-foreign-legacy','Other','Test'), ('fc-fallback','Fallback','Test');
    INSERT INTO mata_kuliah (id,code,title,legacy_course_id,pricing_category,free_starts_at,free_ends_at) VALUES
      ('fc-course','FC','Course','fc-legacy','limited_time_free','2026-12-01T00:00:00Z','2026-12-02T00:00:00Z'),
      ('fc-foreign-course','FOREIGN','Other','fc-foreign-legacy','free',null,null),
      ('fc-fallback-course','FALLBACK','Fallback','fc-fallback','free',null,null);
    INSERT INTO chapters (id,course_id,title,order_index,status) VALUES
      ('fc-old-first','fc-legacy','First',1,'published'), ('fc-old-second','fc-legacy','Second',2,'published'),
      ('fc-fallback-chapter','fc-fallback','Fallback',1,'published');
    INSERT INTO bab (id,mata_kuliah_id,code,title,order_index,status,legacy_chapter_id) VALUES
      ('fc-first','fc-course','ONE','First',1,'active','fc-old-first'),
      ('fc-second','fc-course','TWO','Second',2,'active',null),
      ('fc-archived','fc-course','OLD','Archived',3,'archived',null),
      ('fc-foreign','fc-foreign-course','OTHER','Other',1,'active',null),
      ('fc-fallback-bab','fc-fallback-course','FB','Fallback',1,'active','fc-fallback-chapter');
    INSERT INTO set_flashcard (id,mata_kuliah_id,bab_id,title,status,generation_hash,creator_id) VALUES
      ('fc-set-first','fc-course','fc-first','First','published','g','fc-student'),
      ('fc-set-second','fc-course','fc-second','Second','published','g','fc-student'),
      ('fc-set-archived','fc-course','fc-archived','Archived','published','g','fc-student'),
      ('fc-set-foreign','fc-course','fc-foreign','Foreign','published','g','fc-student'),
      ('fc-set-missing','fc-course',null,'Missing','published','g','fc-student'),
      ('fc-set-draft','fc-course','fc-first','Draft','draft','g','fc-student');
    INSERT INTO flashcard (id,set_flashcard_id,front,back,status,generation_hash) VALUES
      ('fc-mastered','fc-set-first','Q','A','published','g'),
      ('fc-second-card','fc-set-second','Q','A','published','g'),
      ('fc-archived-card','fc-set-archived','Q','A','published','g'),
      ('fc-foreign-card','fc-set-foreign','Q','A','published','g'),
      ('fc-missing-card','fc-set-missing','Q','A','published','g'),
      ('fc-draft-card','fc-set-draft','Q','A','published','g'),
      ('fc-unpublished','fc-set-first','Q','A','draft','g');
    INSERT INTO ide (id,mata_kuliah_id,bab_id,stable_key,code,canonical_statement,concise_explanation,semantic_hash,generation_hash,creator_id,difficulty_metadata) VALUES
      ('fc-idea-80','fc-course','fc-first','fc-80','FC80','80','80','s','g','fc-student','{}'),
      ('fc-idea-79','fc-course','fc-first','fc-79','FC79','79','79','s','g','fc-student','{}'),
      ('fc-idea-null','fc-course','fc-first','fc-null','FCNULL','Null','Null','s','g','fc-student','{}');
    INSERT INTO flashcard_ide (id,flashcard_id,ide_id) VALUES ('fc-link-80','fc-mastered','fc-idea-80');
    INSERT INTO pemahaman_ide (id,pengguna_id,ide_id,skor,keyakinan) VALUES
      ('fc-score-80','fc-student','fc-idea-80',80,90), ('fc-score-79','fc-student','fc-idea-79',79,90),
      ('fc-other-score','fc-other','fc-idea-80',0,90);
    INSERT INTO master_teaching_documents (id,course_id,title,markdown_content,created_by_id) VALUES
      ('fc-mtd','fc-legacy','Source','body','fc-student'), ('fc-fallback-mtd','fc-fallback','Source','body','fc-student');
    INSERT INTO flashcard_sets (id,course_id,chapter_id,source_mtd_id,source_mtd_version,generation_hash,title,status,is_stale) VALUES
      ('fc-legacy-set','fc-legacy','fc-old-first','fc-mtd',1,'g','Legacy','published',false),
      ('fc-fallback-set','fc-fallback','fc-fallback-chapter','fc-fallback-mtd',1,'g','Fallback','published',false),
      ('fc-stale-set','fc-fallback','fc-fallback-chapter','fc-fallback-mtd',1,'g','Stale','published',true),
      ('fc-draft-legacy-set','fc-fallback','fc-fallback-chapter','fc-fallback-mtd',1,'g','Draft','draft',false);
    INSERT INTO flashcards (id,set_id,front,back,status,metadata) VALUES
      ('fc-legacy-card','fc-legacy-set','Q','A','active','{}'), ('fc-fallback-card','fc-fallback-set','Q','A','active','{}'),
      ('fc-stale-card','fc-stale-set','Q','A','active','{}'), ('fc-draft-legacy-card','fc-draft-legacy-set','Q','A','active','{}');
  `);

  async function parity(user: string, course: string, expected: string[]) {
    const queue = await getReviewQueue(user, course);
    expect(queue.map((item) => item.card.id).sort()).toEqual([...expected].sort());
    const counts = await getDueFlashcardCounts(user, new Date());
    const publicId = course === "fc-course" ? "fc-legacy" : course;
    expect(counts.get(publicId) ?? 0).toBe(expected.length);
    expect((await getDashboardReviewSummary(user, [course]))[0].count).toBe(expected.length);
  }

  await parity("fc-student", "fc-course", ["fc-second-card"]);
  await parity("fc-student", "fc-legacy", ["fc-second-card"]);
  await parity("fc-student", "fc-fallback", ["fc-fallback-card"]);
  await parity("fc-suspended", "fc-course", []);

  await client.exec("UPDATE flashcard SET status = 'retired' WHERE id = 'fc-second-card'");
  await parity("fc-student", "fc-course", []);
  const recommendation = await getOrBuildTodayRecommendation("fc-student", []);
  expect(recommendation.items.find((item) => item.kind === "flashcards")?.href).toBe("/courses/fc-fallback/flashcard");
  await client.exec("UPDATE flashcard_sets SET is_stale = true WHERE id = 'fc-fallback-set'");
  expect((await getOrBuildTodayRecommendation("fc-student", [])).items.some((item) => item.kind === "flashcards")).toBe(false);

  await client.exec(`
    INSERT INTO flashcard_ide (id,flashcard_id,ide_id) VALUES ('fc-link-79','fc-mastered','fc-idea-79');
    UPDATE flashcard SET status = 'published' WHERE id = 'fc-second-card';
    INSERT INTO flashcard (id,set_flashcard_id,front,back,status,generation_hash) VALUES ('fc-null-card','fc-set-first','Q','A','published','g');
    INSERT INTO flashcard_ide (id,flashcard_id,ide_id) VALUES ('fc-null-link','fc-null-card','fc-idea-null');
    INSERT INTO kemajuan_flashcard_murid (id,pengguna_id,flashcard_id,due_at,status) VALUES
      ('fc-progress','fc-student','fc-second-card','2026-12-01T00:00:00Z','active'),
      ('fc-other-progress','fc-other','fc-mastered','2027-01-01T00:00:00Z','suspended');
  `);
  await parity("fc-student", "fc-course", ["fc-mastered", "fc-null-card", "fc-second-card"]);
  await client.exec("UPDATE kemajuan_flashcard_murid SET status = 'suspended' WHERE id = 'fc-progress'");
  await parity("fc-student", "fc-course", ["fc-mastered", "fc-null-card"]);
  await client.exec("UPDATE kemajuan_flashcard_murid SET status = 'active', due_at = '2026-12-01T00:00:01Z' WHERE id = 'fc-progress'");
  await parity("fc-student", "fc-course", ["fc-mastered", "fc-null-card"]);

  setSystemTime(new Date("2026-12-02T00:00:00Z"));
  await parity("fc-student", "fc-course", ["fc-mastered", "fc-null-card"]);
  await client.exec("INSERT INTO pendaftaran_murid (id,pengguna_id,mata_kuliah_id,status) VALUES ('fc-paid','fc-student','fc-course','active')");
  await parity("fc-student", "fc-course", ["fc-mastered", "fc-null-card", "fc-second-card"]);
  await client.exec("UPDATE mata_kuliah SET pricing_category = 'free', free_starts_at = null, free_ends_at = null WHERE id = 'fc-course'; DELETE FROM pendaftaran_murid WHERE id = 'fc-paid'");
  await parity("fc-student", "fc-course", ["fc-mastered", "fc-null-card", "fc-second-card"]);
  await client.exec("UPDATE mata_kuliah SET status = 'archived' WHERE id = 'fc-course'");
  await parity("fc-student", "fc-legacy", []);
});
