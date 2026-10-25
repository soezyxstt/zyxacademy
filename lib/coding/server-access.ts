import "server-only";
import { auth } from "@/lib/auth";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { db } from "@/db";
import { codingProblems } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { codingProblemPrivateSchema } from "./contracts";

export async function requireCodingAccess(request: Request, courseId: string) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) throw new Error("CODING_UNAUTHORIZED");
  const access = await resolveCourseAccess({ courseId, userId: session.user.id });
  if (!access.hasCourseAccess || !access.canonicalCourseId || (access.tier !== "enrolled" && access.tier !== "staff")) throw new Error("CODING_FORBIDDEN");
  return { userId: session.user.id, courseId: access.canonicalCourseId };
}
export async function loadPublishedCodingProblem(courseId: string, problemId: string, version: number) {
  const [row] = await db.select().from(codingProblems).where(and(eq(codingProblems.courseId, courseId), eq(codingProblems.id, problemId), eq(codingProblems.version, version), eq(codingProblems.status, "published"))).limit(1);
  if (!row) throw new Error("CODING_PROBLEM_NOT_FOUND");
  const problem = codingProblemPrivateSchema.parse(row.snapshot);
  if (problem.problemId !== row.id || problem.version !== row.version || problem.courseId !== row.courseId) throw new Error("CODING_PROBLEM_VERSION_MISMATCH");
  return problem;
}
export function codingErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, [number, string]> = {
    CODING_UNAUTHORIZED: [401, "Silakan masuk kembali."],
    CODING_FORBIDDEN: [403, "Akses mata kuliah tidak tersedia."],
    CODING_PROBLEM_NOT_FOUND: [404, "Masalah coding belum tersedia."],
    CODING_REQUEST_CONFLICT: [409, "Percobaan ini sudah memakai kode berbeda. Kirim percobaan baru."],
    CODING_PROBLEM_VERSION_MISMATCH: [409, "Versi masalah berubah. Muat ulang halaman."],
    CODING_ATTEMPT_BUSY: [409, "Percobaan sebelumnya masih diperiksa. Coba lagi sebentar."],
    CODING_ATTEMPT_LIMIT: [409, "Batas percobaan sudah tercapai."],
    CODING_DEADLINE_PASSED: [409, "Waktu pengumpulan sudah berakhir."],
    CODING_RUNTIME_CONFIGURATION_REQUIRED: [503, "Pemeriksaan Python belum tersedia. Kode kamu tetap tersimpan."],
    CODING_INVALID_SURFACE: [400, "Masalah tidak sesuai dengan halaman ini."],
    CODING_ASSISTANCE_DISABLED: [403, "Bantuan Zyra tidak tersedia untuk soal ini."],
  };
  const [status, message] = messages[code] ?? [503, "Permintaan belum dapat diproses. Coba lagi."];
  return Response.json({ error: message }, { status });
}
export function assertCodingSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const address = new URL(request.url);
  const host = request.headers.get("host");
  if (host && /^[a-zA-Z0-9.:[\]-]+$/.test(host)) address.host = host;
  if (origin && origin !== address.origin) throw new Error("CODING_FORBIDDEN");
}
