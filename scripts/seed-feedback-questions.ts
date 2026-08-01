import { db } from "../db";
import { aiQuestionBank, courses } from "../db/schema";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

// Load .env manually
try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*["']?(.*?)["']?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  }
} catch {
  // ignore
}

const rawFeedbackQuestions = [
  {
    prompt: "Secara keseluruhan, bagaimana kamu menilai kualitas pengajaran dari para tutor?",
    questionType: "multiple_choice" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "tutor", "pengajaran"],
    options: ["1 — Sangat buruk", "2 — Buruk", "3 — Cukup", "4 — Baik", "5 — Sangat baik"],
    correctIndices: [0, 1, 2, 3, 4],
    explanation: "Item survei skala 1–5. Semua pilihan dianggap benar karena tidak ada jawaban benar/salah.",
  },
  {
    prompt: "Apakah tutor menjelaskan konsep dengan cara yang mudah dipahami?",
    questionType: "multiple_choice" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "tutor", "kejelasan"],
    options: ["1 — Sangat sulit dipahami", "2 — Sulit dipahami", "3 — Cukup", "4 — Mudah dipahami", "5 — Sangat mudah dipahami"],
    correctIndices: [0, 1, 2, 3, 4],
    explanation: "Item survei skala 1–5. Semua pilihan dianggap benar karena tidak ada jawaban benar/salah.",
  },
  {
    prompt: "Bagaimana kamu menilai tempo penyampaian materi selama sesi?",
    questionType: "multiple_choice" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "tutor", "tempo"],
    options: ["Terlalu cepat", "Pas", "Terlalu lambat"],
    correctIndices: [0, 1, 2],
    explanation: "Item survei. Semua pilihan dianggap benar karena tidak ada jawaban benar/salah.",
  },
  {
    prompt: "Menurutmu, apa yang bisa tutor lakukan secara berbeda untuk meningkatkan pemahamanmu?",
    questionType: "essay" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "tutor", "saran"],
    options: [],
    correctIndices: [],
    explanation: "Isian bebas. Tidak ada kunci jawaban — respons dikumpulkan sebagai masukan kualitatif untuk evaluasi tutor.",
  },
  {
    prompt: "Seberapa relevan materi yang diberikan dengan format soal PKA yang sebenarnya?",
    questionType: "multiple_choice" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "materi", "relevansi"],
    options: ["1 — Sangat tidak relevan", "2 — Tidak relevan", "3 — Cukup relevan", "4 — Relevan", "5 — Sangat relevan"],
    correctIndices: [0, 1, 2, 3, 4],
    explanation: "Item survei skala 1–5. Semua pilihan dianggap benar karena tidak ada jawaban benar/salah.",
  },
  {
    prompt: "Bagaimana tingkat kesulitan soal latihan dibandingkan dengan PKA yang sebenarnya?",
    questionType: "multiple_choice" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "materi", "tingkat-kesulitan"],
    options: ["Terlalu mudah", "Pas", "Terlalu sulit"],
    correctIndices: [0, 1, 2],
    explanation: "Item survei. Semua pilihan dianggap benar karena tidak ada jawaban benar/salah.",
  },
  {
    prompt: "Bagaimana kamu menilai performa platform secara keseluruhan saat try out berlangsung (kecepatan, waktu loading)?",
    questionType: "multiple_choice" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "platform", "tryout", "performa"],
    options: ["1 — Sangat buruk", "2 — Buruk", "3 — Cukup", "4 — Baik", "5 — Sangat baik"],
    correctIndices: [0, 1, 2, 3, 4],
    explanation: "Item survei skala 1–5. Semua pilihan dianggap benar karena tidak ada jawaban benar/salah.",
  },
  {
    prompt: "Apakah kamu mengalami kendala teknis (lag, aplikasi/situs crash, masalah login, dll.)?",
    questionType: "multiple_choice" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "platform", "tryout", "kendala-teknis"],
    options: ["Ya", "Tidak"],
    correctIndices: [0, 1],
    explanation: "Item survei. Semua pilihan dianggap benar. Jawaban \"Ya\" memicu pertanyaan lanjutan pada Soal 9.",
  },
  {
    prompt: "Jika ya, tolong jelaskan kendala yang kamu alami.",
    questionType: "essay" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "platform", "tryout", "kendala-teknis"],
    options: [],
    correctIndices: [],
    explanation: "Isian bebas, kondisional — hanya ditampilkan jika responden menjawab \"Ya\" pada Soal 8. Tidak ada kunci jawaban.",
  },
  {
    prompt: "Seberapa mudah platform ini digunakan/dinavigasi?",
    questionType: "multiple_choice" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "platform", "usability"],
    options: ["1 — Sangat sulit", "2 — Sulit", "3 — Cukup", "4 — Mudah", "5 — Sangat mudah"],
    correctIndices: [0, 1, 2, 3, 4],
    explanation: "Item survei skala 1–5. Semua pilihan dianggap benar karena tidak ada jawaban benar/salah.",
  },
  {
    prompt: "Apakah tampilan timer/antarmuka ujian jelas dan mudah diikuti?",
    questionType: "multiple_choice" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "platform", "antarmuka"],
    options: ["Ya", "Cukup jelas", "Tidak"],
    correctIndices: [0, 1, 2],
    explanation: "Item survei. Semua pilihan dianggap benar karena tidak ada jawaban benar/salah.",
  },
  {
    prompt: "Bagaimana kamu menilai kejelasan instruksi yang diberikan sebelum dan selama try out berlangsung?",
    questionType: "multiple_choice" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "platform", "instruksi"],
    options: ["1 — Sangat tidak jelas", "2 — Tidak jelas", "3 — Cukup jelas", "4 — Jelas", "5 — Sangat jelas"],
    correctIndices: [0, 1, 2, 3, 4],
    explanation: "Item survei skala 1–5. Semua pilihan dianggap benar karena tidak ada jawaban benar/salah.",
  },
  {
    prompt: "Kamu mengikuti try out ini menggunakan perangkat apa?",
    questionType: "multiple_choice" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "perangkat"],
    options: ["HP", "Laptop atau Komputer", "Keduanya"],
    correctIndices: [0, 1, 2],
    explanation: "Item survei. Semua pilihan dianggap benar karena tidak ada jawaban benar/salah.",
  },
  {
    prompt: "Dalam skala 0–10, seberapa besar kemungkinan kamu merekomendasikan Zyx Academy ke teman yang sedang mempersiapkan PKA?",
    questionType: "multiple_choice" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "kepuasan", "nps"],
    options: ["0 — Sangat tidak mungkin", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10 — Sangat mungkin"],
    correctIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    explanation: "Item survei skala 0–10 (Net Promoter Score). Semua pilihan dianggap benar. Skor 0–6 = Detractor, 7–8 = Passive, 9–10 = Promoter.",
  },
  {
    prompt: "Apa alasan utama dari skor yang kamu berikan di atas?",
    questionType: "essay" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "kepuasan", "nps", "alasan"],
    options: [],
    correctIndices: [],
    explanation: "Isian bebas. Tidak ada kunci jawaban — respons digunakan untuk menjelaskan skor NPS pada Soal 14.",
  },
  {
    prompt: "Apakah kamu tertarik mengikuti program Zyx Academy selanjutnya (misalnya untuk persiapan SBMPTN/UTBK)?",
    questionType: "multiple_choice" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "retensi", "program-lanjutan"],
    options: ["Ya", "Mungkin", "Tidak"],
    correctIndices: [0, 1, 2],
    explanation: "Item survei. Semua pilihan dianggap benar karena tidak ada jawaban benar/salah.",
  },
  {
    prompt: "Ada hal lain yang ingin kamu sampaikan — saran, keluhan, atau hal yang menurutmu sudah bagus?",
    questionType: "essay" as const,
    difficulty: "easy" as const,
    tags: ["feedback", "masukan-terbuka", "opsional"],
    options: [],
    correctIndices: [],
    explanation: "Isian bebas dan opsional. Tidak ada kunci jawaban.",
  },
];

