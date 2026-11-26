import { z } from "zod";
import { redeemGroupToken } from "@/lib/groups/redeem-token";
import { loadNativeCourseData } from "@/lib/student/native-course-data";
import type { EnrollmentResponse } from "@/packages/native-parity/student/courses/contract";
import { requireNativeStudent } from "../_session";
import { readNativeStudentJson } from "../_request";

const resourceId = z.string().min(1).max(160).regex(/^[^/?#\\\s\u0000-\u001f\u007f]+$/u);
const querySchema = z.discriminatedUnion("view", [
  z.object({ view: z.literal("dashboard") }).strict(),
  z.object({ view: z.literal("dashboard-extras") }).strict(),
  z.object({ view: z.literal("catalog") }).strict(),
  z.object({ view: z.literal("course"), courseId: resourceId }).strict(),
  z.object({ view: z.literal("material-list"), courseId: resourceId }).strict(),
  z.object({ view: z.literal("material-detail"), courseId: resourceId, materialId: resourceId }).strict(),
]);
const enrollmentSchema = z.object({ token: z.string().trim().min(1).max(256) }).strict();

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  const actor = await requireNativeStudent(request);
  if (actor instanceof Response) return actor;
  const params = new URL(request.url).searchParams;
  const values = Object.fromEntries(params);
  if (params.size !== Object.keys(values).length) return reply({ error: "INVALID_LEARNING_QUERY" }, 400);
  const query = querySchema.safeParse(values);
  if (!query.success) return reply({ error: "INVALID_LEARNING_QUERY" }, 400);
  try {
    const result = await loadNativeCourseData(actor.userId, query.data);
    if ("status" in result) return reply({ error: result.status === 403 ? "COURSE_ACCESS_DENIED" : "COURSE_RESOURCE_NOT_FOUND" }, result.status);
    return reply(result);
  } catch (error) {
    console.error("Native Student course read failed", error instanceof Error ? error.name : "UnknownError");
    return reply({ error: "LEARNING_UNAVAILABLE" }, 500);
  }
}

export async function POST(request: Request) {
  const actor = await requireNativeStudent(request);
  if (actor instanceof Response) return actor;
  const body = enrollmentSchema.safeParse(await readNativeStudentJson(request, 2 * 1024).catch(() => null));
  if (!body.success) return reply({ success: false, errorCode: "invalid" } satisfies EnrollmentResponse, 400);
  try {
    const result: EnrollmentResponse = await redeemGroupToken(body.data.token, actor.userId, "dashboard");
    return reply(result, result.success ? 200 : 422);
  } catch (error) {
    console.error("Native Student course activation failed", error instanceof Error ? error.name : "UnknownError");
    return reply({ success: false, errorCode: "internal" } satisfies EnrollmentResponse, 500);
  }
}
