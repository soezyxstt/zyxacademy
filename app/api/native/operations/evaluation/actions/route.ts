import { type NextRequest, NextResponse } from "next/server";
import { getNativeOperationsAdmin } from "@/lib/auth/native-operations-admin";
import { POST as createJob } from "@/app/api/admin/generation-jobs/route";
import { GET as getJob } from "@/app/api/admin/generation-jobs/[id]/route";
import { POST as createQuestion, PUT as reviewQuestions } from "@/app/api/admin/questions/route";
import { DELETE as deleteQuestion, PUT as editQuestion } from "@/app/api/admin/questions/[id]/route";
import { POST as importQuestions } from "@/app/api/admin/questions/bulk-markdown/route";

function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function run(request: NextRequest, method: "GET" | "POST" | "PUT" | "DELETE") {
  const admin = await getNativeOperationsAdmin();
  if (!admin.ok) return error(admin.status, admin.status === 401 ? "Unauthorized" : "Forbidden");

  if (method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return error(403, "Forbidden");
  }
  if ((method === "POST" || method === "PUT") && request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return error(415, "Expected JSON");
  }

  // Fixed dispatch to the existing handlers. These handlers also apply their own
  // checks and own validation, queueing, canonical writes, and response semantics.
  const action = request.nextUrl.searchParams.get("action");
  const id = request.nextUrl.searchParams.get("id");
  const context = id && id.length <= 256 ? { params: Promise.resolve({ id }) } : null;
  let result: Response;
  if (action === "generation-job" && method === "GET" && context) result = await getJob(request, context);
  else if (action === "generation-jobs" && method === "POST" && !id) result = await createJob(request);
  else if (action === "questions" && method === "POST" && !id) result = await createQuestion(request);
  else if (action === "questions" && method === "PUT" && !id) result = await reviewQuestions(request);
  else if (action === "question" && method === "PUT" && context) result = await editQuestion(request, context);
  else if (action === "question" && method === "DELETE" && context) result = await deleteQuestion(request, context);
  else if (action === "import-questions" && method === "POST" && !id) result = await importQuestions(request);
  else return error(404, "Not found");

  result.headers.set("Cache-Control", "private, no-store");
  return result;
}

export const GET = (request: NextRequest) => run(request, "GET");
export const POST = (request: NextRequest) => run(request, "POST");
export const PUT = (request: NextRequest) => run(request, "PUT");
export const DELETE = (request: NextRequest) => run(request, "DELETE");