async function seed() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (!tursoUrl || !tursoToken) {
    console.error("TURSO_DATABASE_URL or TURSO_AUTH_TOKEN missing.");
    return;
  }

  console.log("Connecting to Turso production database...");
  const client = createClient({ url: tursoUrl, authToken: tursoToken });
  const prodDb = drizzle(client);

  const prodCourses = await prodDb.select({ id: courses.id, title: courses.title }).from(courses);
  console.log(`Found ${prodCourses.length} production courses:`, prodCourses.map(c => `${c.id} (${c.title})`));

  if (prodCourses.length === 0) {
    console.error("No production courses found.");
    return;
  }

  // Also seed local SQLite if courses exist or use prod course IDs
  let localCourses = await db.select({ id: courses.id, title: courses.title }).from(courses);
  if (localCourses.length === 0) {
    console.log("Seeding dummy courses into local SQLite...");
    for (const c of prodCourses) {
      await db.insert(courses).values({ id: c.id, title: c.title, category: "matematika", description: c.title }).onConflictDoNothing();
    }
    localCourses = await db.select({ id: courses.id, title: courses.title }).from(courses);
  }

  // Insert into Production Turso
  for (const course of prodCourses) {
    console.log(`\nInserting 17 feedback questions into TURSO PROD for course: ${course.id} (${course.title})...`);
    let count = 0;
    for (const q of rawFeedbackQuestions) {
      const qId = `qbk-feedback-${randomUUID().slice(0, 8)}`;
      await prodDb.insert(aiQuestionBank).values({
        id: qId,
        courseId: course.id,
        prompt: q.prompt,
        options: q.options as any,
        correctIndices: q.correctIndices as any,
        acceptableAnswers: [],
        difficulty: q.difficulty,
        questionType: q.questionType,
        explanation: q.explanation,
        tags: q.tags as any,
        status: "active",
        reviewStatus: "published",
        useCount: 0,
        qualityScore: 1.0,
      });
      count++;
    }
    console.log(`SUCCESS: Inserted ${count} questions for course ${course.id} in Turso Production!`);
  }

  // Insert into Local SQLite
  for (const course of localCourses) {
    console.log(`\nInserting 17 feedback questions into LOCAL SQLite for course: ${course.id}...`);
    for (const q of rawFeedbackQuestions) {
      const qId = `qbk-feedback-${randomUUID().slice(0, 8)}`;
      await db.insert(aiQuestionBank).values({
        id: qId,
        courseId: course.id,
        prompt: q.prompt,
        options: q.options as any,
        correctIndices: q.correctIndices as any,
        acceptableAnswers: [],
        difficulty: q.difficulty,
        questionType: q.questionType,
        explanation: q.explanation,
        tags: q.tags as any,
        status: "active",
        reviewStatus: "published",
        useCount: 0,
        qualityScore: 1.0,
      });
    }
    console.log(`SUCCESS: Inserted 17 questions for course ${course.id} in Local SQLite!`);
  }

  console.log("\nALL 17 FEEDBACK QUESTIONS SUCCESSFULLY ADDED TO PROD AND LOCAL DATABASES!");
}

seed().catch((err) => {
  console.error("Failed to seed feedback questions:", err);
  process.exit(1);
});
