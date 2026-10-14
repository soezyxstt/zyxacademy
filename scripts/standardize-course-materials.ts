import { createClient } from "@libsql/client";
import {
  buildCanonicalDocumentTitle,
  detectMetadataFromFilename,
  detectSessionFromFilename,
  detectPartNumberFromFilename,
} from "../lib/course-batch-upload";
import { type MaterialLevel1Category, type CourseMaterialSubcategory } from "../lib/course-materials";

// Load environment variables
const isApply = process.argv.includes("--apply");
const isProd = process.argv.includes("--prod") || !process.argv.includes("--local");

const envFile = isProd ? ".env.prod" : ".env";
const fs = await import("fs");
const path = await import("path");

function loadEnvFile(file: string) {
  const filePath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf-8");
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      env[key] = val;
    }
  }
  return env;
}

const env = loadEnvFile(envFile);
const dbUrl =
  env.TURSO_CONNECTION_URL ||
  env.TURSO_DATABASE_URL ||
  env.DATABASE_URL ||
  process.env.TURSO_CONNECTION_URL ||
  process.env.TURSO_DATABASE_URL ||
  process.env.DATABASE_URL;
const dbAuthToken = env.TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

if (!dbUrl || !dbAuthToken) {
  console.error("Database credentials not found in", envFile);
  process.exit(1);
}

console.log(`\n=== Standardizing Course Materials (${isApply ? "APPLY MODE" : "DRY RUN"}) ===`);
console.log(`Target Database: ${dbUrl.replace(/\/\/[^@]+@/, "//***@")}\n`);

const client = createClient({
  url: dbUrl,
  authToken: dbAuthToken,
});

type RawMaterial = {
  id: string;
  course_id: string;
  title: string;
  type: string;
  subcategory: string | null;
  file_url: string;
  year: number | null;
  chapter_ids: string[];
};

type RawChapter = {
  id: string;
  course_id: string;
  title: string;
  order_index: number;
};

type RawCourse = {
  id: string;
  title: string;
};

// 1. Fetch courses, chapters, and materials
const coursesRes = await client.execute("SELECT id, title FROM courses ORDER BY id");
const chaptersRes = await client.execute("SELECT id, course_id, title, order_index FROM chapters ORDER BY order_index");
const materialsRes = await client.execute(`
  SELECT id, course_id, title, type, subcategory, file_url, year, chapter_ids
  FROM course_materials
  ORDER BY course_id, title
`);

// Also fetch multi-chapter junction if exists
let junctionMap = new Map<string, string[]>();
try {
  const junctionRes = await client.execute("SELECT material_id, chapter_id FROM course_material_chapters");
  for (const row of junctionRes.rows) {
    const mId = String(row.material_id);
    const cId = String(row.chapter_id);
    if (!junctionMap.has(mId)) junctionMap.set(mId, []);
    junctionMap.get(mId)!.push(cId);
  }
} catch {
  // Junction table might not exist or be empty
}

const chaptersByCourse = new Map<string, RawChapter[]>();
const chapterById = new Map<string, RawChapter>();
for (const row of chaptersRes.rows) {
  const ch: RawChapter = {
    id: String(row.id),
    course_id: String(row.course_id),
    title: String(row.title),
    order_index: Number(row.order_index),
  };
  chapterById.set(ch.id, ch);
  if (!chaptersByCourse.has(ch.course_id)) chaptersByCourse.set(ch.course_id, []);
  chaptersByCourse.get(ch.course_id)!.push(ch);
}

const coursesById = new Map<string, RawCourse>();
for (const row of coursesRes.rows) {
  coursesById.set(String(row.id), {
    id: String(row.id),
    title: String(row.title),
  });
}

console.log(`Loaded ${coursesRes.rows.length} courses, ${chaptersRes.rows.length} chapters, and ${materialsRes.rows.length} materials.\n`);

type UpdatePlan = {
  id: string;
  courseId: string;
  courseCode: string;
  oldTitle: string;
  newTitle: string;
  oldSubcategory: string | null;
  newSubcategory: string | null;
  oldYear: number | null;
  newYear: number | null;
  fileUrl: string;
  reason: string;
};

const plans: UpdatePlan[] = [];
let unchangedCount = 0;

