/**
 * Seeds dummy chapters, master teaching documents, flashcard sets, and flashcards
 * for the Tutorial PKA course so that developers/testers can try the flashcard
 * feature locally.
 *
 * Run: bunx tsx scripts/seed-pka-flashcards.ts
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { eq } from "drizzle-orm";

(async () => {
  const { db } = await import("@/lib/db");
  const { courses, chapters, masterTeachingDocuments, flashcardSets, flashcards, user } = await import("@/db/schema");

  console.log("Seeding Tutorial PKA dummy flashcards...");

  // 1. Verify tutorial-pka course exists
  const [pkaCourse] = await db.select().from(courses).where(eq(courses.id, "tutorial-pka"));
  if (!pkaCourse) {
    console.error("Error: Tutorial PKA course not found. Run scripts/seed-pka.ts first.");
    process.exit(1);
  }

  // 2. Resolve a user for createdById
  let systemUser = await db.query.user.findFirst({
    where: eq(user.role, "admin"),
  });
  if (!systemUser) {
    systemUser = await db.query.user.findFirst();
  }
  if (!systemUser) {
    const userId = "pka-system-user";
    await db.insert(user).values({
      id: userId,
      name: "PKA System",
      email: "system@zyxacademy.com",
      role: "admin",
    }).onConflictDoNothing();
    systemUser = { id: userId } as any;
  }

  // 3. Create dummy chapters
  const pkaChapters = [
    { id: "pka-chap-math", title: "Matematika Dasar (PKA)", orderIndex: 1 },
    { id: "pka-chap-physics", title: "Fisika Dasar (PKA)", orderIndex: 2 },
    { id: "pka-chap-chemistry", title: "Kimia Dasar (PKA)", orderIndex: 3 },
  ];

  for (const chap of pkaChapters) {
    await db.insert(chapters).values({
      id: chap.id,
      courseId: "tutorial-pka",
      title: chap.title,
      orderIndex: chap.orderIndex,
      status: "published",
    }).onConflictDoNothing();

    // 4. Create dummy Master Teaching Document
    const mtdId = `mtd-${chap.id}`;
    await db.insert(masterTeachingDocuments).values({
      id: mtdId,
      courseId: "tutorial-pka",
      title: `Dokumen ${chap.title}`,
      markdownContent: `# ${chap.title}\n\nDokumen referensi untuk flashcard ${chap.title}.`,
      version: 1,
      status: "active",
      type: "learning",
      createdById: systemUser!.id,
    }).onConflictDoNothing();

    // 5. Create flashcard set
    const setId = `fcset-${chap.id}`;
    await db.delete(flashcardSets).where(eq(flashcardSets.id, setId));
    await db.insert(flashcardSets).values({
      id: setId,
      courseId: "tutorial-pka",
      chapterId: chap.id,
      sourceMtdId: mtdId,
      sourceMtdVersion: 1,
      generationHash: "seed-pka",
      title: `Flashcard ${chap.title}`,
      status: "published",
    });

    // 6. Create dummy flashcards
    const dummyCardsMap: Record<string, Array<{ front: string; back: string }>> = {
      "pka-chap-math": [
        { front: "Apa rumus dasar integral dari $x^n$?", back: "$\\frac{1}{n+1} x^{n+1} + C$ (untuk $n \\neq -1$)" },
        { front: "Bagaimana turunan pertama dari fungsi $f(x) = \\sin(x)$?", back: "$f'(x) = \\cos(x)$" },
        { front: "Apa syarat dua matriks dapat dikalikan?", back: "Jumlah kolom matriks pertama sama dengan jumlah baris matriks kedua." },
        { front: "Berapakah nilai $\\lim_{x \\to 0} \\frac{\\sin x}{x}$?", back: "$1$" }
      ],
      "pka-chap-physics": [
        { front: "Sebutkan Hukum Newton Kedua!", back: "$F = m \\cdot a$ (Gaya sama dengan massa dikali percepatan)" },
        { front: "Apa satuan SI dari hambatan listrik?", back: "Ohm ($\\Omega$)" },
        { front: "Tuliskan persamaan gas ideal!", back: "$P \\cdot V = n \\cdot R \\cdot T$" },
        { front: "Apa bunyi Hukum Kekekalan Energi?", back: "Energi tidak dapat diciptakan atau dimusnahkan, hanya dapat berubah bentuk." }
      ],
      "pka-chap-chemistry": [
        { front: "Apa rumus molekul dari air?", back: "$\\text{H}_2\\text{O}$" },
        { front: "Berapakah jumlah partikel dalam 1 mol zat (tetapan Avogadro)?", back: "$6.022 \\times 10^{23}$ partikel" },
        { front: "Apa pH larutan yang bersifat asam?", back: "$\\text{pH} < 7$" },
        { front: "Apa lambang unsur dari Natrium?", back: "$\\text{Na}$" }
      ]
    };

    const cards = dummyCardsMap[chap.id] || [];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      await db.insert(flashcards).values({
        id: `fc-${chap.id}-${i}`,
        setId,
        front: card.front,
        back: card.back,
        explanation: `Pembahasan singkat untuk konsep ${chap.title}.`,
        status: "active",
      });
    }

    console.log(`  seeded ${cards.length} flashcards for chapter: ${chap.title}`);
  }

  console.log("Tutorial PKA flashcards seeding complete.");
  process.exit(0);
})().catch((err) => {
  console.error("seed-pka-flashcards failed:", err);
  process.exit(1);
});
