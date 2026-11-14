import { afterAll, expect, mock, test } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
const { resolveStudentSearchCandidates } = await import("@/lib/search/student-course-results");
const { getDueFlashcardCounts } = await import("@/lib/student/due-flashcards");
const { refreshIdeaRecommendations } = await import("@/lib/pemahaman/recommendations");
const { buildPlanForConcepts } = await import("@/lib/recommendation-service");
afterAll(() => client.close());

const start = new Date("2026-12-01T00:00:00Z");
const end = new Date("2026-12-02T00:00:00Z");

test("search and due cards follow current scope, publication, pricing, aliases and actor status", async () => {
  await client.exec(`
    INSERT INTO "user" (id,name,email,role) VALUES ('student','Student','student@test.local','student'), ('suspended','Suspended','suspended@test.local','student');
    INSERT INTO pengguna (id,status) VALUES ('student','active'), ('suspended','suspended');
    INSERT INTO peran (id,code) VALUES ('murid-role','murid');
    INSERT INTO pengguna_peran (id,pengguna_id,peran_id,source) VALUES ('m1','student','murid-role','test'), ('m2','suspended','murid-role','test');
    INSERT INTO courses (id,title,category) VALUES ('legacy','Course','Test'), ('other','Other','Test');
    INSERT INTO mata_kuliah (id,code,title,legacy_course_id,pricing_category,free_starts_at,free_ends_at) VALUES ('canonical','CAN','Course','legacy','limited_time_free','2026-12-01T00:00:00Z','2026-12-02T00:00:00Z');
    INSERT INTO chapters (id,course_id,title,order_index,status) VALUES ('old-one','legacy','One',1,'published'), ('old-two','legacy','Two',2,'published'), ('foreign','other','Foreign',1,'published');
    INSERT INTO bab (id,mata_kuliah_id,code,title,order_index,legacy_chapter_id) VALUES ('one','canonical','ONE','One',1,'old-one'), ('two','canonical','TWO','Two',2,'old-two');
    INSERT INTO artikel (id,mata_kuliah_id,bab_id,slug,title,content_markdown,status,source_hash,generation_hash,creator_id) VALUES
      ('first','canonical','one','first','First current','body','published','s','g','student'),
      ('later','canonical','two','later','Later current','body','published','s','g','student'),
      ('draft','canonical','one','draft','Private','body','draft','s','g','student');
    INSERT INTO quiz_templates (id,course_id,title,category,visibility,status,selection_rules) VALUES
      ('preview','legacy','Preview','chapter','free','published','{"chapterId":"old-one"}'),
      ('later-quiz','legacy','Later quiz','chapter','paid','published','{"chapterId":"old-two"}'),
      ('foreign-quiz','legacy','Foreign quiz','chapter','paid','published','{"chapterId":"foreign"}'),
      ('draft-quiz','legacy','Draft quiz','chapter','free','draft','{"chapterId":"old-one"}');
    INSERT INTO set_flashcard (id,mata_kuliah_id,bab_id,title,status,generation_hash,creator_id) VALUES
      ('set-one','canonical','one','One','published','g','student'), ('set-two','canonical','two','Two','published','g','student'), ('set-draft','canonical','one','Draft','draft','g','student');
    INSERT INTO flashcard (id,set_flashcard_id,front,back,status,generation_hash) VALUES
      ('card-one','set-one','Q','A','published','g'), ('card-two','set-two','Q','A','published','g'), ('card-draft','set-draft','Q','A','published','g');
  `);
  const first = { courseId: "legacy", entityId: "first", type: "material" };
  const later = { courseId: "canonical", entityId: "later", type: "material" };
  const draft = { courseId: "legacy", entityId: "draft", type: "material" };
  const foreign = { courseId: "legacy", entityId: "foreign", type: "chapter" };
  const preview = { courseId: "legacy", entityId: "preview", type: "quiz" };
  const laterQuiz = { courseId: "legacy", entityId: "later-quiz", type: "quiz" };
  const foreignQuiz = { courseId: "legacy", entityId: "foreign-quiz", type: "quiz" };
  const draftQuiz = { courseId: "legacy", entityId: "draft-quiz", type: "quiz" };
  const candidates = [first, later, draft, foreign, preview, laterQuiz, foreignQuiz, draftQuiz];
  const during = await resolveStudentSearchCandidates("student", candidates, start);
  expect([...during.values()]).toEqual(["First current", "Later current", "Preview", "Later quiz"]);
  expect([...await getDueFlashcardCounts("student", start)]).toEqual([["legacy", 2]]);
  const expired = await resolveStudentSearchCandidates("student", candidates, end);
  expect([...expired.values()]).toEqual(["First current", "Preview"]);
  expect([...await getDueFlashcardCounts("student", end)]).toEqual([["legacy", 1]]);
  expect((await resolveStudentSearchCandidates("suspended", candidates, start)).size).toBe(0);
  expect([...await getDueFlashcardCounts("suspended", start)].every(([, count]) => count === 0)).toBe(true);
  await client.exec("INSERT INTO pendaftaran_murid (id,pengguna_id,mata_kuliah_id,status) VALUES ('paid','student','canonical','active')");
  expect((await resolveStudentSearchCandidates("student", candidates, end)).get(later)).toBe("Later current");
  expect((await resolveStudentSearchCandidates("student", candidates, end)).get(laterQuiz)).toBe("Later quiz");
  expect([...await getDueFlashcardCounts("student", end)]).toEqual([["legacy", 2]]);
  await client.exec("UPDATE mata_kuliah SET pricing_category = 'free', free_starts_at = null, free_ends_at = null WHERE id = 'canonical'; DELETE FROM pendaftaran_murid WHERE id = 'paid'");
  expect((await resolveStudentSearchCandidates("student", candidates, end)).get(later)).toBe("Later current");
  await client.exec(`
    INSERT INTO master_teaching_documents (id,course_id,title,markdown_content,created_by_id) VALUES ('mtd','other','Source','body','student');
    INSERT INTO flashcard_sets (id,course_id,chapter_id,source_mtd_id,source_mtd_version,generation_hash,title,status,is_stale) VALUES
      ('legacy-set','other','foreign','mtd',1,'g','Set','published',false),
      ('stale-set','other','foreign','mtd',1,'g','Stale','published',true);
    INSERT INTO flashcards (id,set_id,front,back,status,metadata) VALUES ('legacy-card','legacy-set','Q','A','active','{}'), ('stale-card','stale-set','Q','A','active','{}');
    INSERT INTO student_flashcard_progress (id,student_id,flashcard_id,due_date) VALUES ('other-progress','suspended','legacy-card','2027-01-01T00:00:00Z');
  `);
  expect((await getDueFlashcardCounts("student", end)).get("other")).toBe(1);
  await client.exec("INSERT INTO student_flashcard_progress (id,student_id,flashcard_id,due_date) VALUES ('own-progress','student','legacy-card','2027-01-01T00:00:00Z')");
  expect((await getDueFlashcardCounts("student", end)).get("other")).toBe(0);
  await client.exec(`
    INSERT INTO ide (id,mata_kuliah_id,bab_id,stable_key,code,canonical_statement,concise_explanation,semantic_hash,generation_hash,creator_id,difficulty_metadata) VALUES
      ('idea-one','canonical','one','idea-one','I1','One','One','s','g','student','{}'),
      ('idea-two','canonical','two','idea-two','I2','Two','Two','s','g','student','{}');
    INSERT INTO flashcard_ide (id,flashcard_id,ide_id) VALUES ('link-one','card-one','idea-one'), ('link-two','card-two','idea-two');
    INSERT INTO pemahaman_ide (id,pengguna_id,ide_id,skor,keyakinan) VALUES ('mastery-one','student','idea-one',20,20), ('mastery-two','student','idea-two',20,20), ('suspended-mastery','suspended','idea-one',20,20);
    INSERT INTO concepts (id,canonical_slug) VALUES ('concept-two','concept-two');
    INSERT INTO concept_localizations (id,concept_id,lang,display_name,aliases) VALUES ('local-two','concept-two','id','Later concept','[]');
    UPDATE ide SET concept_id = 'concept-two' WHERE id = 'idea-two';
    UPDATE mata_kuliah SET pricing_category = 'premium' WHERE id = 'canonical';
  `);
  expect((await refreshIdeaRecommendations("student")).map((row) => row.flashcardId)).toEqual(["card-one"]);
  expect(await refreshIdeaRecommendations("suspended")).toEqual([]);
  expect((await buildPlanForConcepts("student", "canonical", ["Later concept"])).some((item) => item.kind === "flashcards")).toBe(false);
  await client.exec("UPDATE mata_kuliah SET pricing_category = 'free' WHERE id = 'canonical'");
  expect((await refreshIdeaRecommendations("student")).map((row) => row.flashcardId)).toEqual(["card-one", "card-two"]);
  expect((await buildPlanForConcepts("student", "canonical", ["Later concept"])).find((item) => item.kind === "flashcards")?.count).toBe(1);
});
