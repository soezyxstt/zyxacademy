import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customForms, customFormResponses } from "@/db/schema";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { getAuthSession } from "@/lib/auth-session";
import { getNativeOperationsAdmin } from "@/lib/auth/native-operations-admin";
import { protectedFormAttachmentKey } from "@/lib/forms/attachment";
import { slugifyFormTitle } from "@/lib/storage/keys";

const headers = { "Cache-Control": "private, no-store" };
const notFound = () => new Response(null, { status: 404, headers });
const validId = (value: string) => /^[A-Za-z0-9:_-][A-Za-z0-9._:-]{0,255}$/.test(value);

export async function GET(request: Request, { params }: { params: Promise<{ formId: string; responseId: string; index: string }> }) {
  const admin = await getNativeOperationsAdmin();
  if (!admin.ok) return new Response(null, { status: admin.status, headers });
  const auth = await getAuthSession();
  if (!auth?.session.id || auth.user.id !== admin.user.id ||
    request.headers.get("x-native-operations-user-id") !== admin.user.id ||
    request.headers.get("x-native-operations-session-id") !== auth.session.id) return new Response(null, { status: 403, headers });

  const { formId, responseId, index } = await params;
  if (!validId(formId) || !validId(responseId) || !/^(0|[1-9]\d{0,5})$/.test(index)) return notFound();
  const [record] = await db.select({
    title: customForms.title, slug: customForms.slug, questions: customForms.questions, answers: customFormResponses.answers,
  }).from(customFormResponses).innerJoin(customForms, eq(customFormResponses.formId, customForms.id)).where(and(
    eq(customFormResponses.id, responseId), eq(customForms.id, formId), isNull(customForms.deletedAt),
  )).limit(1);
  const question = record?.questions[Number(index)];
  if (!record || question?.type !== "FILE_UPLOAD" || typeof question.title !== "string") return notFound();
  const origin = new URL(resolveAuthBaseUrl()).origin;
  const key = protectedFormAttachmentKey(record.answers[index] ?? record.answers[question.title], {
    origin, legacyBase: process.env.R2_PUBLIC_URL, folders: [slugifyFormTitle(record.title), slugifyFormTitle(record.slug)], questionIndex: Number(index),
  });
  if (!key) return notFound();
  const proxy = new URL(`/api/storage/file/${key.map(encodeURIComponent).join("/")}?download=1`, origin);
  const { GET: serveStorage } = await import("@/app/api/storage/file/[...key]/route");
  const result = await serveStorage(new Request(proxy, { headers: request.headers, signal: request.signal }), { params: Promise.resolve({ key }) });
  const responseHeaders = new Headers(result.headers);
  responseHeaders.set("Cache-Control", headers["Cache-Control"]);
  return new Response(result.body, { status: result.status, headers: responseHeaders });
}