for (const row of materialsRes.rows) {
  const mat: RawMaterial = {
    id: String(row.id),
    course_id: String(row.course_id),
    title: String(row.title),
    type: String(row.type),
    subcategory: row.subcategory ? String(row.subcategory) : null,
    file_url: String(row.file_url),
    year: row.year !== null ? Number(row.year) : null,
    chapter_ids: (() => {
      try {
        if (!row.chapter_ids) return [];
        if (Array.isArray(row.chapter_ids)) return row.chapter_ids.map(String);
        return JSON.parse(String(row.chapter_ids));
      } catch {
        return [];
      }
    })(),
  };

  const course = coursesById.get(mat.course_id);
  const courseCode = mat.course_id.toUpperCase();
  const courseChapters = chaptersByCourse.get(mat.course_id) || [];

  // Determine chapter
  const associatedChapterIds = mat.chapter_ids.length > 0 ? mat.chapter_ids : (junctionMap.get(mat.id) || []);
  const primaryChap = associatedChapterIds.length === 1 ? chapterById.get(associatedChapterIds[0]) : null;

  // Extract leaf filename from file_url for heuristic fallback
  const leafName = mat.file_url.split("/").pop() || "";

  // 1. Year deduction: If year is missing in DB, inspect filename or title
  let deducedYear = mat.year;
  if (!deducedYear) {
    const yearMatch = (mat.file_url + " " + mat.title).match(/(?:20\d\d|199\d)/);
    if (yearMatch) {
      deducedYear = parseInt(yearMatch[0], 10);
    }
  }

  // 2. Subcategory deduction
  let deducedSubcategory: CourseMaterialSubcategory | null = mat.subcategory as CourseMaterialSubcategory | null;
  const lowerUrl = mat.file_url.toLowerCase();
  const lowerTitle = mat.title.toLowerCase();

  if (/\bup\b|_up_|\(up\)/i.test(lowerUrl) || /\bup\b/i.test(lowerTitle)) {
    deducedSubcategory = "up";
  } else if (/\bltm\b/i.test(lowerUrl) || /\bltm\b/i.test(lowerTitle)) {
    deducedSubcategory = "ltm";
  } else if (!deducedSubcategory) {
    if (/\buts\b/i.test(lowerUrl) || /\buts\b/i.test(lowerTitle)) deducedSubcategory = "uts";
    else if (/\buas\b/i.test(lowerUrl) || /\buas\b/i.test(lowerTitle)) deducedSubcategory = "uas";
    else if (/\bkuis\b/i.test(lowerUrl) || /\bkuis\b/i.test(lowerTitle)) deducedSubcategory = "kuis";
    else if (/\bscl\b/i.test(lowerUrl) || /\bscl\b/i.test(lowerTitle)) deducedSubcategory = "scl";
    else if (/\bmodul\b/i.test(lowerUrl)) deducedSubcategory = "modul";
    else if (mat.type === "materi") deducedSubcategory = "materi_dosen";
  }

  // 3. Session & Part deduction
  const session = detectSessionFromFilename(leafName) || detectSessionFromFilename(mat.title);
  const partNumber = detectPartNumberFromFilename(leafName) || detectPartNumberFromFilename(mat.title);

  // 4. Role Qualifier deduction
  let roleQualifier: "utama" | "bagian" | "aplikasi" | "problem" | "kustom" | null = null;
  const isPart = /(?:bagian|part)\s*[-_]?\s*\d+/i.test(mat.title) || /(?:bagian|part)\s*[-_]?\s*\d+/i.test(leafName);
  if (isPart && partNumber) {
    roleQualifier = "bagian";
  } else if (/\baplikasi\b/i.test(lowerTitle) || /\baplikasi\b/i.test(lowerUrl)) {
    roleQualifier = "aplikasi";
  } else if (/\bproblem\b/i.test(lowerTitle) || /\bproblem\b/i.test(lowerUrl)) {
    roleQualifier = "problem";
  } else if (mat.type === "materi" && (deducedSubcategory === "materi_dosen" || !deducedSubcategory)) {
    roleQualifier = "utama";
  }

  // 5. Custom topic clean up
  let customTopic: string | null = null;
  if (deducedSubcategory === "scl") {
    const modMatch = mat.title.match(/modul\s*\d+/i) || leafName.match(/modul[_-]?\d+/i);
    const topicMatch = mat.title.match(/scl\s*[:\.-]?\s*(.+)/i) || leafName.match(/scl[_-]?(.+?)(?:\.pdf|$)/i);
    const modStr = modMatch ? modMatch[0].replace(/[_-]+/g, " ") : "";
    const topicStr = topicMatch ? topicMatch[1].replace(/[_-]+/g, " ").trim() : "";
    customTopic = [modStr, topicStr].filter(Boolean).join(": ");
  } else if (roleQualifier === "aplikasi" || roleQualifier === "problem") {
    const topicMatch = mat.title.match(/(?:aplikasi|problem)\s*[:\.-]?\s*(.+)/i);
    if (topicMatch) customTopic = topicMatch[1].trim();
  }

  // Build Canonical Title
  let canonicalTitle = buildCanonicalDocumentTitle({
    category: (mat.type === "contoh_soal" ? "soal" : mat.type === "solusi" ? "pembahasan_soal" : mat.type) as MaterialLevel1Category,
    subcategory: deducedSubcategory,
    chapter: primaryChap ? { orderIndex: primaryChap.order_index, title: primaryChap.title } : null,
    chapterOrderIndex: primaryChap?.order_index ?? null,
    chapterTitle: primaryChap?.title ?? null,
    year: deducedYear,
    session,
    roleQualifier,
    partNumber,
    customTopic,
    rawFilename: leafName,
  });

  // Preserve existing specific lecture titles if it already has rich descriptive topic
  // e.g., if mat.title is "Bab 2: Pertaksamaan Nilai Mutlak", don't downgrade it to generic chapter title
  if (
    mat.type === "materi" &&
    primaryChap &&
    mat.title.startsWith(`Bab ${primaryChap.order_index}: `) &&
    !mat.title.toLowerCase().includes("uts") &&
    !mat.title.toLowerCase().includes("uas")
  ) {
    canonicalTitle = mat.title;
  }

  const titleChanged = canonicalTitle !== mat.title;
  const subcategoryChanged = deducedSubcategory !== mat.subcategory;
  const yearChanged = deducedYear !== mat.year;

  if (titleChanged || subcategoryChanged || yearChanged) {
    plans.push({
      id: mat.id,
      courseId: mat.course_id,
      courseCode,
      oldTitle: mat.title,
      newTitle: canonicalTitle,
      oldSubcategory: mat.subcategory,
      newSubcategory: deducedSubcategory,
      oldYear: mat.year,
      newYear: deducedYear,
      fileUrl: mat.file_url,
      reason: [
        titleChanged ? "title" : null,
        subcategoryChanged ? "subcategory" : null,
        yearChanged ? "year" : null,
      ]
        .filter(Boolean)
        .join(", "),
    });
  } else {
    unchangedCount++;
  }
}

