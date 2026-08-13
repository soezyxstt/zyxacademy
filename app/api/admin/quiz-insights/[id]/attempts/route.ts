import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quizTemplates, studentQuizAttempts, user, courses } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq, desc } from "drizzle-orm";
import { normalizeDate } from "@/lib/date-utils";

type Context = { params: Promise<{ id: string }> };

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const stringified = String(value);
  if (stringified.includes('"') || stringified.includes(',') || stringified.includes('\n') || stringified.includes('\r')) {
    return `"${stringified.replace(/"/g, '""')}"`;
  }
  return `"${stringified}"`;
}

export async function GET(req: NextRequest, { params }: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userRole = (session?.user as any)?.role;
  if (!session?.user || (userRole !== "admin" && userRole !== "teacher")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: templateId } = await params;
  const searchParams = req.nextUrl.searchParams;
  const format = searchParams.get("format") || searchParams.get("export");
  const exportType = searchParams.get("exportType") || "matrix"; // "matrix" | "summary"
  const includeInProgress = searchParams.get("includeInProgress") === "true";

  // 1. Fetch template details
  const [template] = await db
    .select({
      id: quizTemplates.id,
      title: quizTemplates.title,
      category: quizTemplates.category,
      courseId: quizTemplates.courseId,
      courseName: courses.title,
      status: quizTemplates.status,
    })
    .from(quizTemplates)
    .leftJoin(courses, eq(quizTemplates.courseId, courses.id))
    .where(eq(quizTemplates.id, templateId))
    .limit(1);

  if (!template) {
    return NextResponse.json({ error: "Quiz template not found" }, { status: 404 });
  }

  // 2. Fetch all student attempts for this template
  const rawAttempts = await db
    .select({
      id: studentQuizAttempts.id,
      studentId: studentQuizAttempts.studentId,
      studentName: user.name,
      studentEmail: user.email,
      score: studentQuizAttempts.score,
      durationSeconds: studentQuizAttempts.durationSeconds,
      status: studentQuizAttempts.status,
      questionsSnapshot: studentQuizAttempts.questionsSnapshot,
      answersSnapshot: studentQuizAttempts.answersSnapshot,
      startedAt: studentQuizAttempts.startedAt,
      submittedAt: studentQuizAttempts.submittedAt,
    })
    .from(studentQuizAttempts)
    .leftJoin(user, eq(studentQuizAttempts.studentId, user.id))
    .where(eq(studentQuizAttempts.templateId, templateId))
    .orderBy(desc(studentQuizAttempts.startedAt));

  const filteredAttempts = includeInProgress
    ? rawAttempts
    : rawAttempts.filter((a) => a.status === "completed");

  const formattedAttempts = filteredAttempts.map((att) => {
    const startedDate = att.startedAt ? normalizeDate(att.startedAt) : null;
    const submittedDate = att.submittedAt ? normalizeDate(att.submittedAt) : null;
    return {
      id: att.id,
      studentId: att.studentId,
      studentName: att.studentName || "Tanpa Nama",
      studentEmail: att.studentEmail || "-",
      score: att.score ?? 0,
      durationSeconds: att.durationSeconds ?? 0,
      status: att.status,
      startedAt: startedDate ? startedDate.toISOString() : null,
      submittedAt: submittedDate ? submittedDate.toISOString() : null,
      questionsSnapshot: (att.questionsSnapshot as any[]) || [],
      answersSnapshot: (att.answersSnapshot as Record<string, any>) || {},
    };
  });

  // If CSV export requested
  if (format === "csv") {
    let csvContent = "";
    const bom = "\uFEFF"; // UTF-8 BOM for Excel compatibility

    if (exportType === "summary") {
      const headers = [
        "Attempt ID",
        "Nama Siswa",
        "Email Siswa",
        "Status",
        "Skor Akhir",
        "Durasi (detik)",
        "Durasi (format)",
        "Waktu Mulai",
        "Waktu Selesai",
      ];
      csvContent += headers.map(escapeCsvCell).join(",") + "\n";

      for (const att of formattedAttempts) {
        const mins = Math.floor(att.durationSeconds / 60);
        const secs = att.durationSeconds % 60;
        const durFormatted = `${mins}m ${secs}s`;

        const row = [
          att.id,
          att.studentName,
          att.studentEmail,
          att.status,
          att.score,
          att.durationSeconds,
          durFormatted,
          att.startedAt || "-",
          att.submittedAt || "-",
        ];
        csvContent += row.map(escapeCsvCell).join(",") + "\n";
      }
    } else {
      // Item-Response Matrix CSV export
      const questionsMap = new Map<string, { id: string; prompt: string; options: string[]; correctIndices: number[] }>();
      for (const att of formattedAttempts) {
        for (const q of att.questionsSnapshot) {
          if (q.id && !questionsMap.has(q.id)) {
            const correct = Array.isArray(q.correct_indices)
              ? q.correct_indices
              : Array.isArray(q.correctIndices)
              ? q.correctIndices
              : [];
            questionsMap.set(q.id, {
              id: q.id,
              prompt: q.prompt || q.content || `Soal ${questionsMap.size + 1}`,
              options: Array.isArray(q.options) ? q.options : [],
              correctIndices: correct,
            });
          }
        }
      }
      const questionsList = Array.from(questionsMap.values());

      const headerRow = [
        "Attempt ID",
        "Nama Siswa",
        "Email Siswa",
        "Status",
        "Skor Akhir",
        "Durasi (detik)",
        "Waktu Selesai",
      ];

      for (let i = 0; i < questionsList.length; i++) {
        const qNum = i + 1;
        headerRow.push(`Q${qNum}: Teks Soal`);
        headerRow.push(`Q${qNum}: Jawaban Siswa`);
        headerRow.push(`Q${qNum}: Status Jawaban`);
      }
      csvContent += headerRow.map(escapeCsvCell).join(",") + "\n";

      for (const att of formattedAttempts) {
        const row = [
          att.id,
          att.studentName,
          att.studentEmail,
          att.status,
          att.score,
          att.durationSeconds,
          att.submittedAt || "-",
        ];

        const userAnswers = att.answersSnapshot;

        for (const q of questionsList) {
          const rawAnswer = userAnswers[q.id];
          let selectedIndices: number[] = [];
          if (Array.isArray(rawAnswer)) {
            selectedIndices = rawAnswer.filter((n) => typeof n === "number");
          } else if (typeof rawAnswer === "number") {
            selectedIndices = [rawAnswer];
          }

          let selectedText = "-";
          if (selectedIndices.length > 0) {
            selectedText = selectedIndices
              .map((idx) => {
                const optText = q.options[idx];
                return optText ? `[${String.fromCharCode(65 + idx)}] ${optText}` : `Opsi ${idx + 1}`;
              })
              .join("; ");
          }

          let statusText = "Tidak Dijawab";
          if (selectedIndices.length > 0) {
            const isCorrect =
              selectedIndices.length === q.correctIndices.length &&
              selectedIndices.every((idx) => q.correctIndices.includes(idx));
            statusText = isCorrect ? "BENAR" : "SALAH";
          }

          row.push(q.prompt);
          row.push(selectedText);
          row.push(statusText);
        }

        csvContent += row.map(escapeCsvCell).join(",") + "\n";
      }
    }

    const safeTitle = template.title.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `attempt_${exportType}_${safeTitle}_${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(bom + csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json({
    template,
    attempts: formattedAttempts,
    totalCount: formattedAttempts.length,
  });
}
