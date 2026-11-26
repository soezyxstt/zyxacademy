import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "../../../../../db/schema";
import { PERAN_SEEDS, membershipIdFor } from "../../../../../lib/auth/peran";

export const learningEvidence = {
  learner: "student-evidence-learning",
  visitor: "student-evidence-learning-visitor",
  course: "learning-evidence-math",
  canonical: "learning-evidence-math-canonical",
  concept: "learning-evidence-limit",
  pka: "tutorial-pka",
  pkaCanonical: "learning-evidence-pka-canonical",
  pkaMaterial: "learning-evidence-pka-material",
} as const;

export function learningEvidenceDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.pathname !== "/student_evidence") {
    throw new Error("Expected the loopback student_evidence fixture");
  }
  return url;
}

async function seed() {
  const client = new Client({ connectionString: learningEvidenceDatabase().href });
  await client.connect();
  try {
    return await drizzle(client).transaction(async (tx) => {
      // Refuse to reuse the globally named campaign when another seed owns it.
      const [pka] = await tx.select({ id: schema.courses.id, title: schema.courses.title }).from(schema.courses).where(eq(schema.courses.id, learningEvidence.pka));
      if (pka && pka.title !== "Tutorial PKA Referensi") throw new Error("A different fixture owns Tutorial PKA");
      const published = new Date("2026-07-01T07:00:00Z");
      const activeUntil = new Date("2031-01-01T00:00:00Z");
      await tx.insert(schema.peran).values([...PERAN_SEEDS]).onConflictDoNothing();
      for (const [id, name] of [[learningEvidence.learner, "Nara"], [learningEvidence.visitor, "Tara"]]) {
        await tx.insert(schema.user).values({ id, email: `${id}@example.invalid`, name, role: "student" }).onConflictDoNothing();
        await tx.insert(schema.pengguna).values({ id, status: "active" }).onConflictDoNothing();
        await tx.insert(schema.penggunaPeran).values({ id: membershipIdFor(id, "murid"), penggunaId: id, peranId: "peran-murid", source: "better_auth_user_create" }).onConflictDoNothing();
        await tx.insert(schema.session).values({ id, userId: id, token: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) })
          .onConflictDoUpdate({ target: schema.session.id, set: { expiresAt: new Date(Date.now() + 86_400_000) } });
      }
      const { course, canonical, learner, concept, pkaCanonical, pkaMaterial } = learningEvidence;
      const chapter = `${course}-chapter`, canonicalChapter = `${canonical}-chapter`, article = `${course}-article`, idea = `${course}-idea`;
      const pkaChapter = `${pkaCanonical}-chapter`;
      await tx.insert(schema.courses).values([
        { id: course, title: "Matematika Referensi", category: "Matematika", description: "Fungsi dan limit." },
        { id: learningEvidence.pka, title: "Tutorial PKA Referensi", category: "Matematika" },
      ]).onConflictDoNothing();
      await tx.insert(schema.mataKuliah).values([
        { id: canonical, code: "LE-MA", title: "Matematika Referensi", status: "active", legacyCourseId: course },
        { id: pkaCanonical, code: "LE-PKA", title: "Tutorial PKA Referensi", status: "active", legacyCourseId: learningEvidence.pka },
      ]).onConflictDoNothing();
      await tx.insert(schema.enrollments).values([
        { id: `${learner}-math`, userId: learner, courseId: course, expiresAt: activeUntil },
        { id: `${learner}-pka`, userId: learner, courseId: learningEvidence.pka, expiresAt: activeUntil },
      ]).onConflictDoNothing();
      await tx.insert(schema.pendaftaranMurid).values([
        { id: `${learner}-math`, penggunaId: learner, mataKuliahId: canonical, status: "active", endAt: activeUntil },
        { id: `${learner}-pka`, penggunaId: learner, mataKuliahId: pkaCanonical, status: "active", endAt: activeUntil },
      ]).onConflictDoNothing();
      await tx.insert(schema.chapters).values({ id: chapter, courseId: course, title: "Fungsi dan limit", orderIndex: 1, status: "published" }).onConflictDoNothing();
      await tx.insert(schema.bab).values([
        { id: canonicalChapter, legacyChapterId: chapter, mataKuliahId: canonical, code: "LE-B1", title: "Fungsi dan limit", orderIndex: 1, status: "active" },
        { id: pkaChapter, mataKuliahId: pkaCanonical, code: "LE-P1", title: "Persiapan awal", orderIndex: 1, status: "active" },
      ]).onConflictDoNothing();
      await tx.insert(schema.artikel).values([
        { id: article, slug: article, title: "Membaca limit dari tabel", mataKuliahId: canonical, babId: canonicalChapter, contentMarkdown: "Nilai fungsi mendekati 6 saat masukan mendekati 3.", creatorId: learner, sourceHash: article, generationHash: article, status: "published", publishedAt: published },
        { id: pkaMaterial, slug: pkaMaterial, title: "Persiapan limit PKA", mataKuliahId: pkaCanonical, babId: pkaChapter, contentMarkdown: "Bandingkan nilai dari kiri dan kanan sebelum menyimpulkan limit.", creatorId: learner, sourceHash: pkaMaterial, generationHash: pkaMaterial, status: "published", publishedAt: published },
      ]).onConflictDoNothing();
      await tx.insert(schema.concepts).values({ id: concept, canonicalSlug: concept }).onConflictDoNothing();
      await tx.insert(schema.conceptLocalizations).values({ id: `${concept}-id`, conceptId: concept, lang: "id", displayName: "Limit dari dua arah" }).onConflictDoNothing();
      await tx.insert(schema.ide).values({ id: idea, mataKuliahId: canonical, babId: canonicalChapter, conceptId: concept, stableKey: idea, code: "LE-I1",
        canonicalStatement: "Limit dari dua arah", conciseExplanation: "Limit ada jika nilai dari kiri dan kanan mendekati angka yang sama.", knowledgeKind: "definition",
        status: "published", creatorId: learner, semanticHash: idea, generationHash: idea }).onConflictDoNothing();
      await tx.insert(schema.artikelIde).values({ id: `${article}-idea`, artikelId: article, ideId: idea }).onConflictDoNothing();
      await tx.insert(schema.pemahamanIde).values({ id: `${learner}-mastery`, penggunaId: learner, ideId: idea, skor: 56, keyakinan: 75, evidenceCount: 3 }).onConflictDoNothing();
      await tx.insert(schema.setFlashcard).values({ id: `${course}-deck`, mataKuliahId: canonical, babId: canonicalChapter, title: "Ulasan limit", status: "published", generationHash: `${course}-deck`, creatorId: learner, publishedAt: published }).onConflictDoNothing();
      await tx.insert(schema.flashcard).values({ id: `${course}-card`, setFlashcardId: `${course}-deck`, front: "Kapan limit dari dua arah ada?", back: "Saat limit kiri dan kanan sama.", explanation: "Nilai fungsi pada titik itu dapat berbeda.", status: "published", generationHash: `${course}-card` }).onConflictDoNothing();
      await tx.insert(schema.flashcardIde).values({ id: `${course}-card-idea`, flashcardId: `${course}-card`, ideId: idea }).onConflictDoNothing();
      await tx.insert(schema.learningEvents).values({ id: `${learner}-complete`, studentId: learner, courseId: course, eventType: "material_completed", conceptName: article, createdAt: published }).onConflictDoNothing();
      await tx.insert(schema.courseVideoPlaylists).values({ id: `${course}-playlist`, courseId: course, title: "Pembahasan limit", orderIndex: 1 }).onConflictDoNothing();
      await tx.insert(schema.courseVideos).values({ id: `${course}-video`, courseId: course, playlistId: `${course}-playlist`, chapterId: chapter, title: "Membaca limit dengan tabel", description: "Baca perubahan nilai dari dua arah.", videoUrl: "/learning-evidence-video.mp4", duration: 312 }).onConflictDoNothing();
      await tx.insert(schema.pkaAnnouncements).values({ id: `${pkaCanonical}-announcement`, title: "Persiapan sesi Matematika", body: "Baca materi limit sebelum membuka simulasi.", createdBy: learner, isPinned: true, createdAt: published }).onConflictDoNothing();
      await tx.insert(schema.pkaSchedules).values([
        { id: `${pkaCanonical}-past`, title: "Pengantar sesi tutorial", sessionAt: published, createdBy: learner },
        { id: `${pkaCanonical}-next`, title: "Diskusi limit PKA", sessionAt: new Date("2030-07-21T08:00:00Z"), meetLink: "https://meet.google.com/abc-defg-hij", createdBy: learner },
      ]).onConflictDoNothing();
      for (const subject of ["matematika", "fisika", "kimia"] as const) {
        for (const stage of [1, 2, 3]) {
          const id = `${pkaCanonical}-${subject}-${stage}`;
          await tx.insert(schema.quizTemplates).values({ id, courseId: learningEvidence.pka, title: `Simulasi ${subject} tahap ${stage}`, category: "simulation", selectionRules: {}, status: "published", manualStatus: "open", timeLimitSeconds: 900 }).onConflictDoNothing();
          await tx.insert(schema.pkaSimulationStages).values({ id, subject, stage, quizTemplateId: id, passScoreThreshold: 70 }).onConflictDoNothing();
          const completed = subject === "fisika" && stage === 1;
          const attempt = `${id}-attempt`;
          if (completed) await tx.insert(schema.studentQuizAttempts).values({ id: attempt, studentId: learner, templateId: id, score: 85, status: "completed", questionsSnapshot: [], submittedAt: published }).onConflictDoNothing();
          await tx.insert(schema.pkaStageProgress).values({ id, studentId: learner, subject, stage,
            status: completed ? "completed" : stage === 1 ? "unlocked" : subject === "fisika" ? "skipped" : "locked",
            bestScore: completed ? 85 : null, passed: completed ? true : null, attemptId: completed ? attempt : null }).onConflictDoNothing();
        }
      }
    });
  } finally { await client.end(); }
}

if (import.meta.main) {
  try { await seed(); }
  catch (error) {
    console.error("Learning fixture seed failed", error instanceof Error ? error.name : "unknown error");
    process.exitCode = 1;
  }
}