console.log(`Analysis complete:`);
console.log(`- ${plans.length} documents need standardization`);
console.log(`- ${unchangedCount} documents already canonical\n`);

// Display sample changes
console.log(`Sample proposed changes (Exams & General):`);
console.log("--------------------------------------------------------------------------------");
const examPlans = plans.filter((p) => p.newSubcategory === "uts" || p.newSubcategory === "uas" || p.newSubcategory === "up");
for (const p of examPlans.slice(0, 10)) {
  console.log(`[${p.courseCode}] ID: ${p.id.slice(0, 8)}... (${p.reason})`);
  console.log(`  OLD: "${p.oldTitle}" | sub: ${p.oldSubcategory ?? "-"} | year: ${p.oldYear ?? "-"}`);
  console.log(`  NEW: "${p.newTitle}" | sub: ${p.newSubcategory ?? "-"} | year: ${p.newYear ?? "-"}`);
  console.log("");
}
console.log(`Sample proposed changes (Exercises & Materials):`);
console.log("--------------------------------------------------------------------------------");
const otherPlans = plans.filter((p) => p.newSubcategory !== "uts" && p.newSubcategory !== "uas" && p.newSubcategory !== "up");
for (const p of otherPlans.slice(0, 8)) {
  console.log(`[${p.courseCode}] ID: ${p.id.slice(0, 8)}... (${p.reason})`);
  console.log(`  OLD: "${p.oldTitle}" | sub: ${p.oldSubcategory ?? "-"} | year: ${p.oldYear ?? "-"}`);
  console.log(`  NEW: "${p.newTitle}" | sub: ${p.newSubcategory ?? "-"} | year: ${p.newYear ?? "-"}`);
  console.log("");
}

if (!isApply) {
  console.log("--------------------------------------------------------------------------------");
  console.log(`Dry-run complete. To apply these ${plans.length} changes to production, run:`);
  console.log(`bun scripts/standardize-course-materials.ts --apply\n`);
  process.exit(0);
}

// APPLY MODE
console.log(`Applying ${plans.length} updates to database...`);
let successCount = 0;
let errorCount = 0;

for (const p of plans) {
  try {
    await client.execute({
      sql: `UPDATE course_materials SET title = ?, subcategory = ?, year = ? WHERE id = ?`,
      args: [p.newTitle, p.newSubcategory, p.newYear, p.id],
    });
    successCount++;
  } catch (err) {
    console.error(`Failed to update ${p.id}:`, err);
    errorCount++;
  }
}

console.log(`\n=== Update Finished ===`);
console.log(`- Successfully updated: ${successCount}`);
console.log(`- Errors: ${errorCount}\n`);
