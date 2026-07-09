/**
 * Seeds chapters, master teaching documents, flashcard sets, and flashcards
 * for the Tutorial PKA course directly into the production Turso database.
 *
 * Run: bunx tsx scripts/seed-pka-flashcards-prod.ts
 * Add --commit to actually write; without it the script does a dry run.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { courses, chapters, masterTeachingDocuments, flashcardSets, flashcards, user } from "../db/schema";

const PKA_COURSE_ID = "tutorial-pka";

const PKA_CHAPTERS = [
  { id: "pka-chap-math", title: "Matematika Dasar (PKA)", orderIndex: 1 },
];

const DUMMY_CARDS_MAP: Record<string, Array<{ front: string; back: string; explanation?: string }>> = {
  "pka-chap-math": [
    {
      front: "Rumus jarak antara dua titik $(x_1,y_1)$ dan $(x_2,y_2)$?",
      back: "$d = \\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}$",
      explanation: "Diturunkan langsung dari teorema Pythagoras pada bidang koordinat."
    },
    {
      front: "Bentuk umum persamaan garis dengan gradien $m$ melalui titik $(x_1, y_1)$?",
      back: "$y - y_1 = m(x - x_1)$",
      explanation: "Dikenal sebagai bentuk titik-gradien (point-slope form)."
    },
    {
      front: "Bentuk umum persamaan lingkaran dengan pusat $(a,b)$ dan jari-jari $r$?",
      back: "$(x-a)^2 + (y-b)^2 = r^2$",
      explanation: "Jika pusat di titik asal $(0,0)$, persamaan menjadi $x^2+y^2=r^2$."
    },
    {
      front: "Rumus akar-akar persamaan kuadrat $ax^2+bx+c=0$?",
      back: "$x = \\dfrac{-b \\pm \\sqrt{b^2-4ac}}{2a}$",
      explanation: "Dikenal sebagai rumus abc atau rumus kuadratik."
    },
    {
      front: "Bagaimana cara menentukan tanda pertidaksamaan kuadrat $(x-a)(x-b) < 0$ jika $a<b$?",
      back: "Solusinya adalah $a < x < b$",
      explanation: "Karena koefisien $x^2$ positif, nilai negatif terjadi di antara kedua akar."
    },
    {
      front: "Definisi $|x - a| \\ge k$ untuk $k > 0$?",
      back: "$x \\le a-k$ atau $x \\ge a+k$",
      explanation: "Nilai mutlak yang lebih dari atau sama dengan suatu konstanta menghasilkan dua daerah solusi yang terpisah."
    },
    {
      front: "Rumus komposisi fungsi $(f \\circ g)(x)$?",
      back: "$(f \\circ g)(x) = f(g(x))$",
      explanation: "Substitusikan seluruh fungsi $g(x)$ ke variabel $x$ pada fungsi $f$."
    },
    {
      front: "Koordinat titik $P$ pada bidang-$xy$ jika jarak $P$ ke titik asal $O$ adalah $r$ dan sudut terhadap sumbu-$x$ positif adalah $\\theta$?",
      back: "$P = (r\\cos\\theta,\\ r\\sin\\theta)$",
      explanation: "Ini merupakan konversi dari koordinat polar ke koordinat kartesius."
    },
    {
      front: "Rumus suku ke-$n$ deret aritmatika dengan suku pertama $a$ dan beda $d$?",
      back: "$U_n = a + (n-1)d$",
      explanation: "Beda $d$ dihitung dari selisih dua suku berurutan."
    },
    {
      front: "Nilai limit trigonometri dasar $\\displaystyle\\lim_{h \\to 0} \\frac{\\sin h}{h}$?",
      back: "$1$",
      explanation: "Limit fundamental ini menjadi dasar penurunan turunan fungsi $\\sin x$ dan $\\cos x$."
    },
    {
      front: "Nilai limit trigonometri dasar $\\displaystyle\\lim_{h \\to 0} \\frac{\\cos h - 1}{h}$?",
      back: "$0$",
      explanation: "Digunakan bersama limit $\\frac{\\sin h}{h}$ untuk menurunkan turunan fungsi trigonometri dari definisi limit."
    },
    {
      front: "Turunan pertama dari $f(x) = \\sin x$?",
      back: "$f'(x) = \\cos x$",
      explanation: "Diturunkan menggunakan identitas $\\sin(x+h)$ dan limit dasar trigonometri."
    },
    {
      front: "Rumus kecepatan rata-rata suatu partikel dengan posisi $s(t)$ pada interval $[t_1, t_2]$?",
      back: "$v_{rata-rata} = \\dfrac{s(t_2)-s(t_1)}{t_2-t_1}$",
      explanation: "Merupakan hasil bagi selisih (difference quotient) dari fungsi posisi."
    },
    {
      front: "Rumus volume kerucut dengan jari-jari $r$ dan tinggi $h$?",
      back: "$V = \\dfrac{1}{3}\\pi r^2 h$",
      explanation: "Volume kerucut selalu sepertiga dari volume tabung dengan alas dan tinggi yang sama."
    },
    {
      front: "Rumus volume tabung dengan jari-jari $r$ dan tinggi $h$?",
      back: "$V = \\pi r^2 h$",
      explanation: "Dasar untuk membandingkan volume kerucut maupun bangun ruang lain yang serupa."
    },
    {
      front: "Rumus luas juring lingkaran dengan jari-jari $r$ dan sudut pusat $\\theta$ (radian)?",
      back: "$L = \\dfrac{1}{2}r^2\\theta$",
      explanation: "Berlaku hanya jika $\\theta$ dinyatakan dalam satuan radian."
    },
    {
      front: "Ketaksamaan segitiga (triangle inequality) untuk vektor $u$ and $v$?",
      back: "$\\|u+v\\| \\le \\|u\\| + \\|v\\|$",
      explanation: "Kesamaan terjadi jika dan hanya jika $u$ dan $v$ searah (linearly dependent dengan arah sama)."
    },
    {
      front: "Apa syarat suatu bilangan real $y$ disebut batas atas (upper bound) dari himpunan $X$?",
      back: "$x \\le y$ untuk setiap $x \\in X$",
      explanation: "Jika batas atas terkecil ada, disebut supremum dari himpunan tersebut."
    },
    {
      front: "Cara menentukan daerah asal (domain) fungsi $f(x) = \\sqrt{a^2 - x^2}$?",
      back: "$-a \\le x \\le a$",
      explanation: "Syarat fungsi akar kuadrat terdefinisi adalah nilai di dalam akar harus non-negatif, yaitu $a^2 - x^2 \\ge 0$."
    },
    {
      front: "Rumus invers dari fungsi eksponensial $f(x) = A \\cdot b^{cx}$ (dengan $A, b > 0$)?",
      back: "$f^{-1}(x) = \\dfrac{1}{c}\\log_b\\left(\\dfrac{x}{A}\\right)$",
      explanation: "Diperoleh dengan menukar posisi $x$ dan $y$, lalu menyelesaikan $y$ menggunakan logaritma."
    }
  ]
};

async function main() {
  const commit = process.argv.includes("--commit");
  console.log(`=== Seed Tutorial PKA Flashcards into PRODUCTION (${commit ? "COMMIT" : "DRY RUN"}) ===`);

  const url =
    process.env.TURSO_DATABASE_URL ||
    process.env.TURSO_CONNECTION_URL ||
    (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith("postgres")
      ? process.env.DATABASE_URL
      : undefined);
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || (!url.startsWith("libsql://") && !url.startsWith("https://"))) {
    console.error("Error: production DB URL must be a remote Turso URL (libsql:// or https://). Refusing to run.");
    process.exit(1);
  }
  if (!authToken) {
    console.error("Error: TURSO_AUTH_TOKEN is missing. Refusing to touch production without an auth token.");
    process.exit(1);
  }

  const host = url.replace(/^\w+:\/\//, "").split(/[/?]/)[0];
  console.log(`Target production host: ${host}`);

  const client = createClient({ url, authToken });
  const db = drizzle(client, { schema: { courses, chapters, masterTeachingDocuments, flashcardSets, flashcards, user } });

  // 1. Verify tutorial-pka course exists
  const [pkaCourse] = await db.select().from(courses).where(eq(courses.id, PKA_COURSE_ID));
  if (!pkaCourse) {
    console.error(`Error: Course "${PKA_COURSE_ID}" not found in production. Seed the course first.`);
    process.exit(1);
  }
  console.log(`Found course: ${pkaCourse.title}`);

  // 2. Resolve or create a system user for MTDs
  let systemUser = await db.query.user.findFirst({
    where: eq(user.role, "admin"),
  });
  if (!systemUser) {
    systemUser = await db.query.user.findFirst();
  }
  
  const systemUserId = systemUser?.id || "pka-system-user";
  console.log(`Resolved creator ID for MTD: ${systemUserId}`);

  // 3. Dry run reporting
  if (!commit) {
    console.log("\n[DRY RUN] The following inserts/deletes would be performed:");
    
    // Check for placeholders to clean up
    const placeholderIds = ["pka-chap-physics", "pka-chap-chemistry"];
    for (const id of placeholderIds) {
      console.log(`- Will clean up placeholder data for chapter: ${id}`);
    }

    if (!systemUser) {
      console.log(`- Will insert fallback admin user: { id: "pka-system-user", name: "PKA System", email: "system@zyxacademy.com", role: "admin" }`);
    }

    for (const chap of PKA_CHAPTERS) {
      console.log(`\nChapter: ${chap.title} (${chap.id})`);
      console.log(`  - Will upsert chapter: ${chap.title}`);
      console.log(`  - Will upsert MTD: mtd-${chap.id}`);
      console.log(`  - Will delete existing flashcard set: fcset-${chap.id} (and its flashcards via cascade)`);
      console.log(`  - Will insert new flashcard set: fcset-${chap.id}`);
      
      const cards = DUMMY_CARDS_MAP[chap.id] || [];
      console.log(`  - Will insert ${cards.length} flashcards:`);
      for (let i = 0; i < cards.length; i++) {
        console.log(`    * [fc-${chap.id}-${i}] Front: "${cards[i].front}"`);
        console.log(`      Back: "${cards[i].back}"`);
        console.log(`      Explanation: "${cards[i].explanation || `Pembahasan singkat untuk konsep ${chap.title}.`}"`);
      }
    }

    console.log("\nDry run completed. No writes were executed. Run with --commit to apply to production.");
    process.exit(0);
  }

  // 4. Commit flow
  console.log("\nStarting database transaction/operations...");

  // Clean up legacy placeholders
  const placeholderIds = ["pka-chap-physics", "pka-chap-chemistry"];
  for (const id of placeholderIds) {
    console.log(`Cleaning up placeholder data for chapter: ${id}...`);
    const setId = `fcset-${id}`;
    await db.delete(flashcardSets).where(eq(flashcardSets.id, setId));
    const mtdId = `mtd-${id}`;
    await db.delete(masterTeachingDocuments).where(eq(masterTeachingDocuments.id, mtdId));
    await db.delete(chapters).where(eq(chapters.id, id));
    console.log(`  Placeholder ${id} cleared.`);
  }

  // Insert fallback user if needed
  if (!systemUser) {
    console.log("Inserting fallback system user...");
    await db.insert(user).values({
      id: systemUserId,
      name: "PKA System",
      email: "system@zyxacademy.com",
      role: "admin",
    }).onConflictDoNothing();
  }

  for (const chap of PKA_CHAPTERS) {
    console.log(`Processing chapter: ${chap.title}...`);

    // Chapter
    await db.insert(chapters).values({
      id: chap.id,
      courseId: PKA_COURSE_ID,
      title: chap.title,
      orderIndex: chap.orderIndex,
      status: "published",
    }).onConflictDoNothing();
    console.log(`  Chapter ${chap.id} verified/inserted.`);

    // MTD
    const mtdId = `mtd-${chap.id}`;
    await db.insert(masterTeachingDocuments).values({
      id: mtdId,
      courseId: PKA_COURSE_ID,
      title: `Dokumen ${chap.title}`,
      markdownContent: `# ${chap.title}\n\nDokumen referensi untuk flashcard ${chap.title}.`,
      version: 1,
      status: "active",
      type: "learning",
      createdById: systemUserId,
    }).onConflictDoNothing();
    console.log(`  MTD ${mtdId} verified/inserted.`);

    // Flashcard Set
    const setId = `fcset-${chap.id}`;
    await db.delete(flashcardSets).where(eq(flashcardSets.id, setId));
    await db.insert(flashcardSets).values({
      id: setId,
      courseId: PKA_COURSE_ID,
      chapterId: chap.id,
      sourceMtdId: mtdId,
      sourceMtdVersion: 1,
      generationHash: "seed-pka",
      title: `Flashcard ${chap.title}`,
      status: "published",
    });
    console.log(`  Flashcard Set ${setId} inserted.`);

    // Flashcards
    const cards = DUMMY_CARDS_MAP[chap.id] || [];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      await db.insert(flashcards).values({
        id: `fc-${chap.id}-${i}`,
        setId,
        front: card.front,
        back: card.back,
        explanation: card.explanation || `Pembahasan singkat untuk konsep ${chap.title}.`,
        status: "active",
      });
    }
    console.log(`  Seeded ${cards.length} flashcards for ${chap.id}.`);
  }

  console.log("\n=== Production Seeding & Cleanup Completed Successfully! ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Production seeding failed:", err);
  process.exit(1);
});
