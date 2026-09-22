import { db } from "./index";
import {
  user,
  courses,
  enrollments,
  aiQuestionBank,
  quizTemplates,
  studentQuizAttempts,
  tutorCourses,
} from "./schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("=== Seeding Database for Local Development ===");

  // Clear existing question bank, templates and attempts to ensure new formatting is applied
  console.log("Clearing existing questions, templates, and attempts...");
  await db.delete(studentQuizAttempts);
  await db.delete(quizTemplates);
  await db.delete(aiQuestionBank);

  // 1. Seed Users
  console.log("Seeding users...");
  const devUsers = [
    {
      id: "admin-1",
      name: "Admin Zyx",
      email: "admin@zyx.edu",
      emailVerified: true,
      role: "admin" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "teacher-1",
      name: "Guru Zyx",
      email: "teacher@zyx.edu",
      emailVerified: true,
      role: "teacher" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "student-1",
      name: "Siswa Zyx",
      email: "student@zyx.edu",
      emailVerified: true,
      role: "student" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  for (const u of devUsers) {
    const existing = await db.query.user.findFirst({
      where: eq(user.id, u.id),
    });
    if (!existing) {
      await db.insert(user).values(u);
      console.log(`User ${u.name} (${u.role}) seeded.`);
    } else {
      console.log(`User ${u.name} already exists.`);
    }
  }

  // 2. Seed Courses
  console.log("Seeding courses...");
  const devCourses = [
    {
      id: "calc-1",
      title: "Kalkulus 1",
      category: "TPB",
      description: "Limit, turunan, dan integral dasar dengan latihan terstruktur - materi, kuis cepat, dan tryout ujian.",
    },
    {
      id: "physics-1",
      title: "Fisika Dasar",
      category: "TPB",
      description: "Mekanika dan termodinamika pengantar untuk tahun pertama ITB.",
    },
    {
      id: "chem-1",
      title: "Kimia Dasar",
      category: "TPB",
      description: "Stoikiometri, ikatan, dan dasar termokimia.",
    },
  ];

  for (const c of devCourses) {
    const existing = await db.query.courses.findFirst({
      where: eq(courses.id, c.id),
    });
    if (!existing) {
      await db.insert(courses).values(c as any);
      console.log(`Course ${c.title} seeded.`);
    } else {
      console.log(`Course ${c.title} already exists.`);
    }
  }

  // 3. Seed Enrollments
  console.log("Seeding enrollments...");
  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + 1); // Enrolled for 1 year

  const devEnrollments = [
    {
      id: "enroll-calc",
      userId: "student-1",
      courseId: "calc-1",
      enrolledAt: new Date(),
      expiresAt: expiryDate,
    },
    {
      id: "enroll-physics",
      userId: "student-1",
      courseId: "physics-1",
      enrolledAt: new Date(),
      expiresAt: expiryDate,
    },
  ];

  for (const e of devEnrollments) {
    const existing = await db.query.enrollments.findFirst({
      where: eq(enrollments.id, e.id),
    });
    if (!existing) {
      await db.insert(enrollments).values(e);
      console.log(`Enrollment for Siswa Zyx in course ${e.courseId} seeded.`);
    } else {
      console.log(`Enrollment ${e.id} already exists.`);
    }
  }

  // 3.5 Seed Tutor Courses
  console.log("Seeding tutor course assignments...");
  const devTutorCourses = [
    {
      id: "tc-calc",
      tutorId: "teacher-1",
      courseId: "calc-1",
      createdAt: new Date(),
    },
    {
      id: "tc-physics",
      tutorId: "teacher-1",
      courseId: "physics-1",
      createdAt: new Date(),
    },
  ];

  for (const tc of devTutorCourses) {
    const existing = await db.query.tutorCourses.findFirst({
      where: eq(tutorCourses.id, tc.id),
    });
    if (!existing) {
      await db.insert(tutorCourses).values(tc);
      console.log(`Tutor Course assignment seeded for ${tc.tutorId} on ${tc.courseId}.`);
    } else {
      console.log(`Tutor Course assignment ${tc.id} already exists.`);
    }
  }

  // 4. Seed Questions (at least 10 in aiQuestionBank for calc-1 with various difficulties)
  console.log("Seeding questions in AI Question Bank...");
  const devQuestions = [
    // Easy questions
    {
      id: "q-1",
      courseId: "calc-1",
      difficulty: "easy" as const,
      questionType: "multiple_choice" as const,
      tags: ["limit", "aljabar"],
      prompt: "Berapakah nilai dari $\\lim_{x \\to 3} (2x + 1)$?",
      options: ["5", "6", "7", "8"],
      correctIndices: [2], // "7"
      explanation: "Substitusi langsung $x = 3$ menghasilkan $2(3) + 1 = 7$.",
      reviewStatus: "published" as const,
      qualityScore: 1.0,
      useCount: 0,
      createdAt: new Date(),
    },
    {
      id: "q-2",
      courseId: "calc-1",
      difficulty: "easy" as const,
      questionType: "multiple_choice" as const,
      tags: ["turunan", "aljabar"],
      prompt: "Turunan pertama dari $f(x) = x^2$ adalah...",
      options: ["$x$", "$2x$", "$2x^2$", "$x/2$"],
      correctIndices: [1], // "2x"
      explanation: "Menggunakan aturan pangkat turunan $\\frac{d}{dx}(x^n) = n x^{n-1}$, maka turunan dari $x^2$ adalah $2x$.",
      reviewStatus: "published" as const,
      qualityScore: 1.0,
      useCount: 0,
      createdAt: new Date(),
    },
    {
      id: "q-3",
      courseId: "calc-1",
      difficulty: "easy" as const,
      questionType: "multiple_choice" as const,
      tags: ["integral", "dasar"],
      prompt: "Berapakah hasil dari integral $\\int dx$?",
      options: ["$x + C$", "$1 + C$", "$0$", "$x$"],
      correctIndices: [0], // "x + C"
      explanation: "Integral dari konstanta 1 terhadap $x$ adalah $x + C$.",
      reviewStatus: "published" as const,
      qualityScore: 1.0,
      useCount: 0,
      createdAt: new Date(),
    },

    // Medium questions
    {
      id: "q-4",
      courseId: "calc-1",
      difficulty: "medium" as const,
      questionType: "multiple_choice" as const,
      tags: ["limit", "trigonometri"],
      prompt: "Berapakah nilai dari $\\lim_{x \\to 0} \\frac{\\sin(x)}{x}$?",
      options: ["0", "1", "Tidak terdefinisi", "$\\infty$"],
      correctIndices: [1], // "1"
      explanation: "Berdasarkan teorema limit trigonometri khusus dasar, $\\lim_{x \\to 0} \\frac{\\sin(x)}{x} = 1$.",
      reviewStatus: "published" as const,
      qualityScore: 0.95,
      useCount: 0,
      createdAt: new Date(),
    },
    {
      id: "q-5",
      courseId: "calc-1",
      difficulty: "medium" as const,
      questionType: "multiple_choice" as const,
      tags: ["turunan", "aturan-rantai"],
      prompt: "Turunan pertama dari $f(x) = \\sin(x^2)$ adalah...",
      options: ["$\\cos(x^2)$", "$2x \\cos(x^2)$", "$2x \\sin(x^2)$", "$\\cos(2x)$"],
      correctIndices: [1], // "2x * cos(x^2)"
      explanation: "Dengan aturan rantai: $\\frac{d}{dx}(\\sin(u)) = \\cos(u) \\frac{du}{dx}$. Di sini $u = x^2$, sehingga $\\frac{du}{dx} = 2x$. Hasilnya adalah $2x \\cos(x^2)$.",
      reviewStatus: "published" as const,
      qualityScore: 1.0,
      useCount: 0,
      createdAt: new Date(),
    },
    {
      id: "q-6",
      courseId: "calc-1",
      difficulty: "medium" as const,
      questionType: "multiple_choice" as const,
      tags: ["integral", "substitusi"],
      prompt: "Berapakah hasil dari $\\int 2x e^{x^2}\\,\\mathrm{d}x$?",
      options: ["$e^{x^2} + C$", "$2e^{x^2} + C$", "$e^x + C$", "$x^2 e^x + C$"],
      correctIndices: [0], // "e^(x^2) + C"
      explanation: "Misalkan $u = x^2$, maka $\\mathrm{d}u = 2x\\,\\mathrm{d}x$. Integral menjadi $\\int e^u\\,\\mathrm{d}u = e^u + C = e^{x^2} + C$.",
      reviewStatus: "published" as const,
      qualityScore: 0.98,
      useCount: 0,
      createdAt: new Date(),
    },
    {
      id: "q-7",
      courseId: "calc-1",
      difficulty: "medium" as const,
      questionType: "multiple_choice" as const,
      tags: ["fungsi", "kontinuitas"],
      prompt: "Fungsi $f(x) = \\frac{1}{x}$ tidak kontinu di $x$ sama dengan...",
      options: ["-1", "0", "1", "Semua $x$ real"],
      correctIndices: [1], // "0"
      explanation: "Fungsi $f(x) = \\frac{1}{x}$ memiliki asimtot tegak di $x = 0$ di mana nilai limit kiri dan kanan tidak berhingga, sehingga tidak kontinu di $x = 0$.",
      reviewStatus: "published" as const,
      qualityScore: 0.9,
      useCount: 0,
      createdAt: new Date(),
    },

    // Hard questions
    {
      id: "q-8",
      courseId: "calc-1",
      difficulty: "hard" as const,
      questionType: "multiple_choice" as const,
      tags: ["limit", "lhospital"],
      prompt: "Berapakah nilai dari $\\lim_{x \\to 0} \\frac{e^x - 1 - x}{x^2}$?",
      options: ["0", "1/2", "1", "$\\infty$"],
      correctIndices: [1], // "1/2"
      explanation: "Limit berbentuk 0/0. Menggunakan Aturan L'Hopital dua kali: $\\lim_{x \\to 0} \\frac{e^x - 1}{2x} = \\lim_{x \\to 0} \\frac{e^x}{2} = \\frac{1}{2}$.",
      reviewStatus: "published" as const,
      qualityScore: 1.0,
      useCount: 0,
      createdAt: new Date(),
    },
    {
      id: "q-9",
      courseId: "calc-1",
      difficulty: "hard" as const,
      questionType: "multiple_choice" as const,
      tags: ["turunan", "aplikasi"],
      prompt: "Tentukan nilai maksimum lokal dari $f(x) = x^3 - 3x + 2$.",
      options: ["0", "2", "4", "6"],
      correctIndices: [2], // "4"
      explanation: "Turunan $f'(x) = 3x^2 - 3 = 0$ menghasilkan titik kritis $x = \\pm 1$. $f''(x) = 6x$. Di $x = -1$, $f''(-1) = -6 < 0$ (maksimum lokal). Nilai maksimum $f(-1) = (-1)^3 - 3(-1) + 2 = -1 + 3 + 2 = 4$.",
      reviewStatus: "published" as const,
      qualityScore: 0.95,
      useCount: 0,
      createdAt: new Date(),
    },
    {
      id: "q-10",
      courseId: "calc-1",
      difficulty: "hard" as const,
      questionType: "multiple_choice" as const,
      tags: ["integral", "parsial"],
      prompt: "Hasil dari $\\int x \\ln(x)\\,\\mathrm{d}x$ adalah...",
      options: [
        "$\\frac{x^2}{2} \\ln(x) - \\frac{x^2}{4} + C$",
        "$x^2 \\ln(x) - x^2 + C$",
        "$\\frac{x^2}{2} \\ln(x) + C$",
        "$\\frac{\\ln(x)}{2} - x^2 + C$"
      ],
      correctIndices: [0], // "(x^2/2) * ln(x) - x^2/4 + C"
      explanation: "Menggunakan integral parsial: $u = \\ln(x) \\Rightarrow \\mathrm{d}u = \\frac{1}{x}\\,\\mathrm{d}x$ dan $\\mathrm{d}v = x\\,\\mathrm{d}x \\Rightarrow v = \\frac{x^2}{2}$. Hasilnya $uv - \\int v\\,\\mathrm{d}u = \\frac{x^2}{2} \\ln(x) - \\int \\frac{x}{2}\\,\\mathrm{d}x = \\frac{x^2}{2} \\ln(x) - \\frac{x^2}{4} + C$.",
      reviewStatus: "published" as const,
      qualityScore: 1.0,
      useCount: 0,
      createdAt: new Date(),
    },
  ];

  for (const q of devQuestions) {
    const existing = await db.query.aiQuestionBank.findFirst({
      where: eq(aiQuestionBank.id, q.id),
    });
    if (!existing) {
      await db.insert(aiQuestionBank).values({
        ...q,
        tags: q.tags,
        options: q.options,
        correctIndices: q.correctIndices,
      });
      console.log(`Question ${q.id} seeded.`);
    } else {
      console.log(`Question ${q.id} already exists.`);
    }
  }

  // 5. Seed Quiz Templates
  console.log("Seeding quiz templates...");
  const devTemplates = [
    {
      id: "template-weekly-calc",
      courseId: "calc-1",
      title: "Kuis Mingguan Limit & Turunan",
      category: "weekly" as const,
      visibility: "free" as const,
      timeLimitSeconds: 1200, // 20 minutes
      maxAttempts: 3,
      selectionRules: {
        count: 5,
        tags: ["limit", "turunan"],
        difficulty_proportions: { easy: 2, medium: 2, hard: 1 },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "template-daily-calc",
      courseId: "calc-1",
      title: "Daily Quiz",
      category: "daily" as const,
      visibility: "free" as const,
      timeLimitSeconds: 600, // 10 minutes
      maxAttempts: 1,
      selectionRules: {
        count: 5,
        difficulty_proportions: { easy: 2, medium: 2, hard: 1 },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  for (const t of devTemplates) {
    const existing = await db.query.quizTemplates.findFirst({
      where: eq(quizTemplates.id, t.id),
    });
    if (!existing) {
      await db.insert(quizTemplates).values({
        ...t,
        selectionRules: t.selectionRules,
        status: "published",
      });
      console.log(`Quiz template "${t.title}" seeded.`);
    } else {
      console.log(`Quiz template "${t.title}" already exists.`);
    }
  }

  // 6. Seed Quiz Attempts for Leaderboard Data
  console.log("Seeding student quiz attempts (for leaderboard values)...");
  
  // Snapshot of questions corresponding to template questions
  const questionsSnapshot = [
    { id: "q-1", prompt: "Berapakah nilai dari $\\lim_{x \\to 3} (2x + 1)$?", options: ["5", "6", "7", "8"], correct_indices: [2], explanation: "Substitusi langsung $x = 3$ menghasilkan $2(3) + 1 = 7$." },
    { id: "q-2", prompt: "Turunan pertama dari $f(x) = x^2$ adalah...", options: ["$x$", "$2x$", "$2x^2$", "$x/2$"], correct_indices: [1], explanation: "Menggunakan aturan pangkat turunan $\\frac{d}{dx}(x^n) = n x^{n-1}$, maka turunan dari $x^2$ adalah $2x$." },
    { id: "q-4", prompt: "Berapakah nilai dari $\\lim_{x \\to 0} \\frac{\\sin(x)}{x}$?", options: ["0", "1", "Tidak terdefinisi", "$\\infty$"], correct_indices: [1], explanation: "Berdasarkan teorema limit trigonometri khusus dasar, $\\lim_{x \\to 0} \\frac{\\sin(x)}{x} = 1$." },
    { id: "q-5", prompt: "Turunan pertama dari $f(x) = \\sin(x^2)$ adalah...", options: ["$\\cos(x^2)$", "$2x \\cos(x^2)$", "$2x \\sin(x^2)$", "$\\cos(2x)$"], correct_indices: [1], explanation: "Dengan aturan rantai: $\\frac{d}{dx}(\\sin(u)) = \\cos(u) \\frac{du}{dx}$. Di sini $u = x^2$, sehingga $\\frac{du}{dx} = 2x$. Hasilnya adalah $2x \\cos(x^2)$." },
    { id: "q-8", prompt: "Berapakah nilai dari $\\lim_{x \\to 0} \\frac{e^x - 1 - x}{x^2}$?", options: ["0", "1/2", "1", "$\\infty$"], correct_indices: [1], explanation: "Limit berbentuk 0/0. Menggunakan Aturan L'Hopital dua kali: $\\lim_{x \\to 0} \\frac{e^x - 1}{2x} = \\lim_{x \\to 0} \\frac{e^x}{2} = \\frac{1}{2}$." },
  ];

  const devAttempts = [
    {
      id: "attempt-1",
      studentId: "student-1",
      templateId: "template-weekly-calc",
      score: 80,
      durationSeconds: 450,
      status: "completed" as const,
      questionsSnapshot: questionsSnapshot,
      answersSnapshot: { "q-1": [2], "q-2": [1], "q-4": [1], "q-5": [1], "q-8": [0] }, // 4 correct -> 80%
      startedAt: new Date(),
      submittedAt: new Date(),
    },
    {
      id: "attempt-2",
      studentId: "student-1",
      templateId: "template-weekly-calc",
      score: 100,
      durationSeconds: 300,
      status: "completed" as const,
      questionsSnapshot: questionsSnapshot,
      answersSnapshot: { "q-1": [2], "q-2": [1], "q-4": [1], "q-5": [1], "q-8": [1] }, // 5 correct -> 100%
      startedAt: new Date(),
      submittedAt: new Date(),
    },
  ];

  for (const a of devAttempts) {
    const existing = await db.query.studentQuizAttempts.findFirst({
      where: eq(studentQuizAttempts.id, a.id),
    });
    if (!existing) {
      await db.insert(studentQuizAttempts).values({
        ...a,
        questionsSnapshot: a.questionsSnapshot,
        answersSnapshot: a.answersSnapshot,
      });
      console.log(`Quiz attempt ${a.id} (Score: ${a.score}) seeded.`);
    } else {
      console.log(`Quiz attempt ${a.id} already exists.`);
    }
  }

  console.log("=== Seeding Complete ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
