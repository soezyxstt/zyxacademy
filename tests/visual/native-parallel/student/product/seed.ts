import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { artikel, bab, chapters, courses, enrollments, mataKuliah, onboardingTours, pendaftaranMurid, pengguna, penggunaPeran, peran, session, user } from "../../../../../db/schema";
import { PERAN_SEEDS, membershipIdFor } from "../../../../../lib/auth/peran";
import { TOUR_VERSION } from "../../../../../lib/onboarding/tour-state";

// Use a newly migrated, disposable PostgreSQL database for authenticated product captures.
const url = new URL(process.env.DATABASE_URL ?? "");
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.pathname !== "/student_evidence") {
  throw new Error("Expected a loopback student_evidence database");
}
const client = new Client({ connectionString: url.href });
await client.connect();
try {
  await drizzle(client).transaction(async tx => {
    if ((await tx.select({ id: user.id }).from(user).limit(1)).length) throw new Error("Expected an empty user table");
    await tx.insert(peran).values([...PERAN_SEEDS]).onConflictDoNothing();
    for (const [id, name] of [["enrolled", "Alya"], ["unenrolled", "Bima"], ["revoked", "Citra"]]) {
      const uid = "student-evidence-" + id;
      await tx.insert(user).values({ id: uid, email: uid + "@example.invalid", name, role: "student" });
      await tx.insert(pengguna).values({ id: uid, status: "active" });
      await tx.insert(penggunaPeran).values({ id: membershipIdFor(uid, "murid"), penggunaId: uid, peranId: "peran-murid", source: "better_auth_user_create" });
      await tx.insert(session).values({ id: uid, userId: uid, token: randomUUID(), expiresAt: new Date(Date.now() + 24 * 3600000) });
      await tx.insert(onboardingTours).values({ userId: uid, role: "student", status: "skipped", version: TOUR_VERSION, generation: 1 });
    }
    const cid = "matematika-1", mid = "mk-matematika-1";
    await tx.insert(courses).values({ id: cid, title: "Matematika I", category: "Matematika", description: "Fungsi, limit, turunan dan integral." });
    await tx.insert(mataKuliah).values({ id: mid, legacyCourseId: cid, code: "MA-101", title: "Matematika I" });
    for (const [id, days] of [["enrolled", 365], ["revoked", -1]] as const) {
      const uid = "student-evidence-" + id;
      const endAt = new Date(Date.now() + days * 86400000);
      await tx.insert(enrollments).values({ id: uid, userId: uid, courseId: cid, expiresAt: endAt });
      await tx.insert(pendaftaranMurid).values({ id: uid, penggunaId: uid, mataKuliahId: mid, status: "active", endAt });
    }
    for (const n of [1, 2, 3, 4]) {
      const title = ["Sistem bilangan real", "Fungsi", "Limit", "Turunan"][n - 1];
      await tx.insert(chapters).values({ id: "bab-" + n, courseId: cid, title, orderIndex: n, status: "published" });
      await tx.insert(bab).values({ id: "kanon-" + n, legacyChapterId: "bab-" + n, mataKuliahId: mid, code: "B" + n, title, orderIndex: n, status: "active" });
      await tx.insert(artikel).values({ id: "dokumen-" + n, slug: "dokumen-" + n, title, mataKuliahId: mid, babId: "kanon-" + n,
        contentMarkdown: "Catatan belajar mengenai " + title + ".", creatorId: "student-evidence-enrolled", sourceHash: String(n), generationHash: String(n), status: "published", publishedAt: new Date("2026-01-02T07:00:00Z") });
    }
  });
} finally { await client.end(); }
