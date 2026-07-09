import "dotenv/config";
import { extractKnowledgeObjectsForChapter } from "../lib/ko-extractor";
import { db } from "../db";
import { user, courses, chapters, masterTeachingDocuments, knowledgeObjects, concepts, conceptLocalizations } from "../db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

async function main() {
  console.log("=== Starting Knowledge Object Refactor E2E Verification ===");

  const testUserId = `test-user-${Date.now()}`;
  const testCourseId = `test-course-${Date.now()}`;
  const testMtdId = randomUUID();
  const testChapterId = randomUUID();

  // Test data containing complex concepts, applications, and examples
  const chapterTitle = "Komposisi Fungsi dan Persamaan Aljabar";
  const chapterMarkdown = `
# Bab 3: Komposisi Fungsi dalam Keteknikan

Komposisi fungsi adalah operasi yang mengambil dua fungsi $f$ and $g$ dan menghasilkan fungsi $h$ sedemikian rupa sehingga $h(x) = g(f(x))$.
Definisi formal komposisi fungsi dituliskan sebagai:
$$(g \\circ f)(x) = g(f(x))$$

## Penerapan Komposisi Fungsi pada Termodinamika
Dalam ilmu termodinamika, komposisi fungsi digunakan untuk memodelkan efisiensi mesin carnot. 
Misalkan suhu reservoir panas dinyatakan sebagai fungsi waktu $T_H(t)$, dan efisiensi termal dinyatakan sebagai fungsi suhu $\\eta(T_H)$. 
Maka efisiensi termal terhadap waktu adalah fungsi komposisi $(\\eta \\circ T_H)(t)$.

## Contoh Perhitungan Jarak Euclidean untuk Robotika
Untuk memprogram pergerakan robot manipulator di ruang 2D, kita menggunakan Jarak Euclidean. 
Jarak Euclidean dihitung menggunakan rumus:
$$d(p, q) = \\sqrt{(p_1 - q_1)^2 + (p_2 - q_2)^2}$$
Sebagai contoh: Jika robot berada di titik $p = (3, 4)$ dan target berada di $q = (0, 0)$, jaraknya adalah $\\sqrt{3^2 + 4^2} = 5$ meter.
  `;

  console.log(`Using Test Course ID: ${testCourseId}`);

  let createdConceptId: string | null = null;

  try {
    // Insert parent mock records
    console.log("Inserting parent mock records...");
    await db.insert(user).values({
      id: testUserId,
      email: `${testUserId}@example.com`,
      name: "Test User",
      emailVerified: false,
      role: "admin",
    });

    await db.insert(courses).values({
      id: testCourseId,
      title: "Test Course for Extractors",
      category: "math" as any,
    });

    await db.insert(chapters).values({
      id: testChapterId,
      courseId: testCourseId,
      title: chapterTitle,
      orderIndex: 1,
      status: "published",
    });

    await db.insert(masterTeachingDocuments).values({
      id: testMtdId,
      courseId: testCourseId,
      title: "Test MTD Document",
      markdownContent: chapterMarkdown,
      version: 1,
      status: "active",
      createdById: testUserId,
    });

    // 1. Run extraction
    console.log("\n1. Running extractKnowledgeObjectsForChapter...");
    const results = await extractKnowledgeObjectsForChapter(
      testCourseId,
      testMtdId,
      testChapterId,
      chapterTitle,
      chapterMarkdown
    );

    console.log(`   Extracted ${results.length} Knowledge Objects.`);

    // 2. Validate and audit results
    console.log("\n2. Auditing extracted Knowledge Objects:");
    for (const ko of results) {
      console.log(`   --------------------------------------------------`);
      console.log(`   Concept Name: "${ko.conceptName}"`);
      console.log(`   Title:        "${ko.title}"`);
      console.log(`   Type:         "${ko.type}"`);
      console.log(`   Metadata:     `, JSON.stringify(ko.metadata, null, 2));

      // Assertions
      const issues = ko.metadata?.validation?.issues || [];
      const isValid = ko.metadata?.validation?.isValid;
      
      console.log(`   Validation:   isValid=${isValid}, issues=${issues.length}`);

      // Warning check on problematic conceptual leakage
      const nameLower = ko.conceptName.toLowerCase();
      if (nameLower.includes("pada") || nameLower.includes("untuk") || nameLower.includes("dalam")) {
        console.warn(`   [WARN] Concept name "${ko.conceptName}" contains contextual suffix words!`);
      }
      if (ko.conceptName.split(/\s+/).length > 5) {
        console.warn(`   [WARN] Concept name "${ko.conceptName}" exceeds length limit!`);
      }
    }

    // 3. Verify Database records
    console.log("\n3. Verifying database records...");
    const dbRows = await db
      .select()
      .from(knowledgeObjects)
      .where(eq(knowledgeObjects.courseId, testCourseId));

    console.log(`   Database has ${dbRows.length} rows written.`);
    if (dbRows.length !== results.length) {
      throw new Error(`DB rows count (${dbRows.length}) does not match extraction result count (${results.length})`);
    }

    if (dbRows.length > 0) {
      const ko = dbRows[0];
      createdConceptId = ko.conceptId;
      console.log(`   Verification: generated UUID concept ID is: ${createdConceptId}`);

      // Verify the concept entry in 'concepts' table
      const [conceptRec] = await db
        .select()
        .from(concepts)
        .where(eq(concepts.id, createdConceptId));
      if (!conceptRec) {
        throw new Error(`Registry record for concept ${createdConceptId} was not written to concepts table!`);
      }
      console.log("   ✓ Found concepts table registry record.");

      // Verify the localization entry in 'concept_localizations' table
      const [locRec] = await db
        .select()
        .from(conceptLocalizations)
        .where(eq(conceptLocalizations.conceptId, createdConceptId));
      if (!locRec) {
        throw new Error(`Registry record for localization of ${createdConceptId} was not written to conceptLocalizations table!`);
      }
      console.log(`   ✓ Found concept_localizations table registry record for "${locRec.displayName}".`);
    }

    console.log("   ✓ Database save verified successfully.");

    // Clean up
    console.log("\n4. Cleaning up test data...");
    await db.delete(knowledgeObjects).where(eq(knowledgeObjects.courseId, testCourseId));
    if (createdConceptId) {
      await db.delete(conceptLocalizations).where(eq(conceptLocalizations.conceptId, createdConceptId));
      await db.delete(concepts).where(eq(concepts.id, createdConceptId));
    }
    await db.delete(masterTeachingDocuments).where(eq(masterTeachingDocuments.id, testMtdId));
    await db.delete(chapters).where(eq(chapters.id, testChapterId));
    await db.delete(courses).where(eq(courses.id, testCourseId));
    await db.delete(user).where(eq(user.id, testUserId));
    console.log("   ✓ Cleanup completed.");

    console.log("\n=== Verification Completed Successfully ===");
  } catch (err) {
    console.error("\n=== Verification Failed ===");
    console.error(err);
    // Cleanup anyway
    try {
      await db.delete(knowledgeObjects).where(eq(knowledgeObjects.courseId, testCourseId));
      if (createdConceptId) {
        await db.delete(conceptLocalizations).where(eq(conceptLocalizations.conceptId, createdConceptId));
        await db.delete(concepts).where(eq(concepts.id, createdConceptId));
      }
      await db.delete(masterTeachingDocuments).where(eq(masterTeachingDocuments.id, testMtdId));
      await db.delete(chapters).where(eq(chapters.id, testChapterId));
      await db.delete(courses).where(eq(courses.id, testCourseId));
      await db.delete(user).where(eq(user.id, testUserId));
    } catch {}
    process.exit(1);
  }
}

main();
